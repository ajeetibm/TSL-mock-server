/**
 * middleware/auth.js
 * JWT authentication middleware — protects private routes.
 * PRODUCTION: same pattern; just use real JWT_SECRET from env.
 */
const { verifyToken } = require('../utils/jwt')

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication required.', error: 'NO_TOKEN' })
  }

  const decoded = verifyToken(token)
  if (!decoded) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.', error: 'INVALID_TOKEN' })
  }

  req.user = decoded // { userId, email, role, portal }
  next()
}

module.exports = { authenticate }
