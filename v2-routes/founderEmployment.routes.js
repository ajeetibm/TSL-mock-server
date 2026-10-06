/**
 * v2-routes/founderEmployment.routes.js
 * Mounted at /api/v1/sme/founder-employment
 */
const { Router } = require('express')
const { authenticate } = require('../middleware/auth')
const { submitFounderEmployment, getShareholderRegister } = require('../controllers/founderEmployment.controller')

const router = Router()
router.get('/shareholder-register/:companyId', authenticate, getShareholderRegister)
router.post('/submit', authenticate, submitFounderEmployment)

module.exports = router
