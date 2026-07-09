/**
 * middleware/errorHandler.js
 * Centralised Express error handler — catches thrown errors from controllers.
 * PRODUCTION: also send errors to Sentry / Datadog.
 */
const logger = require('../utils/logger')

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status  = err.statusCode || 500
  const message = err.message || 'An unexpected error occurred.'
  const code    = err.errorCode || 'INTERNAL_ERROR'

  if (status >= 500) {
    logger.error('errorHandler', message, { stack: err.stack, path: req.path, method: req.method })
  }

  if (!res.headersSent) {
    res.status(status).json({ success: false, message, error: code })
  }
}

module.exports = errorHandler
