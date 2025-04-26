const User = require("../models/user")

// Middleware to check if user is an admin
exports.isAdmin = async (req, res, next) => {
    try {
        const userId = req.userId // From auth middleware

        // Check if user exists and is an admin
        // Note: You would need to add an isAdmin field to your User model
        const user = await User.findById(userId)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        // Check if user is an admin
        if (!user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin privileges required.",
            })
        }

        next()
    } catch (error) {
        console.error("Admin check error:", error)
        res.status(500).json({
            success: false,
            message: "Server error during admin check",
        })
    }
}
