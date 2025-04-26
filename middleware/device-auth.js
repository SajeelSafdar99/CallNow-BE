const User = require("../models/user")
const { verifyToken } = require("../utils/jwt")

// Middleware to check if the device is the active device
exports.isActiveDevice = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Authentication required. Please login.",
            })
        }

        const token = authHeader.split(" ")[1]
        const decoded = verifyToken(token)

        if (!decoded) {
            return res.status(401).json({
                success: false,
                message: "Invalid or expired token. Please login again.",
            })
        }

        // Get user and check active device
        const user = await User.findById(decoded.id)
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            })
        }

        // Get device ID from request
        const deviceId = req.body.deviceId || req.query.deviceId || req.headers["x-device-id"]

        if (!deviceId) {
            return res.status(400).json({
                success: false,
                message: "Device ID is required",
            })
        }

        // Check if this is the active device
        if (user.activeDevice !== deviceId) {
            return res.status(403).json({
                success: false,
                message: "This operation can only be performed from the active device",
                activeDevice: user.activeDevice,
                currentDevice: deviceId,
            })
        }

        // Set userId and deviceId in request
        req.userId = decoded.id
        req.deviceId = deviceId
        next()
    } catch (error) {
        console.error("Active device check error:", error)
        res.status(500).json({
            success: false,
            message: "Server error during device authentication",
        })
    }
}
