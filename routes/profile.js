const express = require("express")
const profileController = require("../controllers/profile")
const { authenticate } = require("../middleware/auth")
const upload = require("../middleware/upload")

const router = express.Router()

// Protected routes - require authentication
router.get("/me", authenticate, profileController.getProfile)
router.put("/update", authenticate, profileController.updateProfile)
router.put("/picture", authenticate, upload.single("profilePicture"), profileController.updateProfilePicture)
router.get("/user/:userId", authenticate, profileController.getUserProfile)
router.get("/phone/:phoneNumber", authenticate, profileController.getUserByPhone)
router.get("/search", authenticate, profileController.searchUsers)

module.exports = router
