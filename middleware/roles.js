/**
 * middleware/roles.js
 * Role-based authorization middleware.
 * PRODUCTION: same pattern; roles come from verified JWT claims.
 */

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    const role = req.user?.role?.toLowerCase()
    if (!role || !allowedRoles.map(r => r.toLowerCase()).includes(role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${allowedRoles.join(' or ')}.`,
        error: 'INSUFFICIENT_ROLE',
      })
    }
    next()
  }
}

const requireAdmin   = requireRole('admin', 'super_admin')
const requireCounsel = requireRole('counsel')
const requireSme     = requireRole('sme', 'user')
const requireAny     = requireRole('admin', 'super_admin', 'counsel', 'sme', 'user')

module.exports = { requireRole, requireAdmin, requireCounsel, requireSme, requireAny }
