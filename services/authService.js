/**
 * services/authService.js
 * Centralised authentication logic for all portals.
 * PRODUCTION: replace mockState lookups with DB queries and bcrypt.compare().
 */
const { mockState } = require('../mock-state')
const { signToken } = require('../utils/jwt')
const { addAuditLog, AUDIT_ACTIONS } = require('../mock-data/audit')
const { fetchGoogleUserInfo, getRoleForEmail } = require('./googleService')
const { errors } = require('../utils/errors')
const logger = require('../utils/logger')

function normalizeEmail(email) { return String(email || '').trim().toLowerCase() }

function titleCaseFromEmail(email) {
  return (normalizeEmail(email).split('@')[0] || 'user')
    .split(/[._-]+/).filter(Boolean)
    .map(p => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ') || 'User'
}

// ─── User lookup helpers ──────────────────────────────────────────────────────
function getAdminByEmail(email)   { return mockState.adminUsers.get(normalizeEmail(email)) }
function getCounselByEmail(email) { return mockState.counselUsers.get(normalizeEmail(email)) }
function getSmeByEmail(email)     { return mockState.smeUsers.get(normalizeEmail(email)) }

// ─── User creation helpers (MOCK only) ───────────────────────────────────────
function createSmeUser(email, payload = {}) {
  const fullName = String(payload.fullName || titleCaseFromEmail(email))
  const user = {
    userId: 'usr_' + String(mockState.nextSmeId++).padStart(4, '0'),
    fullName, email,
    role: 'sme', portal: 'sme', plan: 'Operator', status: 'Active',
    joinedAt: new Date().toISOString().slice(0, 10),
    companyName: '', registrationNumber: '', password: '', phone: '',
    physicalAddress: '', contactPerson: fullName,
    updatedAt: new Date().toISOString(),
  }
  mockState.smeUsers.set(email, user)
  return user
}

function createAdminUser(email, payload = {}) {
  const fullName = String(payload.fullName || 'Given Kibanza')
  const [firstName, ...lastParts] = fullName.split(' ').filter(Boolean)
  const user = {
    userId: 'adm_001', fullName,
    firstName: firstName || 'Given', lastName: lastParts.join(' ') || 'Kibanza',
    email: email || 'given@thestartuplegal.co.za',
    password: '', role: 'admin', portal: 'admin',
    phone: '+27 11 234 5678', location: '123 Main Street, Sandton, Johannesburg, 2196',
    jobTitle: 'Platform Administrator', status: 'active',
    joinedAt: '2025-12-01', lastLogin: 'January 9, 2026 - 14:23',
    updatedAt: new Date().toISOString(),
  }
  mockState.adminUsers.set(user.email, user)
  return user
}

/**
 * Build a signed AuthUser response object.
 * Shape matches frontend AuthUser interface — do not change field names.
 */
function buildAuthResponse(user, extraFields = {}) {
  const { token, tokenExpiry } = signToken({ userId: user.userId, email: user.email, role: user.role, portal: user.portal })
  return {
    success: true,
    data: {
      userId: user.userId,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      portal: user.portal,
      plan: user.plan || null,
      token,
      tokenExpiry,
      mustResetPassword: Boolean(user.mustResetPassword),
      ...extraFields,
    },
  }
}

// ─── Login ────────────────────────────────────────────────────────────────────
async function loginUser(payload, ip) {
  const email  = normalizeEmail(payload.email)
  const portal = String(payload.portal || '').toLowerCase()
  const password = String(payload.password || '')

  const isCounsel = portal === 'counsel' || Boolean(getCounselByEmail(email)) || email.includes('counsel') || email.includes('nkosi')
  const isAdmin   = portal === 'admin'   || email.includes('admin') || email.includes('thestartuplegal')

  let user

  if (isCounsel) {
    user = getCounselByEmail(email)
    if (!user) {
      const uid = 'con_' + String(mockState.nextCounselId++).padStart(3, '0')
      user = { userId: uid, fullName: 'Adv. Sipho Nkosi', email, password: 'temporary', role: 'counsel', portal: 'counsel', mustResetPassword: true, status: 'active' }
      mockState.counselUsers.set(email, user)
    }
    // PRODUCTION: bcrypt.compare(password, user.passwordHash)
    if (password !== user.password) throw errors.unauthorized('Invalid credentials.', 'INVALID_CREDENTIALS')

  } else if (isAdmin) {
    user = getAdminByEmail(email) || createAdminUser(email, payload)
    // Persist first-time password (MOCK only — production uses bcrypt hash on register)
    if (!user.password && password) { user.password = password; mockState.adminUsers.set(email, user) }
    if (user.password && password !== user.password) throw errors.unauthorized('Invalid credentials.', 'INVALID_CREDENTIALS')

  } else {
    user = getSmeByEmail(email) || createSmeUser(email, payload)
    if (!user.password && password) { user.password = password; mockState.smeUsers.set(email, user) }
    if (user.password && password !== user.password) throw errors.unauthorized('Invalid credentials.', 'INVALID_CREDENTIALS')
  }

  addAuditLog({ action: AUDIT_ACTIONS.LOGIN, userId: user.userId, email, role: user.role, ip })
  logger.info('authService', 'Login successful', { email, role: user.role })
  return buildAuthResponse(user)
}

// ─── Register ─────────────────────────────────────────────────────────────────
async function registerUser(payload, ip) {
  const email    = normalizeEmail(payload.email)
  const fullName = String(payload.fullName || '').trim()
  const password = String(payload.password || '')

  // PRODUCTION: check DB for existing user
  if (getSmeByEmail(email)) throw errors.conflict('An account with this email already exists.', 'EMAIL_TAKEN')

  const user = createSmeUser(email, { fullName })
  user.password = password // PRODUCTION: bcrypt.hash(password, 10)
  mockState.smeUsers.set(email, user)

  addAuditLog({ action: AUDIT_ACTIONS.LOGIN, userId: user.userId, email, role: user.role, ip, meta: { newUser: true } })
  logger.info('authService', 'Registration successful', { email })
  return { ...buildAuthResponse(user), isNewUser: true }
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────
async function googleLogin(accessToken, ip) {
  // Server calls Google — frontend never touches UserInfo API
  const googleUser = await fetchGoogleUserInfo(accessToken)
  const { email, name, picture } = googleUser

  logger.info('authService', 'Google UserInfo resolved', { email })

  // MOCK role mapping. PRODUCTION: SELECT role FROM users WHERE email=?
  const mapping = getRoleForEmail(email)
  if (!mapping) throw errors.unauthorized('This Google account is not registered for TSL access.', 'GOOGLE_ACCOUNT_NOT_AUTHORIZED')

  const { role, portal } = mapping
  let user

  if (role === 'admin') {
    user = getAdminByEmail(email) || createAdminUser(email, { fullName: name })
    user.googleAuth = true
    user.picture = picture
    mockState.adminUsers.set(email, user)
  } else if (role === 'counsel') {
    user = getCounselByEmail(email)
    if (!user) {
      const uid = 'con_' + String(mockState.nextCounselId++).padStart(3, '0')
      user = { userId: uid, fullName: name, email, password: '', role: 'counsel', portal: 'counsel', mustResetPassword: false, googleAuth: true, status: 'active' }
      mockState.counselUsers.set(email, user)
    }
  } else {
    user = getSmeByEmail(email) || createSmeUser(email, { fullName: name })
    user.googleAuth = true
    user.picture = picture
    mockState.smeUsers.set(email, user)
  }

  addAuditLog({ action: AUDIT_ACTIONS.GOOGLE_LOGIN, userId: user.userId, email, role, ip })
  return buildAuthResponse(user, { picture })
}

module.exports = { loginUser, registerUser, googleLogin, buildAuthResponse, normalizeEmail, getAdminByEmail, getCounselByEmail, getSmeByEmail, createSmeUser, createAdminUser }
