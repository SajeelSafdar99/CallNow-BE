const User = require("../models/user")
const fs = require("fs")
const path = require("path")

exports.getProfile = async (req, res) => {
    try {
        const userId = req.userId

        const user = await User.findById(userId).select("-password")
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        res.status(200).json({
            success: true,
            user,
        })
    } catch (error) {
        console.error("Get profile error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching profile",
        })
    }
}

// Update user profile
exports.updateProfile = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { name, about } = req.body

        // Validate input
        if (!name && !about) {
            return res.status(400).json({
                success: false,
                message: "At least one field (name or about) is required for update",
            })
        }

        // Find user and update
        const updateData = {}
        if (name) updateData.name = name
        if (about) updateData.about = about

        const updatedUser = await User.findByIdAndUpdate(userId, { $set: updateData }, { new: true }).select("-password")

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        res.status(200).json({
            success: true,
            message: "Profile updated successfully",
            user: updatedUser,
        })
    } catch (error) {
        console.error("Update profile error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while updating profile",
        })
    }
}

// Update profile picture
exports.updateProfilePicture = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware

        // Handle removal request
        if (req.body.removeProfilePicture === "true") {
            const user = await User.findById(userId)
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: "User not found",
                })
            }

            // Delete existing profile picture if exists
            if (user.profilePicture) {
                const oldPath = path.join(__dirname, "..", "public", user.profilePicture)
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath)
                }
            }

            user.profilePicture = null
            await user.save()

            return res.status(200).json({
                success: true,
                message: "Profile picture removed successfully",
                user: {
                    ...user.toObject(),
                    password: undefined,
                },
            })
        }

        // Normal update logic when a new file is uploaded
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No image file provided",
            })
        }

        const profilePicturePath = `/uploads/profile/${req.file.filename}`

        const user = await User.findById(userId)
        if (!user) {
            fs.unlinkSync(path.join(__dirname, "..", "public", profilePicturePath))
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        // Delete old profile picture if exists
        if (user.profilePicture) {
            const oldPath = path.join(__dirname, "..", "public", user.profilePicture)
            if (fs.existsSync(oldPath)) {
                fs.unlinkSync(oldPath)
            }
        }

        user.profilePicture = profilePicturePath
        await user.save()

        res.status(200).json({
            success: true,
            message: "Profile picture updated successfully",
            user: {
                ...user.toObject(),
                password: undefined,
            },
        })
    } catch (error) {
        console.error("Update profile picture error:", error)

        if (req.file) {
            const filePath = path.join(__dirname, "..", "public", `/uploads/profile/${req.file.filename}`)
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath)
            }
        }

        res.status(500).json({
            success: false,
            message: "Server error while updating profile picture",
        })
    }
}

// Get another user's profile
exports.getUserProfile = async (req, res) => {
    try {
        const { userId } = req.params

        // Find user by ID
        const user = await User.findById(userId).select("-password -devices -activeDevice")

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        res.status(200).json({
            success: true,
            user,
        })
    } catch (error) {
        console.error("Get user profile error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching user profile",
        })
    }
}

// Get user by phone number
exports.getUserByPhone = async (req, res) => {
    try {
        const { phoneNumber } = req.params

        // Find user by phone number
        const user = await User.findOne({ phoneNumber }).select("-password -devices -activeDevice")

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        res.status(200).json({
            success: true,
            user,
        })
    } catch (error) {
        console.error("Get user by phone error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching user by phone number",
        })
    }
}

// Search users by name
exports.searchUsers = async (req, res) => {
    try {
        const { query } = req.query

        if (!query) {
            return res.status(400).json({
                success: false,
                message: "Search query is required",
            })
        }

        // Search users by name (case insensitive)
        const users = await User.find({
            name: { $regex: query, $options: "i" },
        }).select("_id name phoneNumber profilePicture about")

        res.status(200).json({
            success: true,
            users,
        })
    } catch (error) {
        console.error("Search users error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while searching users",
        })
    }
}
