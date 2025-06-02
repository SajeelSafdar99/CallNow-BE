require("dotenv").config()
const express = require("express")
const mongoose = require("mongoose")
const cors = require("cors")
const helmet = require("helmet")
const morgan = require("morgan")
const connectDB = require("./config/db")
const app = express()
const { verifyToken } = require("./utils/jwt")
const path = require("path")
const User = require("./models/user")
const socketUtils = require("./utils/socket-utils")
const { initializeAdminSockets } = require("./utils/admin-socket-functions")
const { sendCallNotification, sendMessageNotification } = require("./controllers/notification")

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(
    cors({
        origin: ["http://127.0.0.1:5173", "http://192.168.10.53:5173", "http://192.168.10.13:5173"], // Ensure all client origins are listed
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: "*", // Consider being more specific for production
        credentials: true,
    }),
)

app.use(
    helmet({
        crossOriginResourcePolicy: false,
    }),
)
app.use(morgan("dev"))

connectDB()
app.use(express.static(path.join(__dirname, "public")))

// Routes
const authRoutes = require("./routes/auth")
const profileRoutes = require("./routes/profile")
const deviceRoutes = require("./routes/device")
const conversationRoutes = require("./routes/conversation")
const messageRoutes = require("./routes/message")
const callRoutes = require("./routes/call")
const groupCallRoutes = require("./routes/group-call")
const callLogRoutes = require("./routes/call-log")
const callQualityRoutes = require("./routes/ice-quality")
const iceServerRoutes = require("./routes/ice-server")
const contactRoutes = require("./routes/contact")
const subscriptionRoutes = require("./routes/subscription")
const notificationRoutes = require("./routes/notification")
const adminRoutes = require("./routes/admin")

app.use("/api/auth", authRoutes)
app.use("/api/profile", profileRoutes)
app.use("/api/devices", deviceRoutes)
app.use("/api/conversations", conversationRoutes)
app.use("/api/messages", messageRoutes)
app.use("/api/calls", callRoutes)
app.use("/api/group-calls", groupCallRoutes)
app.use("/api/call-logs", callLogRoutes)
app.use("/api/call-quality", callQualityRoutes)
app.use("/api/ice-servers", iceServerRoutes)
app.use("/api/contacts", contactRoutes)
app.use("/api/subscriptions", subscriptionRoutes)
app.use("/api/notifications", notificationRoutes)
app.use("/api/admin", adminRoutes)

const PORT = process.env.PORT || 4000
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

// Initialize Socket.io
const { Server } = require("socket.io")
const io = new Server(server, {
    cors: {
        origin: ["http://127.0.0.1:5173", "http://192.168.10.13:5173", "http://192.168.10.53:5173"], // Ensure all client origins are listed
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
    },
    path: "/socket.io/",
})

socketUtils.setSocketInstance(io)

initializeAdminSockets(io)

const userSockets = new Map() // socket.id -> userId
const userDevices = new Map() // userId (string) -> Set of deviceIds (string)
const deviceSockets = new Map() // deviceId (string) -> socket.id (string)
const onlineUsers = new Map() // userId -> { socketId, lastSeen, deviceId, userName }

// Helper function to send push notification for calls
const sendCallPushNotification = async (receiverId, callData) => {
    try {
        const notification = {
            title: `Incoming ${callData.callType} call`,
            body: `${callData.caller.name} is calling you`,
            data: {
                type: "incoming_call",
                callId: callData.callId,
                callerId: callData.caller.id,
                callerName: callData.caller.name,
                callerProfilePic: callData.caller.profilePicture || "",
                callType: callData.callType,
                timestamp: new Date().toISOString(),
                isGroupCall: callData.isGroupCall || false,
                conversationId: callData.conversationId, // For group call context
            },
        }
        await sendCallNotification(notification) // Assuming this function is defined elsewhere
    } catch (error) {
        console.error("Error sending call push notification:", error)
    }
}

// Helper function to send push notification for messages
const sendMessagePushNotification = async (message, conversation, sender) => {
    try {
        await sendMessageNotification(message, conversation, sender) // Assuming this function is defined elsewhere
    } catch (error) {
        console.error("Error sending message push notification:", error)
    }
}

// Socket.io middleware for authentication
io.use(async (socket, next) => {
    const token = socket.handshake.auth.token
    const deviceIdFromAuth = socket.handshake.auth.deviceId // Get deviceId from handshake

    if (!token) {
        console.warn("[Socket Auth] Middleware: Token not provided.")
        return next(new Error("Authentication error: Token not provided"))
    }
    if (!deviceIdFromAuth) {
        // Check if deviceId is provided
        console.warn("[Socket Auth] Middleware: Device ID not provided in auth handshake.")
        return next(new Error("Authentication error: Device ID not provided"))
    }

    const decoded = verifyToken(token)
    if (!decoded || !decoded.id) {
        // Ensure decoded and decoded.id exist
        console.warn("[Socket Auth] Middleware: Invalid or malformed token.")
        return next(new Error("Authentication error: Invalid token"))
    }

    try {
        const user = await User.findById(decoded.id).select("+isSuspended +suspensionDetails") // Ensure these fields are selected
        if (!user) {
            console.warn(`[Socket Auth] Middleware: User ${decoded.id} not found in DB.`)
            return next(new Error("Authentication error: User not found"))
        }

        if (user.isSuspended) {
            if (user.suspensionDetails?.expiresAt && new Date() > new Date(user.suspensionDetails.expiresAt)) {
                console.log(`[Socket Auth] Middleware: User ${user._id} suspension expired. Unsuspending.`)
                user.isSuspended = false
                user.suspensionDetails = undefined
                await user.save()
            } else {
                console.warn(`[Socket Auth] Middleware: User ${user._id} account is suspended.`)
                return next(new Error("Account suspended"))
            }
        }

        socket.user = user // Store full user object
        socket.userId = user._id.toString() // Ensure it's a string
        socket.deviceId = deviceIdFromAuth // Assign deviceId to socket object
        next()
    } catch (error) {
        console.error("[Socket Auth] Middleware: Error during authentication:", error)
        next(new Error("Authentication error: Server issue")) // Generic error for client
    }
})

// Socket.io connection
io.on("connection", (socket) => {
    console.log(`User connected: ${socket.userId}, Device: ${socket.deviceId}, Socket ID: ${socket.id}`)

    // Store user connection mappings
    socketUtils.addActiveUser(socket.userId, socket.id)
    userSockets.set(socket.id, socket.userId)

    if (!userDevices.has(socket.userId)) {
        userDevices.set(socket.userId, new Set())
    }
    userDevices.get(socket.userId).add(socket.deviceId)
    deviceSockets.set(socket.deviceId, socket.id)

    onlineUsers.set(socket.userId, {
        socketId: socket.id,
        lastSeen: new Date(),
        deviceId: socket.deviceId,
        userName: socket.user?.name || "Unknown User",
    })

    socket.join(socket.userId)
    socket.join(socket.deviceId)

    if (socket.user && socket.user.isAdmin) {
        socket.join("admins")
        console.log(`Admin user ${socket.userId} joined admin room`)
    }

    // ===== CONVERSATION EVENTS =====
    socket.on("join-conversation", (conversationId) => {
        socket.join(conversationId)
        console.log(`User ${socket.userId} (Device: ${socket.deviceId}) joined conversation: ${conversationId}`)
    })

    socket.on("leave-conversation", (conversationId) => {
        socket.leave(conversationId)
        console.log(`User ${socket.userId} (Device: ${socket.deviceId}) left conversation: ${conversationId}`)
    })

    // ===== MESSAGE EVENTS =====
    socket.on("send-message", async (message) => {
        console.log(
            `User ${socket.userId} (Device: ${socket.deviceId}) sent message to conversation ${message.conversationId}`,
        )
        io.to(message.conversationId).emit("receive-message", message)

        try {
            const Conversation = require("./models/conversation")
            const conversation = await Conversation.findById(message.conversationId).populate(
                "participants",
                "name profilePicture devices",
            )

            if (conversation) {
                const senderUser = socket.user

                for (const participant of conversation.participants) {
                    const participantIdStr = participant._id.toString()
                    if (participantIdStr === socket.userId) continue

                    let isParticipantOnline = false
                    if (userDevices.has(participantIdStr)) {
                        for (const devId of userDevices.get(participantIdStr)) {
                            if (deviceSockets.has(devId)) {
                                isParticipantOnline = true
                                break
                            }
                        }
                    }

                    if (!isParticipantOnline) {
                        console.log(`Participant ${participantIdStr} is offline. Sending push notification for message.`)
                        await sendMessagePushNotification(message, conversation, senderUser)
                    }
                }
            }
        } catch (error) {
            console.error("Error handling message notifications:", error)
        }
    })

    socket.on("mark-as-read", (messageId) => {
        socket.broadcast.emit("message-read", {
            messageId,
            userId: socket.userId,
            deviceId: socket.deviceId,
        })
    })

    socket.on("mark-as-delivered", (messageId) => {
        socket.broadcast.emit("message-delivered", {
            messageId,
            userId: socket.userId,
            deviceId: socket.deviceId,
        })
    })

    // ===== TYPING EVENTS =====
    socket.on("set-typing", (conversationId) => {
        socket.to(conversationId).emit("user-typing", {
            conversationId,
            userId: socket.userId,
            userName: socket.user?.name,
            deviceId: socket.deviceId,
        })
    })

    socket.on("stop-typing", (conversationId) => {
        socket.to(conversationId).emit("user-stop-typing", {
            conversationId,
            userId: socket.userId,
            deviceId: socket.deviceId,
        })
    })

    // ===== USER STATUS EVENTS =====
    socket.on("set-online-status", (status) => {
        if (onlineUsers.has(socket.userId)) {
            const userInfo = onlineUsers.get(socket.userId)
            userInfo.lastSeen = new Date()
        }
        socket.broadcast.emit("user-status-change", {
            userId: socket.userId,
            lastSeen: new Date(),
            deviceId: socket.deviceId,
        })
    })

    socket.on("check-user-status", async ({ userId }) => {
        try {
            const user = await User.findById(userId).select("devices name lastSeen")
            if (user) {
                let isOnline = false
                let userActiveDeviceId = null
                const dbActiveDevice = user.devices.find((device) => device.isActive)
                if (dbActiveDevice) userActiveDeviceId = dbActiveDevice.deviceId

                if (userDevices.has(userId)) {
                    for (const devId of userDevices.get(userId)) {
                        if (deviceSockets.has(devId)) {
                            isOnline = true
                            break
                        }
                    }
                }

                socket.emit("user-status-response", {
                    userId,
                    status: isOnline ? "online" : "offline",
                    activeDevice: userActiveDeviceId,
                    lastSeen: user.lastSeen,
                })
            } else {
                socket.emit("user-status-response", { userId, status: "offline", activeDevice: null })
            }
        } catch (error) {
            console.error("Error checking user status for", userId, error)
            socket.emit("user-status-response", { userId, status: "offline", activeDevice: null })
        }
    })

    socket.on("notify-user-came-online", (userId) => {
        if (userDevices.has(userId)) {
            userDevices.get(userId).forEach((devId) => {
                const targetSocketId = deviceSockets.get(devId)
                if (targetSocketId) {
                    io.to(targetSocketId).emit("user-came-online", {
                        userId: socket.userId,
                        deviceId: socket.deviceId,
                        name: socket.user?.name,
                    })
                }
            })
        }
    })

    // ===== ONE-TO-ONE CALL EVENTS =====
    socket.on("initiate-call", async ({ receiverId, callType, callId, offer, callerDeviceId }) => {
        try {
            const actualCallerDeviceId = callerDeviceId || socket.deviceId
            console.log(
                `[Initiate Call] Received from caller ${socket.userId} (device: ${actualCallerDeviceId}) for receiver ${receiverId}. CallID: ${callId}, Type: ${callType}, Offer present: ${!!offer}`,
            )

            const receiver = await User.findById(receiverId).populate("devices")
            if (!receiver) {
                console.log(`[Initiate Call] Receiver ${receiverId} not found. CallID: ${callId}`)
                socket.emit("call-initiation-failed", { callId, reason: "Receiver not found", toUserId: receiverId })
                return
            }

            const activeReceiverDevice = receiver.devices.find((d) => d.isActive)
            let targetReceiverDeviceId = activeReceiverDevice ? activeReceiverDevice.deviceId : null

            if (!targetReceiverDeviceId && receiver.devices.length > 0) {
                console.log(
                    `[Initiate Call] Receiver ${receiverId} has no active device, but has devices. Picking first one as target for now: ${receiver.devices[0].deviceId}. CallID: ${callId}`,
                )
                targetReceiverDeviceId = receiver.devices[0].deviceId
            }

            const callPayload = {
                callId,
                caller: {
                    id: socket.userId,
                    name: socket.user?.name || "Unknown User",
                    profilePicture: socket.user?.profilePicture || "",
                    deviceId: actualCallerDeviceId,
                },
                callType,
                offer,
                targetDeviceId: targetReceiverDeviceId,
            }

            let receiverSocketInstance = null
            if (targetReceiverDeviceId) {
                const receiverSocketId = deviceSockets.get(targetReceiverDeviceId)
                if (receiverSocketId) {
                    receiverSocketInstance = io.sockets.sockets.get(receiverSocketId)
                }
            }

            if (receiverSocketInstance) {
                console.log(
                    `[Initiate Call] Emitting 'incoming-call-notification' to receiver ${receiverId} on device ${targetReceiverDeviceId} (Socket: ${receiverSocketInstance.id}). CallID: ${callId}.`,
                )
                receiverSocketInstance.emit("incoming-call-notification", callPayload)
            } else {
                console.log(
                    `[Initiate Call] Receiver ${receiverId} (Device: ${targetReceiverDeviceId || "N/A"}) not connected. Sending push notification. CallID: ${callId}`,
                )
                await sendCallPushNotification(receiverId, {
                    callId: callPayload.callId,
                    callType: callPayload.callType,
                    caller: callPayload.caller,
                })
            }
        } catch (error) {
            console.error(`[Initiate Call] Error for callId ${callId}:`, error)
            socket.emit("call-initiation-failed", { callId, reason: "Server error", toUserId: receiverId })
        }
    })

    socket.on("accept-call", ({ callId, callerId, answer, deviceId }) => {
        const accepterDeviceId = deviceId || socket.deviceId
        console.log(
            `[Accept Call] Received from callee ${socket.userId} (device: ${accepterDeviceId}). Caller to notify: ${callerId}. CallID: ${callId}. Answer SDP Present: ${!!answer}.`,
        )

        if (!answer) {
            console.error(
                `[Accept Call] CRITICAL: Answer SDP missing in 'accept-call' event from callee ${socket.userId} (device: ${accepterDeviceId}) for call ${callId}.`,
            )
            socket.emit("call-accept-failed", { callId, reason: "Your client did not send an SDP answer." })
            return
        }

        const callerSocketInstances = []
        if (userDevices.has(callerId)) {
            userDevices.get(callerId).forEach((devId) => {
                const socketId = deviceSockets.get(devId)
                if (socketId) {
                    const S = io.sockets.sockets.get(socketId)
                    if (S) {
                        callerSocketInstances.push(S)
                    }
                }
            })
        }

        if (callerSocketInstances.length === 0) {
            console.log(`[Accept Call] No active socket instances found for original caller ${callerId}. CallID: ${callId}`)
            socket.emit("call-accept-failed", { callId, reason: "Original caller is not available." })
            return
        }

        const payloadForCaller = {
            callId,
            answer,
            acceptedBy: {
                id: socket.userId,
                deviceId: accepterDeviceId,
                name: socket.user?.name || "Unknown User",
            },
        }

        callerSocketInstances.forEach((callerSocketInstance) => {
            try {
                callerSocketInstance.emit("call-accepted", payloadForCaller)
            } catch (e) {
                console.error(`[Accept Call] Error emitting 'call-accepted' to caller socket ${callerSocketInstance.id}:`, e)
            }
        })
    })

    socket.on("reject-call", async ({ callId, callerId, reason, rejecterDeviceId }) => {
        const actualRejecterDeviceId = rejecterDeviceId || socket.deviceId
        console.log(
            `[Reject Call] Received from ${socket.userId} (device: ${actualRejecterDeviceId}) for call ${callId} initiated by ${callerId}. Reason: ${reason}`,
        )

        if (userDevices.has(callerId)) {
            userDevices.get(callerId).forEach((devId) => {
                const targetSocketId = deviceSockets.get(devId)
                if (targetSocketId) {
                    io.to(targetSocketId).emit("call-session-terminated", {
                        callId,
                        reason: "rejected",
                        rejectedBy: {
                            id: socket.userId,
                            deviceId: actualRejecterDeviceId,
                            name: socket.user?.name,
                        },
                        details: reason,
                    })
                }
            })
        }

        if (userDevices.has(socket.userId)) {
            userDevices.get(socket.userId).forEach((devId) => {
                if (devId !== actualRejecterDeviceId) {
                    const targetSocketId = deviceSockets.get(devId)
                    if (targetSocketId) {
                        io.to(targetSocketId).emit("call-session-terminated", {
                            callId,
                            reason: "rejected_by_own_device",
                            rejectedBy: { id: socket.userId, deviceId: actualRejecterDeviceId, name: socket.user?.name },
                            details: `Call rejected on another device (${actualRejecterDeviceId})`,
                        })
                    }
                }
            })
        }
    })

    socket.on("end-call", async ({ callId, recipientId, reason, endedByDeviceId }) => {
        const actualEndedByDeviceId = endedByDeviceId || socket.deviceId
        console.log(
            `[End Call] Received from ${socket.userId} (device: ${actualEndedByDeviceId}) for call ${callId} involving ${recipientId}. Reason: ${reason}`,
        )

        const involvedUserIds = new Set([socket.userId, recipientId].filter((id) => id))

        involvedUserIds.forEach((userId) => {
            if (userDevices.has(userId)) {
                userDevices.get(userId).forEach((devId) => {
                    const targetSocketId = deviceSockets.get(devId)
                    if (targetSocketId) {
                        io.to(targetSocketId).emit("call-session-terminated", {
                            callId,
                            reason: reason || "ended",
                            endedBy: {
                                id: socket.userId,
                                deviceId: actualEndedByDeviceId,
                                name: socket.user?.name,
                            },
                        })
                    }
                })
            }
        })
    })

    socket.on("send-ice-candidate", ({ callId, candidate, recipientId, targetDeviceId }) => {
        console.log(
            `[ICE Candidate] From ${socket.userId} (device: ${socket.deviceId}) for call ${callId} to user ${recipientId} (targetDevice: ${targetDeviceId || "any active"}). Candidate: ${!!candidate}`,
        )

        let targetSocketInstance = null

        if (targetDeviceId) {
            const targetSocketId = deviceSockets.get(targetDeviceId)
            if (targetSocketId) {
                targetSocketInstance = io.sockets.sockets.get(targetSocketId)
            }
        } else if (recipientId) {
            if (userDevices.has(recipientId)) {
                userDevices.get(recipientId).forEach((devId) => {
                    const S_ID = deviceSockets.get(devId)
                    if (S_ID) {
                        const S_INSTANCE = io.sockets.sockets.get(S_ID)
                        if (S_INSTANCE) {
                            S_INSTANCE.emit("ice-candidate-received", {
                                callId,
                                candidate,
                                senderId: socket.userId,
                                senderDeviceId: socket.deviceId,
                            })
                        }
                    }
                })
                return
            }
        }

        if (targetSocketInstance) {
            targetSocketInstance.emit("ice-candidate-received", {
                callId,
                candidate,
                senderId: socket.userId,
                senderDeviceId: socket.deviceId,
            })
        } else {
            console.warn(
                `[ICE Candidate] Could not find a live socket for user ${recipientId} (device: ${targetDeviceId || "any active"}) to send ICE candidate. CallID: ${callId}`,
            )
        }
    })

    // ===== GROUP CALL EVENTS =====
    socket.on("join-group-call", async (groupId) => {
        const roomName = `group-call:${groupId}`
        socket.join(roomName)
        console.log(`User ${socket.userId} (Socket: ${socket.id}) joined group call: ${groupId}`)

        const socketsInRoom = await io.in(roomName).fetchSockets()
        const existingParticipants = []
        for (const s of socketsInRoom) {
            if (s.id !== socket.id && s.userId) {
                // Don't add self to list for self
                existingParticipants.push({
                    userId: s.userId,
                    name: s.user?.name || "Unknown User",
                    profilePicture: s.user?.profilePicture || "",
                    socketId: s.id, // Important for direct WebRTC signaling
                    deviceId: s.deviceId,
                })
            }
        }
        // Send list of existing participants to the new joiner
        socket.emit("existing-group-participants", { callId: groupId, participants: existingParticipants })

        const newParticipantPayloadForLogging = {
            callId: groupId,
            participant: {
                userId: socket.userId,
                name: socket.user?.name || "Unknown User",
                profilePicture: socket.user?.profilePicture || "",
                socketId: socket.id,
                deviceId: socket.deviceId,
            },
        }

        console.log(
            `[Server Index.js] About to emit 'participant-joined-group' to room ${roomName} for new participant ${socket.userId} (Socket: ${socket.id}). Payload:`,
            JSON.stringify(newParticipantPayloadForLogging),
        )

        // Log details about who the event is being sent to
        const socketsInRoomForBroadcast = await io.in(roomName).fetchSockets() // Re-fetch or use socketsInRoom if still valid and sender is filtered
        socketsInRoomForBroadcast.forEach((s_in_room) => {
            if (s_in_room.id !== socket.id) {
                // Ensure not to log for the sender itself regarding this broadcast
                console.log(
                    `[Server Index.js] Emitting 'participant-joined-group' to existing participant ${s_in_room.userId} (Socket: ${s_in_room.id}, Device: ${s_in_room.deviceId}) in room ${roomName}.`,
                )
            }
        })

        // This is the existing emit, ensure its payload is correct
        socket.to(roomName).emit("participant-joined-group", {
            callId: groupId,
            participant: {
                userId: socket.userId,
                name: socket.user?.name || "Unknown User",
                profilePicture: socket.user?.profilePicture || "",
                socketId: socket.id, // Important for direct WebRTC signaling
                deviceId: socket.deviceId,
            },
        })
        // Notify other participants about the new joiner
        socket.to(roomName).emit("participant-joined-group", {
            callId: groupId,
            participant: {
                userId: socket.userId,
                name: socket.user?.name || "Unknown User",
                profilePicture: socket.user?.profilePicture || "",
                socketId: socket.id, // Important for direct WebRTC signaling
                deviceId: socket.deviceId,
            },
        })
    })

    socket.on("leave-group-call", (groupId) => {
        const roomName = `group-call:${groupId}`
        socket.leave(roomName)
        console.log(`User ${socket.userId} (Socket: ${socket.id}) left group call: ${groupId}`)

        io.to(roomName).emit("participant-left-group", {
            // Use io.to to include sender's other devices if any in room
            callId: groupId,
            participantId: socket.userId,
            socketId: socket.id, // So clients can identify which specific connection left
            deviceId: socket.deviceId,
        })
    })

    // This event is for initiating a group call to multiple people (like an invite)
    // For WebRTC offers *within* an ongoing call, use "group-offer-to-peer"
    socket.on("group-call-offer", async ({ callId, conversationId, participants, callType, callerInfo }) => {
        console.log(`Group call offer from ${socket.userId} for call ${callId} (conversation: ${conversationId})`)

        for (const participant of participants) {
            // participant is { userId: string, ... }
            if (participant.userId !== socket.userId) {
                let sentToOnlineDevice = false
                if (userDevices.has(participant.userId)) {
                    for (const devId of userDevices.get(participant.userId)) {
                        const targetSocketId = deviceSockets.get(devId)
                        if (targetSocketId) {
                            const targetSocket = io.sockets.sockets.get(targetSocketId)
                            if (targetSocket) {
                                targetSocket.emit("group-call-offer-received", {
                                    // This is the invite
                                    callId,
                                    conversationId,
                                    callType,
                                    callerInfo, // { id, name, profilePicture, deviceId }
                                    // participants, // Client might not need full list here, or server filters it
                                })
                                sentToOnlineDevice = true
                                console.log(`Sent group-call-offer-received to ${participant.userId} on device ${devId}`)
                            }
                        }
                    }
                }

                if (!sentToOnlineDevice) {
                    console.log(`Participant ${participant.userId} for group call ${callId} is offline. Sending push.`)
                    await sendCallPushNotification(participant.userId, {
                        callId,
                        callType: `group ${callType}`,
                        caller: callerInfo,
                        isGroupCall: true,
                        conversationId,
                    })
                }
            }
        }
    })

    // Relaying WebRTC offers between peers in a group call
    socket.on("group-offer-to-peer", ({ callId, toSocketId, offer }) => {
        console.log(`Relaying group offer from ${socket.userId} (Socket: ${socket.id}) to ${toSocketId} for call ${callId}`)
        socket.to(toSocketId).emit("group-offer-from-peer", {
            callId,
            fromSocketId: socket.id,
            fromUserId: socket.userId,
            fromDeviceId: socket.deviceId,
            offer,
        })
    })

    // Relaying WebRTC answers between peers in a group call
    socket.on("group-answer-to-peer", ({ callId, toSocketId, answer }) => {
        console.log(
            `Relaying group answer from ${socket.userId} (Socket: ${socket.id}) to ${toSocketId} for call ${callId}`,
        )
        socket.to(toSocketId).emit("group-answer-from-peer", {
            callId,
            fromSocketId: socket.id,
            fromUserId: socket.userId,
            fromDeviceId: socket.deviceId,
            answer,
        })
    })

    // Relaying ICE candidates between peers in a group call
    socket.on("group-ice-candidate-to-peer", ({ callId, toSocketId, candidate }) => {
        console.log(
            `Relaying group ICE candidate from ${socket.userId} (Socket: ${socket.id}) to ${toSocketId} for call ${callId}`,
        )
        socket.to(toSocketId).emit("group-ice-candidate-from-peer", {
            callId,
            fromSocketId: socket.id,
            fromUserId: socket.userId,
            fromDeviceId: socket.deviceId,
            candidate,
        })
    })

    socket.on("group-call-answer", ({ callId, participantId, conversationId }) => {
        // This seems like an acceptance of the initial invite
        io.to(`group-call:${callId}`).emit("group-call-answered", {
            // Notify everyone in the call
            callId,
            participantId, // User who answered the invite
            conversationId,
        })
    })

    socket.on("group-call-reject", ({ callId, participantId, conversationId }) => {
        // Rejection of initial invite
        io.to(`group-call:${callId}`).emit("group-call-rejected", {
            callId,
            participantId,
            conversationId,
        })
    })

    // New event handler for when an invitee declines a group call invitation
    socket.on("group-call-invite-declined", ({ callId, inviterId, inviteeId, reason }) => {
        console.log(
            `[Server] Group call invite for call ${callId} declined by ${inviteeId} (inviter: ${inviterId}). Reason: ${reason}`,
        )
        // Notify the original inviter (caller) that the invite was declined
        if (userDevices.has(inviterId)) {
            userDevices.get(inviterId).forEach((devId) => {
                const targetSocketId = deviceSockets.get(devId)
                if (targetSocketId) {
                    io.to(targetSocketId).emit("group-call-invite-was-declined", {
                        callId,
                        inviteeId,
                        inviteeName: socket.user?.name || "A user", // Get name of user who declined
                        reason,
                    })
                    console.log(
                        `[Server] Notified inviter ${inviterId} (device ${devId}) that invite to ${inviteeId} was declined.`,
                    )
                }
            })
        }
    })

    socket.on("end-group-call", ({ callId, conversationId, endedBy }) => {
        // endedBy is userId
        io.to(`group-call:${callId}`).emit("group-call-ended", {
            callId,
            conversationId,
            endedBy,
        })
    })

    // The existing "group-ice-candidate", "group-offer", "group-answer" with "toParticipant"
    // might be intended for a different flow or if "toParticipant" is a socket ID.
    // For clarity, I've added "*-to-peer" events. If the original ones are preferred,
    // ensure "toParticipant" is consistently a socket ID.
    // For now, I'll keep the original ones as they were, assuming client handles `toParticipant` as socket ID.
    socket.on("group-ice-candidate", ({ callId, candidate, fromParticipant, toParticipant }) => {
        // Assuming toParticipant is a socket ID
        console.log(
            `Legacy group-ice-candidate: from ${fromParticipant}(${socket.userId}) to ${toParticipant} for call ${callId}`,
        )
        io.to(toParticipant).emit("group-ice-candidate", {
            callId,
            candidate,
            fromParticipant: socket.userId, // or fromParticipant if it's already userId
            fromSocketId: socket.id,
        })
    })

    socket.on("group-offer", ({ callId, fromParticipant, toParticipant, offer }) => {
        // Assuming toParticipant is a socket ID
        console.log(`Legacy group-offer: from ${fromParticipant}(${socket.userId}) to ${toParticipant} for call ${callId}`)
        io.to(toParticipant).emit("group-offer", {
            callId,
            fromParticipant: socket.userId, // or fromParticipant if it's already userId
            fromSocketId: socket.id,
            offer,
        })
    })

    socket.on("group-answer", ({ callId, fromParticipant, toParticipant, answer }) => {
        // Assuming toParticipant is a socket ID
        console.log(`Legacy group-answer: from ${fromParticipant}(${socket.userId}) to ${toParticipant} for call ${callId}`)
        io.to(toParticipant).emit("group-answer", {
            callId,
            fromParticipant: socket.userId, // or fromParticipant if it's already userId
            fromSocketId: socket.id,
            answer,
        })
    })

    socket.on("participant-muted", ({ callId, participantId, isMuted }) => {
        io.to(`group-call:${callId}`).emit("group-participant-muted", {
            // Changed event name for clarity
            callId,
            participantId: participantId || socket.userId, // If participantId not sent, assume it's the sender
            isMuted,
        })
    })

    socket.on("participant-video-toggled", ({ callId, participantId, isVideoEnabled }) => {
        io.to(`group-call:${callId}`).emit("group-participant-video-changed", {
            // Changed event name
            callId,
            participantId: participantId || socket.userId,
            isVideoEnabled,
        })
    })

    socket.on("group-call-invite", async ({ callId, conversationId, invitedParticipant, inviterInfo }) => {
        // invitedParticipant is { _id: string (userId) }
        // inviterInfo is { id, name, profilePicture, deviceId }
        let sentToOnlineDevice = false
        if (userDevices.has(invitedParticipant._id)) {
            for (const devId of userDevices.get(invitedParticipant._id)) {
                const targetSocketId = deviceSockets.get(devId)
                if (targetSocketId) {
                    const targetSocket = io.sockets.sockets.get(targetSocketId)
                    if (targetSocket) {
                        targetSocket.emit("group-call-invitation", {
                            // This seems like a duplicate of group-call-offer-received logic
                            callId,
                            conversationId,
                            inviterInfo,
                            // participant: invitedParticipant, // Client might not need this if already has user info
                        })
                        sentToOnlineDevice = true
                    }
                }
            }
        }

        if (!sentToOnlineDevice) {
            await sendCallPushNotification(invitedParticipant._id, {
                callId,
                callType: "group call", // Consider making this more specific like "group audio" or "group video"
                caller: inviterInfo,
                isGroupCall: true,
                conversationId,
            })
        }
    })

    socket.on("group-call-remove-participant", ({ callId, conversationId, removedParticipantId, removedBy }) => {
        // removedParticipantId is userId
        // removedBy is userId
        if (userDevices.has(removedParticipantId)) {
            userDevices.get(removedParticipantId).forEach((devId) => {
                const targetSocketId = deviceSockets.get(devId)
                if (targetSocketId) {
                    const targetSocket = io.sockets.sockets.get(targetSocketId)
                    if (targetSocket) {
                        targetSocket.emit("removed-from-group-call", {
                            callId,
                            conversationId,
                            removedBy,
                        })
                        targetSocket.leave(`group-call:${callId}`) // Force leave room
                    }
                }
            })
        }
        // Notify remaining participants
        io.to(`group-call:${callId}`).emit("participant-left-group", {
            // Use the consistent event
            callId,
            participantId: removedParticipantId,
            // socketId might not be available if user is already disconnected
        })
    })

    socket.on("group-ice-restart-request", ({ callId, fromParticipant, toParticipant }) => {
        // fromParticipant is userId, toParticipant is userId
        // This needs to be relayed to the specific socket of toParticipant
        // This logic is complex if toParticipant has multiple devices in the call.
        // For simplicity, sending to all devices of toParticipant in the call.
        const roomName = `group-call:${callId}`
        if (userDevices.has(toParticipant)) {
            userDevices.get(toParticipant).forEach((devId) => {
                const targetSocketId = deviceSockets.get(devId)
                if (targetSocketId) {
                    const targetSocket = io.sockets.sockets.get(targetSocketId)
                    if (targetSocket && targetSocket.rooms.has(roomName)) {
                        targetSocket.emit("group-ice-restart-needed", {
                            callId,
                            fromParticipantId: fromParticipant, // userId of requester
                            // fromSocketId: socket.id, // Could be useful
                        })
                    }
                }
            })
        }
    })

    // ===== CALL QUALITY EVENTS =====
    socket.on("send-call-quality-metrics", ({ callId, callType, metrics }) => {
        if (callType === "group") {
            io.to(`group-call:${callId}`).emit("group-call-quality-issue", {
                callId,
                participantId: socket.userId,
                deviceId: socket.deviceId,
                issueType: "quality_metrics",
                metrics,
            })
        } else {
            if (metrics.recipientId) {
                if (userDevices.has(metrics.recipientId)) {
                    userDevices.get(metrics.recipientId).forEach((devId) => {
                        const targetSocketId = deviceSockets.get(devId)
                        if (targetSocketId) {
                            io.to(targetSocketId).emit("call-quality-issue", {
                                callId,
                                userId: socket.userId,
                                deviceId: socket.deviceId,
                                issueType: "quality_metrics",
                                metrics,
                            })
                        }
                    })
                }
            }
        }
    })

    socket.on("send-network-fallback", ({ callId, callType, fallbackType, recipientId }) => {
        if (callType === "group") {
            io.to(`group-call:${callId}`).emit("group-network-fallback", {
                callId,
                participantId: socket.userId,
                deviceId: socket.deviceId,
                fallbackType,
            })
        } else if (recipientId) {
            if (userDevices.has(recipientId)) {
                userDevices.get(recipientId).forEach((devId) => {
                    const targetSocketId = deviceSockets.get(devId)
                    if (targetSocketId) {
                        io.to(targetSocketId).emit("network-fallback", {
                            callId,
                            userId: socket.userId,
                            deviceId: socket.deviceId,
                            fallbackType,
                        })
                    }
                })
            }
        }
    })

    socket.on("request-ice-restart", ({ callId, callType, recipientId }) => {
        // This is for 1-to-1
        if (callType === "group") {
            // This was handled by group-ice-restart-request
        } else if (recipientId) {
            if (userDevices.has(recipientId)) {
                userDevices.get(recipientId).forEach((devId) => {
                    const targetSocketId = deviceSockets.get(devId)
                    if (targetSocketId) {
                        io.to(targetSocketId).emit("ice-restart-needed", {
                            // For 1-to-1
                            callId,
                            userId: socket.userId,
                            deviceId: socket.deviceId,
                        })
                    }
                })
            }
        }
    })

    // ===== NOTIFICATION EVENTS =====
    socket.on("send-call-push-notification", async ({ receiverId, callData }) => {
        await sendCallPushNotification(receiverId, callData)
    })

    // ===== SCREEN SHARING EVENTS =====
    socket.on("set-group-call-screen-sharing", ({ callId, status }) => {
        io.to(`group-call:${callId}`).emit("group-call-screen-sharing", {
            callId,
            userId: socket.userId,
            deviceId: socket.deviceId,
            isSharing: status,
        })
    })

    // ===== DEVICE MANAGEMENT =====
    socket.on("participant-device-change", ({ participantId, newActiveDevice }) => {
        socket.broadcast.emit("participant-device-change", {
            participantId,
            newActiveDevice,
        })
    })

    socket.on("participant-status-update", ({ participantId, status }) => {
        socket.broadcast.emit("participant-status-update", {
            participantId,
            status,
        })
    })

    // ===== ADMIN EVENTS =====
    socket.on("admin:join-dashboard", () => {
        socket.join("admin-dashboard")
        console.log(`Admin ${socket.userId} joined admin dashboard`)
    })

    socket.on("admin:leave-dashboard", () => {
        socket.leave("admin-dashboard")
        console.log(`Admin ${socket.userId} left admin dashboard`)
    })

    // ===== GROUP MANAGEMENT =====
    socket.on("join-group-room", (groupId) => {
        // This is likely for chat, not call
        socket.join(`group:${groupId}`)
        console.log(`User ${socket.userId} joined group room: group:${groupId}`)
    })

    socket.on("leave-group-room", (groupId) => {
        socket.leave(`group:${groupId}`)
        console.log(`User ${socket.userId} left group room: group:${groupId}`)
    })

    socket.on("update-group", ({ groupId, updates }) => {
        socket.to(`group:${groupId}`).emit("group-updated", {
            _id: groupId,
            ...updates,
        })
    })

    socket.on("add-participant", ({ groupId, participant }) => {
        socket.to(`group:${groupId}`).emit("participant-added", {
            groupId,
            participant,
        })
    })

    socket.on("remove-participant", ({ groupId, participantId }) => {
        socket.to(`group:${groupId}`).emit("participant-removed", {
            groupId,
            participantId,
        })
    })

    socket.on("change-admin", ({ groupId, newAdminId }) => {
        socket.to(`group:${groupId}`).emit("admin-changed", {
            groupId,
            newAdminId,
        })
    })

    // ===== LEGACY SUPPORT =====
    socket.on("addUser", (userId) => {
        console.log(`Legacy addUser event for ${userId}`)
    })

    socket.on("sendMessage", ({ senderId, receiverId, text }) => {
        if (userDevices.has(receiverId)) {
            userDevices.get(receiverId).forEach((devId) => {
                const targetSocketId = deviceSockets.get(devId)
                if (targetSocketId) {
                    io.to(targetSocketId).emit("getMessage", {
                        senderId,
                        text,
                    })
                }
            })
        }
    })

    // ===== DISCONNECT HANDLING =====
    socket.on("disconnect", async (reason) => {
        console.log(
            `User disconnected: ${socket.userId}, Device: ${socket.deviceId}, Socket ID: ${socket.id}. Reason: ${reason}`,
        )

        // Handle group call participant leaving due to disconnect
        // Iterate over rooms the socket was in, if any are group call rooms, notify others.
        socket.rooms.forEach((roomName) => {
            if (roomName.startsWith("group-call:")) {
                io.to(roomName).emit("participant-left-group", {
                    callId: roomName.replace("group-call:", ""),
                    participantId: socket.userId,
                    socketId: socket.id,
                    deviceId: socket.deviceId,
                    reason: "disconnect",
                })
                console.log(`User ${socket.userId} (Socket: ${socket.id}) auto-left group call ${roomName} due to disconnect.`)
            }
        })

        socketUtils.removeActiveUser(socket.userId)
        userSockets.delete(socket.id)

        if (userDevices.has(socket.userId)) {
            userDevices.get(socket.userId).delete(socket.deviceId)
            if (userDevices.get(socket.userId).size === 0) {
                userDevices.delete(socket.userId)
                onlineUsers.delete(socket.userId)
                console.log(`User ${socket.userId} is now fully offline (all devices disconnected).`)
            } else {
                const onlineUserInfo = onlineUsers.get(socket.userId)
                if (onlineUserInfo && onlineUserInfo.deviceId === socket.deviceId) {
                    console.log(`Device ${socket.deviceId} for user ${socket.userId} (listed in onlineUsers) disconnected.`)
                }
            }
        }
        deviceSockets.delete(socket.deviceId)

        try {
            if (!userDevices.has(socket.userId) || userDevices.get(socket.userId).size === 0) {
                await User.updateOne({ _id: socket.userId }, { lastSeen: new Date() })
                console.log(`Updated lastSeen for user ${socket.userId} as they are now fully offline.`)
            }
        } catch (error) {
            console.error("Error updating last seen for user:", socket.userId, error)
        }

        let isUserStillOnlineOnOtherDevice = false
        if (userDevices.has(socket.userId) && userDevices.get(socket.userId).size > 0) {
            isUserStillOnlineOnOtherDevice = true
        }

        if (!isUserStillOnlineOnOtherDevice) {
            socket.broadcast.emit("user-status-change", {
                userId: socket.userId,
                status: "offline",
                lastSeen: new Date(),
            })
            console.log(`Broadcasted user ${socket.userId} as fully offline.`)
        } else {
            console.log(`User ${socket.userId} disconnected device ${socket.deviceId}, but remains online on other devices.`)
            socket.broadcast.emit("user-device-status-change", {
                userId: socket.userId,
                deviceId: socket.deviceId,
                status: "disconnected",
                remainingOnlineDevices: Array.from(userDevices.get(socket.userId) || []),
            })
        }
    })
})

module.exports = { app, io }
