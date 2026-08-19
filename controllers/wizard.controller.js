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

function validateAddress(prefix, addr = {}) {
  const missing = []
  if (!String(addr.street_number || '').trim()) missing.push(`${prefix}.street_number`)
  if (!String(addr.street_name  || '').trim()) missing.push(`${prefix}.street_name`)
  if (!String(addr.suburb       || '').trim()) missing.push(`${prefix}.suburb`)
  if (!String(addr.city         || '').trim()) missing.push(`${prefix}.city`)
  if (!String(addr.postal_code  || '').trim()) missing.push(`${prefix}.postal_code`)
  return missing
}

function validateNda(data = {}) {
  const missing = []

  // Party A
  const partyA = data.party_a || {}
  const isEntityA = partyA.entity_type !== 'Individual'
  if (isEntityA) {
    if (!String(partyA.legal_name      || '').trim()) missing.push('party_a.legal_name')
    if (!String(partyA.signatory_name  || '').trim()) missing.push('party_a.signatory_name')
  } else {
    if (!String(partyA.full_names || '').trim()) missing.push('party_a.full_names')
    if (!String(partyA.id_number  || '').trim()) missing.push('party_a.id_number')
  }
  if (!String(partyA.email || '').trim()) missing.push('party_a.email')
  missing.push(...validateAddress('party_a.address', partyA.address))

  // Party B
  const partyBTypeMap = {
    'A company': 'Company', 'A close corporation': 'Close corporation',
    'A trust': 'Trust', 'A partnership': 'Partnership', 'An individual': 'Individual',
  }
  const partyBEntityType = partyBTypeMap[data.party_b_type] ?? 'Company'
  const partyB = data.party_b || {}
  const isEntityB = partyBEntityType !== 'Individual'
  if (isEntityB) {
    if (!String(partyB.legal_name      || '').trim()) missing.push('party_b.legal_name')
    if (!String(partyB.signatory_name  || '').trim()) missing.push('party_b.signatory_name')
  } else {
    if (!String(partyB.full_names || '').trim()) missing.push('party_b.full_names')
    if (!String(partyB.id_number  || '').trim()) missing.push('party_b.id_number')
  }
  if (!String(partyB.email || '').trim()) missing.push('party_b.email')
  missing.push(...validateAddress('party_b.address', partyB.address))

  // Step 2 — Purpose & Scope
  if (!String(data.purpose || '').trim()) missing.push('purpose')
  if (data.ci_definition === 'Specified categories only' &&
      (!Array.isArray(data.ci_categories) || data.ci_categories.length === 0))
    missing.push('ci_categories')

  // Step 3 — Obligations
  const dur = Number(data.duration_years)
  if (!dur || dur < 1 || dur > 10) missing.push('duration_years')
  if (data.non_solicit === true && (!data.non_solicit_months || Number(data.non_solicit_months) < 1))
    missing.push('non_solicit_months')

  // Step 4 — Legal + Signing
  if (!String(data.governing_law || '').trim()) missing.push('governing_law')
  missing.push(...validateAddress('domicilium_a', data.domicilium_a))
  missing.push(...validateAddress('domicilium_b', data.domicilium_b))

  return missing.length ? { message: `Missing required NDA fields: ${missing.join(', ')}` } : null
}

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
    const payload = req.body.data || req.body
    const validationError =
      wizardType === 'employment' ? validateEmploymentOffer(payload) :
      wizardType === 'nda'        ? validateNda(payload)             : null
    if (validationError) return res.status(422).json({ success: false, ...validationError })
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
