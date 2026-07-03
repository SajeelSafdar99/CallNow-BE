const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";

// Fail fast on startup if the JWT secret isn't configured — otherwise jwt.sign
// will throw at runtime on every login/socket connection.
if (!JWT_SECRET || JWT_SECRET.length < 16) {
    console.error("[FATAL] JWT_SECRET env var is missing or too short (<16 chars). Refusing to start.");
    process.exit(1);
}

// Generate JWT token
exports.generateToken = (userId) => {
    return jwt.sign({ id: userId }, JWT_SECRET, {
        expiresIn: JWT_EXPIRES_IN,
    });
};

// Verify JWT token
exports.verifyToken = (token) => {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};
