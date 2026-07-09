const { Router } = require('express')
const { initializePayment, verifyPayment, paystackWebhook, getHistory, getSubscriptionStatus, getAllSubscriptionsAdmin } = require('../controllers/payment.controller')
const { authenticate } = require('../middleware/auth')
const { requireAdmin } = require('../middleware/roles')
const { paymentRateLimiter } = require('../middleware/rateLimiter')

const router = Router()

// Paystack webhook — public, no auth (Paystack calls this directly)
router.post('/webhook/paystack', paystackWebhook)

// Protected payment endpoints
router.post('/paystack/initialize', authenticate, paymentRateLimiter, initializePayment)
router.post('/paystack/verify',     authenticate, verifyPayment)
router.get('/history',              authenticate, getHistory)
router.get('/subscription',         authenticate, getSubscriptionStatus)
router.get('/subscriptions/all',    authenticate, requireAdmin, getAllSubscriptionsAdmin)

module.exports = router
