const express = require("express")
const router = express.Router()
const {verifyToken} = require("../utils/jwt") // Assuming verifyToken populates req.user
const {sendPushNotificationToUser, sendCallNotification, updateFCMToken} = require("../controllers/notification")
const {authenticate} = require("../middleware/auth");
const User = require("../models/user");

// Send push notification to user
router.post("/send", verifyToken, sendPushNotificationToUser)

// Send call notification
router.post("/call", verifyToken, sendCallNotification)

// Update FCM token
// This is the crucial route for saving the token.
// It uses verifyToken, so req.user.id should be available.
router.post("/fcm-token", authenticate, updateFCMToken)

// DEBUG: Get FCM tokens for current user (useful for Firebase Console "Test on device")
// Remove or protect this route in production
router.get("/my-tokens", authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.userId).select("name devices")
        if (!user) return res.status(404).json({ success: false, message: "User not found" })
        const tokens = user.devices
            .filter(d => d.fcmToken)
            .map(d => ({ deviceId: d.deviceId, fcmToken: d.fcmToken, isActive: d.isActive, lastActive: d.lastActive }))
        res.json({ success: true, name: user.name, fcmTokens: tokens })
    } catch (err) {
        res.status(500).json({ success: false, message: err.message })
    }
})

module.exports = router
