// No changes needed, using the file you provided.
// This model is comprehensive and looks good.
const mongoose = require("mongoose")

const callQualityMetricsSchema = new mongoose.Schema(
    {
        callId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            index: true, // Good for querying by callId
        },
        callType: {
            type: String,
            enum: ["one-to-one", "group"],
            required: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true, // Good for querying by user
        },
        timestamp: {
            type: Date,
            default: Date.now,
            index: true, // Good for sorting and time-based queries
        },
        connectionType: {
            type: String,
            enum: ["wifi", "cellular", "ethernet", "bluetooth", "wimax", "vpn", "unknown", "none"], // Added more types based on NetInfo
            default: "unknown",
        },
        networkType: { // e.g., "4g", "5g", "wifi", "ethernet"
            type: String,
            default: "unknown",
        },
        rtt: Number,
        jitter: Number,
        packetLoss: Number,
        audioLevel: Number,
        frameRate: Number,
        resolution: {
            width: Number,
            height: Number,
        },
        bitrate: {
            audio: Number,
            video: Number,
        },
        iceConnectionState: {
            type: String,
            enum: ["new", "checking", "connected", "completed", "failed", "disconnected", "closed", "unknown"], // Added unknown
            default: "unknown",
        },
        iceCandidatePair: {
            local: String,
            remote: String,
            protocol: String,
        },
        qualityScore: {
            audio: { type: Number, min: 0, max: 5 },
            video: { type: Number, min: 0, max: 5 },
        },
    },
    { timestamps: true }, // Adds createdAt and updatedAt
)

// Combined index for common admin queries (user + time)
callQualityMetricsSchema.index({ user: 1, timestamp: -1 })
// Combined index for call-specific queries (call + time)
callQualityMetricsSchema.index({ callId: 1, timestamp: -1 })


const CallQualityMetrics = mongoose.model("CallQualityMetrics", callQualityMetricsSchema)

module.exports = CallQualityMetrics
