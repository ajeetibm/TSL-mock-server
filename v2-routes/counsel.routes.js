const { Router } = require('express')
const { getDashboard, getProfile, updateProfile, changePassword, resetPassword, getRequests, updateAvailability, acceptRequest, rejectRequest } = require('../controllers/counsel.controller')
const { authenticate } = require('../middleware/auth')

const router = Router()

// reset-password is public (counsel uses it before logging in properly)
router.post('/reset-password', resetPassword)

router.get('/dashboard',                    authenticate, getDashboard)
router.get('/profile',                      authenticate, getProfile)
router.put('/profile',                      authenticate, updateProfile)
router.put('/change-password',              authenticate, changePassword)
router.get('/requests',                     authenticate, getRequests)
router.patch('/availability',               authenticate, updateAvailability)
router.post('/requests/:requestId/accept',  authenticate, acceptRequest)
router.post('/requests/:requestId/reject',  authenticate, rejectRequest)

module.exports = router
