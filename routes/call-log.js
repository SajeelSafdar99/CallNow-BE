const express = require("express")
const callLogController = require("../controllers/call-log")
const { authenticate } = require("../middleware/auth")

const router = express.Router()

// All routes require authentication
router.post("/", authenticate, callLogController.logCallEvent)
router.get("/:callType/:callId", authenticate, callLogController.getCallLogs)
router.get("/history", authenticate, callLogController.getCallHistory)

module.exports = router
