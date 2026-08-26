/**
 * controllers/sme.controller.js
 * SME portal endpoints — profile, counsel credits/requests, dashboard.
 * PRODUCTION: replace mockState with DB queries.
 */
const { mockState, resetCounselCreditsIfDue } = require('../mock-state')
const { paymentTransactions } = require('../mock-data/payments')
const { getSmeByEmail, normalizeEmail, createSmeUser } = require('../services/authService')
const { addAuditLog, AUDIT_ACTIONS } = require('../mock-data/audit')
const { errors } = require('../utils/errors')

function publicProfile(user) {
  return {
    userId: user.userId, companySnapshotId: user.companySnapshotId || `snapshot_${user.userId}`, fullName: user.fullName, email: user.email, role: user.role,
    portal: user.portal, plan: user.plan, status: user.status, joinedAt: user.joinedAt,
    companyName: user.companyName, registrationNumber: user.registrationNumber,
    phone: user.phone, physicalAddress: user.physicalAddress, contactPerson: user.contactPerson,
    entityType: user.entityType, legalName: user.legalName, tradingName: user.tradingName,
    individualFullNames: user.individualFullNames, idNumber: user.idNumber,
    businessEmail: user.businessEmail, businessPhone: user.businessPhone,
    unitNumber: user.unitNumber, building: user.building, streetName: user.streetName,
    suburb: user.suburb, city: user.city, province: user.province,
    postalCode: user.postalCode, country: user.country,
    signatoryName: user.signatoryName, signatoryCapacity: user.signatoryCapacity,
    updatedAt: user.updatedAt,
  }
}

function value(body, key, fallback = '') { return String(body[key] ?? fallback ?? '').trim() }

function isValidSaId(idNumber) {
  if (!/^\d{13}$/.test(idNumber)) return false
  const digits = idNumber.split('').map(Number)
  let sum = 0
  for (let index = 0; index < 13; index += 1) {
    let digit = digits[12 - index]
    if (index % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9 }
    sum += digit
  }
  return sum % 10 === 0
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
    const entityType = value(req.body, 'entityType', existing.entityType)
    const individualFullNames = value(req.body, 'individualFullNames', existing.individualFullNames)
    const legalName = value(req.body, 'legalName', existing.legalName || existing.companyName)
    const registrationNumber = value(req.body, 'registrationNumber', existing.registrationNumber)
    const businessPhone = value(req.body, 'businessPhone', existing.businessPhone || existing.phone)
    const country = value(req.body, 'country', existing.country || 'South Africa') || 'South Africa'
    const idNumber = value(req.body, 'idNumber', existing.idNumber)
    if (entityType === 'Individual' && idNumber && !isValidSaId(idNumber)) return next(errors.badRequest('Enter a valid 13-digit South African ID number.', 'INVALID_SA_ID'))
    if (country === 'South Africa' && businessPhone && !/^(?:\+27|0)\d{9}$/.test(businessPhone.replace(/[\s()-]/g, ''))) return next(errors.badRequest('Enter a valid South African telephone number.', 'INVALID_SA_TELEPHONE'))
    if (country === 'South Africa' && value(req.body, 'postalCode', existing.postalCode) && !/^\d{4}$/.test(value(req.body, 'postalCode', existing.postalCode))) return next(errors.badRequest('Enter a four-digit South African postal code.', 'INVALID_POSTAL_CODE'))
    const hasCipcRegistration = entityType === 'Company' || entityType === 'Close corporation'
    if (hasCipcRegistration && registrationNumber && !/^\d{4}\/\d{6}\/\d{2}$/.test(registrationNumber)) return next(errors.badRequest('Enter a CIPC registration number in the format YYYY/NNNNNN/NN.', 'INVALID_REGISTRATION_NUMBER'))

    const signatoryName = value(req.body, 'signatoryName', existing.signatoryName || existing.contactPerson || existing.fullName)
    const companyName = entityType === 'Individual' ? individualFullNames : legalName
    const address = [value(req.body, 'unitNumber', existing.unitNumber), value(req.body, 'building', existing.building), value(req.body, 'streetName', existing.streetName), value(req.body, 'suburb', existing.suburb), value(req.body, 'city', existing.city), value(req.body, 'province', existing.province), value(req.body, 'postalCode', existing.postalCode), country].filter(Boolean).join(', ')
    const updated = {
      ...existing,
      companySnapshotId: existing.companySnapshotId || `snapshot_${existing.userId}`,
      email: incomingEmail,
      companyName,
      registrationNumber,
      phone: businessPhone,
      physicalAddress: address || existing.physicalAddress || '',
      contactPerson: signatoryName,
      entityType,
      legalName,
      tradingName: value(req.body, 'tradingName', existing.tradingName),
      individualFullNames,
      idNumber,
      businessEmail: value(req.body, 'businessEmail', existing.businessEmail || incomingEmail),
      businessPhone,
      unitNumber: value(req.body, 'unitNumber', existing.unitNumber),
      building: value(req.body, 'building', existing.building),
      streetName: value(req.body, 'streetName', existing.streetName),
      suburb: value(req.body, 'suburb', existing.suburb),
      city: value(req.body, 'city', existing.city),
      province: value(req.body, 'province', existing.province),
      postalCode: value(req.body, 'postalCode', existing.postalCode),
      country,
      signatoryName,
      signatoryCapacity: value(req.body, 'signatoryCapacity', existing.signatoryCapacity),
      updatedAt: new Date().toISOString(),
    }
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
  try { res.json({ success: true, data: resetCounselCreditsIfDue() }) }
  catch (e) { next(e) }
}

async function getCounselRequests(req, res, next) {
  try {
    const requests = mockState.adminRequests.map(r => ({
      requestId:          r.requestId,
      subject:            r.subject,
      status:             r.status,
      assignedCounsel:    r.assignedCounselName || null,
      submittedAt:        r.submittedAt || r.receivedAt,
      responseUrl:        r.responseUrl || null,
      description:        r.description || null,
      relatedWizard:      r.relatedWizard || null,
      attachments:        r.attachments || [],
      counselResponse:    r.counselResponse || null,
      supportingDocuments: r.supportingDocuments || [],
      completedAt:        r.completedAt || null,
      responseDate:       r.completedAt || null,
    }))
    res.json({ success: true, data: requests })
  } catch (e) { next(e) }
}

async function createCounselRequest(req, res, next) {
  try {
    const credits = resetCounselCreditsIfDue()
    const subject = req.body.subject || req.body.title || 'Review of SaaS Service Agreement'
    const userEmail = req.body.userEmail || req.body.email || req.user?.email || 'thabo@company.co.za'
    const now = new Date()
    if (!String(req.body.relatedWizard || '').trim()) return next(errors.badRequest('Choose the wizard document to be reviewed before submitting a counsel request.', 'WIZARD_REQUIRED'))
    if (!Array.isArray(req.body.attachments) || req.body.attachments.length !== 1) return next(errors.badRequest('A counsel request must contain one document.', 'SINGLE_DOCUMENT_REQUIRED'))
    const creditsRequired = 1
    if (credits.creditsRemaining < creditsRequired) return next(errors.conflict('No counsel credits remain. Purchase a top-up before submitting.', 'INSUFFICIENT_COUNSEL_CREDITS'))

    const duplicate = mockState.adminRequests.find(r => {
      const sameUser = normalizeEmail(r.userEmail) === normalizeEmail(userEmail)
      const sameSubj = String(r.subject || '').trim().toLowerCase() === String(subject).trim().toLowerCase()
      const age = now.getTime() - new Date(r.submittedAt || r.receivedAt || 0).getTime()
      return r.status === 'pending' && sameUser && sameSubj && age < 30000
    })

    if (duplicate) {
      return res.json({ success: true, message: 'Duplicate request ignored.', data: { requestId: duplicate.requestId, subject: duplicate.subject, status: duplicate.status, creditsRemaining: mockState.smeCredits.creditsRemaining, submittedAt: duplicate.submittedAt || duplicate.receivedAt, duplicate: true } })
    }

    if (creditsRequired > 0) { credits.creditsUsed += creditsRequired; credits.usageThisMonth += creditsRequired; credits.creditsRemaining -= creditsRequired }

    const requestId = 'req_' + mockState.nextRequestId++
    const submittedAt = now.toISOString()
    const request = { requestId, subject, fromUser: req.body.fromUser || req.body.fullName || 'Thabo Molefe', userEmail, company: req.body.company || 'FibreGents (Pty) Ltd', receivedAt: submittedAt, submittedAt, status: 'pending', description: req.body.description || req.body.notes || null, relatedWizard: req.body.relatedWizard || null, attachments: req.body.attachments || [], creditsUsedForRequest: creditsRequired, assignedBy: 'Admin Sarah', earnings: Number(req.body.earnings || 500), currency: 'ZAR' }
    mockState.adminRequests.unshift(request)

    res.status(201).json({ success: true, data: { requestId, subject: request.subject, status: request.status, creditsRemaining: credits.creditsRemaining, submittedAt: request.submittedAt, description: request.description, relatedWizard: request.relatedWizard, attachments: request.attachments } })
  } catch (e) { next(e) }
}

// Mandatory review gate for Founders' Agreement & IP Assignment. This is an
// internal routing workflow, so it does not consume a counsel credit or require
// a user-uploaded document. Admin assigns counsel through the existing queue.
async function createPublicFundingReview(req, res, next) {
  try {
    const wizardData = req.body.wizard_data || req.body.wizardData || {}
    if (wizardData.publicly_funded !== true) return next(errors.badRequest('This review gate applies only when publicly funded IP is declared.', 'PUBLIC_FUNDING_NOT_DECLARED'))
    const userEmail = normalizeEmail(req.user?.email || req.body.userEmail || req.body.email || 'thabo@company.co.za')
    const existing = mockState.adminRequests.find((request) =>
      request.reviewGate === 'founders_public_funding' &&
      normalizeEmail(request.userEmail) === userEmail &&
      request.status !== 'completed',
    )
    if (existing) return res.json({ success: true, message: 'Publicly funded IP review already exists.', data: { requestId: existing.requestId, status: existing.reviewStatus || 'pending', rejectionReason: existing.rejectionReason || null } })

    const requestId = 'req_' + mockState.nextRequestId++
    const submittedAt = new Date().toISOString()
    const request = {
      requestId,
      subject: "Founders' Agreement & IP Assignment - Publicly Funded IP Review",
      fromUser: req.body.fromUser || 'Founder',
      userEmail,
      company: req.body.company || 'Founder company',
      receivedAt: submittedAt,
      submittedAt,
      status: 'pending',
      reviewStatus: 'pending',
      reviewGate: 'founders_public_funding',
      relatedWizard: 'founder-agreement',
      description: 'Mandatory review before generating a Founders\' Agreement & IP Assignment containing publicly funded IP.',
      wizardData,
      attachments: [],
      assignedBy: null,
      earnings: 0,
      currency: 'ZAR',
    }
    mockState.adminRequests.unshift(request)
    res.status(201).json({ success: true, message: 'Publicly funded IP review sent to admin for counsel assignment.', data: { requestId, status: 'pending' } })
  } catch (e) { next(e) }
}

async function getPublicFundingReview(req, res, next) {
  try {
    const request = mockState.adminRequests.find((item) => item.requestId === req.params.requestId && item.reviewGate === 'founders_public_funding')
    if (!request) return next(errors.notFound('Publicly funded IP review not found.', 'PUBLIC_FUNDING_REVIEW_NOT_FOUND'))
    res.json({ success: true, data: { requestId: request.requestId, status: request.reviewStatus || 'pending', rejectionReason: request.rejectionReason || null, assignedCounsel: request.assignedCounselName || null, completedAt: request.completedAt || null } })
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
    const transaction = paymentTransactions.get(String(req.body.reference || ''))
    if (!transaction || transaction.type !== 'counsel-topup' || transaction.status !== 'success') return next(errors.badRequest('A verified counsel top-up payment is required before credits can be added.', 'UNVERIFIED_TOPUP'))
    res.json({ success: true, message: 'Top-up payment was already applied.', data: resetCounselCreditsIfDue() })
  } catch (e) { next(e) }
}

module.exports = { getProfile, updateProfile, getDashboard, getCounselCredits, getCounselRequests, createCounselRequest, createPublicFundingReview, getPublicFundingReview, topUpCredits, changePassword }


// ── Payment Methods (in-memory mock store — resets on server restart) ─────────
// This is intentionally not persisted: each mock-server restart restores the
// seed card list, while cards added during a running session remain visible.

const paymentMethodsByUser = new Map()

function paymentMethodStoreKey(user) {
  return String(user?.email || user?.userId || 'default').trim().toLowerCase()
}

function getDefaultStore() {
  return [
    { methodId: 'pm_001', type: 'card', brand: 'Visa', last4: '4242', expiry: '12/28', isDefault: true },
  ]
}

function readStore(user) {
  const key = paymentMethodStoreKey(user)
  if (!paymentMethodsByUser.has(key)) paymentMethodsByUser.set(key, getDefaultStore())
  return paymentMethodsByUser.get(key)
}

async function getPaymentMethods(req, res, next) {
  try {
    const store = readStore(req.user)
    res.json({ success: true, data: store })
  } catch (e) { next(e) }
}

async function addPaymentMethod(req, res, next) {
  try {
    const store  = readStore(req.user)
    const ref    = String(req.body.reference || '')

    // ── Resolve card details ───────────────────────────────────────────────
    // Priority 1: frontend passes verified authorization fields from Paystack
    //   Verify API response (brand, last4, exp_month, exp_year).
    //   This is the CORRECT path — real card data, no guessing.
    //
    let brand, last4, expiry

    if (req.body.last4 && req.body.brand) {
      // Priority 1 — verified card data sent by frontend after Paystack Verify
      brand  = String(req.body.brand).charAt(0).toUpperCase() + String(req.body.brand).slice(1).toLowerCase()
      // Normalise card_type values: "visa debit" → "Visa", "mastercard" → "Mastercard"
      if (brand.toLowerCase().includes('visa'))       brand = 'Visa'
      if (brand.toLowerCase().includes('mastercard')) brand = 'Mastercard'
      if (brand.toLowerCase().includes('amex') || brand.toLowerCase().includes('american')) brand = 'Amex'
      last4  = String(req.body.last4).slice(-4)
      const month = String(req.body.exp_month || '').padStart(2, '0')
      const year  = String(req.body.exp_year  || '').slice(-2)
      expiry = month && year ? `${month}/${year}` : '**/**'
    } else {
      return res.status(422).json({
        success: false,
        error: 'MISSING_CARD_AUTHORIZATION',
        message: 'Paystack did not return verified card details. Configure PAYSTACK_SECRET_KEY on the server and try again.',
      })
    }

    // Prevent duplicate cards (same brand + last4)
    const duplicate = store.find((m) => m.brand === brand && m.last4 === last4)
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: `This card (${brand} ****${last4}) is already saved.`,
        error: 'DUPLICATE_CARD',
      })
    }

    const methodId = `pm_${Date.now().toString(36)}`

    const newMethod = {
      methodId,
      type: 'card',
      brand,
      last4,
      expiry,
      isDefault: store.length === 0,
      reference: ref || undefined,
    }

    store.push(newMethod)
    res.status(201).json({ success: true, data: newMethod })
  } catch (e) { next(e) }
}

module.exports = Object.assign(module.exports, { getPaymentMethods, addPaymentMethod })

async function setDefaultPaymentMethod(req, res, next) {
  try {
    const store  = readStore(req.user)
    const { methodId } = req.params
    const found = store.find((m) => m.methodId === methodId)
    if (!found) return next(require('../utils/errors').errors.notFound('Payment method not found.', 'METHOD_NOT_FOUND'))
    store.forEach((m) => { m.isDefault = false })
    found.isDefault = true
    res.json({ success: true, message: 'Default payment method updated.', data: store })
  } catch (e) { next(e) }
}

async function removePaymentMethod(req, res, next) {
  try {
    const store  = readStore(req.user)
    const { methodId } = req.params
    const idx = store.findIndex((m) => m.methodId === methodId)
    if (idx === -1) return next(require('../utils/errors').errors.notFound('Payment method not found.', 'METHOD_NOT_FOUND'))
    const wasDefault = store[idx].isDefault
    store.splice(idx, 1)
    if (wasDefault && store.length > 0) store[0].isDefault = true
    res.json({ success: true, message: 'Payment method removed.', data: store })
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



// ── Security: Active Sessions ─────────────────────────────────────────────────
// Uses the production-grade sessionStore service.
// PRODUCTION: swap sessionStore internals from in-memory Maps to PostgreSQL + Redis
// — this controller code does not change.
const { createSession, listSessions, revokeSession: revokeSessionStore } = require('../services/sessionStore')

/**
 * Called by auth.controller.js after every successful login / Google auth.
 * Registers a real session entry keyed by userId + jti.
 */
function registerSession({ userId, jti, userAgent, ip }) {
  createSession({ userId, jti, userAgent, ip })
}

async function getActiveSessions(req, res, next) {
  try {
    const userId     = req.user?.userId ?? 'default'
    const callerJti  = req.user?.jti    ?? ''
    const sessions   = listSessions({ userId, callerJti })
    res.json({ success: true, data: sessions })
  } catch (e) { next(e) }
}

async function revokeSession(req, res, next) {
  try {
    const userId     = req.user?.userId ?? 'default'
    const callerJti  = req.user?.jti    ?? ''
    const { sessionId } = req.params
    const result = revokeSessionStore({ userId, sessionId, callerJti })
    if (!result.ok) {
      return res.status(result.message === 'Session not found.' ? 404 : 400)
        .json({ success: false, message: result.message })
    }
    res.json({ success: true, message: result.message, data: result.sessions })
  } catch (e) { next(e) }
}

module.exports = Object.assign(module.exports, { getActiveSessions, revokeSession, registerSession })
