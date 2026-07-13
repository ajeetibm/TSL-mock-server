const { Router } = require('express')
const { getProfile, updateProfile, getCounselCredits, getCounselRequests, createCounselRequest, topUpCredits, changePassword, getPaymentMethods, addPaymentMethod, setDefaultPaymentMethod, removePaymentMethod } = require('../controllers/sme.controller')
const { authenticate } = require('../middleware/auth')

const router = Router()

router.get('/profile',            authenticate, getProfile)
router.put('/profile',            authenticate, updateProfile)
router.get('/counsel/credits',    authenticate, getCounselCredits)
router.get('/counsel/requests',   authenticate, getCounselRequests)
router.post('/counsel/requests',  authenticate, createCounselRequest)
router.post('/counsel/topup',      authenticate, topUpCredits)
router.put('/change-password',    authenticate, changePassword)

router.get('/billing/payment-methods', authenticate, getPaymentMethods)
router.post('/billing/payment-methods', authenticate, addPaymentMethod)

router.patch('/billing/payment-methods/:methodId/default', authenticate, setDefaultPaymentMethod)
router.delete('/billing/payment-methods/:methodId',         authenticate, removePaymentMethod)

module.exports = router
