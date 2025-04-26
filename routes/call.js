const express = require("express")
const callController = require("../controllers/call")
const { authenticate } = require("../middleware/auth")

const router = express.Router()

// All routes require authentication
router.post("/", authenticate, callController.initiateCall)
router.put("/:callId/status", authenticate, callController.updateCallStatus)
router.get("/history", authenticate, callController.getCallHistory)
router.get("/:callId", authenticate, callController.getCallDetails)
router.delete("/:callId", authenticate, callController.deleteCall)

module.exports = router
