/**
 * utils/jwt.js
 * JWT utility — generates and verifies tokens.
 * PRODUCTION: load JWT_SECRET from process.env; use RS256 asymmetric keys.
 * Each token embeds a unique `jti` (JWT ID) claim so sessions can be tracked
 * and individually revoked via a denylist without invalidating all sessions.
 */
const jwt  = require('jsonwebtoken')
const { v4: uuidv4 } = require('uuid')

const JWT_SECRET     = process.env.JWT_SECRET     || 'tsl_mock_jwt_secret_replace_in_production'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d'

/**
 * Sign a JWT token for an authenticated user.
 * @param {{ userId, email, role, portal }} payload
 * @returns {{ token: string, tokenExpiry: string, jti: string }}
 */
function signToken(payload) {
  const jti   = uuidv4()   // unique ID for this token — used to track & revoke sessions
  const token = jwt.sign(
    {
      userId: payload.userId,
      email:  payload.email,
      role:   payload.role,
      portal: payload.portal,
      jti,                  // embedded so middleware can read it without a DB round-trip
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, issuer: 'tsl-mock-server', audience: 'tsl-frontend' }
  )
  const decoded    = jwt.decode(token)
  const tokenExpiry = new Date((decoded.exp || 0) * 1000).toISOString()
  return { token, tokenExpiry, jti }
}

/**
 * Verify and decode a JWT token.
 * Returns null if invalid, expired, or missing.
 * @param {string} token
 * @returns {{ userId, email, role, portal, jti } | null}
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, { issuer: 'tsl-mock-server', audience: 'tsl-frontend' })
  } catch (_) {
    return null
  }
}

module.exports = { signToken, verifyToken }
