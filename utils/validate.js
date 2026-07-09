/**
 * utils/validate.js
 * Simple request body validators. Returns error string or null.
 * PRODUCTION: replace with joi / zod schemas.
 */

function validateEmail(email) {
  if (!email || typeof email !== 'string') return 'Email is required.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return 'A valid email address is required.'
  return null
}

function validatePassword(password, field = 'Password') {
  if (!password || typeof password !== 'string') return `${field} is required.`
  if (password.length < 6) return `${field} must be at least 6 characters.`
  return null
}

function validateLoginPayload(body) {
  return validateEmail(body.email) || validatePassword(body.password, 'Password')
}

function validateRegisterPayload(body) {
  if (!body.fullName || !String(body.fullName).trim()) return 'Full name is required.'
  return validateEmail(body.email) || validatePassword(body.password, 'Password') ||
    (body.password !== body.confirmPassword ? 'Passwords do not match.' : null)
}

function validateChangePasswordPayload(body) {
  if (!body.currentPassword) return 'Current password is required.'
  return validatePassword(body.newPassword, 'New password') ||
    (body.newPassword !== body.confirmPassword ? 'New password and confirm password must match.' : null)
}

function validatePaystackInitPayload(body) {
  if (!body.email) return 'Email is required.'
  if (!body.amount || Number(body.amount) <= 0) return 'A valid amount is required.'
  return null
}

module.exports = { validateEmail, validatePassword, validateLoginPayload, validateRegisterPayload, validateChangePasswordPayload, validatePaystackInitPayload }
