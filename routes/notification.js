const express = require("express")
const router = express.Router()
const {verifyToken} = require("../utils/jwt") // Assuming verifyToken populates req.user
const {sendPushNotificationToUser, sendCallNotification, updateFCMToken} = require("../controllers/notification")
const {authenticate} = require("../middleware/auth");

// Send push notification to user
router.post("/send", verifyToken, sendPushNotificationToUser)

// Send call notification
router.post("/call", verifyToken, sendCallNotification)

// Update FCM token
// This is the crucial route for saving the token.
// It uses verifyToken, so req.user.id should be available.
router.post("/fcm-token", authenticate, updateFCMToken)

module.exports = router
