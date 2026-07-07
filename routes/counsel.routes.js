const { mockState } = require('../mock-state')
const { createAuthUser, getCounselByEmail, normalizeEmail, sendJson } = require('./helpers')

function getCounselRequests() {
  return mockState.counselRequests
}

function buildCounselDashboard() {
  const requests = getCounselRequests()
  const accepted = requests.filter((request) => request.status === 'accepted')
  const rejected = requests.filter((request) => request.status === 'rejected')
  const pending = requests.filter((request) => request.status === 'pending')
  const totalEarnings = accepted.reduce((sum, request) => sum + (request.earnings || 0), 0)
  const total = requests.length || 1

  return {
    success: true,
    data: {
      counsel: {
        counselId: 'con_002',
        fullName: 'Adv. Sipho Nkosi',
        email: 's.nkosi@tsl.co.za',
      },
      kpis: {
        totalRequests: requests.length,
        accepted: accepted.length,
        acceptedRate: Math.round((accepted.length / total) * 100) + '%',
        rejected: rejected.length,
        rejectedRate: Math.round((rejected.length / total) * 100) + '%',
        totalEarnings,
        currency: 'ZAR',
      },
      availability: mockState.availability,
      pendingRequests: pending,
      acceptedRequests: accepted.map((request) => ({
        requestId: request.requestId,
        subject: request.subject,
        company: request.company,
        date: request.date,
        earnings: request.earnings,
        currency: request.currency,
      })),
      earningsChart: {
        year: 2025,
        months: [
          { month: 'Jan', earnings: 1800, target: 2000 },
          { month: 'Feb', earnings: 2100, target: 2200 },
          { month: 'Mar', earnings: 1950, target: 2100 },
          { month: 'Apr', earnings: 2300, target: 2300 },
          { month: 'May', earnings: 2200, target: 2400 },
          { month: 'Jun', earnings: 2500, target: 2500 },
          { month: 'Jul', earnings: 2700, target: 2700 },
          { month: 'Aug', earnings: 2850, target: 2850 },
          { month: 'Sep', earnings: 3000, target: 3000 },
          { month: 'Oct', earnings: 3400, target: 3300 },
          { month: 'Nov', earnings: 3650, target: 3600 },
          { month: 'Dec', earnings: 3900, target: 3800 },
        ],
        summary: {
          totalEarnings: 32800,
          avgMonthly: 2700,
          bestMonth: 3900,
          growthRate: '108.1%',
        },
      },
    },
  }
}

function toCounselProfile(user) {
  const nameParts = String(user.fullName || '').replace(/^Adv\.\s*/i, '').split(' ').filter(Boolean)
  return {
    userId: user.userId,
    fullName: user.fullName,
    firstName: user.firstName || nameParts[0] || 'Sipho',
    lastName: user.lastName || nameParts.slice(1).join(' ') || 'Nkosi',
    email: user.email,
    phone: user.phone || '+27 11 234 5678',
    specialty: user.specialty || 'Multiple Choice',
    expertise: user.expertise || 'Multiple Choice',
    location: user.location || 'Johannesburg, Gauteng',
    experience: user.experience || '15',
    education: user.education || 'Placeholder',
    meetingId: user.meetingId || 'snawaz@calendly.com',
    joinedDate: user.joinedDate || 'December 2025',
    lastLogin: user.lastLogin || 'January 9, 2026 - 14:23',
    updatedAt: user.updatedAt,
  }
}

function buildMailPayload(request) {
  return {
    to: request.userEmail,
    cc: 'admin@tsl.co.za',
    from: request.assignedCounselEmail || 'counsel@tsl.co.za',
    subject: 'Meeting on discussion about ' + request.subject,
    calendlyLink: 'https://calendly.com/snawaz/30min',
    availabilityWindow: '09:00-13:00 and 14:00-18:00',
  }
}

function handleCounselRoutes(req, res, relPath) {
  if (req.method === 'POST' && relPath === 'api/v1/counsel/reset-password') {
    const email = normalizeEmail(req.body.email)
    const user = getCounselByEmail(email)

    if (!user) {
      return sendJson(res, 404, {
        success: false,
        message: 'Counsel account not found.',
        error: 'COUNSEL_NOT_FOUND',
      })
    }

    user.password = String(req.body.newPassword || '')
    user.mustResetPassword = false

    return sendJson(res, 200, {
      success: true,
      message: 'Counsel password has been reset successfully.',
      data: createAuthUser(user, 'reset_token'),
    })
  }

  if (req.method === 'GET' && relPath === 'api/v1/counsel/profile') {
    const email = normalizeEmail(req.query?.email || 's.nkosi@tsl.co.za')
    const user = getCounselByEmail(email)

    if (!user) {
      return sendJson(res, 404, {
        success: false,
        message: 'Counsel account not found.',
        error: 'COUNSEL_NOT_FOUND',
      })
    }

    return sendJson(res, 200, {
      success: true,
      data: toCounselProfile(user),
    })
  }

  if (req.method === 'PUT' && relPath === 'api/v1/counsel/profile') {
    const currentEmail = normalizeEmail(req.body.currentEmail || req.body.originalEmail || req.body.email || 's.nkosi@tsl.co.za')
    const nextEmail = normalizeEmail(req.body.email || currentEmail)
    const user = getCounselByEmail(currentEmail)

    if (!user) {
      return sendJson(res, 404, {
        success: false,
        message: 'Counsel account not found.',
        error: 'COUNSEL_NOT_FOUND',
      })
    }

    const currentProfile = toCounselProfile(user)
    const firstName = String(req.body.firstName ?? currentProfile.firstName)
    const lastName = String(req.body.lastName ?? currentProfile.lastName)
    Object.assign(user, {
      firstName,
      lastName,
      fullName: `Adv. ${firstName} ${lastName}`.trim(),
      email: nextEmail,
      phone: req.body.phone ?? user.phone,
      specialty: req.body.specialty ?? user.specialty,
      expertise: req.body.expertise ?? user.expertise,
      location: req.body.location ?? user.location,
      experience: req.body.experience ?? user.experience,
      education: req.body.education ?? user.education,
      meetingId: req.body.meetingId ?? user.meetingId,
      joinedDate: req.body.joinedDate ?? user.joinedDate,
      lastLogin: req.body.lastLogin ?? user.lastLogin,
      updatedAt: new Date().toISOString(),
    })
    if (currentEmail !== nextEmail) mockState.counselUsers.delete(currentEmail)
    mockState.counselUsers.set(nextEmail, user)

    const directoryEntry = mockState.counselDirectory.find((entry) => normalizeEmail(entry.email) === currentEmail)
    if (directoryEntry) {
      directoryEntry.fullName = user.fullName
      directoryEntry.name = user.fullName
      directoryEntry.email = user.email
      directoryEntry.phone = user.phone
      directoryEntry.specialty = user.specialty
      directoryEntry.expertise = user.expertise
      directoryEntry.location = user.location
      directoryEntry.experience = String(user.experience || directoryEntry.experience)
    }

    return sendJson(res, 200, {
      success: true,
      message: 'Profile saved successfully.',
      data: toCounselProfile(user),
    })
  }

  if (req.method === 'PUT' && relPath === 'api/v1/counsel/change-password') {
    const email = normalizeEmail(req.body.email || 's.nkosi@tsl.co.za')
    const user = getCounselByEmail(email)
    const currentPassword = String(req.body.currentPassword || '')
    const newPassword = String(req.body.newPassword || '')
    const confirmPassword = String(req.body.confirmPassword || '')

    if (!user) {
      return sendJson(res, 404, {
        success: false,
        message: 'Counsel account not found.',
        error: 'COUNSEL_NOT_FOUND',
      })
    }

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

    if (user.password && currentPassword !== user.password) {
      return sendJson(res, 400, {
        success: false,
        message: 'Current password is incorrect.',
        error: 'INVALID_CURRENT_PASSWORD',
      })
    }

    user.password = newPassword
    user.mustResetPassword = false
    user.updatedAt = new Date().toISOString()
    mockState.counselUsers.set(email, user)

    return sendJson(res, 200, {
      success: true,
      message: 'Password changed successfully.',
      data: {
        userId: user.userId,
        email: user.email,
        role: user.role,
        portal: user.portal,
        passwordUpdatedAt: user.updatedAt,
      },
    })
  }

  if (req.method === 'GET' && relPath === 'api/v1/counsel/dashboard') {
    return sendJson(res, 200, buildCounselDashboard())
  }

  if (req.method === 'GET' && relPath === 'api/v1/counsel/requests') {
    return sendJson(res, 200, {
      success: true,
      data: {
        total: mockState.counselRequests.length,
        requests: mockState.counselRequests,
      },
    })
  }

  if (req.method === 'PATCH' && relPath === 'api/v1/counsel/availability') {
    mockState.availability = req.body.availability === 'unavailable' ? 'unavailable' : 'available'
    return sendJson(res, 200, {
      success: true,
      message: 'Availability updated.',
      data: {
        counselId: 'con_002',
        availability: mockState.availability,
        updatedAt: new Date().toISOString(),
      },
    })
  }

  const acceptMatch = relPath.match(/^api\/v1\/counsel\/requests\/([^/]+)\/accept$/)
  if (req.method === 'POST' && acceptMatch) {
    const request = mockState.counselRequests.find((item) => item.requestId === acceptMatch[1])
    if (!request) {
      return sendJson(res, 404, {
        success: false,
        message: 'Counsel request not found.',
        error: 'REQUEST_NOT_FOUND',
      })
    }

    request.status = 'accepted'
    request.acceptedAt = new Date().toISOString()
    const adminRequest = mockState.adminRequests.find((item) => item.requestId === request.requestId)
    if (adminRequest) {
      adminRequest.status = 'accepted'
      adminRequest.acceptedAt = request.acceptedAt
      adminRequest.assignedCounselName = request.assignedCounsel
      adminRequest.responseUrl = request.responseUrl || null
    }
    const mail = buildMailPayload(request)

    return sendJson(res, 200, {
      success: true,
      message: 'Request accepted and meeting email sent.',
      data: {
        requestId: request.requestId,
        status: request.status,
        email: mail,
      },
    })
  }

  const rejectMatch = relPath.match(/^api\/v1\/counsel\/requests\/([^/]+)\/reject$/)
  if (req.method === 'POST' && rejectMatch) {
    const request = mockState.counselRequests.find((item) => item.requestId === rejectMatch[1])
    if (!request) {
      return sendJson(res, 404, {
        success: false,
        message: 'Counsel request not found.',
        error: 'REQUEST_NOT_FOUND',
      })
    }

    request.status = 'rejected'
    request.rejectedAt = new Date().toISOString()
    request.rejectionReason = req.body.reason || 'Unavailable'

    const adminRequest = mockState.adminRequests.find((item) => item.requestId === request.requestId)
    if (adminRequest) {
      adminRequest.status = 'pending'
      delete adminRequest.assignedCounselId
      delete adminRequest.assignedCounselEmail
      delete adminRequest.assignedCounselName
    }

    return sendJson(res, 200, {
      success: true,
      message: 'Request rejected and returned to admin queue.',
      data: {
        requestId: request.requestId,
        status: request.status,
        returnedToAdminQueue: true,
      },
    })
  }

  return false
}

module.exports = {
  handleCounselRoutes,
  buildCounselDashboard,
  buildMailPayload,
}
