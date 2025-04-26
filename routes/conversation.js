const express = require("express")
const conversationController = require("../controllers/conversation")
const { authenticate } = require("../middleware/auth")
const upload = require("../middleware/upload")

const router = express.Router()

// All routes require authentication
router.post("/", authenticate, conversationController.getOrCreateConversation)
router.get("/", authenticate, conversationController.getConversations)
router.post("/group", authenticate, conversationController.createGroupConversation)
router.put("/group/:conversationId", authenticate, conversationController.updateGroupConversation)
router.put(
    "/group/:conversationId/image",
    authenticate,
    upload.group("groupImage"), // Changed from upload.single to upload.group
    conversationController.updateGroupImage,
)
router.post("/group/:conversationId/participants", authenticate, conversationController.addParticipants)
router.delete(
    "/group/:conversationId/participants/:participantId",
    authenticate,
    conversationController.removeParticipant,
)
router.delete("/group/:conversationId/leave", authenticate, conversationController.leaveGroup)
// Add the new route for changing group admin
router.put("/group/:conversationId/admin", authenticate, conversationController.changeGroupAdmin)

module.exports = router
