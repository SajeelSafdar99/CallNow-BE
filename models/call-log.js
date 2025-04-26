const mongoose = require("mongoose")

const callLogSchema = new mongoose.Schema(
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
        eventType: {
            type: String,
            enum: [
                "initiated",
                "ringing",
                "answered",
                "rejected",
                "missed",
                "ended",
                "participant_joined",
                "participant_left",
                "screen_share_started",
                "screen_share_ended",
                "quality_issue",
                "network_change",
                "fallback_activated",
            ],
            required: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        metadata: {
            type: Object,
            default: {},
        },
        timestamp: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true },
)

// Create indexes for efficient querying
callLogSchema.index({ callId: 1, timestamp: 1 })
callLogSchema.index({ user: 1, timestamp: -1 })
callLogSchema.index({ callType: 1, eventType: 1, timestamp: -1 })

const CallLog = mongoose.model("CallLog", callLogSchema)

module.exports = CallLog
