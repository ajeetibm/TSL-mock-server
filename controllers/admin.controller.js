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
  try { res.json({ success: true, data: { totalRevenue: 485740, outstandingInvoices: 23450, failedPayments: 8920, invoices: [] } }) }
  catch (e) { next(e) }
}

async function getAuditLogsEndpoint(req, res, next) {
  try { res.json({ success: true, data: getAuditLogs({ userId: req.query.userId, action: req.query.action }) }) }
  catch (e) { next(e) }
}

module.exports = { getDashboard, getProfile, updateProfile, changePassword, getUsers, updateUser, getCounsel, addCounsel, assignCounselRequest, inviteAdmin, revokeAdmin, getIssues, getBilling, getAuditLogsEndpoint }
