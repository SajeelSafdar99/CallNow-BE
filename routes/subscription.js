const express = require("express")
const subscriptionController = require("../controllers/subscription")
const { authenticate } = require("../middleware/auth")

const router = express.Router()

// All routes require authentication
router.get("/", authenticate, subscriptionController.getSubscription)
router.post("/payment-intent", authenticate, subscriptionController.createPaymentIntent)
router.post("/subscribe", authenticate, subscriptionController.subscribe)
router.post("/cancel", authenticate, subscriptionController.cancelSubscription)
router.post("/renew", authenticate, subscriptionController.renewSubscription)
router.post("/trial", authenticate, subscriptionController.startFreeTrial)

module.exports = router