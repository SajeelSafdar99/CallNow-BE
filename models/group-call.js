const mongoose = require("mongoose")

const groupCallSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            default: "",
        },
        initiator: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        participants: [
            {
                user: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                    required: true,
                },
                joinedAt: {
                    type: Date,
                    default: Date.now,
                },
                leftAt: {
                    type: Date,
                },
                isActive: {
                    type: Boolean,
                    default: true,
                },
                sharingScreen: {
                    type: Boolean,
                    default: false,
                },
                connectionIds: [String], // Array of peer connection IDs
            },
        ],
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation",
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
            enum: ["active", "ended"],
            default: "active",
        },
        type: {
            type: String,
            enum: ["audio", "video"],
            required: true,
        },
        maxParticipants: {
            type: Number,
            default: 8, // Default limit for group calls
        },
    },
    { timestamps: true },
)

const GroupCall = mongoose.model("GroupCall", groupCallSchema)

module.exports = GroupCall
