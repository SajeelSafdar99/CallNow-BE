const mongoose = require("mongoose")

const iceServerSchema = new mongoose.Schema(
    {
        urls: {
            type: [String],
            required: true,
        },
        username: {
            type: String,
        },
        credential: {
            type: String,
        },
        priority: {
            type: Number,
            default: 0, // Higher number means higher priority
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        serverType: {
            type: String,
            enum: ["stun", "turn"],
            required: true,
        },
        region: {
            type: String,
            default: "global",
        },
        provider: {
            type: String,
            default: "custom",
        },
        expiresAt: {
            type: Date,
        },
    },
    { timestamps: true },
)

const IceServer = mongoose.model("IceServer", iceServerSchema)

module.exports = IceServer
