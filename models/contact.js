const mongoose = require("mongoose")

const contactSchema = new mongoose.Schema(
    {
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        nickname: {
            type: String,
            default: "",
        },
        isFavorite: {
            type: Boolean,
            default: false,
        },
        isBlocked: {
            type: Boolean,
            default: false,
        },
        notes: {
            type: String,
            default: "",
        },
        contactGroup: {
            type: String,
            default: "",
        },
    },
    { timestamps: true },
)

contactSchema.index({ owner: 1, user: 1 }, { unique: true })

const Contact = mongoose.model("Contact", contactSchema)

module.exports = Contact
