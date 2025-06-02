const express = require("express")
const adminController = require("../controllers/admin")
const { authenticate } = require("../middleware/auth")
const { isAdmin } = require("../middleware/admin")
const authController = require("../controllers/auth");

const router = express.Router()

// All routes require authentication and admin privileges
router.use(authenticate, isAdmin)

// User management routes
router.get("/users", adminController.getUsers)
router.get("/users/suspended", adminController.getSuspendedUsers)
router.get("/users/:userId", adminController.getUserDetails)
router.post("/users/:userId/suspend", adminController.suspendUser)
router.post("/users/:userId/unsuspend", adminController.unsuspendUser)
router.get("/stats", authenticate, isAdmin, adminController.getDashboardStats)

module.exports = router
