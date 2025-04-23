const { verifyToken } = require("../utils/jwt")

exports.authenticate = async (req, res, next) => {
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

        req.userId = decoded.id
        next()
    } catch (error) {
        console.error("Authentication error:", error)
        res.status(500).json({
            success: false,
            message: "Server error during authentication",
        })
    }
}
