/**
 * services/subscriptionService.js
 * Manages subscription lifecycle after payment.
 * PRODUCTION: replace in-memory store with DB queries.
 */
const { activateSubscription, getSubscription, subscriptions } = require('../mock-data/payments')
const { addAuditLog, AUDIT_ACTIONS } = require('../mock-data/audit')
const logger = require('../utils/logger')

/**
 * Activate a subscription after verified payment.
 * PRODUCTION: UPDATE subscriptions SET status='active', plan=?, expires_at=? WHERE user_id=?
 */
function activateUserSubscription(email, plan, userId) {
  const sub = activateSubscription(email, plan)
  logger.info('subscriptionService', 'Subscription activated', { email, plan })
  addAuditLog({ action: AUDIT_ACTIONS.SUBSCRIPTION_ACT, userId, email, meta: { plan, expiresAt: sub.expiresAt } })
  return sub
}

/**
 * Get active subscription for a user.
 * PRODUCTION: SELECT * FROM subscriptions WHERE email=? AND status='active'
 */
function getUserSubscription(email) {
  return getSubscription(email)
}

/**
 * Get all subscriptions (admin view).
 * PRODUCTION: SELECT * FROM subscriptions ORDER BY activated_at DESC
 */
function getAllSubscriptions() {
  return Array.from(subscriptions.values())
}

module.exports = { activateUserSubscription, getUserSubscription, getAllSubscriptions }
