/**
 * utils/jwt.js
 * JWT utility — generates and verifies tokens.
 * MOCK: uses a fixed secret. PRODUCTION: load from process.env.JWT_SECRET.
 * PRODUCTION: use RS256 asymmetric keys instead of HS256.
 */
const jwt = require('jsonwebtoken')

// MOCK secret — replace with process.env.JWT_SECRET in production
const JWT_SECRET = process.env.JWT_SECRET || 'tsl_mock_jwt_secret_replace_in_production'
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h'

/**
 * Sign a JWT token for an authenticated user.
 * @param {{ userId, email, role, portal }} payload
 * @returns {{ token: string, tokenExpiry: string }}
 */
function signToken(payload) {
  const token = jwt.sign(
    { userId: payload.userId, email: payload.email, role: payload.role, portal: payload.portal },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN, issuer: 'tsl-mock-server', audience: 'tsl-frontend' }
  )
  // Decode to get exact expiry timestamp
  const decoded = jwt.decode(token)
  const tokenExpiry = new Date((decoded.exp || 0) * 1000).toISOString()
  return { token, tokenExpiry }
}

/**
 * Verify and decode a JWT token.
 * @param {string} token
 * @returns {{ userId, email, role, portal } | null}
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET, { issuer: 'tsl-mock-server', audience: 'tsl-frontend' })
  } catch (_) {
    return null
  }
}

module.exports = { signToken, verifyToken }
