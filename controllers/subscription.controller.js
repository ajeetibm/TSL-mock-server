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
const { documentCatalogue, getBlueprint } = require('../mock-data/documentCatalogue')
const { addAuditLog } = require('../mock-data/audit')
const logger = require('../utils/logger')
const { mockState, COUNSEL_TIERS } = require('../mock-state')

// ── Plan catalogue ─────────────────────────────────────────────────────────────
const PLANS = [
  {
    planId:      'launchpad',
    name:        'Launchpad',
    price:        499,
    annualPrice:  4990,
    currency:    'ZAR',
    tagline:     'Perfect for solo founders getting started',
    wizardRuns:   4,
    teamMembers:  1,
    storage:     '6 months',
    features: [
      '4 Blueprint run units per month',
      '0 Counsel credits per month',
      'Basic email support',
      '6 months document storage',
      'No API access',
      'No white-label',
    ],
  },
  {
    planId:      'operator',
    name:        'Operator',
    price:        1499,
    annualPrice:  14990,
    currency:    'ZAR',
    tagline:     'For growing teams that need every wizard',
    wizardRuns:  12,
    teamMembers: 10,
    storage:     'Unlimited',
    features: [
      '12 Blueprint run units per month',
      '2 Counsel credits per month',
      'Priority support (24–48 hr)',
      'Unlimited document storage',
      'API access',
      'No white-label',
    ],
  },
  {
    planId:      'boardroom',
    name:        'Boardroom',
    price:       3999,
    annualPrice: 39990,
    currency:    'ZAR',
    tagline:     'For growing businesses with ongoing legal needs',
    wizardRuns:  30,
    teamMembers: 25,
    storage:     'Unlimited',
    features: [
      '30 Blueprint run units per month',
      '6 Counsel credits per month',
      'Dedicated support (SLA)',
      'Unlimited document storage',
      'API access',
      'White-label options',
      'Custom workflows',
    ],
  },
]

const PLAN_TIER = { free: -1, launchpad: 0, operator: 1, boardroom: 2 }
const BLUEPRINT_RUN_TOP_UP_RATE = 149

const VAT_RATE = 0.15
function getPlan(planId) {
  if ((planId || '').toLowerCase().trim() === 'free') {
    return { planId: 'free', name: 'Free', price: 0, annualPrice: 0, currency: 'ZAR',
      tagline: 'Get started with the basics — upgrade anytime to unlock more.',
      wizardRuns: 0, teamMembers: 1, storage: '—', features: [] }
  }
  return PLANS.find(p => p.planId === (planId || '').toLowerCase().trim()) || null
}

// ── In-memory subscription store ──────────────────────────────────────────────
const subscriptionStore = new Map()

// ── Pre-seed the 3 test subscriber accounts on startup ─────────────────────────
// Matches the 3 users in mock-state.js and payments.js.
// Each entry gives the full subscription shape the frontend Settings page expects.
;(function seedTestSubscriptions() {
  const now  = new Date()
  const next = new Date(now)
  next.setMonth(next.getMonth() + 1)
  next.setDate(1)
  const nextBillingDate = next.toISOString().split('T')[0]

  // ── Launchpad — lerato dlamini ──────────────────────────────────────────────
  subscriptionStore.set('launchpad@tsl.co.za', {
    planId: 'launchpad', planName: 'Launchpad',
    tagline: 'Perfect for solo founders getting started',
    price: 499, currency: 'ZAR', wizardRuns: 4, teamMembers: 1,
    nextBillingDate,
    paymentMethod: { brand: 'Visa', last4: '1001' },
    pendingDowngrade: null,
    runsUsed: 0, topUpUnits: 0,
    invoices: [
      {
        invoiceId: 'INV-LP-001', invoiceNumber: 'INV-LP-001',
        invoiceDate: '2026-06-01', transactionId: 'TXN_LP_001',
        type: 'subscription', plan: 'Launchpad',
        billingPeriod: '2026-06-01 – 2026-06-30',
        amount: 499, tax: 74.85, total: 573.85, status: 'paid',
        paymentMethod: { brand: 'Visa', last4: '1001' }, date: '2026-06-01',
      },
    ],
  })

  // ── Operator — sipho khumalo ────────────────────────────────────────────────
  subscriptionStore.set('operator@tsl.co.za', {
    planId: 'operator', planName: 'Operator',
    tagline: 'For growing teams that need every wizard',
    price: 1499, currency: 'ZAR', wizardRuns: 12, teamMembers: 10,
    nextBillingDate,
    paymentMethod: { brand: 'Mastercard', last4: '2002' },
    pendingDowngrade: null,
    runsUsed: 0, topUpUnits: 0,
    invoices: [
      {
        invoiceId: 'INV-OP-002', invoiceNumber: 'INV-OP-002',
        invoiceDate: '2026-06-01', transactionId: 'TXN_OP_002',
        type: 'subscription', plan: 'Operator',
        billingPeriod: '2026-06-01 – 2026-06-30',
        amount: 1499, tax: 224.85, total: 1723.85, status: 'paid',
        paymentMethod: { brand: 'Mastercard', last4: '2002' }, date: '2026-06-01',
      },
      {
        invoiceId: 'INV-OP-001', invoiceNumber: 'INV-OP-001',
        invoiceDate: '2026-05-01', transactionId: 'TXN_OP_001',
        type: 'subscription', plan: 'Operator',
        billingPeriod: '2026-05-01 – 2026-05-31',
        amount: 1499, tax: 224.85, total: 1723.85, status: 'paid',
        paymentMethod: { brand: 'Mastercard', last4: '2002' }, date: '2026-05-01',
      },
    ],
  })

  // ── Boardroom — ayanda nkosi ────────────────────────────────────────────────
  subscriptionStore.set('boardroom@tsl.co.za', {
    planId: 'boardroom', planName: 'Boardroom',
    tagline: 'For growing businesses with ongoing legal needs',
    price: 3999, currency: 'ZAR', wizardRuns: 30, teamMembers: 25,
    nextBillingDate,
    paymentMethod: { brand: 'Visa', last4: '3003' },
    pendingDowngrade: null,
    runsUsed: 0, topUpUnits: 0,
    invoices: [
      {
        invoiceId: 'INV-BR-003', invoiceNumber: 'INV-BR-003',
        invoiceDate: '2026-06-01', transactionId: 'TXN_BR_003',
        type: 'subscription', plan: 'Boardroom',
        billingPeriod: '2026-06-01 – 2026-06-30',
        amount: 3999, tax: 599.85, total: 4598.85, status: 'paid',
        paymentMethod: { brand: 'Visa', last4: '3003' }, date: '2026-06-01',
      },
      {
        invoiceId: 'INV-BR-002', invoiceNumber: 'INV-BR-002',
        invoiceDate: '2026-05-01', transactionId: 'TXN_BR_002',
        type: 'subscription', plan: 'Boardroom',
        billingPeriod: '2026-05-01 – 2026-05-31',
        amount: 3999, tax: 599.85, total: 4598.85, status: 'paid',
        paymentMethod: { brand: 'Visa', last4: '3003' }, date: '2026-05-01',
      },
      {
        invoiceId: 'INV-BR-001', invoiceNumber: 'INV-BR-001',
        invoiceDate: '2026-04-01', transactionId: 'TXN_BR_001',
        type: 'subscription', plan: 'Boardroom',
        billingPeriod: '2026-04-01 – 2026-04-30',
        amount: 3999, tax: 599.85, total: 4598.85, status: 'paid',
        paymentMethod: { brand: 'Visa', last4: '3003' }, date: '2026-04-01',
      },
    ],
  })
})()

function seedSubscription(email) {
  const now  = new Date()
  const next = new Date(now)
  next.setMonth(next.getMonth() + 1)
  next.setDate(1)

  const nextBillingDate = next.toISOString().split('T')[0]

  return {
    planId:          'free',
    runsUsed:         0,
    nextBillingDate,
    paymentMethod:   { brand: 'Visa', last4: '4242' },
    pendingDowngrade: null,
    invoices:        [],
  }
}

function getStore(email) {
  const key = String(email || 'thabo@company.co.za').trim().toLowerCase()
  if (!subscriptionStore.has(key)) {
    subscriptionStore.set(key, seedSubscription(key))
  }
  const store = subscriptionStore.get(key)
  // Older fixtures stored the counter as `usage.runsUsed`; normalize it once
  // so paid test profiles behave exactly like newly activated subscriptions.
  if (!Number.isFinite(store.runsUsed)) store.runsUsed = Number(store.usage?.runsUsed || 0)
  return subscriptionStore.get(key)
}

// Payment verification and the subscription settings API use the same mock
// store. This keeps a newly paid plan and its run-unit allowance visible on
// the dashboard immediately after checkout.
function activatePaidSubscription(email, planId) {
  const plan = getPlan(planId)
  if (!plan) throw new Error(`Unknown plan: ${planId}`)
  const key = String(email || 'thabo@company.co.za').trim().toLowerCase()
  const now = new Date()
  const nextBilling = new Date(now)
  nextBilling.setUTCMonth(nextBilling.getUTCMonth() + 1)
  const existing = subscriptionStore.get(key) || {}
  subscriptionStore.set(key, {
    ...existing,
    planId: plan.planId,
    runsUsed: 0,
    topUpUnits: 0,
    nextBillingDate: nextBilling.toISOString().slice(0, 10),
    paymentMethod: existing.paymentMethod || { brand: 'Visa', last4: '4242' },
    pendingDowngrade: null,
    invoices: existing.invoices || [],
  })
  // Sync plan name back to smeUsers so admin Users & Activity reflects the new plan immediately
  const smeUser = mockState.smeUsers.get(key)
  if (smeUser) { smeUser.plan = plan.name; mockState.smeUsers.set(key, smeUser) }
  applyCounselTier(plan.planId)
  return buildSubscriptionResponse(key)
}

function applyCounselTier(planId) {
  const tier = COUNSEL_TIERS[String(planId || '').toLowerCase()]
  if (!tier) return

  const credits = mockState.smeCredits
  credits.plan = tier.name
  credits.includedCredits = tier.includedCredits
  credits.topUpRate = tier.topUpRate
  credits.creditsTotal = tier.includedCredits
  credits.creditsUsed = 0
  credits.usageThisMonth = 0
  credits.creditsRemaining = tier.includedCredits

  const nextReset = new Date()
  nextReset.setUTCMonth(nextReset.getUTCMonth() + 1, 1)
  credits.resetDate = nextReset.toISOString().slice(0, 10)
}

function applyScheduledDowngradeIfDue(email, now = new Date()) {
  const store = getStore(email)
  if (!store.pendingDowngrade) return store

  const effectiveAt = new Date(`${store.pendingDowngrade.effectiveDate}T00:00:00.000Z`)
  if (Number.isNaN(effectiveAt.getTime()) || effectiveAt > now) return store

  store.planId = store.pendingDowngrade.toPlanId
  store.runsUsed = 0
  store.topUpUnits = 0
  store.pendingDowngrade = null
  // Sync downgraded plan name back to smeUsers
  const downgradePlan = getPlan(store.planId)
  const key = String(email || '').trim().toLowerCase()
  const smeUser = mockState.smeUsers.get(key)
  if (smeUser && downgradePlan) { smeUser.plan = downgradePlan.name; mockState.smeUsers.set(key, smeUser) }
  applyCounselTier(store.planId)
  return store
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildSubscriptionResponse(email) {
  const store = applyScheduledDowngradeIfDue(email)
  const plan  = getPlan(store.planId)
  if (!plan) throw new Error(`Unknown planId in store: ${store.planId}`)

  const topUpUnits    = Number(store.topUpUnits || 0)
  // runsTotal is always the plan's monthly allocation — it is the correct
  // denominator for the "X of Y Credits Remaining" display.
  // Top-up units extend runsRemaining beyond the plan total but do not
  // change the plan denominator.
  const runsTotal     = plan.wizardRuns
  const runsUsed      = Math.min(store.runsUsed, plan.wizardRuns + topUpUnits)
  const runsRemaining = Math.max(0, plan.wizardRuns + topUpUnits - runsUsed)

  return {
    planId:          plan.planId,
    planName:        plan.name,
    price:           plan.price,
    annualPrice:     plan.annualPrice,
    currency:        plan.currency,
    tagline:         plan.tagline,
    // Kept for backwards-compatible clients. User-facing copy calls these
    // Blueprint run units.
    wizardRuns:      plan.wizardRuns,
    blueprintRunUnits: plan.wizardRuns,
    blueprintRunTopUpRate: BLUEPRINT_RUN_TOP_UP_RATE,
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

function getBlueprintRunUsage(email) {
  return buildSubscriptionResponse(String(email || 'thabo@company.co.za').toLowerCase()).usage
}

// This endpoint is deliberately separate from draft/preview behaviour. It is
// called only when the user downloads a final document or accepts it into the
// vault. Re-downloading an already charged final document supplies
// `alreadyCharged: true` and is free.
async function consumeBlueprintRun(req, res, next) {
  try {
    const email = String(req.user?.email || 'thabo@company.co.za').toLowerCase()
    const store = applyScheduledDowngradeIfDue(email)
    const requestedBlueprint = req.body?.blueprintId || req.body?.blueprintType || req.body?.blueprintName
    const blueprint = getBlueprint(requestedBlueprint)
    if (!blueprint) return next(errors.badRequest('Unknown Blueprint in the Document Catalogue.', 'UNKNOWN_BLUEPRINT'))

    const plan = getPlan(store.planId)
    const available = Math.max(0, plan.wizardRuns + Number(store.topUpUnits || 0) - store.runsUsed)
    const units = blueprint.blueprintUnitWeight
    if (req.body?.alreadyCharged) {
      return res.json({ success: true, message: 'Final document was already charged; repeat download is free.', data: { unitsCharged: 0, usage: buildSubscriptionResponse(email).usage } })
    }
    if (available < units) {
      return res.status(409).json({ success: false, message: `Insufficient Blueprint Units. ${blueprint.name} requires ${units}; ${available} remain.`, error: 'INSUFFICIENT_RUN_UNITS', data: { remainingBlueprintUnits: available, requiredBlueprintUnits: units, additionalBlueprintUnitsRequired: units - available, blueprint } })
    }

    store.runsUsed += units
    const usage = buildSubscriptionResponse(email).usage
    addAuditLog({ action: 'BLUEPRINT_RUN_CONSUMED', userId: req.user?.userId, email, meta: { blueprintId: blueprint.blueprintId, units, consumptionPoint: blueprint.consumptionPoint } })
    res.json({ success: true, message: `${units} Blueprint Unit${units === 1 ? '' : 's'} used.`, data: { unitsCharged: units, usage, blueprint } })
  } catch (e) { next(e) }
}

async function addBlueprintRunUnits(req, res, next) {
  try {
    const email = String(req.user?.email || 'thabo@company.co.za').toLowerCase()
    const units = Number(req.body?.units)
    if (!Number.isInteger(units) || units < 1 || units > 100) return next(errors.badRequest('Run-unit top-ups must be between 1 and 100 whole units.', 'INVALID_TOPUP_QUANTITY'))
    const store = applyScheduledDowngradeIfDue(email)
    // Top-ups never roll over: they extend this billing-period allowance only.
    // A real recurring-billing job resets topUpUnits together with runsUsed.
    store.topUpUnits = Number(store.topUpUnits || 0) + units
    const plan = getPlan(store.planId)
    const usage = {
      runsUsed: store.runsUsed,
      // runsTotal always reflects the plan's monthly allocation so the
      // dashboard "X of Y" display shows the correct plan value (e.g. 4 for
      // Launchpad, 12 for Operator). Top-up credits extend runsRemaining
      // beyond the plan total but do not change the plan denominator.
      runsTotal: plan.wizardRuns,
      runsRemaining: Math.max(0, plan.wizardRuns + store.topUpUnits - store.runsUsed),
      teamMembers: plan.teamMembers,
    }
    res.json({ success: true, message: `${units} Blueprint run unit${units === 1 ? '' : 's'} added for R${units * BLUEPRINT_RUN_TOP_UP_RATE}.`, data: { units, amount: units * BLUEPRINT_RUN_TOP_UP_RATE, usage } })
  } catch (e) { next(e) }
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

function nextMonthlyBillingDate(fromDate = new Date()) {
  const next = new Date(fromDate)
  next.setUTCMonth(next.getUTCMonth() + 1)
  return next.toISOString().slice(0, 10)
}

function calcUpgradeCharge(currentPlan, newPlan, nextBillingDate, startsNewCycle) {
  const proration = startsNewCycle
    ? { daysInCycle: 30, daysRemaining: 30, creditUnusedTime: 0, proratedNewCharge: newPlan.price }
    : calcProration(currentPlan, newPlan, nextBillingDate)
  const tax = parseFloat((proration.proratedNewCharge * VAT_RATE).toFixed(2))
  return { ...proration, tax, totalDueToday: parseFloat((proration.proratedNewCharge + tax).toFixed(2)), nextBillingDate: startsNewCycle ? nextMonthlyBillingDate() : nextBillingDate, isFullMonthlyCharge: startsNewCycle }
}

function makeBillingPeriod(fromDate, nextBillingDate) {
  const d = new Date(`${fromDate}T00:00:00.000Z`)
  const end = nextBillingDate
    ? new Date(`${nextBillingDate}T00:00:00.000Z`)
    : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
  if (nextBillingDate) end.setUTCDate(end.getUTCDate() - 1)
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
    const store    = applyScheduledDowngradeIfDue(email)
    const current  = getPlan(store.planId)
    const newPlan  = getPlan(toPlanId)

    if (!newPlan) return next(errors.badRequest('Unknown target plan.', 'INVALID_PLAN'))
    if (!current) return next(errors.badRequest('Current plan data is corrupt.', 'INVALID_PLAN'))

    const currentTier = PLAN_TIER[current.planId] ?? -1
    const newTier     = PLAN_TIER[newPlan.planId]  ?? -1
    // Free plan (tier -1) can upgrade to any paid plan.
    // Same-plan (renewal) is allowed — treated as a full monthly charge.
    if (newTier < currentTier) {
      return next(errors.badRequest('Target plan must be at least the current plan.', 'NOT_AN_UPGRADE'))
    }

    // Same-plan renewal always starts a new full monthly cycle
    const isSamePlan = newPlan.planId === current.planId
    const charge = calcUpgradeCharge(current, newPlan, store.nextBillingDate, current.planId === 'free' || isSamePlan)

    res.json({
      success: true,
      data: {
        currentPlanName:   current.name,
        newPlanName:       newPlan.name,
        currentPrice:      current.price,
        newPrice:          newPlan.price,
        daysRemaining:     charge.daysRemaining,
        daysInCycle:       charge.daysInCycle,
        creditUnusedTime:  charge.creditUnusedTime,
        proratedNewCharge: charge.proratedNewCharge,
        tax:               charge.tax,
        totalDueToday:     charge.totalDueToday,
        nextBillingDate:   charge.nextBillingDate,
        isFullMonthlyCharge: charge.isFullMonthlyCharge,
        paymentMethod:     store.paymentMethod || null,
      },
    })
  } catch (e) { next(e) }
}

async function upgradeSubscription(req, res, next) {
  try {
    const email      = String(req.user?.email || 'thabo@company.co.za').toLowerCase()
    const { currentPlanId, toPlanId, paymentReference } = req.body
    const store      = applyScheduledDowngradeIfDue(email)
    const current    = getPlan(store.planId)
    const newPlan    = getPlan(toPlanId)

    if (!newPlan) return next(errors.badRequest('Unknown target plan.', 'INVALID_PLAN'))
    if (!current) return next(errors.badRequest('Current plan data is corrupt.', 'INVALID_PLAN'))
    const sentPlanId  = String(currentPlanId || '').toLowerCase()

    // When a paymentReference is present, the Paystack verify endpoint has
    // already activated the subscription via activatePaidSubscription().
    // The store already reflects the new plan — skip all tier/stale checks
    // and just record the invoice + return the success response.
    const alreadyActivatedByPayment = Boolean(paymentReference)

    if (!alreadyActivatedByPayment) {
      // 'free' is the canonical pre-subscription state — always allow upgrade from it
      const isFreeUpgrade = sentPlanId === 'free' || store.planId === 'free'
      // Same-plan renewal — always allowed regardless of tier comparison
      const isSamePlan = newPlan.planId === current.planId
      if (!isFreeUpgrade && !isSamePlan && currentPlanId && sentPlanId !== store.planId) {
        return next(errors.conflict('Your subscription changed. Refresh the plan selection and try again.', 'STALE_CURRENT_PLAN'))
      }
      if (isFreeUpgrade) store.planId = 'free'

      const currentTier = PLAN_TIER[current.planId] ?? -1
      const newTier     = PLAN_TIER[newPlan.planId]  ?? -1
      // Same-plan renewals and free→paid upgrades are allowed; only block true downgrades
      if (newTier < currentTier) {
        return next(errors.badRequest('Target plan must be at least the current plan.', 'NOT_AN_UPGRADE'))
      }
    }

    const startsNewCycle = sentPlanId === 'free' || current.planId === 'free' || newPlan.planId === current.planId
    const charge        = calcUpgradeCharge(current, newPlan, store.nextBillingDate, startsNewCycle)
    const transactionId = paymentReference
      ? String(paymentReference)
      : `TXN_${Date.now().toString(36).toUpperCase()}`

    const year          = new Date().getFullYear()
    const seq           = String(store.invoices.length + 1).padStart(3, '0')
    const invoiceNumber = `INV-${year}-${seq}`
    const invoiceId     = `inv_${Date.now().toString(36)}`
    const paidAt        = new Date().toISOString()
    const invoiceDate   = new Date().toISOString().split('T')[0]
    const tax           = charge.tax
    const total         = charge.totalDueToday
    const billingPeriod = makeBillingPeriod(invoiceDate, charge.nextBillingDate)

    // Update subscription
    store.planId           = newPlan.planId
    store.nextBillingDate  = charge.nextBillingDate
    store.runsUsed         = 0
    store.topUpUnits       = 0
    store.pendingDowngrade = null
    // Sync plan name back to smeUsers so admin Users & Activity reflects the new plan immediately
    const smeUser = mockState.smeUsers.get(email)
    if (smeUser) { smeUser.plan = newPlan.name; mockState.smeUsers.set(email, smeUser) }
    applyCounselTier(newPlan.planId)

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
      amount:          charge.proratedNewCharge,
      tax,
      total,
      status:          'paid',
      paymentMethod:   store.paymentMethod || { brand: 'Visa', last4: '4242' },
      date:            invoiceDate,
    })

    const runsTotal     = newPlan.wizardRuns
    const runsRemaining = runsTotal

    logger.info('subscriptionController', 'Upgrade confirmed', { email, from: current.planId, to: newPlan.planId, charged: total })
    addAuditLog({ action: 'SUBSCRIPTION_UPGRADE', userId: req.user?.userId, email, meta: { from: current.planId, to: newPlan.planId, amount: total, transactionId } })

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
        amountCharged:   total,
        paidAt,
      },
    })
  } catch (e) { next(e) }
}

async function scheduleDowngrade(req, res, next) {
  try {
    const email      = String(req.user?.email || 'thabo@company.co.za').toLowerCase()
    const { currentPlanId, toPlanId } = req.body
    const store      = applyScheduledDowngradeIfDue(email)
    const current    = getPlan(store.planId)
    const newPlan    = getPlan(toPlanId)

    if (!newPlan) return next(errors.badRequest('Unknown target plan.', 'INVALID_PLAN'))
    if (!current) return next(errors.badRequest('Current plan data is corrupt.', 'INVALID_PLAN'))
    if (currentPlanId && String(currentPlanId).toLowerCase() !== store.planId) {
      return next(errors.conflict('Your subscription changed. Refresh the plan selection and try again.', 'STALE_CURRENT_PLAN'))
    }

    const currentTier = PLAN_TIER[current.planId] ?? -1
    const newTier     = PLAN_TIER[newPlan.planId]  ?? -1
    if (newTier >= currentTier) {
      return next(errors.badRequest('Target plan must be lower than current plan for a downgrade.', 'NOT_A_DOWNGRADE'))
    }
    if (store.pendingDowngrade) {
      return next(errors.conflict(`A downgrade to ${store.pendingDowngrade.toPlanName} is already scheduled. Cancel it before scheduling another.`, 'DOWNGRADE_ALREADY_SCHEDULED'))
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
    const store = applyScheduledDowngradeIfDue(email)

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
  consumeBlueprintRun,
  addBlueprintRunUnits,
  applyScheduledDowngradeIfDue,
  activatePaidSubscription,
  getBlueprintRunUsage,
  getBlueprintCatalogue: async (_req, res, next) => {
    try { res.json({ success: true, data: documentCatalogue, total: documentCatalogue.length }) } catch (e) { next(e) }
  },
}
