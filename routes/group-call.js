const express = require("express")
const groupCallController = require("../controllers/group-call")
const { authenticate } = require("../middleware/auth")

const router = express.Router()

// All routes require authentication
router.post("/", authenticate, groupCallController.createGroupCall)
router.post("/:groupCallId/join", authenticate, groupCallController.joinGroupCall)
router.post("/:groupCallId/leave", authenticate, groupCallController.leaveGroupCall)
router.post("/:groupCallId/end", authenticate, groupCallController.endGroupCall)
router.get("/conversation/:conversationId", authenticate, groupCallController.getActiveGroupCall)
router.get("/:groupCallId", authenticate, groupCallController.getGroupCallDetails)
router.get("/", authenticate, groupCallController.getGroupCallHistory)
router.post("/:groupCallId/screen", authenticate, groupCallController.toggleScreenSharing)
router.put("/:groupCallId/connections", authenticate, groupCallController.updateConnectionIds)

module.exports = router
