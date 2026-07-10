const { Router } = require('express')
const { getDashboard, getProfile, updateProfile, changePassword, getUsers, updateUser, getCounsel, addCounsel, assignCounselRequest, inviteAdmin, revokeAdmin, getIssues, getBilling, getAuditLogsEndpoint, exportBillingInvoices, getGeneralSettings, updateGeneralSettings, getNotificationSettings, updateNotificationSettings, getSecuritySettings, updateSecuritySettings } = require('../controllers/admin.controller')
const { authenticate } = require('../middleware/auth')
const { requireAdmin } = require('../middleware/roles')

const router = Router()

router.use(authenticate, requireAdmin)

router.get('/dashboard',                                getDashboard)
router.get('/profile',                                  getProfile)
router.put('/profile',                                  updateProfile)
router.put('/change-password',                          changePassword)
router.get('/users',                                    getUsers)
router.put('/users/:userId',                            updateUser)
router.get('/counsel',                                  getCounsel)
router.post('/counsel',                                 addCounsel)
router.post('/counsel-requests/:requestId/assign',      assignCounselRequest)
router.post('/admins/invite',                           inviteAdmin)
router.delete('/admins/:adminId',                       revokeAdmin)
router.get('/issues',                                   getIssues)
router.get('/billing',                                  getBilling)
router.post('/billing/export',                          exportBillingInvoices)
router.get('/audit-logs',                               getAuditLogsEndpoint)

router.get('/settings/general',                             getGeneralSettings)
router.put('/settings/general',                             updateGeneralSettings)
router.get('/settings/notifications',                       getNotificationSettings)
router.put('/settings/notifications',                       updateNotificationSettings)
router.get('/settings/security',                            getSecuritySettings)
router.put('/settings/security',                            updateSecuritySettings)

module.exports = router
