const https = require('https')
const { mockState } = require('../mock-state')
const { createAuthUser, getAdminByEmail, getCounselByEmail, getSmeByEmail, normalizeEmail, sendJson } = require('./helpers')

// Calls Google's UserInfo endpoint with the given OAuth2 access_token (ya29.xxx).
// The mock server does this so the frontend never touches Google's API directly.
function fetchGoogleUserInfo(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.googleapis.com',
      path: '/oauth2/v3/userinfo',
      method: 'GET',
      headers: { Authorization: 'Bearer ' + accessToken },
    }
    const req = https.request(options, (googleRes) => {
      let raw = ''
      googleRes.on('data', (chunk) => { raw += chunk })
      googleRes.on('end', () => {
        try {
          const payload = JSON.parse(raw)
          if (googleRes.statusCode !== 200 || payload.error) {
            return reject(new Error(payload.error_description || 'Google UserInfo request failed'))
          }
          resolve({
            email: String(payload.email || '').toLowerCase().trim(),
            name: String(payload.name || payload.given_name || ''),
            picture: String(payload.picture || ''),
          })
        } catch (e) {
          reject(new Error('Failed to parse Google UserInfo response'))
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

function titleCaseFromEmail(email) {
  const localPart = normalizeEmail(email).split('@')[0] || 'user'
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'User'
}

function createAdminUser(email, payload = {}) {
  const fullName = String(payload.fullName || 'Given Kibanza')
  const [firstName, ...lastNameParts] = fullName.split(' ').filter(Boolean)
  const user = {
    userId: 'adm_001',
    fullName,
    firstName: firstName || 'Given',
    lastName: lastNameParts.join(' ') || 'Kibanza',
    email: email || 'given@thestartuplegal.co.za',
    password: '',
    role: 'admin',
    portal: 'admin',
    phone: '+27 11 234 5678',
    location: '123 Main Street, Sandton, Johannesburg, 2196',
    jobTitle: 'Platform Administrator',
    status: 'active',
    joinedAt: '2025-12-01',
    lastLogin: 'January 9, 2026 - 14:23',
    updatedAt: new Date().toISOString(),
  }
  mockState.adminUsers.set(user.email, user)
  return user
}

function createSmeUser(email, payload = {}) {
  const fullName = String(payload.fullName || titleCaseFromEmail(email))
  const user = {
    userId: 'usr_' + String(mockState.nextSmeId++).padStart(4, '0'),
    fullName,
    email,
    role: 'sme',
    portal: 'sme',
    plan: 'Operator',
    status: 'Active',
    joinedAt: new Date().toISOString().slice(0, 10),
    companyName: '',
    registrationNumber: '',
    password: '',
    phone: '',
    physicalAddress: '',
    contactPerson: fullName,
    updatedAt: new Date().toISOString(),
  }
  mockState.smeUsers.set(email, user)
  return user
}

function buildLoginResponse(payload = {}) {
  const portal = String(payload.portal || '').toLowerCase()
  const email = normalizeEmail(payload.email)
  const isKnownCounsel = Boolean(getCounselByEmail(email))
  const isCounsel = portal === 'counsel' || isKnownCounsel || email.includes('counsel') || email.includes('nkosi')
  const isAdmin = portal === 'admin' || email.includes('admin') || email.includes('thestartuplegal')

  if (isCounsel) {
    let counsel = getCounselByEmail(email)
    if (!counsel) {
      const userId = 'con_' + String(mockState.nextCounselId++).padStart(3, '0')
      counsel = {
        userId,
        fullName: payload.fullName || 'Adv. Sipho Nkosi',
        email: email || 's.nkosi@tsl.co.za',
        password: 'temporary',
        role: 'counsel',
        portal: 'counsel',
        mustResetPassword: true,
        status: 'active',
      }
      mockState.counselUsers.set(counsel.email, counsel)
    }
    if (String(payload.password || '') !== counsel.password) {
      return { success: false, message: 'Invalid counsel credentials.', error: 'INVALID_CREDENTIALS' }
    }
    return { success: true, data: createAuthUser(counsel, counsel.mustResetPassword ? 'token' : 'session_token') }
  }

  if (isAdmin) {
    const adminEmail = email || 'given@thestartuplegal.co.za'
    const admin = getAdminByEmail(adminEmail) || createAdminUser(adminEmail, payload)
    const incomingAdminPassword = String(payload.password || '')
    if (admin.password && incomingAdminPassword !== admin.password) {
      return { success: false, message: 'Invalid admin credentials.', error: 'INVALID_CREDENTIALS' }
    }
    if (!admin.password && incomingAdminPassword) {
      admin.password = incomingAdminPassword
      mockState.adminUsers.set(adminEmail, admin)
    }
    return {
      success: true,
      data: { userId: admin.userId, fullName: admin.fullName, email: admin.email, role: 'admin', portal: 'admin', token: 'mock_admin_token', tokenExpiry: '2026-06-11T08:00:00Z' },
    }
  }

  const smeEmail = email || 'thabo@company.co.za'
  const sme = getSmeByEmail(smeEmail) || createSmeUser(smeEmail, payload)
  const incomingPassword = String(payload.password || '')
  if (sme.password && incomingPassword !== sme.password) {
    return { success: false, message: 'Invalid SME credentials.', error: 'INVALID_CREDENTIALS' }
  }
  if (!sme.password && incomingPassword) {
    sme.password = incomingPassword
    mockState.smeUsers.set(smeEmail, sme)
  }
  return {
    success: true,
    data: {
      userId: sme?.userId || 'usr_8f3k2m9x',
      fullName: sme?.fullName || sme?.contactPerson || 'Thabo Molefe',
      email: sme?.email || payload.email || 'thabo@company.co.za',
      role: 'sme',
      portal: 'sme',
      plan: String(sme?.plan || 'operator').toLowerCase(),
      token: 'mock_sme_token',
      tokenExpiry: '2026-06-11T08:00:00Z',
    },
  }
}

function handleAuthRoutes(req, res, relPath) {
  if (req.method === 'PUT' && relPath === 'api/v1/auth/change-password') {
    const email = normalizeEmail(req.body.email || 'thabo@company.co.za')
    const currentPassword = String(req.body.currentPassword || '')
    const newPassword = String(req.body.newPassword || '')
    const confirmPassword = String(req.body.confirmPassword || '')
    const sme = getSmeByEmail(email) || createSmeUser(email, req.body)

    if (!currentPassword || !newPassword || !confirmPassword) {
      return sendJson(res, 400, { success: false, message: 'Current password, new password, and confirmation are required.', error: 'PASSWORD_FIELDS_REQUIRED' })
    }
    if (newPassword !== confirmPassword) {
      return sendJson(res, 400, { success: false, message: 'New password and confirm password must match.', error: 'PASSWORD_MISMATCH' })
    }
    if (newPassword.length < 6) {
      return sendJson(res, 400, { success: false, message: 'New password must be at least 6 characters.', error: 'PASSWORD_TOO_SHORT' })
    }
    if (currentPassword !== sme.password) {
      return sendJson(res, 400, { success: false, message: 'Current password is incorrect.', error: 'INVALID_CURRENT_PASSWORD' })
    }
    sme.password = newPassword
    sme.updatedAt = new Date().toISOString()
    mockState.smeUsers.set(email, sme)
    return sendJson(res, 200, {
      success: true,
      message: 'Password changed successfully.',
      data: { userId: sme.userId, email: sme.email, role: sme.role, portal: sme.portal, passwordUpdatedAt: sme.updatedAt },
    })
  }

  if (req.method === 'POST' && relPath === 'api/v1/auth/login') {
    return sendJson(res, 200, buildLoginResponse(req.body))
  }

  if (req.method === 'POST' && (relPath === 'api/auth/google' || relPath === 'api/v1/auth/google')) {
    const accessToken = String(req.body.access_token || req.body.credential || req.body.token || '')

    if (!accessToken) {
      sendJson(res, 400, { success: false, message: 'Google access token is required.', error: 'MISSING_ACCESS_TOKEN' })
      return true // claim the request — prevent static file handler from also responding
    }

    // Role mapping — update emails here when connecting real backend
    const ROLE_MAP = {
      'tsl.admin.demo@gmail.com':   { role: 'admin',   portal: 'admin',   token: 'mock_google_admin_jwt_token' },
      'tsl.counsel.demo@gmail.com': { role: 'counsel',  portal: 'counsel', token: 'mock_google_counsel_jwt_token' },
      'tsl.user.demo@gmail.com':    { role: 'user',     portal: 'sme',     token: 'mock_google_user_jwt_token' },
    }

    // Call Google UserInfo API with the OAuth2 access_token — works with ya29.xxx tokens
    fetchGoogleUserInfo(accessToken)
      .then(({ email, name, picture }) => {
        console.log('[google-auth] verified email:', email)
        const mapping = ROLE_MAP[email]

        if (!mapping) {
          return sendJson(res, 401, {
            success: false,
            message: 'Unauthorized. This Google account is not registered for TSL access.',
            error: 'GOOGLE_ACCOUNT_NOT_AUTHORIZED',
          })
        }

        const { role, portal, token } = mapping
        let userId

        if (role === 'admin') {
          const admin = getAdminByEmail(email) || createAdminUser(email, { fullName: name })
          admin.googleAuth = true
          mockState.adminUsers.set(email, admin)
          userId = admin.userId
        } else if (role === 'counsel') {
          let counsel = getCounselByEmail(email)
          if (!counsel) {
            const newId = 'con_' + String(mockState.nextCounselId++).padStart(3, '0')
            counsel = { userId: newId, fullName: name, email, password: '', role: 'counsel', portal: 'counsel', mustResetPassword: false, googleAuth: true, status: 'active' }
            mockState.counselUsers.set(email, counsel)
          }
          userId = counsel.userId
        } else {
          const sme = getSmeByEmail(email) || createSmeUser(email, { fullName: name })
          sme.googleAuth = true
          mockState.smeUsers.set(email, sme)
          userId = sme.userId
        }

        return sendJson(res, 200, {
          success: true,
          message: 'Google login successful.',
          data: { userId, fullName: name, email, picture, role, portal, token, tokenExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), mustResetPassword: false },
        })
      })
      .catch((err) => {
        console.error('[google-auth] UserInfo error:', err.message)
        // Only send error if headers haven't been sent yet
        if (!res.headersSent) {
          sendJson(res, 401, { success: false, message: 'Failed to verify Google token: ' + err.message, error: 'GOOGLE_TOKEN_INVALID' })
        }
      })

    return true // claim request synchronously — async response sent in promise above
  }

  return false
}

module.exports = { handleAuthRoutes, buildLoginResponse }
