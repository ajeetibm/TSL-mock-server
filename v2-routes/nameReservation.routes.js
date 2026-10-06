const { Router } = require('express')
const { authenticate } = require('../middleware/auth')
const { checkName, submitReservation } = require('../controllers/nameReservation.controller')

const router = Router()
router.post('/check', authenticate, checkName)
router.post('/submit', authenticate, submitReservation)

module.exports = router
