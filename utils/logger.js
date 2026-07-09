/**
 * utils/logger.js
 * Structured console logger.
 * PRODUCTION: replace with winston / pino writing to log files or log aggregation.
 */

const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }
const CURRENT_LEVEL = LEVELS[process.env.LOG_LEVEL] ?? LEVELS.info

function log(level, context, message, meta = {}) {
  if ((LEVELS[level] ?? 99) > CURRENT_LEVEL) return
  const entry = { ts: new Date().toISOString(), level, context, message, ...meta }
  const fn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  fn(JSON.stringify(entry))
}

const logger = {
  info:  (ctx, msg, meta) => log('info',  ctx, msg, meta),
  warn:  (ctx, msg, meta) => log('warn',  ctx, msg, meta),
  error: (ctx, msg, meta) => log('error', ctx, msg, meta),
  debug: (ctx, msg, meta) => log('debug', ctx, msg, meta),
}

module.exports = logger
