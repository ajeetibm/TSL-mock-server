const { mockState } = require('../mock-state')
const { createAuthUser, getCounselByEmail, normalizeEmail, sendJson } = require('./helpers')

function buildLoginResponse(payload = {}) {
  const portal = String(payload.portal || '').toLowerCase()
  const email = normalizeEmail(payload.email)
  const isCounsel = portal === 'counsel' || email.includes('counsel') || email.includes('nkosi')
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
      return {
        success: false,
        message: 'Invalid counsel credentials.',
        error: 'INVALID_CREDENTIALS',
      }
    }

    return {
      success: true,
      data: createAuthUser(counsel, counsel.mustResetPassword ? 'token' : 'session_token'),
    }
  }

  if (isAdmin) {
    return {
      success: true,
      data: {
        userId: 'adm_001',
        fullName: 'Given Kibanza',
        email: payload.email || 'given@thestartuplegal.co.za',
        role: 'admin',
        portal: 'admin',
        token: 'mock_admin_token',
        tokenExpiry: '2026-06-11T08:00:00Z',
      },
    }
  }

  return {
    success: true,
    data: {
      userId: 'usr_8f3k2m9x',
      fullName: 'Thabo Molefe',
      email: payload.email || 'thabo@company.co.za',
      role: 'sme',
      portal: 'sme',
      plan: 'operator',
      token: 'mock_sme_token',
      tokenExpiry: '2026-06-11T08:00:00Z',
    },
  }
}

function handleAuthRoutes(req, res, relPath) {
  if (req.method === 'POST' && relPath === 'api/v1/auth/login') {
    return sendJson(res, 200, buildLoginResponse(req.body))
  }

  return false
}

module.exports = { handleAuthRoutes, buildLoginResponse }
