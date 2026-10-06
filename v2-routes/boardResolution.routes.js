/**
 * v2-routes/boardResolution.routes.js
 * Mounted at /api/v1/sme/board-resolution
 */
const { Router } = require('express')
const { authenticate } = require('../middleware/auth')
const { submitResolution } = require('../controllers/boardResolution.controller')

const router = Router()
router.post('/submit', authenticate, submitResolution)

module.exports = router
