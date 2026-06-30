const { handleAuthRoutes } = require('./auth.routes')
const { handleSmeRoutes } = require('./sme.routes')
const { handleAdminRoutes } = require('./admin.routes')
const { handleCounselRoutes } = require('./counsel.routes')

function handleDynamicMock(req, res, relPath) {
  return (
    handleAuthRoutes(req, res, relPath) ||
    handleSmeRoutes(req, res, relPath) ||
    handleAdminRoutes(req, res, relPath) ||
    handleCounselRoutes(req, res, relPath)
  )
}

module.exports = { handleDynamicMock }
