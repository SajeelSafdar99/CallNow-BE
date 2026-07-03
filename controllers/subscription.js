const PaymentService = require("../services/payment")
const Subscription = require("../models/subscription")
const User = require("../models/user")
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY)

// Get subscription details
exports.getSubscription = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware

        const result = await PaymentService.checkSubscription(userId)

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            })
        }

        res.status(200).json({
            success: true,
            hasActiveSubscription: result.hasActiveSubscription,
            subscription: result.hasActiveSubscription ? result.subscription : null,
        })
        console.log("Subscription:", result.subscription);
    } catch (error) {
        console.error("Get subscription error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while fetching subscription details",
        })
    }
}

// Create payment intent for subscription
exports.createPaymentIntent = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { amount } = req.body

        if (!amount) {
            return res.status(400).json({
                success: false,
                message: "Amount is required",
            })
        }

        const result = await PaymentService.createPaymentIntent(userId, amount)

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            })
        }

        res.status(200).json({
            success: true,
            clientSecret: result.clientSecret,
            paymentIntentId: result.paymentIntentId,
        })
    } catch (error) {
        console.error("Create payment intent error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while creating payment intent",
        })
    }
}

// Subscribe to premium plan
exports.subscribe = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { paymentMethod, paymentId, amount } = req.body

        if (!paymentMethod || !paymentId || !amount) {
            return res.status(400).json({
                success: false,
                message: "Payment method, payment ID, and amount are required",
            })
        }

        const result = await PaymentService.createSubscription(
            userId,
            "premium",
            paymentMethod,
            paymentId,
            amount
        )

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            })
        }

        res.status(200).json({
            success: true,
            message: "Subscription created successfully",
            subscription: result.subscription,
        })
    } catch (error) {
        console.error("Subscribe error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while creating subscription",
        })
    }
}

// Cancel subscription
exports.cancelSubscription = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware

        const result = await PaymentService.cancelSubscription(userId)

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            })
        }

        res.status(200).json({
            success: true,
            message: "Subscription canceled successfully",
        })
    } catch (error) {
        console.error("Cancel subscription error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while canceling subscription",
        })
    }
}

// Renew subscription
exports.renewSubscription = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware
        const { paymentId } = req.body
        if (!paymentId) {
            return res.status(400).json({
                success: false,
                message: "Payment ID is required",
            })
        }

        const result = await PaymentService.renewSubscription(userId, paymentId)

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            })
        }

        res.status(200).json({
            success: true,
            message: "Subscription renewed successfully",
            subscription: result.subscription,
        })
    } catch (error) {
        console.error("Renew subscription error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while renewing subscription",
        })
    }
}

// Start free trial
exports.startFreeTrial = async (req, res) => {
    try {
        const userId = req.userId // From auth middleware

        const result = await PaymentService.startFreeTrial(userId)

        if (!result.success) {
            return res.status(400).json({
                success: false,
                message: result.message,
            })
        }

        res.status(200).json({
            success: true,
            message: "Free trial started successfully",
            subscription: result.subscription,
        })
    } catch (error) {
        console.error("Start free trial error:", error)
        res.status(500).json({
            success: false,
            message: "Server error while starting free trial",
        })
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stripe Webhook Handler
// This route receives raw body (not JSON-parsed) so Stripe signature validation
// works correctly.  The route is registered BEFORE express.json() in index.js.
// ─────────────────────────────────────────────────────────────────────────────
exports.stripeWebhook = async (req, res) => {
    const sig = req.headers["stripe-signature"]
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

    // If no webhook secret is configured, skip signature check (dev / placeholder)
    if (!webhookSecret || webhookSecret.startsWith("whsec_XXXX")) {
        console.warn("[Stripe Webhook] STRIPE_WEBHOOK_SECRET not configured — skipping verification.")
        return res.status(200).json({ received: true, warning: "Webhook secret not configured" })
    }

    let event
    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret)
    } catch (err) {
        console.error("[Stripe Webhook] Signature verification failed:", err.message)
        return res.status(400).json({ success: false, message: `Webhook signature error: ${err.message}` })
    }

    console.log(`[Stripe Webhook] Received event: ${event.type}`)

    try {
        switch (event.type) {
            // ── Payment confirmed — activate the subscription ──────────────
            case "payment_intent.succeeded": {
                const intent = event.data.object
                const userId = intent.metadata?.userId
                if (!userId) break

                // Check if subscription already exists (e.g. created client-side)
                const existing = await Subscription.findOne({ user: userId, paymentId: intent.id })
                if (!existing) {
                    // Auto-create subscription record if not already created
                    const endDate = new Date()
                    endDate.setMonth(endDate.getMonth() + 1)
                    const sub = await Subscription.create({
                        user: userId,
                        plan: "premium",
                        status: "active",
                        startDate: new Date(),
                        endDate,
                        paymentMethod: intent.payment_method_types?.[0] || "card",
                        paymentId: intent.id,
                        amount: intent.amount / 100,
                        currency: intent.currency?.toUpperCase() || "USD",
                        autoRenew: true,
                    })
                    await User.findByIdAndUpdate(userId, { subscriptionId: sub._id })
                    console.log(`[Stripe Webhook] Created subscription for user ${userId}`)
                } else if (existing.status !== "active") {
                    existing.status = "active"
                    await existing.save()
                    console.log(`[Stripe Webhook] Activated existing subscription for user ${userId}`)
                }
                break
            }

            // ── Payment failed — mark subscription as past_due ─────────────
            case "payment_intent.payment_failed": {
                const intent = event.data.object
                const userId = intent.metadata?.userId
                if (!userId) break

                await Subscription.findOneAndUpdate(
                    { user: userId },
                    { status: "past_due" },
                    { sort: { createdAt: -1 } }
                )
                console.log(`[Stripe Webhook] Payment failed for user ${userId} — marked past_due`)
                break
            }

            // ── Subscription cancelled from Stripe side ────────────────────
            case "customer.subscription.deleted": {
                const stripeSub = event.data.object
                await Subscription.findOneAndUpdate(
                    { stripeSubscriptionId: stripeSub.id },
                    { status: "canceled", canceledAt: new Date(), autoRenew: false }
                )
                console.log(`[Stripe Webhook] Stripe subscription ${stripeSub.id} deleted`)
                break
            }

            default:
                console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`)
        }

        res.status(200).json({ received: true })
    } catch (err) {
        console.error("[Stripe Webhook] Handler error:", err)
        res.status(500).json({ success: false, message: "Webhook handler error" })
    }
}
