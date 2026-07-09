/**
 * middleware/requestLogger.js
 * Logs every incoming request and its response time.
 * PRODUCTION: replace with morgan or pino-http writing to log aggregation.
 */
const logger = require('../utils/logger')

function requestLogger(req, res, next) {
  const start = Date.now()
  res.on('finish', () => {
    logger.info('http', `${req.method} ${req.path}`, {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Date.now() - start,
      ip: req.ip || req.connection?.remoteAddress,
    })
  })
  next()
}

module.exports = requestLogger
