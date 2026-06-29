const fs = require('fs');
const path = require('path');
const express = require('express');
const yaml = require('js-yaml');

function loadConfig() {
  const cfgPath = path.join(__dirname, 'config.yml');
  try {
    const content = fs.readFileSync(cfgPath, 'utf8');
    return yaml.load(content) || {};
  } catch (err) {
    console.error('Failed to read config.yml:', err.message);
    return {};
  }
}

const config = loadConfig();
const httpCfg = (config.protocols && config.protocols.http) || {};
const enabled = httpCfg.hasOwnProperty('enable') ? httpCfg.enable : true;
if (!enabled) {
  console.warn('HTTP protocol disabled in config.yml. Exiting.');
  process.exit(0);
}

const port = httpCfg.port || 8080;
const chosenPort = process.env.PORT || port;
const mocksDir = path.resolve(__dirname, (httpCfg.mocks_dir || './mocks'));

const app = express();

// parse JSON bodies for potential mock templating
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Honor X-HTTP-Method-Override header so clients can tunnel PATCH/PUT/DELETE via POST
app.use((req, res, next) => {
  const override = req.get('X-HTTP-Method-Override') || req.get('X-HTTP-Method') || req.query && req.query._method;
  if (override) {
    req.method = override.toUpperCase();
  }
  next();
});

function isLocalDevOrigin(origin) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
}

// CORS middleware: allow origins configured in config.yml, plus localhost dev ports.
const allowedOrigins = (config.origins && Array.isArray(config.origins)) ? config.origins : [];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.length === 0) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && (allowedOrigins.includes(origin) || isLocalDevOrigin(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-HTTP-Method-Override');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
});

// Serve static files from mocks directory
// Handlebars setup for rendering templates in mock bodies
const Handlebars = require('handlebars');
Handlebars.registerHelper('randomValue', function (opts) {
  const type = opts.hash && opts.hash.type;
  if (type === 'UUID') {
    // simple UUID v4 generator
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
  return '';
});

const mockState = {
  nextCounselId: 8,
  nextRequestId: 7800,
  availability: 'available',
  smeCredits: {
    plan: 'operator',
    creditsTotal: 2,
    creditsUsed: 1,
    creditsRemaining: 1,
    usageThisMonth: 1,
    topUpRate: 500,
    currency: 'ZAR',
    resetDate: '2026-07-10',
  },
  counselUsers: new Map([
    ['s.nkosi@tsl.co.za', {
      userId: 'con_002',
      fullName: 'Adv. Sipho Nkosi',
      email: 's.nkosi@tsl.co.za',
      password: 'temporary',
      role: 'counsel',
      portal: 'counsel',
      mustResetPassword: true,
      status: 'active',
    }],
  ]),
  counselDirectory: [
    {
      counselId: 'con_002',
      fullName: 'Adv. Sipho Nkosi',
      name: 'Adv. Sipho Nkosi',
      email: 's.nkosi@tsl.co.za',
      phone: '+27 11 234 5678',
      specialty: 'Commercial & Contract Law',
      expertise: 'SaaS & Technology Contracts',
      status: 'Available',
      availability: 'Available',
      experience: '12 years exp',
      location: 'Johannesburg, Gauteng',
    },
  ],
  adminRequests: [
    {
      requestId: 'req_77b2',
      subject: 'Review of SaaS Service Agreement',
      fromUser: 'Thabo Molefe',
      userEmail: 'thabo@company.co.za',
      company: 'FibreGents (Pty) Ltd',
      receivedAt: '2026-06-10T09:15:00Z',
      submittedAt: '2026-06-10T09:15:00Z',
      status: 'pending',
      description: 'I need a comprehensive review of our SaaS agreement template.',
      assignedBy: 'Admin Sarah',
      earnings: 550,
      currency: 'ZAR',
    },
  ],
  counselRequests: [
    {
      requestId: 'req_77b2',
      subject: 'Contract Review for SaaS Agreement',
      fromUser: 'Michael Chen',
      userEmail: 'michael.chen@company.com',
      company: 'FibreGents (Pty) Ltd',
      earnings: 550,
      currency: 'ZAR',
      status: 'pending',
      assignedBy: 'Admin Sarah',
      assignedCounselId: 'con_002',
      assignedCounselEmail: 's.nkosi@tsl.co.za',
      date: '2026-01-12',
      assignedAt: '2026-01-12T10:10:00Z',
      timeAgo: '12 min ago',
    },
    {
      requestId: 'req_77b3',
      subject: 'Employment Contract Consultation',
      fromUser: 'Jessica Williams',
      userEmail: 'jessica.w@startup.co.za',
      company: 'Growth Ventures',
      earnings: 450,
      currency: 'ZAR',
      status: 'pending',
      assignedBy: 'Admin Sarah',
      assignedCounselId: 'con_002',
      assignedCounselEmail: 's.nkosi@tsl.co.za',
      date: '2026-01-12',
      assignedAt: '2026-01-12T09:57:00Z',
      timeAgo: '25 min ago',
    },
    {
      requestId: 'req_77b4',
      subject: 'Shareholder Agreement Review',
      fromUser: 'David Brown',
      userEmail: 'david.brown@tech.com',
      company: 'Digital Solutions',
      earnings: 550,
      currency: 'ZAR',
      status: 'accepted',
      assignedBy: 'Admin John',
      assignedCounselId: 'con_002',
      assignedCounselEmail: 's.nkosi@tsl.co.za',
      date: '2026-01-11',
    },
    {
      requestId: 'req_77b5',
      subject: 'NDA Review & Modification',
      fromUser: 'Sarah Johnson',
      userEmail: 'sarah.j@business.co.za',
      company: 'TechStart Inc.',
      earnings: 500,
      currency: 'ZAR',
      status: 'accepted',
      assignedBy: 'Admin Sarah',
      assignedCounselId: 'con_002',
      assignedCounselEmail: 's.nkosi@tsl.co.za',
      date: '2026-01-10',
    },
    {
      requestId: 'req_77b7',
      subject: 'Intellectual Property Review',
      fromUser: 'Emily Davis',
      userEmail: 'emily.d@innovation.co.za',
      company: 'Innovation Labs',
      earnings: 450,
      currency: 'ZAR',
      status: 'rejected',
      assignedBy: 'Admin Sarah',
      assignedCounselId: 'con_002',
      assignedCounselEmail: 's.nkosi@tsl.co.za',
      date: '2026-01-09',
    },
  ],
}

function sendJson(res, statusCode, payload) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  return res.status(statusCode).json(payload)
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function createAuthUser(user, tokenSuffix = 'token') {
  return {
    userId: user.userId,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    portal: user.portal,
    token: 'mock_counsel_' + tokenSuffix,
    tokenExpiry: '2026-06-11T08:00:00Z',
    mustResetPassword: Boolean(user.mustResetPassword),
  }
}

function getCounselByEmail(email) {
  return mockState.counselUsers.get(normalizeEmail(email))
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

function handleDynamicMock(req, res, relPath) {
  if (req.method === 'POST' && relPath === 'api/v1/auth/login') {
    return sendJson(res, 200, buildLoginResponse(req.body))
  }

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

  if (req.method === 'GET' && relPath === 'api/v1/sme/counsel/credits') {
    return sendJson(res, 200, {
      success: true,
      data: mockState.smeCredits,
    })
  }


  if (req.method === 'GET' && relPath === 'api/v1/sme/counsel/requests') {
    const requests = mockState.adminRequests.map((request) => ({
      requestId: request.requestId,
      subject: request.subject,
      status: request.status,
      assignedCounsel: request.assignedCounselName || null,
      submittedAt: request.submittedAt || request.receivedAt,
      responseUrl: request.responseUrl || null,
    }))

    return sendJson(res, 200, {
      success: true,
      data: requests,
    })
  }

  if (req.method === 'POST' && relPath === 'api/v1/sme/counsel/requests') {
    const subject = req.body.subject || req.body.title || 'Review of SaaS Service Agreement'
    const userEmail = req.body.userEmail || req.body.email || 'thabo@company.co.za'
    const now = new Date()
    const duplicateWindowMs = 30000
    const existingPendingRequest = mockState.adminRequests.find((request) => {
      const sameUser = normalizeEmail(request.userEmail) === normalizeEmail(userEmail)
      const sameSubject = String(request.subject || '').trim().toLowerCase() === String(subject).trim().toLowerCase()
      const submittedAt = new Date(request.submittedAt || request.receivedAt || 0).getTime()
      return request.status === 'pending' && sameUser && sameSubject && now.getTime() - submittedAt < duplicateWindowMs
    })

    if (existingPendingRequest) {
      return sendJson(res, 200, {
        success: true,
        message: 'Duplicate request ignored. Existing pending request returned.',
        data: {
          requestId: existingPendingRequest.requestId,
          subject: existingPendingRequest.subject,
          status: existingPendingRequest.status,
          creditsRemaining: mockState.smeCredits.creditsRemaining,
          submittedAt: existingPendingRequest.submittedAt || existingPendingRequest.receivedAt,
          duplicate: true,
        },
      })
    }

    if (mockState.smeCredits.creditsRemaining > 0) {
      mockState.smeCredits.creditsUsed += 1
      mockState.smeCredits.usageThisMonth += 1
      mockState.smeCredits.creditsRemaining -= 1
    }

    const requestId = 'req_' + mockState.nextRequestId++
    const submittedAt = now.toISOString()
    const request = {
      requestId,
      subject,
      fromUser: req.body.fromUser || req.body.fullName || 'Thabo Molefe',
      userEmail,
      company: req.body.company || 'FibreGents (Pty) Ltd',
      receivedAt: submittedAt,
      submittedAt,
      status: 'pending',
      description: req.body.description || req.body.notes || 'Please review the attached legal request.',
      assignedBy: 'Admin Sarah',
      earnings: Number(req.body.earnings || 500),
      currency: 'ZAR',
    }
    mockState.adminRequests.unshift(request)

    return sendJson(res, 201, {
      success: true,
      data: {
        requestId,
        subject: request.subject,
        status: request.status,
        creditsRemaining: mockState.smeCredits.creditsRemaining,
        submittedAt: request.submittedAt,
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

function buildMockCandidates(relPath, method) {
  const segments = relPath.split('/').filter(Boolean);
  const pathVariants = new Set([relPath]);
  const dynamicIndexes = segments
    .map((segment, index) => ({ segment, index }))
    .filter(({ segment }) => segment && segment !== 'api' && segment !== 'v1')
    .map(({ index }) => index);

  for (let mask = 1; mask < (1 << dynamicIndexes.length); mask += 1) {
    const variant = [...segments];
    dynamicIndexes.forEach((segmentIndex, bitIndex) => {
      if (mask & (1 << bitIndex)) {
        variant[segmentIndex] = '__';
      }
    });
    pathVariants.add(variant.join('/'));
  }

  return [...pathVariants].flatMap((variantPath) => [
    path.join(mocksDir, variantPath, `${method}.mock`),
    path.join(mocksDir, variantPath, `${method.toLowerCase()}.mock`),
  ]);
}

// Try to serve method-specific mock files (e.g. mocks/user/login/POST.mock)
app.use(async (req, res, next) => {
  try {
    const relPath = req.path.replace(/^\/+/, '');
    const overrideHeader = req.get('X-HTTP-Method-Override') || req.get('X-HTTP-Method') || '';
    const dynamicResponse = handleDynamicMock(req, res, relPath)
    if (dynamicResponse) return

    console.log(`[mock] incoming ${req.method} ${req.path} relPath='${relPath}' override='${overrideHeader}'`);
    // try multiple candidates for method-specific responses so real PATCH calls and
    // dynamic route segments represented by "__" folders work.
    const candidates = buildMockCandidates(relPath, req.method);

    console.log('[mock] candidate mock paths:', candidates);

    let filePath = null;
    for (const p of candidates) {
      try {
        if (fs.existsSync(p)) { filePath = p; break; }
      } catch (e) {
        // ignore errors checking candidates
      }
    }
    if (filePath) console.log(`[mock] matched file: ${filePath}`);
    else console.log(`[mock] no matching mock file found for ${req.method} ${relPath}`);

    if (filePath) {
      const raw = fs.readFileSync(filePath, 'utf8');
      // Split headers and body by first blank line
      const parts = raw.split(/\r?\n\r?\n/);
      const headerLines = parts[0].split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      let statusCode = 200;
      const headers = {};

      if (headerLines.length) {
        // First line may be HTTP status: HTTP/1.1 200 OK
        const first = headerLines[0];
        const m = first.match(/HTTP\/\d+\.\d+\s+(\d{3})/);
        if (m) statusCode = parseInt(m[1], 10);

        // remaining header lines
        for (let i = 1; i < headerLines.length; i++) {
          const idx = headerLines[i].indexOf(':');
          if (idx > -1) {
            const k = headerLines[i].slice(0, idx).trim();
            const v = headerLines[i].slice(idx + 1).trim();
            headers[k] = v;
          }
        }
      }

      let body = parts.slice(1).join('\n\n');
      // render template with request context if it contains handlebars markers
      if (body.includes('{{')) {
        try {
          const tpl = Handlebars.compile(body);
          body = tpl({ request: { body: req.body, headers: req.headers, query: req.query, params: req.params } });
        } catch (e) {
          console.error('Handlebars render error:', e.message);
        }
      }
      Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v));
      res.status(statusCode).send(body);
      return;
    }

    // fallback: try to serve a file matching the path directly for GET
    if (req.method === 'GET') {
      const staticFile = path.join(mocksDir, relPath);
      if (fs.existsSync(staticFile) && fs.statSync(staticFile).isFile()) {
        return res.sendFile(staticFile);
      }
    }

    // not found
    res.status(404).json({ error: 'Not Found', path: req.path, method: req.method });
  } catch (err) {
    next(err);
  }
});

const server = app.listen(chosenPort, () => {
  console.log(`Mock server listening on http://0.0.0.0:${chosenPort}`);
  console.log(`Serving files from: ${mocksDir}`);
});

server.on('error', (err) => {
  if (err && err.code === 'EADDRINUSE') {
    console.error(`Port ${chosenPort} is already in use. Change the port in config.yml or stop the process using the port.`);
    process.exit(1);
  }
  throw err;
});
