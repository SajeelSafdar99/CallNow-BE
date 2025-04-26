const mongoose = require("mongoose")

const callQualityMetricsSchema = new mongoose.Schema(
    {
        // Reference to either a one-to-one call or group call
        callId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
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
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
        // Connection metrics
        connectionType: {
            type: String,
            enum: ["wifi", "cellular", "ethernet", "unknown"],
            default: "unknown",
        },
        networkType: {
            type: String,
            default: "unknown",
        },
        // WebRTC stats
        rtt: {
            type: Number, // Round-trip time in ms
        },
        jitter: {
            type: Number, // Jitter in ms
        },
        packetLoss: {
            type: Number, // Packet loss percentage
        },
        audioLevel: {
            type: Number, // Audio level (0-1)
        },
        frameRate: {
            type: Number, // Video frame rate
        },
        resolution: {
            width: Number,
            height: Number,
        },
        bitrate: {
            audio: Number, // Audio bitrate in kbps
            video: Number, // Video bitrate in kbps
        },
        // ICE connectivity
        iceConnectionState: {
            type: String,
            enum: ["new", "checking", "connected", "completed", "failed", "disconnected", "closed"],
        },
        iceCandidatePair: {
            local: {
                type: String,
                default: "",
            },
            remote: {
                type: String,
                default: "",
            },
            protocol: {
                type: String,
                default: "",
            },
        },
        // Quality scores (0-5, where 5 is best)
        qualityScore: {
            audio: {
                type: Number,
                min: 0,
                max: 5,
            },
            video: {
                type: Number,
                min: 0,
                max: 5,
            },
        },
    },
    { timestamps: true },
)

// Create indexes for efficient querying
callQualityMetricsSchema.index({ callId: 1, timestamp: 1 })
callQualityMetricsSchema.index({ user: 1, timestamp: -1 })

const CallQualityMetrics = mongoose.model("CallQualityMetrics", callQualityMetricsSchema)

module.exports = CallQualityMetrics
