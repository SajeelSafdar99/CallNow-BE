const mongoose = require("mongoose")

const subscriptionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        plan: {
            type: String,
            enum: ["free", "premium"],
            default: "free",
        },
        status: {
            type: String,
            enum: ["active", "canceled", "expired", "trial"],
            default: "free",
        },
        startDate: {
            type: Date,
            default: Date.now,
        },
        endDate: {
            type: Date,
        },
        paymentMethod: {
            type: String,
            enum: ["credit_card", "paypal", "stripe", "other"],
        },
        paymentId: {
            type: String,
        },
        amount: {
            type: Number,
        },
        currency: {
            type: String,
            default: "USD",
        },
        autoRenew: {
            type: Boolean,
            default: true,
        },
        canceledAt: {
            type: Date,
        },
        trialEndsAt: {
            type: Date,
        },
    },
    { timestamps: true }
)

// Method to check if subscription is active
subscriptionSchema.methods.isActive = function() {
    return this.status === "active" && (!this.endDate || new Date() < this.endDate);
}

// Method to check if subscription is in trial period
subscriptionSchema.methods.isInTrial = function() {
    return this.status === "trial" && new Date() < this.trialEndsAt;
}

// Method to check if user can set active device
subscriptionSchema.methods.canSetActiveDevice = function() {
    return this.plan === "premium" && (this.isActive() || this.isInTrial());
}

const Subscription = mongoose.model("Subscription", subscriptionSchema)

module.exports = Subscription