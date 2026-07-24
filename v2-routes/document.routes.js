/**
 * v2-routes/document.routes.js
 * Document endpoints — returns PDF metadata with locally-served URLs.
 *
 * The `url` field in each response is a root-relative path (e.g. /assets/pdfs/terms.pdf).
 * The PDF bytes are served directly by express.static — no auth required.
 *
 * Routes:
 *   GET /api/v1/documents              → list all documents (optional ?category= filter)
 *   GET /api/v1/documents/:documentId  → single document metadata + PDF url
 */
const { Router } = require('express')
const { getDocuments, getDocumentById } = require('../controllers/document.controller')

const router = Router()

// GET /api/v1/documents?category=legal|compliance|guide|template
router.get('/', getDocuments)

// GET /api/v1/documents/:documentId
router.get('/:documentId', getDocumentById)

module.exports = router
