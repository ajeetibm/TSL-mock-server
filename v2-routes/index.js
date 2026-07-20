/**
 * v2-routes/index.js
 * Mounts all v2 API routes under /api/v1 (same prefix as before — no frontend changes needed).
 */
const { Router } = require('express')

const router = Router()

router.use('/auth',            require('./auth.routes'))
router.use('/sme',             require('./sme.routes'))
router.use('/sme/payments',    require('./payment.routes'))
router.use('/admin',           require('./admin.routes'))
router.use('/counsel',         require('./counsel.routes'))

// Subscription upgrade / downgrade routes
router.use('/',                require('./subscription.routes'))

module.exports = router
