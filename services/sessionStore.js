/**
 * services/sessionStore.js
 * Production-grade session store for active login sessions.
 *
 * ARCHITECTURE
 * ─────────────────────────────────────────────────────────────────────────────
 * This module is the ONLY place that reads/writes session and denylist data.
 * All other code (controllers, middleware) imports from here.
 *
 * CURRENT IMPLEMENTATION: in-memory Maps (suitable for single-instance dev/staging).
 *
 * TO SWITCH TO PRODUCTION (PostgreSQL + Redis):
 *   1. Replace _sessions Map operations with `db.query('SELECT/INSERT/DELETE ...')`
 *   2. Replace _denylist Set operations with `redis.set / redis.get`
 *   3. Remove the cron job below — use a DB scheduled event or pg_cron instead.
 *   No other files need to change.
 *
 * DATABASE SCHEMA (for reference):
 * ─────────────────────────────────────────────────────────────────────────────
 *   CREATE TABLE sessions (
 *     id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *     user_id     VARCHAR(64) NOT NULL,
 *     jti         VARCHAR(128) UNIQUE NOT NULL,
 *     device      VARCHAR(255),
 *     ip          VARCHAR(64),
 *     location    VARCHAR(255),
 *     last_active TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 *     expires_at  TIMESTAMPTZ NOT NULL,
 *     created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
 *   );
 *   CREATE INDEX sessions_user_id_idx ON sessions(user_id);
 *
 *   -- Token denylist (revoked JTIs)
 *   CREATE TABLE token_denylist (
 *     jti        VARCHAR(128) PRIMARY KEY,
 *     expires_at TIMESTAMPTZ NOT NULL   -- auto-cleaned when TTL passes
 *   );
 *   -- Or use Redis: SET denylist:{jti} 1 EX {ttl_seconds}
 */

const { v4: uuidv4 }   = require('uuid')
const geoip            = require('geoip-lite')
const cron             = require('node-cron')

// ── In-memory stores ──────────────────────────────────────────────────────────
// _sessions: Map<userId, Session[]>
// Each Session = { id, userId, jti, device, ip, location, lastActive, expiresAt, createdAt }
const _sessions  = new Map()

// _denylist: Map<jti, expiresAt (ms)>
// Revoked JTIs are checked in authenticate middleware before any protected route.
const _denylist  = new Map()

// Session TTL — 30 days in milliseconds (matches JWT_EXPIRES_IN = '30d')
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Parse a User-Agent string into a human-readable device label.
 * PRODUCTION: replace with a proper ua-parser library (e.g. ua-parser-js).
 */
function parseUserAgent(ua) {
  if (!ua) return 'Unknown Browser'
  const s = ua.toLowerCase()
  let browser = 'Unknown Browser'
  if      (s.includes('edg/') || s.includes('edge/'))     browser = 'Edge'
  else if (s.includes('opr/')  || s.includes('opera'))     browser = 'Opera'
  else if (s.includes('firefox'))                          browser = 'Firefox'
  else if (s.includes('safari') && !s.includes('chrom'))   browser = 'Safari'
  else if (s.includes('chrome'))                           browser = 'Chrome'

  let os = 'Unknown OS'
  if      (s.includes('iphone'))        os = 'iPhone'
  else if (s.includes('ipad'))          os = 'iPad'
  else if (s.includes('android'))       os = 'Android'
  else if (s.includes('mac os x'))      os = 'macOS'
  else if (s.includes('windows'))       os = 'Windows'
  else if (s.includes('linux'))         os = 'Linux'

  return `${browser} on ${os}`
}

/**
 * Resolve an IP address to a city/country string.
 * PRODUCTION: geoip-lite works here too; upgrade to MaxMind GeoIP2 for accuracy.
 * Returns 'Unknown Location' for localhost / private IPs.
 */
function resolveLocation(ip) {
  if (!ip || ip === '::1' || ip === '127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return 'Local Network'
  }
  try {
    const geo = geoip.lookup(ip)
    if (geo && geo.city && geo.country) return `${geo.city}, ${geo.country}`
    if (geo && geo.country)             return geo.country
  } catch (_) { /* ignore */ }
  return 'Unknown Location'
}

function getUserSessions(userId) {
  if (!_sessions.has(userId)) _sessions.set(userId, [])
  return _sessions.get(userId)
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register a new session on login.
 * Called by auth.controller.js after every successful password or Google login.
 *
 * @param {{ userId, jti, userAgent, ip }} params
 */
function createSession({ userId, jti, userAgent, ip }) {
  const store = getUserSessions(userId)

  // Deduplicate: if a session with this jti already exists (shouldn't happen
  // in normal flow, but guards against double-calls), update lastActive only.
  const existing = store.findIndex((s) => s.jti === jti)
  if (existing !== -1) {
    store[existing].lastActive = new Date().toISOString()
    return
  }

  const now      = new Date()
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS)

  store.unshift({
    id:          uuidv4(),
    userId,
    jti,
    device:      parseUserAgent(userAgent),
    ip:          ip || '0.0.0.0',
    location:    resolveLocation(ip),
    lastActive:  now.toISOString(),
    expiresAt:   expiresAt.toISOString(),
    createdAt:   now.toISOString(),
  })
}

/**
 * List all non-expired sessions for a user.
 * Marks isCurrent by comparing each session's jti to the caller's jti.
 *
 * @param {{ userId, callerJti }} params
 * @returns {Array}
 */
function listSessions({ userId, callerJti }) {
  const store = getUserSessions(userId)
  const now   = Date.now()
  // Filter expired, then map — never expose jti to the client
  return store
    .filter((s) => new Date(s.expiresAt).getTime() > now)
    .map(({ jti, userId: _uid, ...rest }) => ({
      ...rest,
      isCurrent: jti === callerJti,
    }))
}

/**
 * Revoke a session by sessionId.
 * Adds its jti to the denylist so the token is rejected immediately.
 *
 * @param {{ userId, sessionId, callerJti }} params
 * @returns {{ ok: boolean, message: string, sessions?: Array }}
 */
function revokeSession({ userId, sessionId, callerJti }) {
  const store = getUserSessions(userId)
  const idx   = store.findIndex((s) => s.id === sessionId)

  if (idx === -1) return { ok: false, message: 'Session not found.' }
  if (store[idx].jti === callerJti) return { ok: false, message: 'Cannot revoke your current session.' }

  const { jti, expiresAt } = store[idx]
  store.splice(idx, 1)

  // Add to denylist so the revoked JWT is rejected on next request
  _denylist.set(jti, new Date(expiresAt).getTime())

  return {
    ok:       true,
    message:  'Session revoked successfully.',
    sessions: listSessions({ userId, callerJti }),
  }
}

/**
 * Check whether a jti has been revoked.
 * Called by authenticate middleware on every protected request.
 *
 * @param {string} jti
 * @returns {boolean}
 */
function isDenylisted(jti) {
  if (!_denylist.has(jti)) return false
  // Auto-clean stale entries while we're here
  if (Date.now() > _denylist.get(jti)) {
    _denylist.delete(jti)
    return false
  }
  return true
}

/**
 * Remove all expired sessions and denylist entries.
 * Called by the cron job below. In production: run as a DB scheduled event.
 */
function purgeExpired() {
  const now = Date.now()
  for (const [userId, store] of _sessions.entries()) {
    const live = store.filter((s) => new Date(s.expiresAt).getTime() > now)
    if (live.length !== store.length) _sessions.set(userId, live)
  }
  for (const [jti, exp] of _denylist.entries()) {
    if (now > exp) _denylist.delete(jti)
  }
}

// ── Cron: purge expired sessions every day at 03:00 ───────────────────────────
// PRODUCTION: replace with a DB scheduled event or pg_cron.
cron.schedule('0 3 * * *', () => {
  purgeExpired()
})

module.exports = { createSession, listSessions, revokeSession, isDenylisted, purgeExpired }
