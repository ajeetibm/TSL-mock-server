/**
 * controllers/auth.controller.js
 * Handles auth routes: login, register, Google OAuth, password reset.
 * PRODUCTION: replace mockState lookups with DB queries and bcrypt.
 */
const { loginUser, registerUser, googleLogin } = require('../services/authService')
const { addAuditLog, AUDIT_ACTIONS } = require('../mock-data/audit')
const { validateLoginPayload, validateRegisterPayload } = require('../utils/validate')
const { errors } = require('../utils/errors')
const logger = require('../utils/logger')
const { registerSession } = require('./sme.controller')

// ── Password Reset Tokens (in-memory, 15-min TTL) ────────────────────────────
// PRODUCTION: store in DB with expiry column; send email via Resend/SendGrid.
// Map: token → { email, role, expiresAt }
const resetTokens = new Map()

async function login(req, res, next) {
  try {
    const err = validateLoginPayload(req.body)
    if (err) return next(errors.badRequest(err, 'VALIDATION_ERROR'))
    const result = await loginUser(req.body, req.ip)
    if (result.success && result.data?.userId && result.data?.token) {
      registerSession({ userId: result.data.userId, jti: result.data.jti, userAgent: req.headers['user-agent'], ip: req.ip })

      // ── Login Notification ────────────────────────────────────────────────────
      // If the admin logged in AND loginNotifications is enabled, push a bell notification.
      if (result.data.portal === 'admin') {
        const { mockState } = require('../mock-state')
        const { _settingsStore } = require('./admin.controller')
        if (_settingsStore?.security?.loginNotifications) {
          const ua = req.headers['user-agent'] || 'Unknown device'
          const browser = ua.includes('Chrome') ? 'Chrome'
            : ua.includes('Firefox') ? 'Firefox'
            : ua.includes('Safari') ? 'Safari'
            : ua.includes('Edge') ? 'Edge'
            : 'Browser'
          const os = ua.includes('Windows') ? 'Windows'
            : ua.includes('Mac') ? 'macOS'
            : ua.includes('Linux') ? 'Linux'
            : ua.includes('Android') ? 'Android'
            : ua.includes('iPhone') || ua.includes('iPad') ? 'iOS'
            : 'Unknown OS'
          const notifId = `notif_login_${mockState.nextAdminNotificationId++}`
          mockState.adminNotifications.unshift({
            notificationId: notifId,
            type: 'login_alert',
            subject: 'New Login Detected',
            message: `New login to your admin account from ${browser} on ${os} · IP: ${req.ip || '127.0.0.1'}`,
            read: false,
            createdAt: new Date().toISOString(),
          })
        }
      }
    }
    res.json(result)
  } catch (e) { next(e) }
}

async function register(req, res, next) {
  try {
    const err = validateRegisterPayload(req.body)
    if (err) return next(errors.badRequest(err, 'VALIDATION_ERROR'))
    const result = await registerUser(req.body, req.ip)

    // ── New User Notification ─────────────────────────────────────────────────
    // If newUserAlerts is enabled, push a notification into adminNotifications.
    if (result.success && result.data?.userId) {
      const { mockState } = require('../mock-state')
      const { _settingsStore } = require('./admin.controller')
      if (_settingsStore?.notifications?.newUserAlerts) {
        const email = String(req.body.email || result.data?.email || 'unknown')
        const name = String(result.data?.fullName || result.data?.contactPerson || email)
        const notifId = `notif_user_${mockState.nextAdminNotificationId++}`
        mockState.adminNotifications.unshift({
          notificationId: notifId,
          type: 'new_user',
          subject: 'New User Registered',
          message: `${name} (${email}) created a new account`,
          read: false,
          createdAt: new Date().toISOString(),
        })
      }
    }

    res.status(201).json(result)
  } catch (e) { next(e) }
}

async function googleAuth(req, res, next) {
  try {
    const accessToken = String(req.body.access_token || req.body.credential || req.body.token || '')
    if (!accessToken) return next(errors.badRequest('Google access token is required.', 'MISSING_TOKEN'))
    const result = await googleLogin(accessToken, req.ip)
    if (result.success && result.data?.userId && result.data?.token) {
      registerSession({ userId: result.data.userId, jti: result.data.jti, userAgent: req.headers['user-agent'], ip: req.ip })
    }
    res.json(result)
  } catch (e) { next(e) }
}

// ── Forgot Password ───────────────────────────────────────────────────────────
async function forgotPassword(req, res, next) {
  try {
    const { normalizeEmail, getSmeByEmail, getAdminByEmail, getCounselByEmail } = require('../services/authService')

    const email = normalizeEmail(req.body.email || '')
    const portalHint = String(req.body.portal || req.body.role || '').toLowerCase()

    if (!email) return next(errors.badRequest('Email is required.', 'EMAIL_REQUIRED'))

    // Determine which role store this email belongs to
    let role = 'user'
    if (portalHint === 'admin' || getAdminByEmail(email)) {
      role = 'admin'
    } else if (portalHint === 'counsel' || getCounselByEmail(email)) {
      role = 'counsel'
    } else if (getSmeByEmail(email)) {
      role = 'user'
    } else {
      // Unknown email — auto-create as SME so the reset works for new test emails too
      role = portalHint === 'admin' ? 'admin' : portalHint === 'counsel' ? 'counsel' : 'user'
    }

    const token     = 'mock-reset-token-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15-min TTL

    // Always store the token so it can be verified
    resetTokens.set(token, { email, role, expiresAt })
    logger.info('authController', 'Reset token generated', { email, role, token, expiresAt })

    const resetLink = `http://localhost:5173/reset-password?token=${token}`
    res.json({
      success: true,
      message: 'Password reset link generated.',
      token,
      resetLink,
      role,
    })
  } catch (e) { next(e) }
}

// ── Verify Reset Token ────────────────────────────────────────────────────────
async function verifyResetToken(req, res, next) {
  try {
    const token = String(req.query.token || '')
    if (!token) return res.json({ valid: false, message: 'Token is required.' })

    const entry = resetTokens.get(token)
    if (!entry) return res.json({ valid: false, message: 'Reset link is invalid or has expired.' })

    if (new Date(entry.expiresAt) < new Date()) {
      resetTokens.delete(token)
      return res.json({ valid: false, message: 'Reset link has expired. Please request a new one.' })
    }

    // Return role so frontend can show correct context
    return res.json({ valid: true, role: entry.role, email: entry.email })
  } catch (e) { next(e) }
}

// ── Reset Password ────────────────────────────────────────────────────────────
async function resetPassword(req, res, next) {
  try {
    const { mockState } = require('../mock-state')
    const { normalizeEmail, getSmeByEmail, getAdminByEmail, getCounselByEmail, createSmeUser, createAdminUser } = require('../services/authService')

    const token    = String(req.body.token || '')
    const password = String(req.body.password || req.body.newPassword || '')

    if (!token)    return next(errors.badRequest('Token is required.', 'TOKEN_REQUIRED'))
    if (!password) return next(errors.badRequest('New password is required.', 'PASSWORD_REQUIRED'))

    const entry = resetTokens.get(token)
    if (!entry) return next(errors.badRequest('Reset link is invalid or has expired.', 'INVALID_TOKEN'))
    if (new Date(entry.expiresAt) < new Date()) {
      resetTokens.delete(token)
      return next(errors.badRequest('Reset link has expired. Please request a new one.', 'TOKEN_EXPIRED'))
    }
    if (password.length < 8) {
      return next(errors.badRequest('Password must be at least 8 characters.', 'PASSWORD_TOO_SHORT'))
    }

    const { email, role } = entry
    const now = new Date().toISOString()

    // Update password in the correct user store based on role
    if (role === 'admin') {
      const user = getAdminByEmail(email) || createAdminUser(email)
      user.password  = password
      user.updatedAt = now
      mockState.adminUsers.set(normalizeEmail(email), user)
      logger.info('authController', 'Admin password reset', { email })

    } else if (role === 'counsel') {
      const user = getCounselByEmail(email)
      if (user) {
        user.password          = password
        user.updatedAt         = now
        user.mustResetPassword = false
        mockState.counselUsers.set(normalizeEmail(email), user)
        logger.info('authController', 'Counsel password reset', { email })
      }

    } else {
      // user / sme
      const user = getSmeByEmail(email) || createSmeUser(email)
      user.password  = password
      user.updatedAt = now
      mockState.smeUsers.set(normalizeEmail(email), user)
      logger.info('authController', 'SME password reset', { email })
    }

    resetTokens.delete(token) // single-use — consumed after success

    res.json({
      success: true,
      message: 'Password updated successfully.',
      role,
    })
  } catch (e) { next(e) }
}

// ── Change Password (authenticated) ──────────────────────────────────────────
async function changePassword(req, res, next) {
  try {
    const { mockState } = require('../mock-state')
    const { normalizeEmail, getSmeByEmail, getAdminByEmail, createSmeUser } = require('../services/authService')
    const { validateChangePasswordPayload } = require('../utils/validate')

    const err = validateChangePasswordPayload(req.body)
    if (err) return next(errors.badRequest(err, 'VALIDATION_ERROR'))

    const email           = normalizeEmail(req.body.email || req.user?.email || '')
    const { currentPassword, newPassword } = req.body

    let user  = getAdminByEmail(email) || getSmeByEmail(email) || createSmeUser(email)
    const store = getAdminByEmail(email) ? mockState.adminUsers : mockState.smeUsers

    if (user.password && currentPassword !== user.password) {
      return next(errors.badRequest('Current password is incorrect.', 'INVALID_CURRENT_PASSWORD'))
    }

    user.password  = newPassword
    user.updatedAt = new Date().toISOString()
    store.set(email, user)

    addAuditLog({ action: AUDIT_ACTIONS.PASSWORD_CHANGE, userId: user.userId, email, role: user.role, ip: req.ip })
    res.json({ success: true, message: 'Password changed successfully.', data: { userId: user.userId, email, passwordUpdatedAt: user.updatedAt } })
  } catch (e) { next(e) }
}

module.exports = { login, register, googleAuth, forgotPassword, verifyResetToken, resetPassword, changePassword }
