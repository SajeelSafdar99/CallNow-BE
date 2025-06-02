const User = require("../models/user")
const admin = require("firebase-admin")
const {authenticate} = require("../middleware/auth");

// Initialize Firebase Admin SDK (add this to your server startup)
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        }),
    })
}
// Add this new function to your existing notification.js file

// Send message notification
const sendMessageNotification = async (message, conversation, sender) => {
    try {
        // Get all participants except sender
        const recipientIds = conversation.participants.filter(
            (participant) => participant.toString() !== sender._id.toString(),
        )

        if (recipientIds.length === 0) return

        // Get recipients with their devices
        const recipients = await User.find({ _id: { $in: recipientIds } }, { _id: 1, name: 1, devices: 1 })

        // Prepare notification data
        const senderName = sender.name || "Someone"

        // Create notification payload based on message type
        let title = senderName
        let body = ""

        if (conversation.isGroup) {
            title = `${senderName} in ${conversation.name || "group"}`
        }

        switch (message.contentType) {
            case "text":
                body = message.content
                break
            case "image":
                body = "📷 Image"
                break
            case "video":
                body = "🎥 Video"
                break
            case "audio":
                body = "🎵 Audio message"
                break
            case "document":
                body = "📄 Document"
                break
            default:
                body = "New message"
        }

        // Process each recipient
        for (const recipient of recipients) {
            // Get active device tokens
            const activeTokens = recipient.devices
                .filter((device) => device.isActive && device.fcmToken)
                .map((device) => device.fcmToken)

            if (activeTokens.length === 0) continue

            // Prepare FCM message
            const notificationPayload = {
                title,
                body,
            }

            const dataPayload = {
                type: "message",
                conversationId: conversation._id.toString(),
                messageId: message._id.toString(),
                senderId: sender._id.toString(),
                senderName: sender.name,
                senderProfilePic: sender.profilePicture || "",
                contentType: message.contentType,
                createdAt: message.createdAt.toISOString(),
                isGroup: conversation.isGroup ? "true" : "false",
                groupId: conversation.isGroup ? conversation._id.toString() : "",
                groupName: conversation.isGroup ? conversation.name : "",
            }

            const fcmMessage = {
                notification: notificationPayload,
                data: Object.keys(dataPayload).reduce((acc, key) => {
                    acc[key] = String(dataPayload[key])
                    return acc
                }, {}),
                android: {
                    priority: "high",
                    notification: {
                        channelId: "messages",
                        priority: "default",
                        defaultSound: true,
                        defaultVibrateTimings: true,
                    },
                },
                apns: {
                    payload: {
                        aps: {
                            sound: "default",
                            badge: 1,
                            category: "MESSAGE",
                        },
                    },
                },
                tokens: activeTokens,
            }

            // Send to multiple devices
            const response = await admin.messaging().sendEachForMulticast(fcmMessage)

            console.log(`Push notification sent to ${recipient.name}:`, {
                successCount: response.successCount,
                failureCount: response.failureCount,
            })

            // Handle failed tokens (remove invalid ones)
            if (response.failureCount > 0) {
                const failedTokens = []
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        failedTokens.push(activeTokens[idx])
                        console.error("Failed to send to token:", activeTokens[idx], resp.error)
                    }
                })

                // Remove failed tokens from user's devices
                if (failedTokens.length > 0) {
                    await User.updateOne(
                        { _id: recipient._id },
                        {
                            $pull: {
                                "devices.$[].fcmToken": { $in: failedTokens },
                            },
                        },
                    )
                }
            }
        }
    } catch (error) {
        console.error("Error sending message notification:", error)
    }
}

// Send push notification to user
const sendPushNotificationToUser = async (req, res) => {
    try {
        const { userId, notification } = req.body

        const user = await User.findById(userId).select("devices name") // Removed fcmTokens as it's not in the latest userSchema
        console.log(
            `sendPushNotificationToUser: Processing user ${user?.name || userId}. Devices found in DB:`,
            JSON.stringify(user?.devices, null, 2),
        )

        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" })
        }

        const activeTokens = user.devices
            .filter((device) => {
                const hasToken = device.fcmToken && device.fcmToken.trim() !== ""
                const deviceIsActive = device.isActive === true
                console.log(
                    `sendPushNotificationToUser: Checking device ${device.deviceId} for user ${user.name || userId}: isActive=${deviceIsActive}, hasFcmToken=${hasToken} (Token: ${device.fcmToken ? device.fcmToken.substring(0, 10) + "..." : "N/A"})`,
                )
                return deviceIsActive && hasToken
            })
            .map((device) => device.fcmToken)

        console.log(
            `sendPushNotificationToUser: Filtered activeTokens for user ${user.name || userId}:`,
            JSON.stringify(activeTokens),
        )

        if (activeTokens.length === 0) {
            // This is where your error is triggered
            return res.status(400).json({ success: false, message: "No active devices found for user" })
        }

        const fcmMessage = {
            // Renamed from 'message' to 'fcmMessage' to avoid conflict
            notification: {
                title: notification.title,
                body: notification.body,
            },
            data: {
                ...notification.data,
                ...(notification.data &&
                    Object.keys(notification.data).reduce((acc, key) => {
                        acc[key] = String(notification.data[key])
                        return acc
                    }, {})),
            },
            android: {
                priority: "high",
                notification: {
                    channelId: notification.data?.type === "incoming_call" ? "calls" : "messages",
                    priority: "max", // Changed from "high" to "max" for calls, if desired
                    defaultSound: true,
                    defaultVibrateTimings: true,
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: "default",
                        badge: 1,
                        category: notification.data?.type === "incoming_call" ? "CALL_INVITE" : "MESSAGE",
                    },
                },
            },
            tokens: activeTokens,
        }

        const response = await admin.messaging().sendEachForMulticast(fcmMessage)
        console.log("Push notification sent:", {
            successCount: response.successCount,
            failureCount: response.failureCount,
        })

        if (response.failureCount > 0) {
            const failedTokens = []
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    failedTokens.push(activeTokens[idx])
                    console.error("Failed to send to token:", activeTokens[idx], resp.error)
                }
            })
            if (failedTokens.length > 0) {
                await User.updateOne(
                    { _id: userId },
                    { $pull: { "devices.$[].fcmToken": { $in: failedTokens } } }, // Corrected to pull fcmToken from device subdocument
                )
            }
        }

        res.json({
            success: true,
            message: "Push notification sent",
            successCount: response.successCount,
            failureCount: response.failureCount,
        })
    } catch (error) {
        console.error("Error sending push notification:", error)
        // Ensure response is sent if not already
        if (res && typeof res.status === "function" && !res.headersSent) {
            res.status(500).json({ success: false, message: "Failed to send push notification" })
        }
    }
}

// Send call notification specifically
const sendCallNotification = async (req, res) => {
    try {
        let finalNotificationObject
        let targetUserId

        if (req.body.notification && req.body.userId) {
            console.log(
                "sendCallNotification: Path from index.js helper. Received req.body.notification:",
                JSON.stringify(req.body.notification.data),
            )
            finalNotificationObject = req.body.notification
            targetUserId = req.body.userId
        } else if (req.body.callData && req.body.receiverId) {
            console.log(
                "sendCallNotification: Path from direct API call. Received req.body.callData:",
                JSON.stringify(req.body.callData),
            )
            const rawCallData = req.body.callData
            targetUserId = req.body.receiverId
            finalNotificationObject = {
                title: `Incoming ${rawCallData.callType} call`,
                body: `${rawCallData.caller.name} is calling you`,
                data: {
                    type: "incoming_call",
                    callId: rawCallData.callId,
                    callerId: rawCallData.caller.id,
                    callerName: rawCallData.caller.name,
                    callerProfilePic: rawCallData.caller.profilePicture || "",
                    callType: rawCallData.callType,
                    timestamp: rawCallData.timestamp || new Date().toISOString(),
                    // Ensure offer and targetDeviceId are included if available and needed by client for background notifications
                    ...(rawCallData.offer && { offer: JSON.stringify(rawCallData.offer) }), // Stringify offer
                    ...(rawCallData.targetDeviceId && { targetDeviceId: rawCallData.targetDeviceId }),
                },
            }
            console.log(
                "sendCallNotification: Constructed notification for API call:",
                JSON.stringify(finalNotificationObject.data),
            )
        } else {
            console.error("sendCallNotification: Invalid request body structure:", req.body)
            if (res && typeof res.status === "function" && !res.headersSent) {
                return res.status(400).json({ success: false, message: "Invalid request body for sendCallNotification" })
            }
            throw new Error(
                "Invalid request body for sendCallNotification. Ensure 'userId' and 'notification' fields, or 'receiverId' and 'callData' fields are present.",
            )
        }

        const newReqBodyForPush = { userId: targetUserId, notification: finalNotificationObject }
        const tempReqForPush = { ...req, body: newReqBodyForPush } // Create a new req-like object for sendPushNotificationToUser

        // Call sendPushNotificationToUser. If it sends a response, 'res' will be handled.
        // If it throws or doesn't send a response in some error paths, this function needs to.
        await sendPushNotificationToUser(tempReqForPush, res)
    } catch (error) {
        console.error("Error in sendCallNotification:", error.message, error.stack)
        if (res && typeof res.status === "function" && !res.headersSent) {
            res.status(500).json({ success: false, message: "Failed to send call notification" })
        } else {
            console.error(
                "sendCallNotification: Error occurred, and response might have been partially sent or is a mock response.",
            )
        }
    }
}

// Update FCM token for device
const updateFCMToken = async (req, res) => {

    try {
        const { deviceId, fcmToken } = req.body
        const userId = req.userId // From auth middleware (verifyToken)

        // User added log:
        console.log("updateFCMToken: Received req.body:", JSON.stringify(req.body))
        console.log(
            `updateFCMToken: Processing request. userId from auth: ${userId}, deviceId from body: ${deviceId}, fcmToken from body: ${fcmToken ? fcmToken.substring(0, 10) + "..." : "N/A"}`,
        )

        if (!userId) {
            console.error(
                "updateFCMToken: Error - req.user.id is undefined. Authentication middleware might not be running or setting user correctly for this route.",
            )
            return res.status(401).json({ success: false, message: "User not authenticated or user ID missing." })
        }

        if (!deviceId || !fcmToken) {
            console.log("updateFCMToken: Missing deviceId or fcmToken in request body.")
            return res.status(400).json({ success: false, message: "Missing deviceId or fcmToken" })
        }

        // Ensure fcmToken is a non-empty string
        if (typeof fcmToken !== "string" || fcmToken.trim() === "") {
            console.log("updateFCMToken: fcmToken is invalid (empty or not a string).")
            return res.status(400).json({ success: false, message: "Invalid fcmToken provided." })
        }

        const user = await User.findById(userId)
        if (!user) {
            console.log(`updateFCMToken: User not found with ID: ${userId}`)
            return res.status(404).json({ success: false, message: "User not found." })
        }

        const deviceIndex = user.devices.findIndex((d) => d.deviceId === deviceId)

        if (deviceIndex === -1) {
            console.log(
                `updateFCMToken: Device not found for userId: ${userId} and deviceId: ${deviceId}. Adding new device.`,
            )
            // If device not found, add it to the user's devices array
            // This assumes that if a deviceId is sent, it's a legitimate device for the user.
            // You might want different logic here, e.g., only update existing devices.
            user.devices.push({
                deviceId,
                fcmToken,
                // deviceName: req.body.deviceName || "Unknown Device", // Optionally capture deviceName if sent by client
                lastActive: new Date(),
                isActive: user.devices.length === 0 || user.activeDevice === deviceId, // Make active if it's the only one or already active
            })
        } else {
            // Device found, update its fcmToken and lastActive
            console.log(`updateFCMToken: Device found for userId: ${userId} and deviceId: ${deviceId}. Updating token.`)
            user.devices[deviceIndex].fcmToken = fcmToken
            user.devices[deviceIndex].lastActive = new Date()
        }

        // If this device is being set active or is the only device, ensure user.activeDevice is set
        if (user.devices.length === 1) {
            user.activeDevice = deviceId
            if (deviceIndex !== -1) user.devices[deviceIndex].isActive = true
            else user.devices[user.devices.length - 1].isActive = true // New device becomes active
        }

        await user.save()
        console.log(`updateFCMToken: User document saved for userId: ${userId}, deviceId: ${deviceId}.`)
        res.json({ success: true, message: "FCM token updated/added successfully" })
    } catch (error) {
        console.error("Error updating FCM token:", error)
        res.status(500).json({ success: false, message: "Failed to update FCM token" })
    }
}

module.exports = {
    sendPushNotificationToUser,
    sendCallNotification,
    updateFCMToken,
    sendMessageNotification,
}
