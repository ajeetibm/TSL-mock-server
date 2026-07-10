/**
 * controllers/admin.controller.js
 * Admin portal endpoints — dashboard, users, counsel management, issues.
 * PRODUCTION: replace mockState with DB queries.
 */
const { mockState } = require('../mock-state')
const { getAdminByEmail, getCounselByEmail, normalizeEmail, createAdminUser } = require('../services/authService')
const { addAuditLog, AUDIT_ACTIONS } = require('../mock-data/audit')
const { getAuditLogs } = require('../mock-data/audit')
const { errors } = require('../utils/errors')

const REVENUE_MONTHS = [
  {month:'Jan',actual:38200,target:40000},{month:'Feb',actual:41500,target:40000},{month:'Mar',actual:30000,target:31000},
  {month:'Apr',actual:35500,target:32000},{month:'May',actual:39000,target:35000},{month:'Jun',actual:48574,target:52000},
  {month:'Jul',actual:40500,target:39000},{month:'Aug',actual:44500,target:42000},{month:'Sep',actual:47000,target:45000},
  {month:'Oct',actual:45000,target:46000},{month:'Nov',actual:50500,target:48000},{month:'Dec',actual:52400,target:50000},
]

function getAdmin(email) {
  const normalized = normalizeEmail(email || 'given@thestartuplegal.co.za')
  return getAdminByEmail(normalized) || Array.from(mockState.adminUsers.values())[0]
}

function toAdminProfile(a) {
  return { userId:a.userId, fullName:a.fullName, firstName:a.firstName, lastName:a.lastName, email:a.email, role:a.role, portal:a.portal, phone:a.phone, location:a.location, jobTitle:a.jobTitle, status:a.status, joinedAt:a.joinedAt, lastLogin:a.lastLogin, updatedAt:a.updatedAt }
}

function toAdminUser(u) {
  return { userId:u.userId, fullName:u.fullName||u.contactPerson||u.companyName, email:u.email, role:u.role||'sme', portal:u.portal||'sme', companyName:u.companyName, contactPerson:u.contactPerson, phone:u.phone, registrationNumber:u.registrationNumber, physicalAddress:u.physicalAddress, plan:u.plan||'Operator', status:u.status||'Active', joinedAt:u.joinedAt||'2025-09-15', updatedAt:u.updatedAt }
}

async function getDashboard(req, res, next) {
  try {
    const actuals = REVENUE_MONTHS.map(m => m.actual)
    const total = actuals.reduce((s,v) => s+v, 0)
    res.json({
      success: true,
      data: {
        kpis: { totalUsers:2847, totalUsersTrend:'+12%', activeWizards:1234, activeWizardsTrend:'+8%', revenueMTD:48574, currency:'ZAR', issuesCount:26, criticalIssues:3 },
        topWizards: [{name:'NDA Generator',completions:1234},{name:'Employment Contract',completions:987},{name:'Shareholder Agreement',completions:756},{name:'Director Appointment',completions:543},{name:'Company Registration',completions:432}],
        recentCounselRequests: mockState.adminRequests.filter(r => r.status === 'pending').map(r => ({ requestId:r.requestId, subject:r.subject, fromUser:r.fromUser, receivedAt:r.receivedAt||r.submittedAt, status:r.status })),
        revenueChart: { year:2026, months:REVENUE_MONTHS, summary:{ totalRevenue:total, avgMonthly:Math.round(total/REVENUE_MONTHS.length), bestMonth:Math.max(...actuals), growthRate:(((actuals[actuals.length-1]-actuals[0])/actuals[0])*100).toFixed(1)+'%' }, axis:{ yMax:60000, ticks:[60000,45000,30000,15000,0], tickLabels:['R99k','R45k','R30k','R15k','R0k'], format:'ZAR' } },
      },
    })
  } catch (e) { next(e) }
}

async function getProfile(req, res, next) {
  try { res.json({ success: true, data: toAdminProfile(getAdmin(req.query?.email || req.user?.email)) }) }
  catch (e) { next(e) }
}

async function updateProfile(req, res, next) {
  try {
    const current = getAdmin(req.body.email || req.user?.email)
    const prevEmail = normalizeEmail(current.email)
    const nextEmail = normalizeEmail(req.body.email || current.email)
    const firstName = String(req.body.firstName ?? current.firstName)
    const lastName = String(req.body.lastName ?? current.lastName)
    const updated = { ...current, firstName, lastName, fullName: `${firstName} ${lastName}`.trim(), email: nextEmail, phone: req.body.phone ?? current.phone, location: req.body.location ?? current.location, jobTitle: req.body.jobTitle ?? current.jobTitle, updatedAt: new Date().toISOString() }
    if (prevEmail !== nextEmail) mockState.adminUsers.delete(prevEmail)
    mockState.adminUsers.set(nextEmail, updated)
    addAuditLog({ action: AUDIT_ACTIONS.PROFILE_UPDATE, userId: updated.userId, email: nextEmail, role: 'admin', ip: req.ip })
    res.json({ success: true, message: 'Profile saved successfully.', data: toAdminProfile(updated) })
  } catch (e) { next(e) }
}

async function changePassword(req, res, next) {
  try {
    const admin = getAdmin(req.body.email || req.user?.email)
    const { currentPassword, newPassword, confirmPassword } = req.body
    if (!currentPassword || !newPassword || !confirmPassword) return next(errors.badRequest('All password fields are required.', 'VALIDATION_ERROR'))
    if (newPassword !== confirmPassword) return next(errors.badRequest('Passwords must match.', 'PASSWORD_MISMATCH'))
    if (newPassword.length < 6) return next(errors.badRequest('New password must be at least 6 characters.', 'PASSWORD_TOO_SHORT'))
    if (admin.password && currentPassword !== admin.password) return next(errors.badRequest('Current password is incorrect.', 'INVALID_CURRENT_PASSWORD'))
    admin.password = newPassword; admin.updatedAt = new Date().toISOString()
    mockState.adminUsers.set(normalizeEmail(admin.email), admin)
    addAuditLog({ action: AUDIT_ACTIONS.PASSWORD_CHANGE, userId: admin.userId, email: admin.email, role: 'admin', ip: req.ip })
    res.json({ success: true, message: 'Password changed successfully.', data: { userId: admin.userId, email: admin.email, passwordUpdatedAt: admin.updatedAt } })
  } catch (e) { next(e) }
}

async function getUsers(req, res, next) {
  try {
    const users = Array.from(mockState.smeUsers.values()).map(toAdminUser)
    res.json({ success: true, data: { stats: { actionsToday:2847, activeNow:234, workflowsStarted:87 }, users, pagination: { page:1, perPage:20, total:users.length, totalPages:1 } } })
  } catch (e) { next(e) }
}

async function updateUser(req, res, next) {
  try {
    const userId = req.params.userId
    const existing = Array.from(mockState.smeUsers.values()).find(u => u.userId === userId)
    if (!existing) return next(errors.notFound('User not found.', 'USER_NOT_FOUND'))
    const prevEmail = normalizeEmail(existing.email)
    const updatedEmail = normalizeEmail(req.body.email || existing.email)
    const updated = { ...existing, fullName: req.body.fullName || req.body.contactPerson || existing.fullName, email: updatedEmail, companyName: req.body.companyName ?? existing.companyName, contactPerson: req.body.contactPerson ?? existing.contactPerson, phone: req.body.phone ?? existing.phone, registrationNumber: req.body.registrationNumber ?? existing.registrationNumber, physicalAddress: req.body.physicalAddress ?? existing.physicalAddress, plan: req.body.plan ?? existing.plan, status: req.body.status ?? existing.status, updatedAt: new Date().toISOString() }
    if (prevEmail !== updatedEmail) mockState.smeUsers.delete(prevEmail)
    mockState.smeUsers.set(updatedEmail, updated)
    res.json({ success: true, message: 'User updated.', data: toAdminUser(updated) })
  } catch (e) { next(e) }
}

async function getCounsel(req, res, next) {
  try { res.json({ success: true, data: { total: mockState.counselDirectory.length, counsel: mockState.counselDirectory } }) }
  catch (e) { next(e) }
}

async function addCounsel(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email || 's.nkosi@tsl.co.za')
    const fullName = String(req.body.fullName || req.body.name || 'Adv. Sipho Nkosi')
    const userId = 'con_' + String(mockState.nextCounselId++).padStart(3, '0')
    const counsel = { userId, fullName, email, password: 'temporary', role: 'counsel', portal: 'counsel', mustResetPassword: true, status: 'active' }
    mockState.counselUsers.set(email, counsel)
    mockState.counselDirectory.push({ counselId: userId, fullName, name: fullName, email, phone: req.body.phone || '+27 11 234 5678', specialty: req.body.specialty || 'Commercial & Contract Law', expertise: req.body.expertise || req.body.specialty || 'Commercial & Contract Law', status: 'Available', availability: 'Available', experience: req.body.experience || '10 years exp', location: req.body.location || 'Johannesburg, Gauteng' })
    res.status(201).json({ success: true, message: `Counsel created. Temporary password sent to ${email}.`, data: { counselId: userId, fullName, email, status: 'active', temporaryPassword: 'temporary', createdAt: new Date().toISOString(), emailPreview: { to: email, from: 'admin@tsl.co.za', subject: 'Your TSL Counsel Portal temporary password', temporaryPassword: 'temporary', loginUrl: '/counsel/login' } } })
  } catch (e) { next(e) }
}

async function assignCounselRequest(req, res, next) {
  try {
    const requestId = req.params.requestId
    const request = mockState.adminRequests.find(r => r.requestId === requestId)
    if (!request) return next(errors.notFound('Counsel request not found.', 'REQUEST_NOT_FOUND'))
    const selectedEmail = normalizeEmail(req.body.counselEmail || req.body.email || req.body.assignedCounselEmail || 's.nkosi@tsl.co.za')
    const dirEntry = mockState.counselDirectory.find(e => normalizeEmail(e.email) === selectedEmail)
    let counselUser = getCounselByEmail(selectedEmail)
    if (!counselUser && dirEntry) { counselUser = { userId: dirEntry.counselId, fullName: dirEntry.fullName || dirEntry.name, email: normalizeEmail(dirEntry.email), password: 'temporary', role: 'counsel', portal: 'counsel', mustResetPassword: true, status: 'active' }; mockState.counselUsers.set(counselUser.email, counselUser) }
    counselUser = counselUser || getCounselByEmail('s.nkosi@tsl.co.za')
    request.status = 'assigned'; request.assignedCounselId = counselUser.userId; request.assignedCounselEmail = counselUser.email; request.assignedCounselName = counselUser.fullName; request.assignedAt = new Date().toISOString()
    const counselRequest = { requestId: request.requestId, subject: request.subject, fromUser: request.fromUser, userEmail: request.userEmail, company: request.company, earnings: request.earnings, currency: request.currency, status: 'pending', assignedBy: 'Admin Sarah', assignedCounselId: counselUser.userId, assignedCounselEmail: counselUser.email, assignedCounselName: counselUser.fullName, assignedCounsel: counselUser.fullName, date: new Date().toISOString().slice(0,10), assignedAt: request.assignedAt, timeAgo: 'just now' }
    const idx = mockState.counselRequests.findIndex(r => r.requestId === request.requestId)
    if (idx >= 0) mockState.counselRequests[idx] = counselRequest; else mockState.counselRequests.unshift(counselRequest)
    res.json({ success: true, message: `Request assigned to ${counselUser.fullName}.`, data: { requestId: request.requestId, assignedCounselId: counselUser.userId, assignedCounselName: counselUser.fullName, assignedCounselEmail: counselUser.email, status: 'in_progress', assignedAt: request.assignedAt } })
  } catch (e) { next(e) }
}

async function inviteAdmin(req, res, next) {
  try { res.status(201).json({ success: true, message: 'Sub-admin invitation sent (MOCK — no email sent).', data: { email: req.body.email, invitedAt: new Date().toISOString() } }) }
  catch (e) { next(e) }
}

async function revokeAdmin(req, res, next) {
  try {
    const adminId = req.params.adminId
    const found = Array.from(mockState.adminUsers.values()).find(a => a.userId === adminId)
    if (!found) return next(errors.notFound('Admin not found.', 'ADMIN_NOT_FOUND'))
    mockState.adminUsers.delete(normalizeEmail(found.email))
    res.json({ success: true, message: 'Admin access revoked.', data: { adminId } })
  } catch (e) { next(e) }
}

async function getIssues(req, res, next) {
  try { res.json({ success: true, data: [] }) } // MOCK: no issues data yet
  catch (e) { next(e) }
}

async function getBilling(req, res, next) {
  try {
    // PRODUCTION: query invoices from real DB filtered by req.query (client, plan, month, search)
    const { search = '', client = '', plan = '', month = '' } = req.query

    const mockInvoices = [
      { invoiceId: 'INV-2025-001', client: 'Acme Corp',        plan: 'Operator',  paymentType: 'subscription', amount: 4999,  currency: 'ZAR', status: 'paid',    issueDate: '2026-01-03', dueDate: '2026-01-17', month: 'Jan', paidAt: '2026-01-04', reference: 'ref_acme_001',      email: 'billing@acmecorp.co.za' },
      { invoiceId: 'INV-2025-002', client: 'TechStart Ltd',    plan: 'Launchpad', paymentType: 'subscription', amount: 1999,  currency: 'ZAR', status: 'paid',    issueDate: '2026-01-02', dueDate: '2026-01-16', month: 'Jan', paidAt: '2026-01-03', reference: 'ref_tech_002',      email: 'accounts@techstart.co.za' },
      { invoiceId: 'INV-2025-003', client: 'Digital Co',       plan: 'Operator',  paymentType: 'top-up',       amount: 500,   currency: 'ZAR', status: 'pending', issueDate: '2025-12-25', dueDate: '2026-01-08', month: 'Dec', paidAt: null,          reference: 'ref_digital_003',   email: 'finance@digitalco.io' },
      { invoiceId: 'INV-2024-004', client: 'Cloud Systems',    plan: 'Boardroom', paymentType: 'subscription', amount: 12999, currency: 'ZAR', status: 'paid',    issueDate: '2026-01-03', dueDate: '2026-01-17', month: 'Jan', paidAt: '2026-01-05', reference: 'ref_cloud_004',     email: 'cfo@cloudsystems.co.za' },
      { invoiceId: 'INV-2024-005', client: 'Smart Solutions',  plan: 'Operator',  paymentType: 'subscription', amount: 4999,  currency: 'ZAR', status: 'failed',  issueDate: '2025-12-20', dueDate: '2026-01-03', month: 'Dec', paidAt: null,          reference: 'ref_smart_005',     email: 'admin@smartsolutions.co.za' },
      { invoiceId: 'INV-2024-006', client: 'Nexus Labs',       plan: 'Launchpad', paymentType: 'one-time',     amount: 2499,  currency: 'ZAR', status: 'paid',    issueDate: '2025-12-15', dueDate: '2025-12-29', month: 'Dec', paidAt: '2025-12-16', reference: 'ref_nexus_006',     email: 'ops@nexuslabs.co.za' },
      { invoiceId: 'INV-2024-007', client: 'Pinnacle Group',   plan: 'Boardroom', paymentType: 'subscription', amount: 12999, currency: 'ZAR', status: 'failed',  issueDate: '2025-12-10', dueDate: '2025-12-24', month: 'Dec', paidAt: null,          reference: 'ref_pinnacle_007',  email: 'billing@pinnaclegroup.co.za' },
      { invoiceId: 'INV-2024-008', client: 'Vortex Ventures',  plan: 'Operator',  paymentType: 'top-up',       amount: 1000,  currency: 'ZAR', status: 'paid',    issueDate: '2026-01-07', dueDate: '2026-01-21', month: 'Jan', paidAt: '2026-01-08', reference: 'ref_vortex_008',    email: 'finance@vortexvc.co.za' },
      { invoiceId: 'INV-2024-009', client: 'BrightPath Inc',   plan: 'Launchpad', paymentType: 'subscription', amount: 1999,  currency: 'ZAR', status: 'pending', issueDate: '2026-01-01', dueDate: '2026-01-15', month: 'Jan', paidAt: null,          reference: 'ref_bright_009',    email: 'accounts@brightpath.co.za' },
      { invoiceId: 'INV-2024-010', client: 'Meridian Co',      plan: 'Boardroom', paymentType: 'subscription', amount: 12999, currency: 'ZAR', status: 'failed',  issueDate: '2025-11-25', dueDate: '2025-12-09', month: 'Nov', paidAt: null,          reference: 'ref_meridian_010',  email: 'ceo@meridian.co.za' },
    ]

    // Apply filters
    const q = search.toLowerCase()
    const filtered = mockInvoices.filter(inv => {
      const matchSearch = !q || inv.invoiceId.toLowerCase().includes(q) || inv.client.toLowerCase().includes(q) || inv.plan.toLowerCase().includes(q)
      const matchClient = !client || client === 'All Clients' || inv.client === client
      const matchPlan   = !plan   || plan   === 'All Plans'   || inv.plan === plan
      const matchMonth  = !month  || month  === 'All Months'  || inv.month === month
      return matchSearch && matchClient && matchPlan && matchMonth
    })

    // KPI aggregates (always from full dataset)
    const totalRevenue        = mockInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.amount, 0)
    const outstandingAmount   = mockInvoices.filter(i => i.status === 'pending').reduce((s, i) => s + i.amount, 0)
    const outstandingCount    = mockInvoices.filter(i => i.status === 'pending').length
    const failedAmount        = mockInvoices.filter(i => i.status === 'failed').reduce((s, i) => s + i.amount, 0)
    const failedCount         = mockInvoices.filter(i => i.status === 'failed').length

    res.json({
      success: true,
      data: {
        kpis: {
          totalRevenue,        currency: 'ZAR', period: 'This month',
          outstandingAmount,   outstandingCount,
          failedAmount,        failedCount,
        },
        reconciliationAlert: failedCount > 0 ? {
          active: true,
          message: `${failedCount} payment${failedCount > 1 ? 's have' : ' has'} failed in the last 7 days. Review and retry failed transactions to maintain cash flow.`,
          failedCount,
        } : { active: false },
        invoices: filtered,
        total: filtered.length,
      },
    })
  }
  catch (e) { next(e) }
}

async function getAuditLogsEndpoint(req, res, next) {
  try { res.json({ success: true, data: getAuditLogs({ userId: req.query.userId, action: req.query.action }) }) }
  catch (e) { next(e) }
}


async function exportBillingInvoices(req, res, next) {
  try {
    // PRODUCTION: validate request body (format, filters, date range)
    const { format = 'pdf', filters = {} } = req.body

    // Simulate async export job processing delay (1–2 seconds)
    // PRODUCTION: replace with real job queue (Bull/SQS) that generates the file,
    // uploads to S3/Azure Blob, then sends the download link to the admin's email
    await new Promise((resolve) => setTimeout(resolve, 1200 + Math.random() * 800))

    const jobId = `export_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    const adminEmail = req.user?.email ?? 'admin@tsl.com'

    res.json({
      success: true,
      message: 'Your invoice export is being prepared. You will receive an email with the download link shortly.',
      data: {
        jobId,
        status: 'queued',
        // PRODUCTION: this email comes from the authenticated admin's profile
        notificationEmail: adminEmail,
        format,
        estimatedCompletionSeconds: 30,
        // PRODUCTION: real link will be delivered via email, not inline
        _mockNote: 'In production, the download link is emailed — never returned inline.',
      },
    })
  } catch (e) { next(e) }
}

module.exports = { getDashboard, getProfile, updateProfile, changePassword, getUsers, updateUser, getCounsel, addCounsel, assignCounselRequest, inviteAdmin, revokeAdmin, getIssues, getBilling, getAuditLogsEndpoint, exportBillingInvoices, getGeneralSettings, updateGeneralSettings, getNotificationSettings, updateNotificationSettings, getSecuritySettings, updateSecuritySettings }


// ── In-memory settings store (PRODUCTION: replace with DB reads/writes) ──────
const _settingsStore = {
  general: {
    platformName: 'The Startup Legal',
    supportEmail: 'support@startuplegal.com',
    timezone: 'UTC+02:00 (South Africa)',
    language: 'English',
    dateFormat: 'DD/MM/YYYY',
  },
  notifications: {
    emailNotifications: true,
    newUserAlerts: true,
    paymentAlerts: true,
    systemAlerts: false,
    issueNotifications: true,
    weeklyReports: false,
  },
  security: {
    twoFactorAuth: false,
    sessionTimeout: '30 minutes',
    loginNotifications: true,
  },
}

async function getGeneralSettings(req, res, next) {
  try {
    await new Promise((r) => setTimeout(r, 300))
    res.json({ success: true, data: { ..._settingsStore.general } })
  } catch (e) { next(e) }
}

async function updateGeneralSettings(req, res, next) {
  try {
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 600))
    const { platformName, supportEmail, timezone, language, dateFormat } = req.body
    if (platformName !== undefined) _settingsStore.general.platformName = platformName
    if (supportEmail !== undefined) _settingsStore.general.supportEmail = supportEmail
    if (timezone     !== undefined) _settingsStore.general.timezone     = timezone
    if (language     !== undefined) _settingsStore.general.language     = language
    if (dateFormat   !== undefined) _settingsStore.general.dateFormat   = dateFormat
    res.json({ success: true, message: 'Settings saved successfully.', data: { ..._settingsStore.general } })
  } catch (e) { next(e) }
}

async function getNotificationSettings(req, res, next) {
  try {
    await new Promise((r) => setTimeout(r, 300))
    res.json({ success: true, data: { ..._settingsStore.notifications } })
  } catch (e) { next(e) }
}

async function updateNotificationSettings(req, res, next) {
  try {
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 600))
    const keys = ['emailNotifications','newUserAlerts','paymentAlerts','systemAlerts','issueNotifications','weeklyReports']
    for (const k of keys) {
      if (req.body[k] !== undefined) _settingsStore.notifications[k] = Boolean(req.body[k])
    }
    res.json({ success: true, message: 'Notification preferences saved successfully.', data: { ..._settingsStore.notifications } })
  } catch (e) { next(e) }
}

async function getSecuritySettings(req, res, next) {
  try {
    await new Promise((r) => setTimeout(r, 300))
    res.json({ success: true, data: { ..._settingsStore.security } })
  } catch (e) { next(e) }
}

async function updateSecuritySettings(req, res, next) {
  try {
    await new Promise((r) => setTimeout(r, 1000 + Math.random() * 600))
    if (req.body.twoFactorAuth      !== undefined) _settingsStore.security.twoFactorAuth      = Boolean(req.body.twoFactorAuth)
    if (req.body.sessionTimeout     !== undefined) _settingsStore.security.sessionTimeout     = req.body.sessionTimeout
    if (req.body.loginNotifications !== undefined) _settingsStore.security.loginNotifications = Boolean(req.body.loginNotifications)
    res.json({ success: true, message: 'Security settings updated successfully.', data: { ..._settingsStore.security } })
  } catch (e) { next(e) }
}
