const express = require("express")
const callQualityController = require("../controllers/call-quality")
const { authenticate } = require("../middleware/auth")
const {isAdmin} = require("../middleware/admin")
// Assuming isAdmin is in your auth middleware

const router = express.Router()

// --- Standard User Routes ---
// Record metrics during a call
router.post("/metrics", authenticate, callQualityController.recordMetrics)

// Get summarized metrics for a specific call (user must be a participant)
router.get("/metrics/:callType/:callId", authenticate, callQualityController.getCallMetrics)

// Get personal call statistics summary for the authenticated user
router.get("/stats", authenticate, callQualityController.getUserCallStats)


// --- Admin Routes ---
// Get all metrics for a specific user (admin access)
router.get(
    "/admin/metrics/user/:userId",
    authenticate,
    isAdmin, // Middleware to check if the authenticated user is an admin
    callQualityController.getMetricsForUserByAdmin
)

// Get all metrics in the system, with pagination and optional filters (admin access)
router.get(
    "/admin/metrics/all",
    authenticate,
    isAdmin,
    callQualityController.getAllMetricsByAdmin
)

module.exports = router