/**
 * v2-routes/subscription.routes.js
 * Subscription Upgrade / Downgrade routes.
 *
 * Mounted at /api/v1 by v2-routes/index.js → prefix is /api/v1/subscription and /api/v1/plans
 *
 * Routes:
 *   GET    /api/v1/subscription                        — current subscription
 *   GET    /api/v1/plans                               — all available plans
 *   GET    /api/v1/subscription/upgrade/preview        — prorated preview (query: toPlanId)
 *   POST   /api/v1/subscription/upgrade                — confirm upgrade (immediate charge)
 *   POST   /api/v1/subscription/downgrade              — schedule downgrade
 *   DELETE /api/v1/subscription/downgrade              — cancel scheduled downgrade
 *   GET    /api/v1/subscription/invoices               — billing history invoices
 */
const { Router } = require('express')
const {
  getBlueprintCatalogue,
  getSubscription,
  getPlans,
  getUpgradePreview,
  upgradeSubscription,
  scheduleDowngrade,
  cancelDowngrade,
  getInvoices,
  consumeBlueprintRun,
  addBlueprintRunUnits,
} = require('../controllers/subscription.controller')
const { authenticate } = require('../middleware/auth')

const router = Router()

router.get('/subscription',                 authenticate, getSubscription)
router.get('/plans',                        authenticate, getPlans)
router.get('/subscription/upgrade/preview', authenticate, getUpgradePreview)
router.post('/subscription/upgrade',        authenticate, upgradeSubscription)
router.post('/subscription/downgrade',      authenticate, scheduleDowngrade)
router.delete('/subscription/downgrade',    authenticate, cancelDowngrade)
router.get('/subscription/invoices',        authenticate, getInvoices)
// Charge only after a final Blueprint download/vault acceptance. Drafts and
// previews never call this endpoint.
router.post('/subscription/blueprint-runs/consume', authenticate, consumeBlueprintRun)
router.post('/subscription/blueprint-runs/top-up',  authenticate, addBlueprintRunUnits)
router.get('/blueprints',                    authenticate, getBlueprintCatalogue)

module.exports = router
