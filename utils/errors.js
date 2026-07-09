/**
 * utils/errors.js
 * Centralised HTTP error factory with consistent { success, message, error } shape.
 */

function apiError(statusCode, message, errorCode) {
  const err = new Error(message)
  err.statusCode = statusCode
  err.errorCode = errorCode || 'ERROR'
  err.isApiError = true
  return err
}

const errors = {
  badRequest:    (msg, code) => apiError(400, msg, code || 'BAD_REQUEST'),
  unauthorized:  (msg, code) => apiError(401, msg, code || 'UNAUTHORIZED'),
  forbidden:     (msg, code) => apiError(403, msg, code || 'FORBIDDEN'),
  notFound:      (msg, code) => apiError(404, msg, code || 'NOT_FOUND'),
  conflict:      (msg, code) => apiError(409, msg, code || 'CONFLICT'),
  internal:      (msg, code) => apiError(500, msg, code || 'INTERNAL_ERROR'),
}

module.exports = { apiError, errors }
