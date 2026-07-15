/**
 * controllers/payment.controller.js
 * Handles Paystack payment initialize, verify, webhook, history, subscriptions.
 */
const { initializeTransaction, paymentTransactions, verifiedReferences, recordPaymentHistory, getPaymentHistory } = require('../mock-data/payments')
const { activateUserSubscription, getUserSubscription, getAllSubscriptions } = require('../services/subscriptionService')
const { smartVerify } = require('../services/paystackService')
const { addAuditLog, AUDIT_ACTIONS } = require('../mock-data/audit')
const { validatePaystackInitPayload } = require('../utils/validate')
const { errors } = require('../utils/errors')
const logger = require('../utils/logger')

async function initializePayment(req, res, next) {
  try {
    const err = validatePaystackInitPayload(req.body)
    if (err) return next(errors.badRequest(err, 'VALIDATION_ERROR'))

    const txn = initializeTransaction({
      email: req.body.email,
      amount: Number(req.body.amount),
      currency: req.body.currency || 'ZAR',
      plan: req.body.plan || 'operator',
      paymentMethod: req.body.paymentMethod,
      selectedWizards: req.body.selectedWizards,
    })

    addAuditLog({ action: AUDIT_ACTIONS.PAYMENT_INIT, userId: req.user?.userId, email: txn.email, ip: req.ip, meta: { reference: txn.reference, amount: txn.amount } })
    logger.info('paymentController', 'Payment initialized', { reference: txn.reference, email: txn.email })

    res.json({
      success: true,
      message: 'Paystack transaction initialized.',
      data: {
        provider: 'paystack', mode: 'sandbox',
        reference: txn.reference,
        accessCode: `mock_access_code_${txn.reference}`,
        // PRODUCTION: use real authorizationUrl from Paystack Initialize API response
        authorizationUrl: `https://checkout.paystack.com/mock_${txn.reference}`,
        publicKey: process.env.PAYSTACK_PUBLIC_KEY || 'pk_test_configure_in_env',
        amount: txn.amount, amountInKobo: txn.amountInKobo,
        currency: txn.currency, email: txn.email, plan: txn.plan,
      },
    })
  } catch (e) { next(e) }
}

async function verifyPayment(req, res, next) {
  try {
    const reference = String(req.body.reference || req.params.reference || '')
    if (!reference) return next(errors.badRequest('Payment reference is required.', 'MISSING_REFERENCE'))

    // Prevent duplicate verification
    if (verifiedReferences.has(reference)) {
      const txn = paymentTransactions.get(reference)
      return res.json({ success: true, message: 'Payment already verified.', data: { provider: 'paystack', reference, status: txn?.status || 'success', paidAt: txn?.paidAt } })
    }

    let txn = paymentTransactions.get(reference)
    // If the reference was generated client-side (e.g. Paystack inline checkout), it won't
    // be in paymentTransactions yet — register it now so verification can proceed.
    if (!txn) {
      const type = req.body.type || 'subscription'
      const plan = req.body.plan || 'operator'
      const credits = Number(req.body.credits) || 0
      const email = req.user?.email || req.body.email || 'unknown@tsl.co.za'
      txn = {
        reference,
        email,
        amount: req.body.amountPaid || 0,
        amountInKobo: Math.round((req.body.amountPaid || 0) * 100),
        currency: req.body.currency || 'ZAR',
        plan,
        credits,
        type,
        status: 'initialized',
        createdAt: new Date().toISOString(),
        verifiedAt: null,
        paidAt: null,
      }
      paymentTransactions.set(reference, txn)
    }

    // Call real Paystack Verify API (or mock if key not set)
    const paystackData = await smartVerify(reference, req.body.outcome || 'success')
    const status = paystackData.status === 'success' ? 'success' : paystackData.status === 'failed' ? 'failed' : 'cancelled'

    txn.status = status
    txn.verifiedAt = new Date().toISOString()
    txn.paidAt = status === 'success' ? txn.verifiedAt : null
    txn.gatewayResponse = paystackData.gateway_response || paystackData.gatewayResponse
    txn._mockVerification = Boolean(paystackData._mock)
    paymentTransactions.set(reference, txn)

    verifiedReferences.add(reference) // Prevent duplicate verification
    recordPaymentHistory(txn)

    // Activate subscription on success (skip for counsel top-up — credits handled below)
    let subscription = null
    const isCounselTopUp = (txn.type || req.body.type) === 'counsel-topup'
    if (status === 'success' && !isCounselTopUp) {
      subscription = activateUserSubscription(txn.email, txn.plan, req.user?.userId)
    }

    // Add counsel credits on successful top-up payment
    if (status === 'success' && isCounselTopUp) {
      const { mockState } = require('../mock-state')
      const creditsToAdd = Number(txn.credits || req.body.credits) > 0 ? Number(txn.credits || req.body.credits) : 1
      mockState.smeCredits.creditsTotal     += creditsToAdd
      mockState.smeCredits.creditsRemaining += creditsToAdd
    }

    addAuditLog({ action: AUDIT_ACTIONS.PAYMENT_VERIFY, userId: req.user?.userId, email: txn.email, ip: req.ip, meta: { reference, status, plan: txn.plan } })
    logger.info('paymentController', `Payment verified: ${status}`, { reference, email: txn.email })

    // Forward the Paystack authorization object so the frontend can extract
    // real card details (card_type, last4, exp_month, exp_year) and pass them
    // to the addPaymentMethod endpoint — no guessing, no hardcoding.
    res.json({
      success: true,
      message: status === 'success' ? 'Payment verified and subscription activated.' : `Payment ${status}.`,
      data: { provider: 'paystack', reference, status, gatewayResponse: txn.gatewayResponse, paidAt: txn.paidAt, subscription, authorization: paystackData.authorization || null },
    })
  } catch (e) { next(e) }
}

// Mock Paystack webhook — mimics real charge.success event
async function paystackWebhook(req, res, next) {
  try {
    // PRODUCTION: verify X-Paystack-Signature header using HMAC-SHA512
    const event = req.body
    if (!event || event.event !== 'charge.success') return res.sendStatus(200)

    const reference = event.data?.reference
    const email = event.data?.customer?.email
    logger.info('paymentController', 'Webhook received: charge.success', { reference, email })

    addAuditLog({ action: AUDIT_ACTIONS.PAYMENT_WEBHOOK, email, ip: req.ip, meta: { reference, event: event.event } })

    // Update transaction status from webhook
    const txn = paymentTransactions.get(reference)
    if (txn && txn.status !== 'success') {
      txn.status = 'success'
      txn.paidAt = event.data.paid_at || new Date().toISOString()
      paymentTransactions.set(reference, txn)
      if (!verifiedReferences.has(reference)) {
        verifiedReferences.add(reference)
        recordPaymentHistory(txn)
        activateUserSubscription(email, txn.plan, null)
      }
    }

    res.sendStatus(200) // Always 200 to Paystack
  } catch (e) { next(e) }
}

async function getHistory(req, res, next) {
  try {
    const email = req.query.email || req.user?.email
    res.json({ success: true, data: getPaymentHistory(email) })
  } catch (e) { next(e) }
}

async function getSubscriptionStatus(req, res, next) {
  try {
    const email = req.query.email || req.user?.email
    const sub = getUserSubscription(email)
    res.json({ success: true, data: sub || { status: 'inactive', plan: null } })
  } catch (e) { next(e) }
}

async function getAllSubscriptionsAdmin(req, res, next) {
  try {
    res.json({ success: true, data: getAllSubscriptions() })
  } catch (e) { next(e) }
}

module.exports = { initializePayment, verifyPayment, paystackWebhook, getHistory, getSubscriptionStatus, getAllSubscriptionsAdmin }
