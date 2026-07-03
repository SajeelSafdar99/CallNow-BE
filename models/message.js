const mongoose = require("mongoose")

const messageSchema = new mongoose.Schema(
    {
        conversationId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Conversation",
            required: true,
        },
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        content: {
            type: String,
            required: true,
        },
        contentType: {
            type: String,
            enum: ["text", "image", "video", "audio", "document", "location"],
            default: "text",
        },
        mediaUrl: {
            type: String,
            default: "",
        },
        mediaSize: {
            type: Number, // in bytes
            default: 0,
        },
        mediaName: {
            type: String,
            default: "",
        },
        mediaDuration: {
            type: Number, // in seconds (for audio/video)
            default: 0,
        },
        mediaWidth: {
            type: Number, // for image/video dimensions
            default: 0,
        },
        mediaHeight: {
            type: Number,
            default: 0,
        },
        status: {
            type: String,
            enum: ["sending", "sent", "delivered", "read", "failed"],
            default: "sent",
            index: true,
        },
        editedAt: {
            type: Date,
        },
        deletedAt: {
            type: Date,
        },
        readBy: [
            {
                user: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                readAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        deliveredTo: [
            {
                user: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "User",
                },
                deliveredAt: {
                    type: Date,
                    default: Date.now,
                },
            },
        ],
        isDeleted: {
            type: Boolean,
            default: false,
        },
        deletedFor: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
        ],
        replyTo: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Message",
        },
    },
    { timestamps: true },
)

// Indexes for efficient sync queries
messageSchema.index({ conversationId: 1, updatedAt: 1 })
messageSchema.index({ conversationId: 1, createdAt: -1 })
messageSchema.index({ sender: 1, createdAt: -1 })
messageSchema.index({ "readBy.user": 1 })
messageSchema.index({ "deliveredTo.user": 1 })

const Message = mongoose.model("Message", messageSchema)

module.exports = Message
