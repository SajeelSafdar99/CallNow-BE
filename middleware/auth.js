const jwt = require("jsonwebtoken")
const User = require("../models/user")
const { JWT_SECRET } = process.env

exports.authenticate = async (req, res, next) => {
    try {
        // Get token from header
        const token = req.header("Authorization")?.replace("Bearer ", "")

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Authentication required",
            })
        }

        // Verify token
        const decoded = jwt.verify(token, JWT_SECRET)
        req.userId = decoded.userId || decoded.id // Support both formats

        // Check if user exists and is not suspended
        const user = await User.findById(req.userId)

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        // Check if user is suspended
        if (user.isSuspended) {
            // Check if suspension has expired
            if (user.suspensionDetails?.expiresAt && new Date() > new Date(user.suspensionDetails.expiresAt)) {
                // Auto-unsuspend if expired
                user.isSuspended = false
                user.suspensionDetails = undefined
                await user.save()
            } else {
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
        }

        next()
    } catch (error) {
        console.error("Authentication error:", error)

        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                success: false,
                message: "Invalid token",
            })
        }

        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                success: false,
                message: "Token expired",
            })
        }

        res.status(500).json({
            success: false,
            message: "Server error during authentication",
        })
    }
}
