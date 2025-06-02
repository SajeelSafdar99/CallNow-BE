const mongoose = require("mongoose")
const bcrypt = require("bcrypt")

const userSchema = new mongoose.Schema(
    {
        phoneNumber: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        password: {
            type: String,
            required: true,
        },
        name: {
            type: String,
            trim: true,
        },
        profilePicture: {
            type: String,
            default: "",
        },
        about: {
            type: String,
            default: "Hey there! I am using CallNow",
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        isAdmin: {
            type: Boolean,
            default: false,
        },
        isSuspended: {
            type: Boolean,
            default: false,
        },
        suspensionDetails: {
            suspendedAt: Date,
            suspendedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
            },
            reason: String,
            expiresAt: Date, // Optional: for temporary suspensions
        },
        activeDevice: {
            type: String,
            default: "",
        },
        devices: [
            {
                deviceId: String,
                deviceName: String,
                lastActive: Date,
                fcmToken: String,
                isActive: {
                    type: Boolean,
                    default: false,
                },
            },
        ],
        subscriptionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subscription",
        },
        createdAt: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true },
)

// Hash password before saving
userSchema.pre("save", async function (next) {
    if (!this.isModified("password")) return next()

    try {
        const salt = await bcrypt.genSalt(10)
        this.password = await bcrypt.hash(this.password, salt)
        next()
    } catch (error) {
        next(error)
    }
})

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password)
}

// Method to check if suspension has expired
userSchema.methods.isSuspensionExpired = function () {
    if (!this.isSuspended || !this.suspensionDetails?.expiresAt) {
        return false
    }
    return new Date() > new Date(this.suspensionDetails.expiresAt)
}

const User = mongoose.model("User", userSchema)

module.exports = User
