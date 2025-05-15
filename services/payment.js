const Subscription = require("../models/subscription")
const User = require("../models/user")
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

// Create a payment intent with Stripe
exports.createPaymentIntent = async (userId, amount, currency = "usd") => {
    try {
        const paymentIntent = await stripe.paymentIntents.create({
            amount: amount * 100, // Convert to cents
            currency,
            metadata: {
                userId,
            },
        })

        return {
            success: true,
            clientSecret: paymentIntent.client_secret,
            paymentIntentId: paymentIntent.id,
        }
    } catch (error) {
        console.error("Payment intent creation error:", error)
        return {
            success: false,
            message: error.message,
        }
    }
}

// Create a subscription for a user
exports.createSubscription = async (userId, plan, paymentMethod, paymentId, amount) => {
    try {
        // Calculate subscription end date (1 month from now)
        const endDate = new Date()
        endDate.setMonth(endDate.getMonth() + 1)

        // Create subscription record
        const subscription = new Subscription({
            user: userId,
            plan,
            status: "active",
            startDate: new Date(),
            endDate,
            paymentMethod,
            paymentId,
            amount,
            currency: "USD",
            autoRenew: true,
        })

        await subscription.save()

        // Update user with subscription ID
        await User.findByIdAndUpdate(userId, { subscriptionId: subscription._id })

        return {
            success: true,
            subscription,
        }
    } catch (error) {
        console.error("Subscription creation error:", error)
        return {
            success: false,
            message: error.message,
        }
    }
}

// Check if a user has an active subscription
exports.checkSubscription = async (userId) => {
    try {
        const user = await User.findById(userId).populate("subscriptionId")

        if (!user) {
            return {
                success: false,
                message: "User not found",
            }
        }

        if (!user.subscriptionId) {
            return {
                success: true,
                hasActiveSubscription: false,
            }
        }

        const subscription = user.subscriptionId
        const isActive = subscription.isActive() || subscription.isInTrial()

        return {
            success: true,
            hasActiveSubscription: isActive,
            subscription,
        }
    } catch (error) {
        console.error("Subscription check error:", error)
        return {
            success: false,
            message: error.message,
        }
    }
}

// Cancel a subscription
exports.cancelSubscription = async (userId) => {
    try {
        const user = await User.findById(userId).populate("subscriptionId")

        if (!user || !user.subscriptionId) {
            return {
                success: false,
                message: "User or subscription not found",
            }
        }

        const subscription = user.subscriptionId

        // Update subscription status
        subscription.status = "canceled"
        subscription.canceledAt = new Date()
        subscription.autoRenew = false

        await subscription.save()

        return {
            success: true,
            message: "Subscription canceled successfully",
        }
    } catch (error) {
        console.error("Subscription cancellation error:", error)
        return {
            success: false,
            message: error.message,
        }
    }
}

// Renew a subscription
exports.renewSubscription = async (userId, paymentId) => {
    try {
        const user = await User.findById(userId).populate("subscriptionId")

        if (!user || !user.subscriptionId) {
            return {
                success: false,
                message: "User or subscription not found",
            }
        }

        const subscription = user.subscriptionId

        // Calculate new end date (1 month from current end date)
        const newEndDate = new Date(subscription.endDate)
        newEndDate.setMonth(newEndDate.getMonth() + 1)

        // Update subscription
        subscription.status = "active"
        subscription.endDate = newEndDate
        subscription.paymentId = paymentId
        subscription.autoRenew = true

        await subscription.save()

        return {
            success: true,
            message: "Subscription renewed successfully",
            subscription,
        }
    } catch (error) {
        console.error("Subscription renewal error:", error)
        return {
            success: false,
            message: error.message,
        }
    }
}

// Start a free trial
exports.startFreeTrial = async (userId) => {
    try {
        // Check if user already had a trial
        const existingSubscription = await Subscription.findOne({ user: userId })
        if (existingSubscription) {
            return {
                success: false,
                message: "User has already had a subscription or trial",
            }
        }

        // Calculate trial end date (7 days from now)
        const trialEndsAt = new Date()
        trialEndsAt.setDate(trialEndsAt.getDate() + 7)

        // Create subscription record with trial status
        const subscription = new Subscription({
            user: userId,
            plan: "premium",
            status: "trial",
            startDate: new Date(),
            trialEndsAt,
        })

        await subscription.save()

        // Update user with subscription ID
        await User.findByIdAndUpdate(userId, { subscriptionId: subscription._id })

        return {
            success: true,
            subscription,
        }
    } catch (error) {
        console.error("Free trial start error:", error)
        return {
            success: false,
            message: error.message,
        }
    }
}