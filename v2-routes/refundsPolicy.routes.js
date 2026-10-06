/**
 * v2-routes/refundsPolicy.routes.js
 * Mounted at /api/v1/sme/refunds-policy
 */
const { Router } = require('express')
const { submitRefundsPolicy } = require('../controllers/refundsPolicy.controller')

const router = Router()

router.post('/submit', submitRefundsPolicy)

module.exports = router
