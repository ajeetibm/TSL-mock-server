/**
 * mock-data/audit.js
 * In-memory audit log store.
 * PRODUCTION: replace with DB inserts (e.g. INSERT INTO audit_logs ...).
 */

const auditLogs = []

const AUDIT_ACTIONS = {
  LOGIN:            'auth.login',
  LOGOUT:           'auth.logout',
  GOOGLE_LOGIN:     'auth.google_login',
  PASSWORD_CHANGE:  'auth.password_change',
  PAYMENT_INIT:     'payment.initialize',
  PAYMENT_VERIFY:   'payment.verify',
  PAYMENT_WEBHOOK:  'payment.webhook',
  SUBSCRIPTION_ACT: 'subscription.activate',
  PROFILE_UPDATE:   'profile.update',
}

/**
 * Append an audit log entry.
 * @param {{ action, userId, email, role, meta, ip }} entry
 */
function addAuditLog(entry) {
  auditLogs.push({
    id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    action: entry.action,
    userId: entry.userId || null,
    email: entry.email || null,
    role: entry.role || null,
    ip: entry.ip || '0.0.0.0',
    meta: entry.meta || {},
  })
  // Keep last 500 entries in memory
  if (auditLogs.length > 500) auditLogs.shift()
}

function getAuditLogs(filter = {}) {
  return auditLogs
    .filter(log => !filter.userId || log.userId === filter.userId)
    .filter(log => !filter.action || log.action === filter.action)
    .slice(-100) // Return last 100 matching entries
    .reverse()
}

module.exports = { auditLogs, addAuditLog, getAuditLogs, AUDIT_ACTIONS }
