const express = require("express")
const messageController = require("../controllers/message")
const { authenticate } = require("../middleware/auth")
const upload = require("../middleware/upload")

const router = express.Router()

// All routes require authentication
router.post("/", authenticate, upload.media.single("media"), messageController.sendMessage)
router.get("/:conversationId", authenticate, messageController.getMessages)
router.delete("/:messageId", authenticate, messageController.deleteMessage)
router.put("/:conversationId/deliver", authenticate, messageController.markAsDelivered)

module.exports = router
