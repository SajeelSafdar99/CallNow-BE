const express = require("express")
const authController = require("../controllers/auth")
const { authenticate } = require("../middleware/auth")

const router = express.Router()

// Public routes
router.post("/register", authController.register)
router.post("/verify-otp", authController.verifyOTP)
router.post("/resend-otp", authController.resendOTP)
router.post("/login", authController.login)
router.post("/forget-password", authController.forgetPassword)
router.post("/reset-password", authController.resetPassword)


// Protected routes
router.post("/change-password", authenticate, authController.changePassword)

module.exports = router
