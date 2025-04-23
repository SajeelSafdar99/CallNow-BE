const mongoose = require("mongoose")

const otpSchema = new mongoose.Schema({
    phoneNumber: {
        type: String,
        required: true,
    },
    otp: {
        type: String,
        required: true,
    },
    purpose: {
        type: String,
        enum: ["registration", "password_reset"],
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 600, // OTP expires after 10 minutes
    },
})

const OTP = mongoose.model("OTP", otpSchema)

module.exports = OTP
