const express = require("express")
const messageController = require("../controllers/message")
const { authenticate } = require("../middleware/auth")
const upload = require("../middleware/upload")

const router = express.Router()

// All routes require authentication
// This route handles both single and multiple file uploads
router.post("/", authenticate, (req, res, next) => {
    // Check if the request is for multiple files
    const isMultiple = req.query.multiple === 'true';

    if (isMultiple) {
        // Use array for multiple files (up to 10)
        upload.media.array("media", 10)(req, res, next);
    } else {
        // Use single for one file
        upload.media.single("media")(req, res, next);
    }
}, messageController.sendMessage);

router.get("/:conversationId", authenticate, messageController.getMessages)
router.delete("/:messageId", authenticate, messageController.deleteMessage)
router.put("/:conversationId/deliver", authenticate, messageController.markAsDelivered)

module.exports = router