/**
 * controllers/wizard.controller.js
 *
 * Mock implementation of the wizard draft API.
 * Production: replace mockState.wizardDrafts with DB queries.
 *
 * Endpoints:
 *   GET    /api/v1/sme/wizards/:wizardType/draft
 *   PUT    /api/v1/sme/wizards/:wizardType/draft
 *   POST   /api/v1/sme/wizards/:wizardType/complete
 *   DELETE /api/v1/sme/wizards/:wizardType/draft
 */
const { mockState } = require('../mock-state')
const { normalizeEmail } = require('../services/authService')

const VALID_TYPES = ['nda', 'employment']

function validateEmploymentOffer(data = {}) {
  const required = ['company_id', 'candidate.full_names', 'candidate.email', 'job_title', 'reports_to', 'start_date', 'work_location', 'salary_amount', 'salary_period', 'conditions', 'offer_expiry']
  const missing = required.filter((key) => !data[key] || (Array.isArray(data[key]) && data[key].length === 0))
  if (data.restraint_flag !== true && data.restraint_flag !== false) missing.push('restraint_flag')
  if (Array.isArray(data.conditions) && data.conditions.includes('Medical assessment') && !String(data.medical_justification || '').trim()) {
    return { message: 'Medical assessment requires an inherent requirement.', gate: { type: 'block', fieldKey: 'medical_justification', reason: 'Medical assessment selected without a justification.' } }
  }
  return missing.length ? { message: `Missing required Employment Offer Letter fields: ${missing.join(', ')}` } : null
}

function draftKey(email, wizardType) {
  return `${normalizeEmail(email)}::${wizardType}`
}

async function getDraft(req, res, next) {
  try {
    const { wizardType } = req.params
    if (!VALID_TYPES.includes(wizardType))
      return res.status(400).json({ success: false, message: `Unknown wizard type: ${wizardType}` })
    const email = req.user?.email || 'thabo@company.co.za'
    const draft = mockState.wizardDrafts.get(draftKey(email, wizardType)) ?? null
    res.json({ success: true, data: draft })
  } catch (e) { next(e) }
}

async function saveDraft(req, res, next) {
  try {
    const { wizardType } = req.params
    if (!VALID_TYPES.includes(wizardType))
      return res.status(400).json({ success: false, message: `Unknown wizard type: ${wizardType}` })
    const email = req.user?.email || 'thabo@company.co.za'
    const draft = { ...req.body, wizardType, updatedAt: new Date().toISOString() }
    mockState.wizardDrafts.set(draftKey(email, wizardType), draft)
    res.json({ success: true, data: draft })
  } catch (e) { next(e) }
}

async function completeWizard(req, res, next) {
  try {
    const { wizardType } = req.params
    if (!VALID_TYPES.includes(wizardType))
      return res.status(400).json({ success: false, message: `Unknown wizard type: ${wizardType}` })
    const offerError = wizardType === 'employment' ? validateEmploymentOffer(req.body.data || req.body) : null
    if (offerError) return res.status(422).json({ success: false, ...offerError })
    const email = req.user?.email || 'thabo@company.co.za'
    const key = draftKey(email, wizardType)
    const completedAt = new Date().toISOString()
    const existing = mockState.wizardDrafts.get(key) ?? {}
    mockState.wizardDrafts.set(key, { ...existing, ...req.body, wizardType, status: 'completed', completedAt, updatedAt: completedAt })
    res.json({ success: true, data: { completedAt } })
  } catch (e) { next(e) }
}

async function deleteDraft(req, res, next) {
  try {
    const { wizardType } = req.params
    const email = req.user?.email || 'thabo@company.co.za'
    mockState.wizardDrafts.delete(draftKey(email, wizardType))
    res.json({ success: true, message: 'Draft deleted.' })
  } catch (e) { next(e) }
}

module.exports = { getDraft, saveDraft, completeWizard, deleteDraft }
