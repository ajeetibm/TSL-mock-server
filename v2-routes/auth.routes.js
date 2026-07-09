const { Router } = require('express')
const { login, register, googleAuth, forgotPassword, resetPassword, changePassword } = require('../controllers/auth.controller')
const { authRateLimiter } = require('../middleware/rateLimiter')
const { authenticate } = require('../middleware/auth')

const router = Router()

router.post('/login',           authRateLimiter, login)
router.post('/register',        authRateLimiter, register)
router.post('/google',          authRateLimiter, googleAuth)
router.post('/forgot-password', authRateLimiter, forgotPassword)
router.post('/reset-password',  authRateLimiter, resetPassword)
router.put('/change-password',  authenticate, changePassword)

module.exports = router
