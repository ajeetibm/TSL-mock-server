/**
 * mock-data/payments.js
 * In-memory payment transactions, subscriptions, and payment history.
 * PRODUCTION: replace with DB tables: payment_transactions, subscriptions, payment_history.
 */

// Map<reference, transaction>
const paymentTransactions = new Map()

// Map<email, subscription>
const subscriptions = new Map()

// Map<email, { plan, wizardLimit, selectedWizards, activatedAt }>.  A wizard
// selection is an entitlement, not a payment-cart item: it is only written
// after a successful payment or when an active plan still has capacity.
const wizardAccessByEmail = new Map()
// These are monthly Blueprint run-unit allowances, not a limit on how many
// Blueprints a customer may pin to their dashboard.
const WIZARD_PLAN_LIMITS = { launchpad: 4, operator: 12, boardroom: 30 }

// ── Pre-seeded test subscriptions ──────────────────────────────────────────────
// These mirror the 3 test SME users in mock-state.js smeUsers.
// Restart the server to reset to these defaults.
;(function seedTestAccounts() {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
  const activatedAt = '2026-06-01T08:00:00Z'

  // Launchpad — lerato@dlaminiventures.co.za
  subscriptions.set('launchpad@tsl.co.za', {
    email: 'launchpad@tsl.co.za', plan: 'launchpad', status: 'active',
    activatedAt, expiresAt, credits: 0,
  })
  wizardAccessByEmail.set('launchpad@tsl.co.za', {
    plan: 'launchpad', wizardLimit: 4, activatedAt,
    selectedWizards: [
      { title: 'Non-Disclosure Agreement (NDA)', quantity: 1 },
      { title: 'Employment Offer Letter', quantity: 1 },
      { title: 'Privacy & Cookies Policy', quantity: 1 },
    ],
  })

  // Operator — sipho@khumalotech.co.za
  subscriptions.set('operator@tsl.co.za', {
    email: 'operator@tsl.co.za', plan: 'operator', status: 'active',
    activatedAt, expiresAt, credits: 2,
  })
  wizardAccessByEmail.set('operator@tsl.co.za', {
    plan: 'operator', wizardLimit: 12, activatedAt,
    selectedWizards: [
      { title: 'Non-Disclosure Agreement (NDA)', quantity: 1 },
      { title: 'Employment Offer Letter', quantity: 1 },
      { title: 'Founder Agreement', quantity: 1 },
      { title: 'Service Agreement', quantity: 1 },
      { title: 'Privacy & Cookies Policy', quantity: 1 },
      { title: 'Loan Agreement', quantity: 1 },
    ],
  })

  // Boardroom — ayanda@nkosiholdings.co.za
  subscriptions.set('boardroom@tsl.co.za', {
    email: 'boardroom@tsl.co.za', plan: 'boardroom', status: 'active',
    activatedAt, expiresAt, credits: 6,
  })
  wizardAccessByEmail.set('boardroom@tsl.co.za', {
    plan: 'boardroom', wizardLimit: 30, activatedAt,
    selectedWizards: [
      { title: 'Non-Disclosure Agreement (NDA)', quantity: 1 },
      { title: 'Employment Offer Letter', quantity: 1 },
      { title: 'Founder Agreement', quantity: 1 },
      { title: 'Service Agreement', quantity: 1 },
      { title: 'Privacy & Cookies Policy', quantity: 1 },
      { title: 'Loan Agreement', quantity: 1 },
      { title: 'Shareholder Resolutions', quantity: 1 },
      { title: 'Shareholders Agreement', quantity: 1 },
    ],
  })
})()

// Array of completed payment records (history)
const paymentHistory = []

// Set of verified references — prevents duplicate verification
const verifiedReferences = new Set()

let nextPaymentId = 1

const PLAN_PRICES = {
  launchpad:  499,
  operator:   1499,
  boardroom:  3999,
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
    gateway: transaction.provider || 'paystack',
  })
  if (paymentHistory.length > 200) paymentHistory.shift()
}

/**
 * Activate subscription after successful payment.
 * PRODUCTION: UPDATE subscriptions SET status='active' WHERE email=...
 */
function activateSubscription(email, plan) {
  const normalizedEmail = String(email || '').toLowerCase().trim()
  const sub = {
    email: normalizedEmail,
    plan,
    status: 'active',
    activatedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
    credits: plan === 'boardroom' ? 6 : plan === 'operator' ? 2 : 0,
  }
  subscriptions.set(normalizedEmail, sub)
  return sub
}

function getWizardLimit(plan) {
  return WIZARD_PLAN_LIMITS[String(plan || '').toLowerCase()] || 0
}

function normalizeSelectedWizards(selectedWizards) {
  const byTitle = new Map()
  for (const item of (Array.isArray(selectedWizards) ? selectedWizards : [])) {
    const title = String(item?.title || '').trim()
    if (!title) continue
    const quantity = Math.max(1, Number(item?.quantity) || 1)
    byTitle.set(title, (byTitle.get(title) || 0) + quantity)
  }
  return Array.from(byTitle, ([title, quantity]) => ({ title, quantity }))
}

function getWizardAccess(email) {
  const key = String(email || '').toLowerCase().trim()
  const subscription = getSubscription(key)
  const access = wizardAccessByEmail.get(key)
  const plan = subscription?.plan || access?.plan || null
  const wizardLimit = plan ? getWizardLimit(plan) : 0
  const selectedWizards = access?.selectedWizards || []
  return {
    hasSubscription: Boolean(subscription?.status === 'active'),
    plan,
    wizardLimit,
    selectedWizards,
    remainingWizards: Math.max(0, wizardLimit - selectedWizards.length),
  }
}

function activateWizardAccess(email, plan, selectedWizards) {
  const key = String(email || '').toLowerCase().trim()
  const normalized = normalizeSelectedWizards(selectedWizards)
  const wizardLimit = getWizardLimit(plan)
  // Dashboard selections are bookmarks. Subscription entitlement is measured
  // in Blueprint run units when a final document is downloaded.
  const access = { plan: String(plan).toLowerCase(), wizardLimit, selectedWizards: normalized, activatedAt: new Date().toISOString() }
  wizardAccessByEmail.set(key, access)
  return getWizardAccess(key)
}

function addWizardsToAccess(email, selectedWizards) {
  const key = String(email || '').toLowerCase().trim()
  const current = getWizardAccess(key)
  if (!current.hasSubscription) throw new Error('An active subscription is required before wizards can be added.')
  const requested = normalizeSelectedWizards(selectedWizards)
  const requestedByTitle = new Map(requested.map(wizard => [wizard.title, wizard.quantity]))
  const updated = current.selectedWizards.map((wizard) => {
    const additionalQuantity = requestedByTitle.get(wizard.title) || 0
    requestedByTitle.delete(wizard.title)
    return { ...wizard, quantity: (wizard.quantity || 1) + additionalQuantity }
  })
  const additions = Array.from(requestedByTitle, ([title, quantity]) => ({ title, quantity }))
  wizardAccessByEmail.set(key, {
    plan: current.plan,
    wizardLimit: current.wizardLimit,
    selectedWizards: [...updated, ...additions],
    activatedAt: wizardAccessByEmail.get(key)?.activatedAt || new Date().toISOString(),
  })
  return getWizardAccess(key)
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
  getWizardAccess,
  activateWizardAccess,
  addWizardsToAccess,
  normalizeSelectedWizards,
  WIZARD_PLAN_LIMITS,
}
