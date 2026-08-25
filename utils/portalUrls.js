/**
 * Public frontend URLs are configuration, not application logic. The future
 * backend should keep this contract when creating emails and redirects.
 */
const PORTAL_URLS = {
  user: process.env.PUBLIC_APP_URL || 'http://localhost:5173',
  sme: process.env.PUBLIC_APP_URL || 'http://localhost:5173',
  admin: process.env.PUBLIC_ADMIN_URL || 'http://localhost:5173',
  counsel: process.env.PUBLIC_COUNSEL_URL || 'http://localhost:5173',
}

function publicPortalUrl(portal, pathname = '/') {
  const origin = PORTAL_URLS[String(portal || 'user').toLowerCase()] || PORTAL_URLS.user
  return new URL(pathname, `${origin.replace(/\/$/, '')}/`).toString()
}

module.exports = { publicPortalUrl }
