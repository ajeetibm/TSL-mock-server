/**
 * controllers/sme.controller.js
 * SME portal endpoints — profile, counsel credits/requests, dashboard.
 * PRODUCTION: replace mockState with DB queries.
 */
const { mockState } = require('../mock-state')
const { getSmeByEmail, normalizeEmail, createSmeUser } = require('../services/authService')
const { addAuditLog, AUDIT_ACTIONS } = require('../mock-data/audit')
const { errors } = require('../utils/errors')

function publicProfile(user) {
  return { userId: user.userId, fullName: user.fullName, email: user.email, role: user.role, portal: user.portal, plan: user.plan, status: user.status, joinedAt: user.joinedAt, companyName: user.companyName, registrationNumber: user.registrationNumber, phone: user.phone, physicalAddress: user.physicalAddress, contactPerson: user.contactPerson, updatedAt: user.updatedAt }
}

async function getProfile(req, res, next) {
  try {
    const email = normalizeEmail(req.query.email || req.user?.email || 'thabo@company.co.za')
    let user = getSmeByEmail(email)
    if (!user) { user = createSmeUser(email); mockState.smeUsers.set(email, user) }
    res.json({ success: true, data: publicProfile(user) })
  } catch (e) { next(e) }
}

async function updateProfile(req, res, next) {
  try {
    const incomingEmail = normalizeEmail(req.body.email || req.user?.email || 'thabo@company.co.za')
    const existing = getSmeByEmail(incomingEmail) || createSmeUser(incomingEmail)
    const prevEmail = normalizeEmail(existing.email)
    const contactPerson = String(req.body.contactPerson || existing.contactPerson || existing.fullName || '').trim()
    const companyName = String(req.body.companyName || existing.companyName || '').trim()
    const updated = { ...existing, fullName: contactPerson || existing.fullName || companyName || 'User', email: incomingEmail, companyName, registrationNumber: String(req.body.registrationNumber || existing.registrationNumber || '').trim(), phone: String(req.body.phone || existing.phone || '').trim(), physicalAddress: String(req.body.physicalAddress || existing.physicalAddress || '').trim(), contactPerson, updatedAt: new Date().toISOString() }
    if (prevEmail && prevEmail !== updated.email) mockState.smeUsers.delete(prevEmail)
    mockState.smeUsers.set(updated.email, updated)
    addAuditLog({ action: AUDIT_ACTIONS.PROFILE_UPDATE, userId: updated.userId, email: updated.email, role: 'sme', ip: req.ip })
    res.json({ success: true, message: 'Profile updated successfully.', data: publicProfile(updated) })
  } catch (e) { next(e) }
}

async function getDashboard(req, res, next) {
  try {
    // Delegates to mock GET file for backward compat; real data from mockState
    res.json({ success: true, message: 'SME dashboard data — served from mock', data: {} })
  } catch (e) { next(e) }
}

async function getCounselCredits(req, res, next) {
  try { res.json({ success: true, data: mockState.smeCredits }) }
  catch (e) { next(e) }
}

async function getCounselRequests(req, res, next) {
  try {
    const requests = mockState.adminRequests.map(r => ({ requestId: r.requestId, subject: r.subject, status: r.status, assignedCounsel: r.assignedCounselName || null, submittedAt: r.submittedAt || r.receivedAt, responseUrl: r.responseUrl || null }))
    res.json({ success: true, data: requests })
  } catch (e) { next(e) }
}

async function createCounselRequest(req, res, next) {
  try {
    const subject = req.body.subject || req.body.title || 'Review of SaaS Service Agreement'
    const userEmail = req.body.userEmail || req.body.email || req.user?.email || 'thabo@company.co.za'
    const now = new Date()

    const duplicate = mockState.adminRequests.find(r => {
      const sameUser = normalizeEmail(r.userEmail) === normalizeEmail(userEmail)
      const sameSubj = String(r.subject || '').trim().toLowerCase() === String(subject).trim().toLowerCase()
      const age = now.getTime() - new Date(r.submittedAt || r.receivedAt || 0).getTime()
      return r.status === 'pending' && sameUser && sameSubj && age < 30000
    })

    if (duplicate) {
      return res.json({ success: true, message: 'Duplicate request ignored.', data: { requestId: duplicate.requestId, subject: duplicate.subject, status: duplicate.status, creditsRemaining: mockState.smeCredits.creditsRemaining, submittedAt: duplicate.submittedAt || duplicate.receivedAt, duplicate: true } })
    }

    if (mockState.smeCredits.creditsRemaining > 0) { mockState.smeCredits.creditsUsed++; mockState.smeCredits.usageThisMonth++; mockState.smeCredits.creditsRemaining-- }

    const requestId = 'req_' + mockState.nextRequestId++
    const submittedAt = now.toISOString()
    const request = { requestId, subject, fromUser: req.body.fromUser || req.body.fullName || 'Thabo Molefe', userEmail, company: req.body.company || 'FibreGents (Pty) Ltd', receivedAt: submittedAt, submittedAt, status: 'pending', description: req.body.description || req.body.notes || 'Please review the attached legal request.', assignedBy: 'Admin Sarah', earnings: Number(req.body.earnings || 500), currency: 'ZAR' }
    mockState.adminRequests.unshift(request)

    res.status(201).json({ success: true, data: { requestId, subject: request.subject, status: request.status, creditsRemaining: mockState.smeCredits.creditsRemaining, submittedAt: request.submittedAt } })
  } catch (e) { next(e) }
}

async function changePassword(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email || req.user?.email || '')
    const { currentPassword, newPassword, confirmPassword } = req.body
    const user = getSmeByEmail(email) || createSmeUser(email)
    if (!currentPassword || !newPassword || !confirmPassword) return next(errors.badRequest('All password fields are required.', 'VALIDATION_ERROR'))
    if (newPassword !== confirmPassword) return next(errors.badRequest('New password and confirm password must match.', 'PASSWORD_MISMATCH'))
    if (newPassword.length < 6) return next(errors.badRequest('New password must be at least 6 characters.', 'PASSWORD_TOO_SHORT'))
    if (user.password && currentPassword !== user.password) return next(errors.badRequest('Current password is incorrect.', 'INVALID_CURRENT_PASSWORD'))
    user.password = newPassword; user.updatedAt = new Date().toISOString()
    mockState.smeUsers.set(email, user)
    addAuditLog({ action: AUDIT_ACTIONS.PASSWORD_CHANGE, userId: user.userId, email, role: 'sme', ip: req.ip })
    res.json({ success: true, message: 'Password changed successfully.', data: { userId: user.userId, email, passwordUpdatedAt: user.updatedAt } })
  } catch (e) { next(e) }
}


async function topUpCredits(req, res, next) {
  try {
    const { plan, credits, amountPaid, currency, reference } = req.body

    const PLAN_RATES = { Launchpad: 550, Operator: 500, Boardroom: 450 }
    const planName = String(plan || 'Operator')
    const ratePerCredit = PLAN_RATES[planName] ?? 500
    const creditsToAdd = Number(credits) > 0 ? Number(credits) : 1
    const totalPaid = Number(amountPaid) || Math.round(ratePerCredit * creditsToAdd * 1.15)

    // Add credits to the mock sme credits state
    mockState.smeCredits.creditsTotal     += creditsToAdd
    mockState.smeCredits.creditsRemaining += creditsToAdd

    // Record the payment transaction for auditing
    const txnId = 'topup_' + Date.now()
    const txn = {
      txnId,
      reference: reference || txnId,
      plan: planName,
      creditsAdded: creditsToAdd,
      amountPaid: totalPaid,
      currency: currency || 'ZAR',
      paidAt: new Date().toISOString(),
      type: 'counsel-topup',
    }
    mockState.paymentTransactions.set(txnId, txn)

    addAuditLog({ action: 'COUNSEL_TOPUP', userId: req.user?.userId, email: req.user?.email || 'thabo@company.co.za', ip: req.ip, meta: { plan: planName, creditsAdded: creditsToAdd, amountPaid: totalPaid } })

    res.json({ success: true, message: `${creditsToAdd} credit${creditsToAdd !== 1 ? 's' : ''} added successfully.`, data: { ...mockState.smeCredits } })
  } catch (e) { next(e) }
}

module.exports = { getProfile, updateProfile, getDashboard, getCounselCredits, getCounselRequests, createCounselRequest, topUpCredits, changePassword }


// ── Payment Methods (in-memory store, persists for server lifetime) ──────────
// PRODUCTION: replace with DB reads/writes keyed by userId.
const _paymentMethodsStore = [
  {
    methodId: 'pm_001',
    type: 'card',
    brand: 'Visa',
    last4: '4242',
    expiry: '12/28',
    isDefault: true,
  },
]
let _nextPmId = 2

async function getPaymentMethods(req, res, next) {
  try {
    res.json({ success: true, data: [..._paymentMethodsStore] })
  } catch (e) { next(e) }
}

async function addPaymentMethod(req, res, next) {
  try {
    // In production Paystack returns a reusable authorization object.
    // We derive a mock card from the reference so every Add returns
    // a distinct visible entry (last4 cycles through a small set).
    const ref = String(req.body.reference || '')
    const brands = ['Visa', 'Mastercard', 'Visa', 'Mastercard']
    const last4s = ['5353', '0004', '1111', '9999']
    const expiries = ['09/29', '03/30', '11/28', '06/27']
    const idx = (_nextPmId - 2) % brands.length

    const newMethod = {
      methodId: `pm_${String(_nextPmId).padStart(3, '0')}`,
      type: 'card',
      brand: brands[idx],
      last4: last4s[idx],
      expiry: expiries[idx],
      isDefault: false,
      reference: ref || undefined,
    }
    _nextPmId++
    _paymentMethodsStore.push(newMethod)

    res.status(201).json({ success: true, data: newMethod })
  } catch (e) { next(e) }
}

module.exports = Object.assign(module.exports, { getPaymentMethods, addPaymentMethod })


async function setDefaultPaymentMethod(req, res, next) {
  try {
    const { methodId } = req.params
    const found = _paymentMethodsStore.find((m) => m.methodId === methodId)
    if (!found) return next(require('../utils/errors').errors.notFound('Payment method not found.', 'METHOD_NOT_FOUND'))
    // Clear existing default, set new one
    _paymentMethodsStore.forEach((m) => { m.isDefault = false })
    found.isDefault = true
    res.json({ success: true, message: 'Default payment method updated.', data: [..._paymentMethodsStore] })
  } catch (e) { next(e) }
}

async function removePaymentMethod(req, res, next) {
  try {
    const { methodId } = req.params
    const idx = _paymentMethodsStore.findIndex((m) => m.methodId === methodId)
    if (idx === -1) return next(require('../utils/errors').errors.notFound('Payment method not found.', 'METHOD_NOT_FOUND'))
    const wasDefault = _paymentMethodsStore[idx].isDefault
    _paymentMethodsStore.splice(idx, 1)
    // If removed card was default, promote the first remaining card
    if (wasDefault && _paymentMethodsStore.length > 0) {
      _paymentMethodsStore[0].isDefault = true
    }
    res.json({ success: true, message: 'Payment method removed.', data: [..._paymentMethodsStore] })
  } catch (e) { next(e) }
}

module.exports = Object.assign(module.exports, { setDefaultPaymentMethod, removePaymentMethod })


// ── Quick Access Links ───────────────────────────────────────────────────────
// PRODUCTION: store these URLs in the DB and expose an admin UI to update them.
const _quickAccessLinks = {
  gettingStartedGuideUrl: 'https://example.com/mock/getting-started-guide.pdf',
  videoTutorialUrl: 'https://www.youtube.com/watch?v=yb2zkxHDWws',
  consultationBookingUrl: 'https://calendly.com/example/legal-consultation',
}

async function getQuickAccessLinks(req, res, next) {
  try {
    res.json({ success: true, data: { ..._quickAccessLinks } })
  } catch (e) { next(e) }
}

module.exports = Object.assign(module.exports, { getQuickAccessLinks })


// ── Legal Notices Links ──────────────────────────────────────────────────────
// PRODUCTION: store these URLs in the DB (admin-configurable). No UI changes needed.
const _legalLinks = {
  termsOfServiceUrl:  'https://www.example.com/mock/terms-of-service.pdf',
  privacyPolicyUrl:   'https://www.example.com/mock/privacy-popia-policy.pdf',
  legalDisclaimerUrl: 'https://www.example.com/mock/legal-advice-disclaimer.pdf',
}

async function getLegalLinks(req, res, next) {
  try {
    res.json({ success: true, data: { ..._legalLinks } })
  } catch (e) { next(e) }
}

module.exports = Object.assign(module.exports, { getLegalLinks })


// ── SME Profile Preferences ───────────────────────────────────────────────────
// PRODUCTION: store per-user in DB keyed by userId.
const _smeProfilePrefs = {
  workflowUpdates: true,
  weeklySummary:   true,
  productUpdates:  true,
}

async function getSmeProfilePreferences(req, res, next) {
  try {
    res.json({ success: true, data: { ..._smeProfilePrefs } })
  } catch (e) { next(e) }
}

async function saveSmeProfilePreferences(req, res, next) {
  try {
    const { workflowUpdates, weeklySummary, productUpdates } = req.body
    if (typeof workflowUpdates === 'boolean') _smeProfilePrefs.workflowUpdates = workflowUpdates
    if (typeof weeklySummary   === 'boolean') _smeProfilePrefs.weeklySummary   = weeklySummary
    if (typeof productUpdates  === 'boolean') _smeProfilePrefs.productUpdates  = productUpdates
    res.json({ success: true, message: 'Preferences saved successfully.', data: { ..._smeProfilePrefs } })
  } catch (e) { next(e) }
}

module.exports = Object.assign(module.exports, { getSmeProfilePreferences, saveSmeProfilePreferences })
