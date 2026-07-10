/**
 * v2-routes/wizard.routes.js
 * Mounted at /api/v1/sme/wizards
 */
const { Router } = require('express')
const { getDraft, saveDraft, completeWizard, deleteDraft } = require('../controllers/wizard.controller')
const { authenticate } = require('../middleware/auth')

const router = Router()

router.get('/:wizardType/draft',     authenticate, getDraft)
router.put('/:wizardType/draft',     authenticate, saveDraft)
router.post('/:wizardType/complete', authenticate, completeWizard)
router.delete('/:wizardType/draft',  authenticate, deleteDraft)

module.exports = router
