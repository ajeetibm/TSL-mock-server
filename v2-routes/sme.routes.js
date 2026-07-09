const { Router } = require('express')
const { getProfile, updateProfile, getCounselCredits, getCounselRequests, createCounselRequest, changePassword } = require('../controllers/sme.controller')
const { authenticate } = require('../middleware/auth')

const router = Router()

router.get('/profile',            authenticate, getProfile)
router.put('/profile',            authenticate, updateProfile)
router.get('/counsel/credits',    authenticate, getCounselCredits)
router.get('/counsel/requests',   authenticate, getCounselRequests)
router.post('/counsel/requests',  authenticate, createCounselRequest)
router.put('/change-password',    authenticate, changePassword)

module.exports = router
