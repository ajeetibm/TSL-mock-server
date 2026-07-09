/**
 * mock-data/payments.js
 * In-memory payment transactions, subscriptions, and payment history.
 * PRODUCTION: replace with DB tables: payment_transactions, subscriptions, payment_history.
 */

// Map<reference, transaction>
const paymentTransactions = new Map()

// Map<email, subscription>
const subscriptions = new Map()

// Array of completed payment records (history)
const paymentHistory = []

// Set of verified references — prevents duplicate verification
const verifiedReferences = new Set()

let nextPaymentId = 1

const PLAN_PRICES = {
  launchpad:  1999,
  operator:   3999,
  boardroom:  7999,
}

function createReference() {
  return `TSL_PAY_${Date.now()}_${String(nextPaymentId++).padStart(4, '0')}`
}

function getPlanAmount(plan) {
  return PLAN_PRICES[String(plan || '').toLowerCase()] || 3999
}

/**
 * Initialize a new payment transaction.
 * PRODUCTION: also call Paystack Initialize API to get authorizationUrl.
 */
function initializeTransaction(data) {
  const reference = createReference()
  const transaction = {
    reference,
    email: data.email,
    amount: data.amount || getPlanAmount(data.plan),
    amountInKobo: Math.round((data.amount || getPlanAmount(data.plan)) * 100),
    currency: data.currency || 'ZAR',
    plan: data.plan || 'operator',
    paymentMethod: data.paymentMethod || 'Credit/Debit Cards',
    selectedWizards: Array.isArray(data.selectedWizards) ? data.selectedWizards : [],
    status: 'initialized',
    createdAt: new Date().toISOString(),
    verifiedAt: null,
    paidAt: null,
  }
  paymentTransactions.set(reference, transaction)
  return transaction
}

/**
 * Record a verified/completed payment in history.
 * PRODUCTION: INSERT INTO payment_history.
 */
function recordPaymentHistory(transaction) {
  paymentHistory.push({
    id: `ph_${Date.now()}`,
    reference: transaction.reference,
    email: transaction.email,
    amount: transaction.amount,
    currency: transaction.currency,
    plan: transaction.plan,
    status: transaction.status,
    paidAt: transaction.paidAt,
    gateway: 'paystack',
  })
  if (paymentHistory.length > 200) paymentHistory.shift()
}

/**
 * Activate subscription after successful payment.
 * PRODUCTION: UPDATE subscriptions SET status='active' WHERE email=...
 */
function activateSubscription(email, plan) {
  const sub = {
    email,
    plan,
    status: 'active',
    activatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    credits: plan === 'boardroom' ? 30 : plan === 'operator' ? 15 : 5,
  }
  subscriptions.set(email, sub)
  return sub
}

function getSubscription(email) {
  return subscriptions.get(String(email || '').toLowerCase().trim()) || null
}

function getPaymentHistory(email) {
  if (!email) return paymentHistory.slice(-50).reverse()
  return paymentHistory.filter(p => p.email === email).slice(-50).reverse()
}

module.exports = {
  paymentTransactions,
  subscriptions,
  paymentHistory,
  verifiedReferences,
  initializeTransaction,
  recordPaymentHistory,
  activateSubscription,
  getSubscription,
  getPaymentHistory,
  getPlanAmount,
  PLAN_PRICES,
}
