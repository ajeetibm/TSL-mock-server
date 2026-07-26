/**
 * middleware/auth.js
 * JWT authentication middleware — protects private routes.
 *
 * PRODUCTION additions vs the original mock:
 *   1. Reads the `jti` claim from the verified token.
 *   2. Checks the token denylist before allowing the request through.
 *      This ensures revoked sessions (e.g. from another device) are rejected
 *      immediately — even if the JWT itself hasn't expired yet.
 *
 * PRODUCTION: same pattern; load JWT_SECRET from env; use RS256 keys.
 */
const { verifyToken }  = require('../utils/jwt')
const { isDenylisted } = require('../services/sessionStore')

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token      = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required.', error: 'NO_TOKEN' })
  }

  const decoded = verifyToken(token)
  if (!decoded) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.', error: 'INVALID_TOKEN' })
  }

  // Reject if this specific token has been revoked (e.g. session revoked from another device)
  if (decoded.jti && isDenylisted(decoded.jti)) {
    return res.status(401).json({ success: false, message: 'This session has been revoked. Please log in again.', error: 'TOKEN_REVOKED' })
  }

  req.user = decoded  // { userId, email, role, portal, jti }
  next()
}

module.exports = { authenticate }
