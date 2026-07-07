const { mockState } = require('../mock-state')
const { createAuthUser, getAdminByEmail, getCounselByEmail, getSmeByEmail, normalizeEmail, sendJson } = require('./helpers')

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
    const adminEmail = email || 'given@thestartuplegal.co.za'
    const admin = getAdminByEmail(adminEmail) || createAdminUser(adminEmail, payload)
    const incomingAdminPassword = String(payload.password || '')

    if (admin.password && incomingAdminPassword !== admin.password) {
      return {
        success: false,
        message: 'Invalid admin credentials.',
        error: 'INVALID_CREDENTIALS',
      }
    }

    // Persist the password used at login so change-password can validate against it
    if (!admin.password && incomingAdminPassword) {
      admin.password = incomingAdminPassword
      mockState.adminUsers.set(adminEmail, admin)
    }

    return {
      success: true,
      data: {
        userId: admin.userId,
        fullName: admin.fullName,
        email: admin.email,
        role: 'admin',
        portal: 'admin',
        token: 'mock_admin_token',
        tokenExpiry: '2026-06-11T08:00:00Z',
      },
    }
  }

  const smeEmail = email || 'thabo@company.co.za'
  const sme = getSmeByEmail(smeEmail) || createSmeUser(smeEmail, payload)
  const incomingPassword = String(payload.password || '')

  if (sme.password && incomingPassword !== sme.password) {
    return {
      success: false,
      message: 'Invalid SME credentials.',
      error: 'INVALID_CREDENTIALS',
    }
  }

  // Persist the password used at login so change-password can validate against it
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
      return sendJson(res, 400, {
        success: false,
        message: 'Current password, new password, and confirmation are required.',
        error: 'PASSWORD_FIELDS_REQUIRED',
      })
    }

    if (newPassword !== confirmPassword) {
      return sendJson(res, 400, {
        success: false,
        message: 'New password and confirm password must match.',
        error: 'PASSWORD_MISMATCH',
      })
    }

    if (newPassword.length < 6) {
      return sendJson(res, 400, {
        success: false,
        message: 'New password must be at least 6 characters.',
        error: 'PASSWORD_TOO_SHORT',
      })
    }

    if (currentPassword !== sme.password) {
      return sendJson(res, 400, {
        success: false,
        message: 'Current password is incorrect.',
        error: 'INVALID_CURRENT_PASSWORD',
      })
    }

    sme.password = newPassword
    sme.updatedAt = new Date().toISOString()
    mockState.smeUsers.set(email, sme)

    return sendJson(res, 200, {
      success: true,
      message: 'Password changed successfully.',
      data: {
        userId: sme.userId,
        email: sme.email,
        role: sme.role,
        portal: sme.portal,
        passwordUpdatedAt: sme.updatedAt,
      },
    })
  }

  if (req.method === 'POST' && relPath === 'api/v1/auth/login') {
    return sendJson(res, 200, buildLoginResponse(req.body))
  }

  return false
}

module.exports = { handleAuthRoutes, buildLoginResponse }
