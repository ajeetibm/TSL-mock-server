/**
 * controllers/counsel.controller.js
 * All counsel portal endpoints — re-uses existing logic from routes/counsel.routes.js.
 * PRODUCTION: replace mockState lookups with DB queries.
 */
const { mockState } = require('../mock-state')
const { getCounselByEmail, normalizeEmail } = require('../services/authService')
const { buildAuthResponse } = require('../services/authService')
const { addAuditLog, AUDIT_ACTIONS } = require('../mock-data/audit')
const { errors } = require('../utils/errors')

function toCounselProfile(user) {
  const nameParts = String(user.fullName || '').replace(/^Adv\.\s*/i, '').split(' ').filter(Boolean)
  return {
    userId: user.userId, fullName: user.fullName,
    firstName: user.firstName || nameParts[0] || 'Sipho',
    lastName: user.lastName || nameParts.slice(1).join(' ') || 'Nkosi',
    email: user.email, phone: user.phone || '+27 11 234 5678',
    specialty: user.specialty || 'Multiple Choice', expertise: user.expertise || 'Multiple Choice',
    location: user.location || 'Johannesburg, Gauteng', experience: user.experience || '15',
    education: user.education || 'Placeholder', meetingId: user.meetingId || 'snawaz@calendly.com',
    joinedDate: user.joinedDate || 'December 2025', lastLogin: user.lastLogin || 'January 9, 2026 - 14:23',
    updatedAt: user.updatedAt,
  }
}

function getCounselRequests(email) {
  const normalized = normalizeEmail(email)
  if (!normalized) return mockState.counselRequests
  return mockState.counselRequests.filter(r => normalizeEmail(r.assignedCounselEmail) === normalized)
}

async function getDashboard(req, res, next) {
  try {
    const email = normalizeEmail(req.query.email || req.user?.email || 's.nkosi@tsl.co.za')
    const requests = getCounselRequests(email)
    const counselUser = getCounselByEmail(email) || getCounselByEmail('s.nkosi@tsl.co.za')
    const accepted = requests.filter(r => r.status === 'accepted')
    const rejected = requests.filter(r => r.status === 'rejected')
    const pending  = requests.filter(r => r.status === 'pending')
    const total = requests.length || 1
    const totalEarnings = accepted.reduce((s, r) => s + (r.earnings || 0), 0)

    res.json({
      success: true,
      data: {
        counsel: { counselId: counselUser?.userId, fullName: counselUser?.fullName, email: counselUser?.email },
        kpis: { totalRequests: requests.length, accepted: accepted.length, acceptedRate: Math.round((accepted.length/total)*100)+'%', rejected: rejected.length, rejectedRate: Math.round((rejected.length/total)*100)+'%', totalEarnings, currency: 'ZAR' },
        availability: mockState.availability, pendingRequests: pending,
        acceptedRequests: accepted.map(r => ({ requestId: r.requestId, subject: r.subject, company: r.company, date: r.date, earnings: r.earnings, currency: r.currency })),
        earningsChart: { year: 2025, months: [{ month:'Jan',earnings:1800,target:2000},{ month:'Feb',earnings:2100,target:2200},{ month:'Mar',earnings:1950,target:2100},{ month:'Apr',earnings:2300,target:2300},{ month:'May',earnings:2200,target:2400},{ month:'Jun',earnings:2500,target:2500},{ month:'Jul',earnings:2700,target:2700},{ month:'Aug',earnings:2850,target:2850},{ month:'Sep',earnings:3000,target:3000},{ month:'Oct',earnings:3400,target:3300},{ month:'Nov',earnings:3650,target:3600},{ month:'Dec',earnings:3900,target:3800}], summary: { totalEarnings:32800, avgMonthly:2700, bestMonth:3900, growthRate:'108.1%' } },
      },
    })
  } catch (e) { next(e) }
}

async function getProfile(req, res, next) {
  try {
    const email = normalizeEmail(req.query.email || req.user?.email || 's.nkosi@tsl.co.za')
    const user = getCounselByEmail(email)
    if (!user) return next(errors.notFound('Counsel account not found.', 'COUNSEL_NOT_FOUND'))
    res.json({ success: true, data: toCounselProfile(user) })
  } catch (e) { next(e) }
}

async function updateProfile(req, res, next) {
  try {
    const currentEmail = normalizeEmail(req.body.currentEmail || req.body.originalEmail || req.body.email || req.user?.email || 's.nkosi@tsl.co.za')
    const nextEmail = normalizeEmail(req.body.email || currentEmail)
    const user = getCounselByEmail(currentEmail)
    if (!user) return next(errors.notFound('Counsel account not found.', 'COUNSEL_NOT_FOUND'))

    const current = toCounselProfile(user)
    const firstName = String(req.body.firstName ?? current.firstName)
    const lastName = String(req.body.lastName ?? current.lastName)
    Object.assign(user, { firstName, lastName, fullName: `Adv. ${firstName} ${lastName}`.trim(), email: nextEmail, phone: req.body.phone ?? user.phone, specialty: req.body.specialty ?? user.specialty, expertise: req.body.expertise ?? user.expertise, location: req.body.location ?? user.location, experience: req.body.experience ?? user.experience, education: req.body.education ?? user.education, meetingId: req.body.meetingId ?? user.meetingId, updatedAt: new Date().toISOString() })
    if (currentEmail !== nextEmail) mockState.counselUsers.delete(currentEmail)
    mockState.counselUsers.set(nextEmail, user)
    const dir = mockState.counselDirectory.find(e => normalizeEmail(e.email) === currentEmail)
    if (dir) Object.assign(dir, { fullName: user.fullName, name: user.fullName, email: user.email, phone: user.phone, specialty: user.specialty, expertise: user.expertise, location: user.location })

    addAuditLog({ action: AUDIT_ACTIONS.PROFILE_UPDATE, userId: user.userId, email: nextEmail, role: 'counsel', ip: req.ip })
    res.json({ success: true, message: 'Profile saved successfully.', data: toCounselProfile(user) })
  } catch (e) { next(e) }
}

async function changePassword(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email || req.user?.email || 's.nkosi@tsl.co.za')
    const user = getCounselByEmail(email)
    if (!user) return next(errors.notFound('Counsel account not found.', 'COUNSEL_NOT_FOUND'))
    const { currentPassword, newPassword, confirmPassword } = req.body
    if (!currentPassword || !newPassword || !confirmPassword) return next(errors.badRequest('All password fields are required.', 'VALIDATION_ERROR'))
    if (newPassword !== confirmPassword) return next(errors.badRequest('New password and confirm password must match.', 'PASSWORD_MISMATCH'))
    if (newPassword.length < 6) return next(errors.badRequest('New password must be at least 6 characters.', 'PASSWORD_TOO_SHORT'))
    if (user.password && currentPassword !== user.password) return next(errors.badRequest('Current password is incorrect.', 'INVALID_CURRENT_PASSWORD'))
    user.password = newPassword; user.mustResetPassword = false; user.updatedAt = new Date().toISOString()
    mockState.counselUsers.set(email, user)
    addAuditLog({ action: AUDIT_ACTIONS.PASSWORD_CHANGE, userId: user.userId, email, role: 'counsel', ip: req.ip })
    res.json({ success: true, message: 'Password changed successfully.', data: { userId: user.userId, email, passwordUpdatedAt: user.updatedAt } })
  } catch (e) { next(e) }
}

async function resetPassword(req, res, next) {
  try {
    const email = normalizeEmail(req.body.email)
    const user = getCounselByEmail(email)
    if (!user) return next(errors.notFound('Counsel account not found.', 'COUNSEL_NOT_FOUND'))
    user.password = String(req.body.newPassword || '')
    user.mustResetPassword = false
    res.json({ success: true, message: 'Password reset successfully.', data: buildAuthResponse(user).data })
  } catch (e) { next(e) }
}

async function getRequests(req, res, next) {
  try {
    const email = normalizeEmail(req.query.email || req.user?.email)
    const requests = getCounselRequests(email)
    res.json({ success: true, data: { total: requests.length, requests } })
  } catch (e) { next(e) }
}

async function updateAvailability(req, res, next) {
  try {
    mockState.availability = req.body.availability === 'unavailable' ? 'unavailable' : 'available'
    res.json({ success: true, message: 'Availability updated.', data: { counselId: req.user?.userId || 'con_002', availability: mockState.availability, updatedAt: new Date().toISOString() } })
  } catch (e) { next(e) }
}

async function acceptRequest(req, res, next) {
  try {
    const request = mockState.counselRequests.find(r => r.requestId === req.params.requestId)
    if (!request) return next(errors.notFound('Counsel request not found.', 'REQUEST_NOT_FOUND'))
    request.status = 'accepted'; request.acceptedAt = new Date().toISOString()
    const adminReq = mockState.adminRequests.find(r => r.requestId === request.requestId)
    if (adminReq) { adminReq.status = 'accepted'; adminReq.acceptedAt = request.acceptedAt }
    res.json({ success: true, message: 'Request accepted.', data: { requestId: request.requestId, status: request.status, email: { to: request.userEmail, from: request.assignedCounselEmail, subject: 'Meeting: '+request.subject, calendlyLink: 'https://calendly.com/snawaz/30min' } } })
  } catch (e) { next(e) }
}

async function completeRequest(req, res, next) {
  try {
    const request = mockState.counselRequests.find(r => r.requestId === req.params.requestId)
    if (!request) return next(errors.notFound('Counsel request not found.', 'REQUEST_NOT_FOUND'))
    request.status = 'completed'
    request.completedAt = new Date().toISOString()
    request.counselResponse = req.body.response || ''
    request.supportingDocuments = req.body.supportingDocuments || []
    const adminReq = mockState.adminRequests.find(r => r.requestId === request.requestId)
    if (adminReq) { adminReq.status = 'completed'; adminReq.completedAt = request.completedAt; adminReq.counselResponse = request.counselResponse; adminReq.supportingDocuments = request.supportingDocuments; adminReq.responseDate = request.completedAt }
    res.json({ success: true, message: 'Request marked as completed. User and admin have been notified.', data: { requestId: request.requestId, status: request.status, completedAt: request.completedAt, notified: { user: true, admin: true } } })
  } catch (e) { next(e) }
}

async function rejectRequest(req, res, next) {
  try {
    const request = mockState.counselRequests.find(r => r.requestId === req.params.requestId)
    if (!request) return next(errors.notFound('Counsel request not found.', 'REQUEST_NOT_FOUND'))
    request.status = 'rejected'; request.rejectedAt = new Date().toISOString(); request.rejectionReason = req.body.reason || 'Unavailable'
    const adminReq = mockState.adminRequests.find(r => r.requestId === request.requestId)
    if (adminReq) { adminReq.status = 'pending'; delete adminReq.assignedCounselId; delete adminReq.assignedCounselEmail }
    res.json({ success: true, message: 'Request rejected.', data: { requestId: request.requestId, status: request.status, returnedToAdminQueue: true } })
  } catch (e) { next(e) }
}

module.exports = { getDashboard, getProfile, updateProfile, changePassword, resetPassword, getRequests, updateAvailability, acceptRequest, rejectRequest, completeRequest }
