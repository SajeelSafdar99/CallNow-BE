express = require("express")
const router = express.Router()
const groupCallController = require("../controllers/group-call")
const {authenticate} = require("../middleware/auth")

router.post("/create", authenticate, groupCallController.createGroupCall)
router.post("/:groupCallId/join", authenticate, groupCallController.joinGroupCall)
router.put("/:groupCallId/leave", authenticate, groupCallController.leaveGroupCall)
router.put("/:groupCallId/end", authenticate, groupCallController.endGroupCall)
router.put("/:groupCallId/status", authenticate, groupCallController.updateCallStatus)
router.put("/:groupCallId/screen", authenticate, groupCallController.toggleScreenSharing)

module.exports = router
