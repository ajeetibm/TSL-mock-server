/**
 * middleware/rateLimiter.js
 * Rate limiting for auth endpoints.
 * PRODUCTION: use Redis store for distributed rate limiting.
 */
const rateLimit = require('express-rate-limit')

// 10 attempts per 30 seconds on auth endpoints (mock server — short window for dev)
const authRateLimiter = rateLimit({
  windowMs: 30 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Please try again in 30 seconds.', error: 'RATE_LIMIT_EXCEEDED' },
  skip: () => process.env.NODE_ENV === 'test',
})

// 5 payment attempts per 10 minutes
const paymentRateLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many payment requests. Please wait before retrying.', error: 'RATE_LIMIT_EXCEEDED' },
  skip: () => process.env.NODE_ENV === 'test',
})

module.exports = { authRateLimiter, paymentRateLimiter }
