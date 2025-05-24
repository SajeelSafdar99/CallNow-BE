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
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(
    cors({
        origin: ["http://127.0.0.1:5173", "http://192.168.10.53:5173"], // Allow both localhost and 127.0.0.1
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: "*",
        credentials: true, // Allow credentials
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

const PORT = process.env.PORT || 4000
const server = app.listen(PORT, () => console.log(`Server running on port ${PORT}`))

// Initialize Socket.io with proper CORS configuration
const { Server } = require("socket.io")
const io = new Server(server, {
    cors: {
        origin: ["http://127.0.0.1:5173", "http://192.168.10.53:5173"],
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
        credentials: true,
    },
    path: "/socket.io/", // Explicit path
})

// Socket.io middleware for authentication
io.use((socket, next) => {
    const token = socket.handshake.auth.token
    if (!token) {
        return next(new Error("Authentication error: Token not provided"))
    }

    const decoded = verifyToken(token)
    if (!decoded) {
        return next(new Error("Authentication error: Invalid token"))
    }

    socket.userId = decoded.id
    socket.deviceId = socket.handshake.auth.deviceId
    next()
})
let users = []

const addUser = (userId, socketId) => {
    !users.some((user) => user.userId === userId) && users.push({ userId, socketId })
}

const removeUser = (socketId) => {
    users = users.filter((user) => user.socketId !== socketId)
}

const getUser = (userId) => {
    return users.find((user) => user.userId === userId)
}

// Socket.io connection
io.on("connection", (socket) => {
    console.log(`User connected: ${socket.userId}, Device: ${socket.deviceId}`)

    // Join user's room for private messages
    socket.join(socket.userId)

    // Handle joining conversation rooms
    socket.on("join-conversation", (conversationId) => {
        socket.join(conversationId)
        console.log(`User ${socket.userId} joined conversation: ${conversationId}`)
    })

    // Handle leaving conversation rooms
    socket.on("leave-conversation", (conversationId) => {
        socket.leave(conversationId)
        console.log(`User ${socket.userId} left conversation: ${conversationId}`)
    })
    socket.on("addUser", (userId) => {
        addUser(userId, socket.id)
        io.emit("getUsers", users)
    })

    //send and get message
    socket.on("sendMessage", ({ senderId, receiverId, text }) => {
        const user = getUser(receiverId)
        if (user) {
            io.to(user.socketId).emit("getMessage", {
                senderId,
                text,
            })
        }
    })

    // Handle message read
    socket.on("read-message", ({ messageId, conversationId, userId }) => {
        socket.to(conversationId).emit("message-read", {
            messageId,
            conversationId,
            userId,
        })
    })

    // Handle message delivered
    socket.on("deliver-message", ({ messageId, conversationId, userId }) => {
        socket.to(conversationId).emit("message-delivered", {
            messageId,
            conversationId,
            userId,
        })
    })

    // Handle typing indicator
    socket.on("typing", ({ conversationId, userId }) => {
        console.log(`Server received typing event from user ${userId} in conversation ${conversationId}`)
        socket.to(conversationId).emit("user-typing", { conversationId, userId })
    })

    socket.on("stop-typing", ({ conversationId, userId }) => {
        console.log(`Server received stop-typing event from user ${userId} in conversation ${conversationId}`)
        socket.to(conversationId).emit("user-stop-typing", { conversationId, userId })
    })

    // Handle user online status
    socket.on("set-online-status", ({ status }) => {
        // Broadcast to all users that this user is online/offline
        socket.broadcast.emit("user-status-change", {
            userId: socket.userId,
            status,
        })
    })

    // Add these event handlers after the "set-online-status" handler

    // Handle user status query
    socket.on("get-user-status", ({ userId }) => {
        // Find the socket of the requested user if they're online
        const userSockets = io.sockets.adapter.rooms.get(userId)
        const isOnline = !!userSockets && userSockets.size > 0

        // Send status back to requester
        socket.emit("user-status", {
            userId,
            status: isOnline ? "online" : "offline",
        })
    })

    // Handle joining group rooms (for group details updates)
    socket.on("join-group-room", (groupId) => {
        socket.join(`group:${groupId}`)
        console.log(`User ${socket.userId} joined group room: group:${groupId}`)
    })

    // Handle leaving group rooms
    socket.on("leave-group-room", (groupId) => {
        socket.leave(`group:${groupId}`)
        console.log(`User ${socket.userId} left group room: group:${groupId}`)
    })

    // Handle group updates
    socket.on("update-group", ({ groupId, updates }) => {
        socket.to(`group:${groupId}`).emit("group-updated", {
            _id: groupId,
            ...updates,
        })
    })

    // Handle participant management
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

    // WebRTC Signaling for 1-to-1 calls
    // Handle call offer
    socket.on("call-offer", ({ callId, receiverId, offer, callType }) => {
        // Send offer to receiver
        socket.to(receiverId).emit("incoming-call", {
            callId,
            callerId: socket.userId,
            offer,
            callType,
        })
    })

    // Handle call answer
    socket.on("call-answer", ({ callId, callerId, answer }) => {
        // Send answer to caller
        socket.to(callerId).emit("call-answered", {
            callId,
            receiverId: socket.userId,
            answer,
        })
    })

    // Handle ICE candidates for 1-to-1 calls
    socket.on("ice-candidate", ({ callId, candidate, recipientId }) => {
        // Send ICE candidate to the other peer
        socket.to(recipientId).emit("ice-candidate", {
            callId,
            candidate,
            senderId: socket.userId,
        })
    })

    // Handle call rejection
    socket.on("reject-call", ({ callId, callerId }) => {
        // Notify caller that call was rejected
        socket.to(callerId).emit("call-rejected", {
            callId,
            receiverId: socket.userId,
        })
    })

    // Handle call end
    socket.on("end-call", ({ callId, recipientId }) => {
        // Notify the other peer that call has ended
        socket.to(recipientId).emit("call-ended", {
            callId,
            endedBy: socket.userId,
        })
    })

    // Group Call Signaling
    // Join a group call room
    socket.on("join-group-call", (groupCallId) => {
        socket.join(`group-call:${groupCallId}`)
        console.log(`User ${socket.userId} joined group call: ${groupCallId}`)
    })

    // Leave a group call room
    socket.on("leave-group-call", (groupCallId) => {
        socket.leave(`group-call:${groupCallId}`)
        console.log(`User ${socket.userId} left group call: ${groupCallId}`)
    })

    // Send offer to a specific participant in group call
    socket.on("group-call-offer", ({ groupCallId, receiverId, offer, connectionId }) => {
        socket.to(receiverId).emit("group-call-offer", {
            groupCallId,
            senderId: socket.userId,
            offer,
            connectionId,
        })
    })

    // Send answer to a specific participant in group call
    socket.on("group-call-answer", ({ groupCallId, receiverId, answer, connectionId }) => {
        socket.to(receiverId).emit("group-call-answer", {
            groupCallId,
            senderId: socket.userId,
            answer,
            connectionId,
        })
    })

    // Send ICE candidate to a specific participant in group call
    socket.on("group-call-ice-candidate", ({ groupCallId, receiverId, candidate, connectionId }) => {
        socket.to(receiverId).emit("group-call-ice-candidate", {
            groupCallId,
            senderId: socket.userId,
            candidate,
            connectionId,
        })
    })

    // Notify all participants about a new participant joining
    socket.on("group-call-user-joined", ({ groupCallId, user }) => {
        socket.to(`group-call:${groupCallId}`).emit("group-call-user-joined", {
            groupCallId,
            user,
        })
    })

    // Notify all participants about a participant leaving
    socket.on("group-call-user-left", ({ groupCallId, userId }) => {
        socket.to(`group-call:${groupCallId}`).emit("group-call-user-left", {
            groupCallId,
            userId,
        })
    })

    // Notify all participants about screen sharing status change
    socket.on("group-call-screen-sharing", ({ groupCallId, isSharing }) => {
        socket.to(`group-call:${groupCallId}`).emit("group-call-screen-sharing", {
            groupCallId,
            userId: socket.userId,
            isSharing,
        })
    })

    // Handle call quality metrics
    socket.on("call-quality-metrics", ({ callId, callType, metrics }) => {
        // Store metrics in database (handled by API endpoint)
        // But also notify other participants about quality issues if severe
        if (metrics.qualityScore && (metrics.qualityScore.audio < 2 || metrics.qualityScore.video < 2)) {
            if (callType === "one-to-one") {
                // For one-to-one calls, notify the other participant
                const recipientId = metrics.recipientId
                if (recipientId) {
                    socket.to(recipientId).emit("call-quality-issue", {
                        callId,
                        userId: socket.userId,
                        issueType: "poor_quality",
                        metrics: {
                            qualityScore: metrics.qualityScore,
                            rtt: metrics.rtt,
                            packetLoss: metrics.packetLoss,
                        },
                    })
                }
            } else if (callType === "group") {
                // For group calls, notify all participants in the room
                socket.to(`group-call:${callId}`).emit("call-quality-issue", {
                    callId,
                    userId: socket.userId,
                    issueType: "poor_quality",
                    metrics: {
                        qualityScore: metrics.qualityScore,
                        rtt: metrics.rtt,
                        packetLoss: metrics.packetLoss,
                    },
                })
            }
        }
    })

    // Handle network fallback events
    socket.on("network-fallback", ({ callId, callType, fallbackType, recipientId }) => {
        // Notify relevant participants about fallback
        if (callType === "one-to-one" && recipientId) {
            socket.to(recipientId).emit("network-fallback", {
                callId,
                userId: socket.userId,
                fallbackType,
            })
        } else if (callType === "group") {
            socket.to(`group-call:${callId}`).emit("network-fallback", {
                callId,
                userId: socket.userId,
                fallbackType,
            })
        }
    })

    // Handle ICE restart request
    socket.on("ice-restart-request", ({ callId, callType, recipientId }) => {
        if (callType === "one-to-one" && recipientId) {
            socket.to(recipientId).emit("ice-restart-needed", {
                callId,
                userId: socket.userId,
            })
        }
    })

    // Handle disconnect
    socket.on("disconnect", () => {
        console.log(`User disconnected: ${socket.userId}`)
        // Broadcast to all users that this user is offline
        socket.broadcast.emit("user-status-change", {
            userId: socket.userId,
            status: "offline",
        })
    })
})

// Connect to MongoDB
mongoose
    .connect(process.env.MONGODB_URI)
    .then(() => console.log("Connected to MongoDB"))
    .catch((err) => console.error("MongoDB connection error:", err))
