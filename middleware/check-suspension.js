const User = require("../models/user")

exports.checkSuspension = async (req, res, next) => {
    try {
        const userId = req.userId // From auth middleware

        if (!userId) {
            return next()
        }

        const user = await User.findById(userId)

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        // Check if user is suspended
        if (user.isSuspended) {
            // Check if suspension has expired
            if (user.isSuspensionExpired()) {
                // Auto-unsuspend if expired
                user.isSuspended = false
                user.suspensionDetails = undefined
                await user.save()
                return next()
            }

            const suspensionMessage = user.suspensionDetails?.reason
                ? `Account suspended: ${user.suspensionDetails.reason}`
                : "Your account has been suspended. Please contact support."

            return res.status(403).json({
                success: false,
                message: suspensionMessage,
                status: "suspended",
                suspendedAt: user.suspensionDetails?.suspendedAt,
                expiresAt: user.suspensionDetails?.expiresAt,
            })
        }

        next()
    } catch (error) {
        console.error("Check suspension error:", error)
        next(error)
    }
}
