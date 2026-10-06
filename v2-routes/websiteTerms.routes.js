/**
 * v2-routes/websiteTerms.routes.js
 * Mounted at /api/v1/sme/website-terms
 */
const { Router } = require('express')
const { authenticate } = require('../middleware/auth')
const { submitWebsiteTerms } = require('../controllers/websiteTerms.controller')

const router = Router()
router.post('/submit', authenticate, submitWebsiteTerms)

module.exports = router
