const mongoose = require("mongoose")

const callSchema = new mongoose.Schema(
    {
        caller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        receiver: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        startTime: {
            type: Date,
            default: Date.now,
        },
        endTime: {
            type: Date,
        },
        duration: {
            type: Number, // in seconds
            default: 0,
        },
        status: {
            type: String,
            enum: ["initiated", "ringing", "ongoing", "completed", "missed", "rejected", "failed"],
            default: "initiated",
        },
        type: {
            type: String,
            enum: ["audio", "video"],
            required: true,
        },
        callSignal: {
            type: Object,
        },
    },
    { timestamps: true },
)

const Call = mongoose.model("Call", callSchema)

module.exports = Call
