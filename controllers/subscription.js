const PaymentService = require("../services/payment")

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