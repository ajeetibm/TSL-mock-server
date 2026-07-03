const { mockState } = require('../mock-state')

function sendJson(res, statusCode, payload) {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  return res.status(statusCode).json(payload)
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function createAuthUser(user, tokenSuffix = 'token') {
  return {
    userId: user.userId,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    portal: user.portal,
    token: 'mock_counsel_' + tokenSuffix,
    tokenExpiry: '2026-06-11T08:00:00Z',
    mustResetPassword: Boolean(user.mustResetPassword),
  }
}

function getCounselByEmail(email) {
  return mockState.counselUsers.get(normalizeEmail(email))
}

function getSmeByEmail(email) {
  return mockState.smeUsers.get(normalizeEmail(email))
}

function getFirstSmeUser() {
  return Array.from(mockState.smeUsers.values())[0]
}

module.exports = {
  sendJson,
  normalizeEmail,
  createAuthUser,
  getCounselByEmail,
  getSmeByEmail,
  getFirstSmeUser,
}
