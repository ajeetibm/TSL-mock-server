/**
 * Shared admin notification state for the mock server.
 * PRODUCTION: replace this module with persisted notification and preference tables.
 */
const { mockState } = require('../mock-state')

const notificationSettings = {
  emailNotifications: false,
  newUserAlerts: false,
  paymentAlerts: false,
  systemAlerts: false,
  issueNotifications: false,
  weeklyReports: false,
}

const securitySettings = {
  twoFactorAuth: false,
  sessionTimeout: '30 minutes',
  loginNotifications: false,
}

function getNotificationSettings() {
  return { ...notificationSettings }
}

function updateNotificationSettings(values = {}) {
  for (const key of Object.keys(notificationSettings)) {
    if (values[key] !== undefined) notificationSettings[key] = Boolean(values[key])
  }
  return getNotificationSettings()
}

function getSecuritySettings() {
  return { ...securitySettings }
}

function updateSecuritySettings(values = {}) {
  if (values.twoFactorAuth !== undefined) securitySettings.twoFactorAuth = Boolean(values.twoFactorAuth)
  if (values.sessionTimeout !== undefined) securitySettings.sessionTimeout = values.sessionTimeout
  if (values.loginNotifications !== undefined) securitySettings.loginNotifications = Boolean(values.loginNotifications)
  return getSecuritySettings()
}

function isEnabledFor(type) {
  if (type === 'new_user') return notificationSettings.newUserAlerts
  if (type === 'admin_login') return securitySettings.loginNotifications
  return true
}

function createAdminNotification({ type, subject, message, actorEmail = null }) {
  if (!isEnabledFor(type)) return null

  const notification = {
    notificationId: `admin_notice_${mockState.nextAdminNotificationId++}`,
    type,
    subject,
    message,
    actorEmail,
    read: false,
    createdAt: new Date().toISOString(),
  }
  mockState.adminNotifications.unshift(notification)
  return notification
}

function listAdminNotifications() {
  return mockState.adminNotifications
}

function markAllAdminNotificationsRead() {
  const readAt = new Date().toISOString()
  for (const notification of mockState.adminNotifications) {
    if (!notification.read) {
      notification.read = true
      notification.readAt = readAt
    }
  }
  return mockState.adminNotifications
}

module.exports = {
  getNotificationSettings,
  updateNotificationSettings,
  getSecuritySettings,
  updateSecuritySettings,
  createAdminNotification,
  listAdminNotifications,
  markAllAdminNotificationsRead,
}
