const User = require("../models/user")

exports.isAdmin = async (req, res, next) => {
    try {
        const userId = req.userId // This comes from the authenticate middleware

        if (!userId) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            })
        }

        const user = await User.findById(userId)

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        if (!user.isAdmin) {
            return res.status(403).json({
                success: false,
                message: "Access denied. Admin privileges required.",
            })
        }

        // Attach user to request for use in controllers
        req.user = user
        next()
    } catch (error) {
        console.error("Admin middleware error:", error)
        res.status(500).json({
            success: false,
            message: "Server error in admin verification",
        })
    }
}
