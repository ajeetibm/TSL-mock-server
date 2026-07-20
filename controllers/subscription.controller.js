/**
 * controllers/subscription.controller.js
 * Handles Subscription Upgrade / Downgrade flow.
 *
 * Architecture: routes → this controller → in-memory subscriptionStore
 *
 * PRODUCTION: replace in-memory stores with DB queries.
 * UI and service layer stay unchanged — only swap VITE_API_BASE_URL.
 */

const { errors } = require('../utils/errors')
const { addAuditLog } = require('../mock-data/audit')
const logger = require('../utils/logger')

// ── Plan catalogue ─────────────────────────────────────────────────────────────
const PLANS = [
  {
    planId:      'launchpad',
    name:        'Launchpad',
    price:        499,
    currency:    'ZAR',
    tagline:     'Perfect for solo founders getting started',
    wizardRuns:   5,
    teamMembers:  1,
    storage:     '6 months',
    features: [
      '5 essential wizards',
      '5 runs per month',
      '1 team member',
      'Basic email support',
      '6 months document storage',
    ],
  },
  {
    planId:      'operator',
    name:        'Operator',
    price:        999,
    currency:    'ZAR',
    tagline:     'For growing teams that need every wizard',
    wizardRuns:  12,
    teamMembers: 10,
    storage:     'Unlimited',
    features: [
      'All 12 legal wizards',
      '12 runs per month',
      '10 team members',
      'Priority support (24–48 hr)',
      'Unlimited document storage',
      'API access',
    ],
  },
  {
    planId:      'boardroom',
    name:        'Boardroom',
    price:       2499,
    currency:    'ZAR',
    tagline:     'For growing businesses with ongoing legal needs',
    wizardRuns:  30,
    teamMembers: 25,
    storage:     'Unlimited',
    features: [
      'All 30 legal wizards',
      '30 runs per month',
      '25 team members',
      'Dedicated support (SLA)',
      'Unlimited document storage',
      'API access',
      'White-label options',
      'Custom workflows',
    ],
  },
]

const PLAN_TIER = { launchpad: 0, operator: 1, boardroom: 2 }

function getPlan(planId) {
  return PLANS.find(p => p.planId === (planId || '').toLowerCase().trim()) || null
}

// ── In-memory subscription store ──────────────────────────────────────────────
const subscriptionStore = new Map()

function seedSubscription(email) {
  const now  = new Date()
  const next = new Date(now)
  next.setMonth(next.getMonth() + 1)
  next.setDate(1)

  const nextBillingDate = next.toISOString().split('T')[0]
  // Seed billing period: last full month
  const periodStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const periodEnd   = new Date(now.getFullYear(), now.getMonth(), 0)
  const billingPeriod = `${periodStart.toISOString().split('T')[0]} – ${periodEnd.toISOString().split('T')[0]}`

  return {
    planId:          'operator',
    runsUsed:         3,
    nextBillingDate,
    paymentMethod:   { brand: 'Visa', last4: '4242' },
    pendingDowngrade: null,
    invoices: [
      {
        invoiceId:       'INV-2025-003',
        invoiceNumber:   'INV-2025-003',
        invoiceDate:     '2025-12-01',
        transactionId:   'TXN_SEED003',
        type:            'subscription',
        previousPlan:    'Operator',
        newPlan:         'Operator',
        billingPeriod:   '2025-12-01 – 2025-12-31',
        plan:            'Operator',
        amount:           999,
        tax:              149.85,
        total:            1148.85,
        status:          'paid',
        paymentMethod:   { brand: 'Visa', last4: '4242' },
        date:            '2025-12-01',
      },
      {
        invoiceId:       'INV-2025-002',
        invoiceNumber:   'INV-2025-002',
        invoiceDate:     '2025-11-01',
        transactionId:   'TXN_SEED002',
        type:            'subscription',
        previousPlan:    'Operator',
        newPlan:         'Operator',
        billingPeriod:   '2025-11-01 – 2025-11-30',
        plan:            'Operator',
        amount:           999,
        tax:              149.85,
        total:            1148.85,
        status:          'paid',
        paymentMethod:   { brand: 'Visa', last4: '4242' },
        date:            '2025-11-01',
      },
      {
        invoiceId:       'INV-2025-001',
        invoiceNumber:   'INV-2025-001',
        invoiceDate:     '2025-10-01',
        transactionId:   'TXN_SEED001',
        type:            'subscription',
        previousPlan:    'Launchpad',
        newPlan:         'Operator',
        billingPeriod:   '2025-10-01 – 2025-10-31',
        plan:            'Operator',
        amount:           999,
        tax:              149.85,
        total:            1148.85,
        status:          'paid',
        paymentMethod:   { brand: 'Visa', last4: '4242' },
        date:            '2025-10-01',
      },
    ],
  }
}

function getStore(email) {
  const key = String(email || 'thabo@company.co.za').trim().toLowerCase()
  if (!subscriptionStore.has(key)) {
    subscriptionStore.set(key, seedSubscription(key))
  }
  return subscriptionStore.get(key)
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSubscriptionResponse(email) {
  const store = getStore(email)
  const plan  = getPlan(store.planId)
  if (!plan) throw new Error(`Unknown planId in store: ${store.planId}`)

  const runsTotal     = plan.wizardRuns
  const runsUsed      = Math.min(store.runsUsed, runsTotal)
  const runsRemaining = Math.max(0, runsTotal - runsUsed)

  return {
    planId:          plan.planId,
    planName:        plan.name,
    price:           plan.price,
    currency:        plan.currency,
    tagline:         plan.tagline,
    wizardRuns:      plan.wizardRuns,
    teamMembers:     plan.teamMembers,
    usage: {
      runsUsed,
      runsTotal,
      runsRemaining,
      teamMembers: plan.teamMembers,
    },
    nextBillingDate: store.nextBillingDate,
    paymentMethod:   store.paymentMethod,
    pendingDowngrade: store.pendingDowngrade,
  }
}

function calcProration(currentPlan, newPlan, nextBillingDate) {
  const now           = new Date()
  const billing       = new Date(nextBillingDate)
  const daysInCycle   = 30
  const msInDay       = 1000 * 60 * 60 * 24

  const msRemaining   = billing.getTime() - now.getTime()
  const daysRemaining = Math.max(1, Math.round(msRemaining / msInDay))

  const dailyCurrentRate   = currentPlan.price / daysInCycle
  const creditUnusedTime   = parseFloat((dailyCurrentRate * daysRemaining).toFixed(2))
  const dailyNewRate       = newPlan.price / daysInCycle
  const proratedNewCharge  = parseFloat((dailyNewRate * daysRemaining).toFixed(2))
  const totalDueToday      = parseFloat(Math.max(0, proratedNewCharge - creditUnusedTime).toFixed(2))

  return { daysInCycle, daysRemaining, creditUnusedTime, proratedNewCharge, totalDueToday }
}

function makeBillingPeriod(fromDate) {
  const d = new Date(fromDate)
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0)
  return `${d.toISOString().split('T')[0]} – ${end.toISOString().split('T')[0]}`
}

// ── Controllers ───────────────────────────────────────────────────────────────

async function getSubscription(req, res, next) {
  try {
    const email = String(req.user?.email || 'thabo@company.co.za').toLowerCase()
    res.json({ success: true, data: buildSubscriptionResponse(email) })
  } catch (e) { next(e) }
}

async function getPlans(req, res, next) {
  try {
    res.json({ success: true, data: PLANS })
  } catch (e) { next(e) }
}

async function getUpgradePreview(req, res, next) {
  try {
    const email    = String(req.user?.email || 'thabo@company.co.za').toLowerCase()
    const toPlanId = String(req.query.toPlanId || '').toLowerCase()
    const store    = getStore(email)
    const current  = getPlan(store.planId)
    const newPlan  = getPlan(toPlanId)

    if (!newPlan) return next(errors.badRequest('Unknown target plan.', 'INVALID_PLAN'))
    if (!current) return next(errors.badRequest('Current plan data is corrupt.', 'INVALID_PLAN'))

    const currentTier = PLAN_TIER[current.planId] ?? -1
    const newTier     = PLAN_TIER[newPlan.planId]  ?? -1
    if (newTier <= currentTier) {
      return next(errors.badRequest('Target plan must be higher than current plan for an upgrade.', 'NOT_AN_UPGRADE'))
    }

    const proration = calcProration(current, newPlan, store.nextBillingDate)

    res.json({
      success: true,
      data: {
        currentPlanName:   current.name,
        newPlanName:       newPlan.name,
        currentPrice:      current.price,
        newPrice:          newPlan.price,
        daysRemaining:     proration.daysRemaining,
        daysInCycle:       proration.daysInCycle,
        creditUnusedTime:  proration.creditUnusedTime,
        proratedNewCharge: proration.proratedNewCharge,
        totalDueToday:     proration.totalDueToday,
        nextBillingDate:   store.nextBillingDate,
        paymentMethod:     store.paymentMethod || null,
      },
    })
  } catch (e) { next(e) }
}

async function upgradeSubscription(req, res, next) {
  try {
    const email      = String(req.user?.email || 'thabo@company.co.za').toLowerCase()
    const { currentPlanId, toPlanId, paymentReference } = req.body
    const store      = getStore(email)
    const current    = getPlan(currentPlanId || store.planId)
    const newPlan    = getPlan(toPlanId)

    if (!newPlan) return next(errors.badRequest('Unknown target plan.', 'INVALID_PLAN'))
    if (!current) return next(errors.badRequest('Current plan data is corrupt.', 'INVALID_PLAN'))

    const currentTier = PLAN_TIER[current.planId] ?? -1
    const newTier     = PLAN_TIER[newPlan.planId]  ?? -1
    if (newTier <= currentTier) {
      return next(errors.badRequest('Target plan must be higher than current plan.', 'NOT_AN_UPGRADE'))
    }

    const proration     = calcProration(current, newPlan, store.nextBillingDate)
    const transactionId = paymentReference
      ? String(paymentReference)
      : `TXN_${Date.now().toString(36).toUpperCase()}`

    const year          = new Date().getFullYear()
    const seq           = String(store.invoices.length + 1).padStart(3, '0')
    const invoiceNumber = `INV-${year}-${seq}`
    const invoiceId     = `inv_${Date.now().toString(36)}`
    const paidAt        = new Date().toISOString()
    const invoiceDate   = new Date().toISOString().split('T')[0]
    const tax           = parseFloat((proration.totalDueToday * 0.15).toFixed(2))
    const total         = parseFloat((proration.totalDueToday + tax).toFixed(2))
    const billingPeriod = makeBillingPeriod(invoiceDate)

    // Update subscription
    store.planId           = newPlan.planId
    store.runsUsed         = 0
    store.pendingDowngrade = null

    // Persist full invoice
    store.invoices.unshift({
      invoiceId,
      invoiceNumber,
      invoiceDate,
      transactionId,
      type:            'upgrade',
      previousPlan:    current.name,
      newPlan:         newPlan.name,
      billingPeriod,
      plan:            newPlan.name,
      amount:          proration.totalDueToday,
      tax,
      total,
      status:          'paid',
      paymentMethod:   store.paymentMethod || { brand: 'Visa', last4: '4242' },
      date:            invoiceDate,
    })

    const runsTotal     = newPlan.wizardRuns
    const runsRemaining = runsTotal

    logger.info('subscriptionController', 'Upgrade confirmed', { email, from: current.planId, to: newPlan.planId, charged: proration.totalDueToday })
    addAuditLog({ action: 'SUBSCRIPTION_UPGRADE', userId: req.user?.userId, email, meta: { from: current.planId, to: newPlan.planId, amount: proration.totalDueToday, transactionId } })

    res.json({
      success: true,
      message: `Subscription upgraded to ${newPlan.name} successfully.`,
      data: {
        planId:          newPlan.planId,
        planName:        newPlan.name,
        price:           newPlan.price,
        tagline:         newPlan.tagline,
        wizardRuns:      newPlan.wizardRuns,
        teamMembers:     newPlan.teamMembers,
        usage: {
          runsUsed:      0,
          runsTotal,
          runsRemaining,
          teamMembers:   newPlan.teamMembers,
        },
        nextBillingDate: store.nextBillingDate,
        transactionId,
        invoiceId,
        invoiceNumber,
        amountCharged:   proration.totalDueToday,
        paidAt,
      },
    })
  } catch (e) { next(e) }
}

async function scheduleDowngrade(req, res, next) {
  try {
    const email      = String(req.user?.email || 'thabo@company.co.za').toLowerCase()
    const { currentPlanId, toPlanId } = req.body
    const store      = getStore(email)
    const current    = getPlan(currentPlanId || store.planId)
    const newPlan    = getPlan(toPlanId)

    if (!newPlan) return next(errors.badRequest('Unknown target plan.', 'INVALID_PLAN'))
    if (!current) return next(errors.badRequest('Current plan data is corrupt.', 'INVALID_PLAN'))

    const currentTier = PLAN_TIER[current.planId] ?? -1
    const newTier     = PLAN_TIER[newPlan.planId]  ?? -1
    if (newTier >= currentTier) {
      return next(errors.badRequest('Target plan must be lower than current plan for a downgrade.', 'NOT_A_DOWNGRADE'))
    }

    store.pendingDowngrade = {
      toPlanId:      newPlan.planId,
      toPlanName:    newPlan.name,
      effectiveDate: store.nextBillingDate,
    }

    logger.info('subscriptionController', 'Downgrade scheduled', { email, from: current.planId, to: newPlan.planId, effectiveDate: store.nextBillingDate })
    addAuditLog({ action: 'SUBSCRIPTION_DOWNGRADE_SCHEDULED', userId: req.user?.userId, email, meta: { from: current.planId, to: newPlan.planId, effectiveDate: store.nextBillingDate } })

    res.json({
      success: true,
      message: `Downgrade to ${newPlan.name} scheduled for ${store.nextBillingDate}.`,
      data: {
        scheduledPlanId:   newPlan.planId,
        scheduledPlanName: newPlan.name,
        effectiveDate:     store.nextBillingDate,
      },
    })
  } catch (e) { next(e) }
}

async function cancelDowngrade(req, res, next) {
  try {
    const email = String(req.user?.email || 'thabo@company.co.za').toLowerCase()
    const store = getStore(email)

    if (!store.pendingDowngrade) {
      return next(errors.badRequest('No scheduled downgrade to cancel.', 'NO_PENDING_DOWNGRADE'))
    }

    const cancelled = { ...store.pendingDowngrade }
    store.pendingDowngrade = null

    logger.info('subscriptionController', 'Downgrade cancelled', { email, cancelled })
    addAuditLog({ action: 'SUBSCRIPTION_DOWNGRADE_CANCELLED', userId: req.user?.userId, email, meta: { cancelled } })

    res.json({
      success: true,
      message: 'Scheduled downgrade cancelled. Your current plan continues unchanged.',
      data: { cancelled },
    })
  } catch (e) { next(e) }
}

async function getInvoices(req, res, next) {
  try {
    const email = String(req.user?.email || 'thabo@company.co.za').toLowerCase()
    const store = getStore(email)
    res.json({ success: true, data: store.invoices })
  } catch (e) { next(e) }
}

module.exports = {
  getSubscription,
  getPlans,
  getUpgradePreview,
  upgradeSubscription,
  scheduleDowngrade,
  cancelDowngrade,
  getInvoices,
}
