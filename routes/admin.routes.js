const { mockState } = require('../mock-state')
const { getAdminByEmail, getCounselByEmail, normalizeEmail, sendJson } = require('./helpers')

const REVENUE_MONTHS = [
  { month: 'Jan', actual: 38200, target: 40000 },
  { month: 'Feb', actual: 41500, target: 40000 },
  { month: 'Mar', actual: 30000, target: 31000 },
  { month: 'Apr', actual: 35500, target: 32000 },
  { month: 'May', actual: 39000, target: 35000 },
  { month: 'Jun', actual: 48574, target: 52000 },
  { month: 'Jul', actual: 40500, target: 39000 },
  { month: 'Aug', actual: 44500, target: 42000 },
  { month: 'Sep', actual: 47000, target: 45000 },
  { month: 'Oct', actual: 45000, target: 46000 },
  { month: 'Nov', actual: 50500, target: 48000 },
  { month: 'Dec', actual: 52400, target: 50000 },
]

function buildRevenueSummary(months) {
  const actuals = months.map((item) => item.actual)
  const totalRevenue = actuals.reduce((sum, value) => sum + value, 0)
  const avgMonthly = Math.round(totalRevenue / months.length)
  const bestMonth = Math.max(...actuals)
  const firstActual = actuals[0] ?? 0
  const lastActual = actuals[actuals.length - 1] ?? 0
  const growthRate =
    firstActual > 0
      ? `${(((lastActual - firstActual) / firstActual) * 100).toFixed(1)}%`
      : '0%'

  return { totalRevenue, avgMonthly, bestMonth, growthRate }
}

function buildAdminDashboard() {
  return {
    success: true,
    data: {
      kpis: {
        totalUsers: 2847,
        totalUsersTrend: '+12%',
        activeWizards: 1234,
        activeWizardsTrend: '+8%',
        revenueMTD: 48574,
        currency: 'ZAR',
        issuesCount: 26,
        criticalIssues: 3,
      },
      topWizards: [
        { name: 'NDA Generator', completions: 1234 },
        { name: 'Employment Contract', completions: 987 },
        { name: 'Shareholder Agreement', completions: 756 },
        { name: 'Director Appointment', completions: 543 },
        { name: 'Company Registration', completions: 432 },
      ],
      recentCounselRequests: mockState.adminRequests
        .filter((request) => request.status === 'pending')
        .map((request) => ({
          requestId: request.requestId,
          subject: request.subject,
          fromUser: request.fromUser,
          receivedAt: request.receivedAt || request.submittedAt,
          status: request.status,
        })),
      revenueChart: {
        year: 2026,
        months: REVENUE_MONTHS,
        summary: buildRevenueSummary(REVENUE_MONTHS),
        axis: {
          yMax: 60000,
          ticks: [60000, 45000, 30000, 15000, 0],
          tickLabels: ['R99k', 'R45k', 'R30k', 'R15k', 'R0k'],
          format: 'ZAR',
        },
      },
    },
  }
}

function getPrimaryAdmin(email = 'given@thestartuplegal.co.za') {
  const normalizedEmail = normalizeEmail(email)
  return getAdminByEmail(normalizedEmail) || Array.from(mockState.adminUsers.values())[0]
}

function toAdminProfile(admin) {
  return {
    userId: admin.userId,
    fullName: admin.fullName,
    firstName: admin.firstName,
    lastName: admin.lastName,
    email: admin.email,
    role: admin.role,
    portal: admin.portal,
    phone: admin.phone,
    location: admin.location,
    jobTitle: admin.jobTitle,
    status: admin.status,
    joinedAt: admin.joinedAt,
    lastLogin: admin.lastLogin,
    updatedAt: admin.updatedAt,
  }
}

function toAdminUser(user) {
  return {
    userId: user.userId,
    fullName: user.fullName || user.contactPerson || user.companyName,
    email: user.email,
    role: user.role || 'sme',
    portal: user.portal || 'sme',
    companyName: user.companyName,
    contactPerson: user.contactPerson,
    phone: user.phone,
    registrationNumber: user.registrationNumber,
    physicalAddress: user.physicalAddress,
    plan: user.plan || 'Operator',
    status: user.status || 'Active',
    joinedAt: user.joinedAt || '2025-09-15',
    updatedAt: user.updatedAt,
  }
}

function handleAdminRoutes(req, res, relPath) {
  if (req.method === 'GET' && relPath === 'api/v1/admin/profile') {
    return sendJson(res, 200, {
      success: true,
      data: toAdminProfile(getPrimaryAdmin(req.query?.email)),
    })
  }

  if (req.method === 'PUT' && relPath === 'api/v1/admin/profile') {
    const currentAdmin = getPrimaryAdmin(req.body.email)
    const previousEmail = normalizeEmail(currentAdmin.email)
    const nextEmail = normalizeEmail(req.body.email || currentAdmin.email)
    const firstName = String(req.body.firstName ?? currentAdmin.firstName)
    const lastName = String(req.body.lastName ?? currentAdmin.lastName)
    const updatedAdmin = {
      ...currentAdmin,
      firstName,
      lastName,
      fullName: `${firstName} ${lastName}`.trim(),
      email: nextEmail,
      phone: req.body.phone ?? currentAdmin.phone,
      location: req.body.location ?? currentAdmin.location,
      jobTitle: req.body.jobTitle ?? currentAdmin.jobTitle,
      updatedAt: new Date().toISOString(),
    }

    if (previousEmail !== nextEmail) mockState.adminUsers.delete(previousEmail)
    mockState.adminUsers.set(nextEmail, updatedAdmin)

    return sendJson(res, 200, {
      success: true,
      message: 'Profile saved successfully.',
      data: toAdminProfile(updatedAdmin),
    })
  }

  if (req.method === 'PUT' && relPath === 'api/v1/admin/change-password') {
    const admin = getPrimaryAdmin(req.body.email)
    const currentPassword = String(req.body.currentPassword || '')
    const newPassword = String(req.body.newPassword || '')
    const confirmPassword = String(req.body.confirmPassword || '')

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

    if (admin.password && currentPassword !== admin.password) {
      return sendJson(res, 400, {
        success: false,
        message: 'Current password is incorrect.',
        error: 'INVALID_CURRENT_PASSWORD',
      })
    }

    admin.password = newPassword
    admin.updatedAt = new Date().toISOString()
    mockState.adminUsers.set(normalizeEmail(admin.email), admin)

    return sendJson(res, 200, {
      success: true,
      message: 'Password changed successfully.',
      data: {
        userId: admin.userId,
        email: admin.email,
        role: admin.role,
        portal: admin.portal,
        passwordUpdatedAt: admin.updatedAt,
      },
    })
  }

  if (req.method === 'GET' && relPath === 'api/v1/admin/users') {
    const users = Array.from(mockState.smeUsers.values()).map(toAdminUser)

    return sendJson(res, 200, {
      success: true,
      data: {
        stats: {
          actionsToday: 2847,
          activeNow: 234,
          workflowsStarted: 87,
        },
        users,
        pagination: {
          page: 1,
          perPage: 20,
          total: users.length,
          totalPages: 1,
        },
      },
    })
  }

  const userMatch = relPath.match(/^api\/v1\/admin\/users\/([^/]+)$/)
  if (req.method === 'PUT' && userMatch) {
    const userId = userMatch[1]
    const existingUser = Array.from(mockState.smeUsers.values()).find((user) => user.userId === userId)

    if (!existingUser) {
      return sendJson(res, 404, {
        success: false,
        message: 'User not found.',
        error: 'USER_NOT_FOUND',
      })
    }

    const previousEmail = normalizeEmail(existingUser.email)
    const updatedEmail = normalizeEmail(req.body.email || existingUser.email)
    const updatedUser = {
      ...existingUser,
      fullName: req.body.fullName || req.body.contactPerson || existingUser.fullName,
      email: updatedEmail,
      companyName: req.body.companyName ?? existingUser.companyName,
      contactPerson: req.body.contactPerson ?? existingUser.contactPerson,
      phone: req.body.phone ?? existingUser.phone,
      registrationNumber: req.body.registrationNumber ?? existingUser.registrationNumber,
      physicalAddress: req.body.physicalAddress ?? existingUser.physicalAddress,
      plan: req.body.plan ?? existingUser.plan,
      status: req.body.status ?? existingUser.status,
      updatedAt: new Date().toISOString(),
    }

    if (previousEmail !== updatedEmail) mockState.smeUsers.delete(previousEmail)
    mockState.smeUsers.set(updatedEmail, updatedUser)

    return sendJson(res, 200, {
      success: true,
      message: 'User updated successfully.',
      data: toAdminUser(updatedUser),
    })
  }

  if (req.method === 'POST' && relPath === 'api/v1/admin/counsel') {
    const email = normalizeEmail(req.body.email || 's.nkosi@tsl.co.za')
    const fullName = String(req.body.fullName || req.body.name || 'Adv. Sipho Nkosi')
    const userId = 'con_' + String(mockState.nextCounselId++).padStart(3, '0')
    const temporaryPassword = 'temporary'
    const counsel = {
      userId,
      fullName,
      email,
      password: temporaryPassword,
      role: 'counsel',
      portal: 'counsel',
      mustResetPassword: true,
      status: 'active',
    }

    mockState.counselUsers.set(email, counsel)
    mockState.counselDirectory.push({
      counselId: userId,
      fullName,
      name: fullName,
      email,
      phone: req.body.phone || '+27 11 234 5678',
      specialty: req.body.specialty || 'Commercial & Contract Law',
      expertise: req.body.expertise || req.body.specialty || 'Commercial & Contract Law',
      status: 'Available',
      availability: 'Available',
      experience: req.body.experience || '10 years exp',
      location: req.body.location || 'Johannesburg, Gauteng',
    })

    return sendJson(res, 201, {
      success: true,
      message: 'Counsel profile created. Temporary password sent to ' + email + '.',
      data: {
        counselId: userId,
        fullName,
        email,
        status: 'active',
        temporaryPassword,
        createdAt: new Date().toISOString(),
        emailPreview: {
          to: email,
          from: 'admin@tsl.co.za',
          subject: 'Your TSL Counsel Portal temporary password',
          temporaryPassword,
          loginUrl: '/counsel/login',
        },
      },
    })
  }

  if (req.method === 'GET' && relPath === 'api/v1/admin/counsel') {
    return sendJson(res, 200, {
      success: true,
      data: {
        total: mockState.counselDirectory.length,
        counsel: mockState.counselDirectory,
      },
    })
  }

  if (req.method === 'GET' && relPath === 'api/v1/admin/dashboard') {
    return sendJson(res, 200, buildAdminDashboard())
  }

  const assignMatch = relPath.match(/^api\/v1\/admin\/counsel-requests\/([^/]+)\/assign$/)
  if (req.method === 'POST' && assignMatch) {
    const requestId = assignMatch[1]
    const request = mockState.adminRequests.find((item) => item.requestId === requestId)
    const selectedEmail = normalizeEmail(req.body.counselEmail || req.body.email || req.body.assignedCounselEmail || 's.nkosi@tsl.co.za')
    const counselUser = getCounselByEmail(selectedEmail) || getCounselByEmail('s.nkosi@tsl.co.za')

    if (!request) {
      return sendJson(res, 404, {
        success: false,
        message: 'Counsel request not found.',
        error: 'REQUEST_NOT_FOUND',
      })
    }

    request.status = 'assigned'
    request.assignedCounselId = counselUser.userId
    request.assignedCounselEmail = counselUser.email
    request.assignedCounselName = counselUser.fullName
    request.assignedAt = new Date().toISOString()

    const counselRequest = {
      requestId: request.requestId,
      subject: request.subject,
      fromUser: request.fromUser,
      userEmail: request.userEmail,
      company: request.company,
      earnings: request.earnings,
      currency: request.currency,
      status: 'pending',
      assignedBy: 'Admin Sarah',
      assignedCounselId: counselUser.userId,
      assignedCounselEmail: counselUser.email,
      date: new Date().toISOString().slice(0, 10),
      assignedAt: request.assignedAt,
      timeAgo: 'just now',
    }

    const existingIndex = mockState.counselRequests.findIndex((item) => item.requestId === request.requestId)
    if (existingIndex >= 0) mockState.counselRequests[existingIndex] = counselRequest
    else mockState.counselRequests.unshift(counselRequest)

    return sendJson(res, 200, {
      success: true,
      message: 'Request assigned to ' + counselUser.fullName + '.',
      data: {
        requestId: request.requestId,
        assignedCounselId: counselUser.userId,
        assignedCounselName: counselUser.fullName,
        assignedCounselEmail: counselUser.email,
        status: 'in_progress',
        assignedAt: request.assignedAt,
        emailPreview: {
          to: counselUser.email,
          from: 'admin@tsl.co.za',
          subject: 'New counsel request assigned: ' + request.subject,
        },
      },
    })
  }

  return false
}

module.exports = { handleAdminRoutes, buildAdminDashboard }
