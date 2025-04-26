const express = require("express")
const callQualityController = require("../controllers/call-quality")
const { authenticate } = require("../middleware/auth")

const router = express.Router()

// All routes require authentication
router.post("/metrics", authenticate, callQualityController.recordMetrics)
router.get("/metrics/:callType/:callId", authenticate, callQualityController.getCallMetrics)
router.get("/stats", authenticate, callQualityController.getUserCallStats)

module.exports = router
