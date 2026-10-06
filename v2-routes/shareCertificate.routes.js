/**
 * v2-routes/shareCertificate.routes.js
 * Mounted at /api/v1/sme/share-certificate
 */
const { Router } = require('express')
const { authenticate } = require('../middleware/auth')
const { submitCertificate } = require('../controllers/shareCertificate.controller')

const router = Router()
router.post('/submit', authenticate, submitCertificate)

module.exports = router
