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

const VALID_TYPES = ['nda', 'employment', 'privacy-policy', 'founder-agreement']

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

function validateFounderAgreement(data = {}) {
  const missing = []
  const required = [
    'is_incorporated', 'founders', 'vesting', 'decision_model', 'removal_process',
    'departure_role', 'ip_assignment', 'ip_pre_incorporation', 'prior_ip',
    'publicly_funded', 'created_at_employer', 'confidentiality', 'restraint',
    'non_solicit', 'deadlock', 'dispute_forum', 'governing_law', 'signatories',
  ]
  for (const key of required) {
    if (data[key] === undefined || data[key] === null || (Array.isArray(data[key]) && key !== 'prior_ip' && data[key].length === 0)) missing.push(key)
  }
  if (data.is_incorporated === true && !String(data.company_id || '').trim()) missing.push('company_id')
  if (data.is_incorporated === false) {
    if (!String(data.intended_name || '').trim()) missing.push('intended_name')
    if (!String(data.target_incorporation || '').trim()) missing.push('target_incorporation')
  }
  if (!Array.isArray(data.founders) || data.founders.length === 0) missing.push('founders')
  if (Array.isArray(data.founders)) {
    data.founders.forEach((founder, index) => {
      for (const key of ['full_names', 'id_number', 'role', 'equity_pct', 'commitment']) {
        if (!String(founder?.[key] || '').trim()) missing.push(`founders[${index}].${key}`)
      }
    })
  }
  if (data.vesting === true) {
    for (const key of ['vesting_months', 'cliff_months', 'vesting_frequency']) if (!String(data[key] || '').trim()) missing.push(key)
  }
  if (data.restraint === true) {
    for (const key of ['restraint_months', 'restraint_area']) if (!String(data[key] || '').trim()) missing.push(key)
  }
  if ((!Array.isArray(data.prior_ip) || data.prior_ip.length === 0) && data.prior_ip_nil_declaration !== true) missing.push('prior_ip')
  if (Array.isArray(data.prior_ip)) {
    data.prior_ip.forEach((item, index) => {
      for (const key of ['founder', 'description', 'date_created', 'treatment']) if (!String(item?.[key] || '').trim()) missing.push(`prior_ip[${index}].${key}`)
    })
  }
  if (!Array.isArray(data.signatories) || data.signatories.length === 0 || !data.signatories.every((signatory) => String(signatory?.name || '').trim())) missing.push('signatories')
  return missing.length ? { message: `Missing required Founders Agreement fields: ${[...new Set(missing)].join(', ')}` } : null
}

function validatePrivacyPolicy(data = {}) {
  const missing = []
  const hasText = (value) => String(value || '').trim().length > 0
  const hasItems = (value) => Array.isArray(value) && value.length > 0
  const required = [
    'company_id', 'info_officer', 'privacy_email', 'domains', 'pi_categories',
    'children_data', 'purposes', 'retention', 'third_parties', 'cross_border',
    'direct_marketing', 'cookies', 'cookie_consent', 'dsr_channel', 'dsr_days',
    'security_summary', 'effective_date',
  ]
  for (const key of required) {
    const value = data[key]
    if (value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)) missing.push(key)
  }
  for (const key of ['children_data', 'cross_border', 'direct_marketing']) {
    if (data[key] !== true && data[key] !== false) missing.push(key)
  }
  for (const key of ['full_names', 'id_number', 'email']) {
    if (!hasText(data.info_officer?.[key])) missing.push(`info_officer.${key}`)
  }
  if (hasItems(data.special_pi) && !hasText(data.special_pi_basis)) missing.push('special_pi_basis')
  if (data.children_data === true && !hasText(data.children_consent)) missing.push('children_consent')
  if (data.cross_border === true) {
    if (!hasItems(data.cross_border_countries)) missing.push('cross_border_countries')
    if (!hasText(data.transfer_basis)) missing.push('transfer_basis')
  }
  if (!Number.isFinite(Number(data.dsr_days)) || Number(data.dsr_days) <= 0) missing.push('dsr_days')
  ;(data.purposes || []).forEach((row, index) => {
    for (const key of ['purpose', 'categories', 'basis']) if (!hasText(row?.[key])) missing.push(`purposes[${index}].${key}`)
    if (row?.basis === 'Legitimate interest' && !hasText(row?.li_statement)) missing.push(`purposes[${index}].li_statement`)
  })
  ;(data.retention || []).forEach((row, index) => {
    for (const key of ['category', 'period', 'reason']) if (!hasText(row?.[key])) missing.push(`retention[${index}].${key}`)
  })
  ;(data.third_parties || []).forEach((row, index) => {
    for (const key of ['name', 'purpose', 'country']) if (!hasText(row?.[key])) missing.push(`third_parties[${index}].${key}`)
  })
  ;(data.cookies || []).forEach((row, index) => {
    for (const key of ['name', 'purpose', 'duration']) if (!hasText(row?.[key])) missing.push(`cookies[${index}].${key}`)
    if (row?.strictly_necessary !== true && row?.strictly_necessary !== false) missing.push(`cookies[${index}].strictly_necessary`)
  })
  return missing.length ? { message: `Missing required Privacy & Cookies Policy fields: ${[...new Set(missing)].join(', ')}` } : null
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
      wizardType === 'nda'        ? validateNda(payload)             :
      wizardType === 'privacy-policy' ? validatePrivacyPolicy(payload) :
      wizardType === 'founder-agreement' ? validateFounderAgreement(payload) : null
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
