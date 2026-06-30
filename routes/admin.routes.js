const { mockState } = require('../mock-state')
const { getCounselByEmail, normalizeEmail, sendJson } = require('./helpers')

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
        months: [
          { month: 'Jan', actual: 38200, target: 40000 },
          { month: 'Feb', actual: 41500, target: 40000 },
          { month: 'Jun', actual: 48574, target: 52000 },
        ],
        summary: {
          totalRevenue: 504100,
          avgMonthly: 42008,
          bestMonth: 52400,
          growthRate: '48.7%',
        },
      },
    },
  }
}

function handleAdminRoutes(req, res, relPath) {
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
