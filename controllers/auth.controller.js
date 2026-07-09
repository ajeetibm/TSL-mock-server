/**
 * controllers/auth.controller.js
 * Handles auth routes: login, register, Google OAuth, password change.
 */
const { loginUser, registerUser, googleLogin } = require('../services/authService')
const { addAuditLog, AUDIT_ACTIONS } = require('../mock-data/audit')
const { validateLoginPayload, validateRegisterPayload } = require('../utils/validate')
const { errors } = require('../utils/errors')
const logger = require('../utils/logger')

async function login(req, res, next) {
  try {
    const err = validateLoginPayload(req.body)
    if (err) return next(errors.badRequest(err, 'VALIDATION_ERROR'))
    const result = await loginUser(req.body, req.ip)
    res.json(result)
  } catch (e) { next(e) }
}

async function register(req, res, next) {
  try {
    const err = validateRegisterPayload(req.body)
    if (err) return next(errors.badRequest(err, 'VALIDATION_ERROR'))
    const result = await registerUser(req.body, req.ip)
    res.status(201).json(result)
  } catch (e) { next(e) }
}

async function googleAuth(req, res, next) {
  try {
    const accessToken = String(req.body.access_token || req.body.credential || req.body.token || '')
    if (!accessToken) return next(errors.badRequest('Google access token is required.', 'MISSING_TOKEN'))
    const result = await googleLogin(accessToken, req.ip)
    res.json(result)
  } catch (e) { next(e) }
}

async function forgotPassword(req, res, next) {
  try {
    const email = String(req.body.email || '')
    if (!email) return next(errors.badRequest('Email is required.', 'VALIDATION_ERROR'))
    // PRODUCTION: generate reset token, save to DB, send email
    logger.info('authController', 'Forgot password requested (MOCK — no email sent)', { email })
    res.json({ success: true, message: 'If an account exists, a reset link has been sent.' })
  } catch (e) { next(e) }
}

async function resetPassword(req, res, next) {
  try {
    // PRODUCTION: verify reset token from DB, update password hash
    const { token, newPassword } = req.body
    if (!token || !newPassword) return next(errors.badRequest('Token and new password are required.', 'VALIDATION_ERROR'))
    logger.info('authController', 'Password reset (MOCK)', { token })
    res.json({ success: true, message: 'Password has been reset successfully.' })
  } catch (e) { next(e) }
}

async function changePassword(req, res, next) {
  try {
    const { mockState } = require('../mock-state')
    const { normalizeEmail, getSmeByEmail, getAdminByEmail, createSmeUser } = require('../services/authService')
    const { validateChangePasswordPayload } = require('../utils/validate')
    const { errors } = require('../utils/errors')

    const err = validateChangePasswordPayload(req.body)
    if (err) return next(errors.badRequest(err, 'VALIDATION_ERROR'))

    const email = normalizeEmail(req.body.email || req.user?.email || '')
    const { currentPassword, newPassword } = req.body

    // Try admin first, then SME
    let user = getAdminByEmail(email) || getSmeByEmail(email) || createSmeUser(email)
    const store = getAdminByEmail(email) ? mockState.adminUsers : mockState.smeUsers

    // PRODUCTION: bcrypt.compare(currentPassword, user.passwordHash)
    if (user.password && currentPassword !== user.password) {
      return next(errors.badRequest('Current password is incorrect.', 'INVALID_CURRENT_PASSWORD'))
    }

    user.password = newPassword // PRODUCTION: bcrypt.hash(newPassword, 10)
    user.updatedAt = new Date().toISOString()
    store.set(email, user)

    addAuditLog({ action: AUDIT_ACTIONS.PASSWORD_CHANGE, userId: user.userId, email, role: user.role, ip: req.ip })
    res.json({ success: true, message: 'Password changed successfully.', data: { userId: user.userId, email, passwordUpdatedAt: user.updatedAt } })
  } catch (e) { next(e) }
}

module.exports = { login, register, googleAuth, forgotPassword, resetPassword, changePassword }
