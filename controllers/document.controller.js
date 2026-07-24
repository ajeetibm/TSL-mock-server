/**
 * controllers/document.controller.js
 * Mock document service — returns PDF metadata including a root-relative URL
 * the frontend passes directly to a PDF viewer or <a href> download link.
 *
 * Each entry contains:
 *   - documentId   unique stable ID
 *   - name         human-readable document name
 *   - description  one-line description
 *   - category     grouping label: "legal" | "compliance" | "guide" | "template"
 *   - url          root-relative path served by express.static from assets/pdfs/
 *                  e.g. /assets/pdfs/terms.pdf  →  GET http://localhost:8080/assets/pdfs/terms.pdf
 *   - mimeType     always "application/pdf"
 *   - sizeKb       approximate file size hint for the UI
 *   - updatedAt    ISO timestamp
 *
 * PRODUCTION: replace _documents with a DB query (SELECT * FROM documents WHERE ...).
 * The url field would become a presigned cloud-storage URL (S3 / GCS presigned link).
 */

const _documents = [
  {
    documentId:  'doc_001',
    name:        'POPIA Compliance Basics',
    description: 'An introduction to POPIA obligations for South African startups.',
    category:    'compliance',
    url:         '/assets/pdfs/popia-compliance-basics.pdf',
    mimeType:    'application/pdf',
    sizeKb:      210,
    updatedAt:   '2025-01-15T08:00:00.000Z',
  },
  {
    documentId:  'doc_002',
    name:        'Website Legal Readiness',
    description: 'Checklist for ensuring your website meets legal requirements.',
    category:    'legal',
    url:         '/assets/pdfs/website-legal-readiness.pdf',
    mimeType:    'application/pdf',
    sizeKb:      185,
    updatedAt:   '2025-01-20T10:00:00.000Z',
  },
  {
    documentId:  'doc_003',
    name:        'Document Retention Checklist',
    description: 'Guidelines on how long to keep business documents under South African law.',
    category:    'compliance',
    url:         '/assets/pdfs/document-retention-checklist.pdf',
    mimeType:    'application/pdf',
    sizeKb:      98,
    updatedAt:   '2025-02-01T09:00:00.000Z',
  },
  {
    documentId:  'doc_004',
    name:        'Contractor vs Employee Classification',
    description: 'How to correctly classify workers and avoid misclassification risk.',
    category:    'legal',
    url:         '/assets/pdfs/contractor-vs-employee-classification.pdf',
    mimeType:    'application/pdf',
    sizeKb:      154,
    updatedAt:   '2025-02-10T11:00:00.000Z',
  },
  {
    documentId:  'doc_005',
    name:        'Hiring Your First Employee',
    description: 'Step-by-step guide to making your first compliant hire in South Africa.',
    category:    'guide',
    url:         '/assets/pdfs/hiring-your-first-employee.pdf',
    mimeType:    'application/pdf',
    sizeKb:      230,
    updatedAt:   '2025-02-15T08:30:00.000Z',
  },
  {
    documentId:  'doc_006',
    name:        'Building an Employee Handbook',
    description: 'Template and guidance for creating an employee handbook for your startup.',
    category:    'template',
    url:         '/assets/pdfs/building-an-employee-handbook.pdf',
    mimeType:    'application/pdf',
    sizeKb:      275,
    updatedAt:   '2025-03-01T09:30:00.000Z',
  },
  {
    documentId:  'doc_007',
    name:        'Due Diligence Pack',
    description: 'Documents and checklist required for investor due diligence.',
    category:    'template',
    url:         '/assets/pdfs/due-diligence-pack.pdf',
    mimeType:    'application/pdf',
    sizeKb:      312,
    updatedAt:   '2025-03-10T14:00:00.000Z',
  },
  {
    documentId:  'doc_008',
    name:        'Investor Meeting Prep',
    description: 'How to prepare for and run a successful investor meeting.',
    category:    'guide',
    url:         '/assets/pdfs/investor-meeting-prep.pdf',
    mimeType:    'application/pdf',
    sizeKb:      198,
    updatedAt:   '2025-03-20T13:00:00.000Z',
  },
]

/**
 * GET /api/v1/documents
 * Returns all documents, optionally filtered by ?category=
 *
 * Query params:
 *   category  (optional) — filter by category slug, e.g. "legal", "compliance", "guide", "template"
 *
 * Example response:
 * {
 *   "success": true,
 *   "data": [
 *     {
 *       "documentId": "doc_001",
 *       "name": "POPIA Compliance Basics",
 *       "url": "/assets/pdfs/popia-compliance-basics.pdf",
 *       ...
 *     }
 *   ]
 * }
 */
async function getDocuments(req, res, next) {
  try {
    const { category } = req.query
    const data = category
      ? _documents.filter(d => d.category === category)
      : _documents

    res.json({ success: true, data })
  } catch (e) { next(e) }
}

/**
 * GET /api/v1/documents/:documentId
 * Returns a single document's metadata (including the PDF url) by ID.
 *
 * Example response:
 * {
 *   "success": true,
 *   "data": {
 *     "documentId": "doc_001",
 *     "name": "POPIA Compliance Basics",
 *     "url": "/assets/pdfs/popia-compliance-basics.pdf",
 *     "mimeType": "application/pdf",
 *     ...
 *   }
 * }
 */
async function getDocumentById(req, res, next) {
  try {
    const doc = _documents.find(d => d.documentId === req.params.documentId)
    if (!doc) {
      return res.status(404).json({
        success: false,
        message: 'Document not found.',
        error:   'DOCUMENT_NOT_FOUND',
      })
    }
    res.json({ success: true, data: doc })
  } catch (e) { next(e) }
}

module.exports = { getDocuments, getDocumentById }
