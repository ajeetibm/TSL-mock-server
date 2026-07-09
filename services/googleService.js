/**
 * services/googleService.js
 * Verifies a Google OAuth2 access_token by calling Google's UserInfo API.
 * PRODUCTION: same implementation — no changes needed when going live.
 * The server calls Google so the frontend never touches the UserInfo API directly.
 */
const https = require('https')
const logger = require('../utils/logger')

function fetchGoogleUserInfo(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'www.googleapis.com',
      path: '/oauth2/v3/userinfo',
      method: 'GET',
      headers: { Authorization: 'Bearer ' + accessToken },
    }
    const req = https.request(options, (googleRes) => {
      let raw = ''
      googleRes.on('data', chunk => { raw += chunk })
      googleRes.on('end', () => {
        try {
          const payload = JSON.parse(raw)
          if (googleRes.statusCode !== 200 || payload.error) {
            logger.warn('googleService', 'UserInfo failed', { status: googleRes.statusCode, error: payload.error })
            return reject(new Error(payload.error_description || 'Google UserInfo request failed.'))
          }
          resolve({
            email:   String(payload.email   || '').toLowerCase().trim(),
            name:    String(payload.name    || payload.given_name || ''),
            picture: String(payload.picture || ''),
          })
        } catch (e) {
          reject(new Error('Failed to parse Google UserInfo response.'))
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

/**
 * MOCK role mapping by email.
 * PRODUCTION: replace with DB query — SELECT role FROM users WHERE email = ?
 */
const GOOGLE_ROLE_MAP = {
  'tsl.admin.demo@gmail.com':   { role: 'admin',   portal: 'admin' },
  'tsl.counsel.demo@gmail.com': { role: 'counsel',  portal: 'counsel' },
  'tsl.user.demo@gmail.com':    { role: 'user',     portal: 'sme' },
}

function getRoleForEmail(email) {
  return GOOGLE_ROLE_MAP[email] || null
}

module.exports = { fetchGoogleUserInfo, getRoleForEmail, GOOGLE_ROLE_MAP }
