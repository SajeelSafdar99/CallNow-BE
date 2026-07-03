const mongoose = require("mongoose")

const conversationSchema = new mongoose.Schema(
    {
        participants: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true,
            },
        ],
        isGroup: {
            type: Boolean,
            default: false,
        },
        groupName: {
            type: String,
            default: "",
        },
        groupAdmin: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
        },
        groupDescription: {
            type: String,
            default: "",
        },
        groupImage: {
            type: String,
            default: "",
        },
        lastMessage: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Message",
        },
        lastMessageAt: {
            type: Date,
            default: Date.now,
            index: true,
        },
        unreadCounts: [
            {
                user: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                count: {
                    type: Number,
                    default: 0,
                },
            },
        ],
    },
    { timestamps: true },
)

// Index for efficient sync queries
conversationSchema.index({ participants: 1, updatedAt: -1 })
conversationSchema.index({ participants: 1, lastMessageAt: -1 })

const Conversation = mongoose.models.Conversation || mongoose.model("Conversation", conversationSchema)

module.exports = Conversation
