/**
 * controllers/founderEmployment.controller.js
 *
 * Mock implementation for the Founder Employment Contract blueprint (ref 12.3).
 *
 * Endpoint:
 *   POST /api/v1/sme/founder-employment/submit
 *
 * Gates (matching the HTML blueprint and TSL Blueprint Form Field Specification v2.0):
 *   • Block  : publicly_funded = 'Yes' — statutory licensing position cannot be
 *              contracted away on the platform; route to Counsel. A blocked run
 *              consumes nothing.
 *   • Prompt : leaver_acknowledged required when leaver terms differ from the
 *              shareholders agreement on record and vesting is linked.
 *   • Warn   : restraint > 24 months or worldwide area (non-blocking).
 *
 * Production: replace COMPANIES / FOUNDERS with DB / company-snapshot queries.
 */

const { addAuditLog } = require('../mock-data/audit')

/* ── Mock register (mirrors the HTML blueprint demo data) ──────────────── */
const COMPANIES = {
  'The Startup Legal (Pty) Ltd': {
    founders: [
      { n: 'Thandi Nkosi',   id: '8001015009087', email: 'thandi@startuplegal.co.za', sh: '400 ordinary shares (40%)' },
      { n: 'Pieter van Wyk', id: '8505055800080', email: '',                           sh: '350 ordinary shares (35%)' },
    ],
    sha: {
      good: ['Death', 'Disability', 'Termination without cause', 'Mutual agreement'],
      bad: 'Unvested shares forfeited',
    },
  },
  'Karoo Labs (Pty) Ltd': {
    founders: [{ n: 'Annelie Botha', id: '', email: '', sh: '600 ordinary shares (60%)' }],
    sha: null,
  },
}

const MOCK_SNAPSHOT_RECORD = COMPANIES['The Startup Legal (Pty) Ltd']

function companyRegister(body) {
  const company = String(body.company || '').trim()
  const companyId = String(body.company_id || '').trim()
  if (!company || !companyId) return null
  return COMPANIES[company] || MOCK_SNAPSHOT_RECORD
}

function getShareholderRegister(req, res) {
  const companyId = String(req.params.companyId || '').trim()
  if (!companyId) return res.status(400).json({ success: false, message: 'company_id is required.' })
  const company = String(req.query.company || '').trim()
  // The mock maps any confirmed snapshot to its seeded shareholder register.
  // Production resolves this by company_id from the shareholder-register store.
  return res.json({ success: true, data: COMPANIES[company] || MOCK_SNAPSHOT_RECORD })
}

const VALID_GOOD_LEAVER = [
  'Death', 'Disability', 'Termination without cause',
  'Resignation after the cliff', 'Mutual agreement',
]
const VALID_BAD_LEAVER = [
  'Unvested shares forfeited',
  'All shares at book value',
  'Unvested forfeited and vested at fair value',
]
const VALID_RESTRAINT_AREAS = ['South Africa', 'Named provinces', 'Worldwide']

/* ── Luhn check ─────────────────────────────────────────────────────────── */
function isValidSaId(value) {
  const id = String(value || '').trim()
  if (!/^\d{13}$/.test(id)) return false
  let sum = 0
  for (let i = 0; i < 12; i++) {
    let digit = Number(id[i])
    if (i % 2 === 1) { digit *= 2; if (digit > 9) digit -= 9 }
    sum += digit
  }
  return (10 - (sum % 10)) % 10 === Number(id[12])
}

const hasText = (v) => String(v || '').trim().length > 0
const positive = (v) => Number.isFinite(Number(v)) && Number(v) > 0

/* ── Step 1: Role validation ─────────────────────────────────────────────── */
function validateRole(body) {
  const missing = []

  if (!hasText(body.company))    missing.push('company')
  if (!hasText(body.company_id)) missing.push('company_id')
  if (!hasText(body.founder))    missing.push('founder')
  if (!hasText(body.full_names)) missing.push('full_names')
  if (!isValidSaId(body.id_number)) {
    return { message: 'id_number must be a valid 13-digit South African identity number.' }
  }
  if (!/^\S+@\S+\.\S+$/.test(String(body.email || ''))) {
    return { message: 'Enter a valid email address.' }
  }

  const address = body.address || {}
  for (const key of ['street', 'suburb', 'city', 'province', 'postal_code']) {
    if (!hasText(address[key])) missing.push(`address.${key}`)
  }
  if (!/^\d{4}$/.test(String(address.postal_code || ''))) {
    return { message: 'address.postal_code must be a 4-digit South African postal code.' }
  }

  if (!hasText(body.job_title))       missing.push('job_title')
  if (!hasText(body.time_commitment)) missing.push('time_commitment')

  if (body.time_commitment === 'Part time with stated hours') {
    const h = Number(body.hours_per_week)
    if (isNaN(h) || h < 1 || h > 45) {
      return { message: 'hours_per_week must be between 1 and 45 for part-time founders.' }
    }
  }

  if (!['Yes', 'No'].includes(String(body.is_director || ''))) missing.push('is_director')

  if (body.other_ventures === 'Yes' && !hasText(body.ventures_text)) {
    missing.push('ventures_text')
  }

  return missing.length ? { message: `Missing required Role fields: ${missing.join(', ')}` } : null
}

/* ── Step 2: Pay & Equity validation ─────────────────────────────────────── */
function validatePay(body) {
  if (!positive(body.salary_amount)) {
    return { message: 'salary_amount must be a positive number.' }
  }
  if (!hasText(body.salary_review))  return { message: 'salary_review is required.' }
  if (!hasText(body.shareholding_ref)) return { message: 'shareholding_ref is required.' }

  if (body.salary_deferral === 'Yes' && !hasText(body.deferral_terms)) {
    return { message: 'deferral_terms is required when salary_deferral is Yes.' }
  }

  if (body.vesting_linked === 'Yes') {
    if (!Array.isArray(body.good_leaver) || body.good_leaver.length === 0) {
      return { message: 'Select at least one good leaver event when vesting is linked to employment.' }
    }
    const invalidGood = body.good_leaver.filter((e) => !VALID_GOOD_LEAVER.includes(e))
    if (invalidGood.length) {
      return { message: `Invalid good leaver events: ${invalidGood.join(', ')}` }
    }
    if (!hasText(body.bad_leaver_effect)) {
      return { message: 'bad_leaver_effect is required when vesting is linked to employment.' }
    }
    if (!VALID_BAD_LEAVER.includes(String(body.bad_leaver_effect || ''))) {
      return { message: `bad_leaver_effect must be one of: ${VALID_BAD_LEAVER.join(', ')}` }
    }

    // Leaver acknowledgement gate — prompt if diffs exist and not acknowledged
    const co = companyRegister(body)
    if (co?.sha) {
      const sha = co.sha
      const good = Array.isArray(body.good_leaver) ? body.good_leaver : []
      const diffs = []
      const extra = good.filter((x) => !sha.good.includes(x))
      const miss  = sha.good.filter((x) => !good.includes(x))
      if (extra.length) diffs.push(`Good leaver events not in SHA: ${extra.join(', ')}`)
      if (miss.length)  diffs.push(`SHA good leaver events not here: ${miss.join(', ')}`)
      if (body.bad_leaver_effect && body.bad_leaver_effect !== sha.bad) {
        diffs.push(`Bad leaver consequence differs from SHA ("${sha.bad}")`)
      }
      if (diffs.length && body.leaver_acknowledged !== true) {
        return {
          message: 'Leaver terms differ from the shareholders agreement on record. Acknowledge the differences before generating.',
          gate: { type: 'prompt', reason: 'leaver_conflict', diffs },
        }
      }
    }
  }

  return null
}

/* ── Step 3: IP & Exit validation ─────────────────────────────────────────── */
function validateIpExit(body) {
  if (!['Yes', 'No'].includes(String(body.ip_assignment || ''))) {
    return { message: 'ip_assignment must be Yes or No.' }
  }

  // Prior IP rows — required unless nothing_to_declare = true
  if (body.nothing_to_declare !== true) {
    const rows = Array.isArray(body.prior_ip) ? body.prior_ip : []
    if (rows.length === 0) {
      return { message: 'Add at least one prior IP row, or tick "Nothing to declare".' }
    }
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      for (const key of ['description', 'date_created', 'treatment']) {
        if (!hasText(row?.[key])) {
          return { message: `prior_ip[${i}].${key} is required.` }
        }
      }
    }
  }

  // Publicly funded block gate
  if (!['Yes', 'No'].includes(String(body.publicly_funded || ''))) {
    return { message: 'publicly_funded must be Yes or No.' }
  }
  if (body.publicly_funded === 'Yes') {
    return {
      message: 'Where prior IP was publicly funded, the statutory licensing position cannot be contracted away on the platform. This Blueprint is blocked until it is resolved through Counsel. A blocked run consumes nothing.',
      gate: { type: 'block', reason: 'publicly_funded_ip' },
    }
  }

  // Restraint fields
  if (body.restraint === 'Yes') {
    const m = Number(body.restraint_months)
    if (!Number.isInteger(m) || m < 1) {
      return { message: 'restraint_months must be a positive integer.' }
    }
    if (!VALID_RESTRAINT_AREAS.includes(String(body.restraint_area || ''))) {
      return { message: `restraint_area must be one of: ${VALID_RESTRAINT_AREAS.join(', ')}` }
    }
    if (!hasText(body.restraint_activities)) {
      return { message: 'restraint_activities is required when a restraint of trade applies.' }
    }
  }

  if (!['Yes', 'No'].includes(String(body.resign_both || ''))) {
    return { message: 'resign_both must be Yes or No.' }
  }

  return null
}

/* ── Restraint warnings (non-blocking) ──────────────────────────────────── */
function buildWarnings(body) {
  const warnings = []
  if (body.restraint === 'Yes') {
    const m = Number(body.restraint_months)
    if (m > 24) warnings.push('A restraint longer than 24 months is harder to enforce.')
    if (body.restraint_area === 'Worldwide') warnings.push('A worldwide restraint is unlikely to be seen as reasonable.')
  }
  return warnings
}

/* ── Controller ──────────────────────────────────────────────────────────── */
function submitFounderEmployment(req, res, next) {
  try {
    const body = req.body || {}

    // 1. Role validation
    const roleError = validateRole(body)
    if (roleError) return res.status(422).json({ success: false, ...roleError })

    // 2. Pay & Equity validation
    const payError = validatePay(body)
    if (payError) return res.status(422).json({ success: false, ...payError })

    // 3. IP & Exit validation (includes publicly_funded block gate)
    const ipError = validateIpExit(body)
    if (ipError) return res.status(422).json({ success: false, ...ipError })

    // 4. Non-blocking warnings
    const warnings = buildWarnings(body)

    // 5. Audit log
    const email = req.user?.email || 'thabo@company.co.za'
    addAuditLog({
      action: 'founder_employment.submitted',
      email,
      role: 'sme',
      ip: req.ip,
      meta: {
        company:        String(body.company     || '').trim(),
        companyId:      String(body.company_id  || '').trim(),
        founder:        String(body.founder     || '').trim(),
        fullNames:      String(body.full_names  || '').trim(),
        jobTitle:       String(body.job_title   || '').trim(),
        timeCommitment: String(body.time_commitment || '').trim(),
        salaryAmount:   Number(body.salary_amount),
        vestingLinked:  String(body.vesting_linked || '').trim(),
        ipAssignment:   String(body.ip_assignment  || '').trim(),
        publiclyFunded: String(body.publicly_funded || '').trim(),
        restraint:      String(body.restraint || '').trim(),
        leaverAcknowledged: body.leaver_acknowledged === true,
        warnings,
      },
    })

    return res.status(201).json({
      success: true,
      data: {
        contractId:  `FEC-${Date.now()}`,
        founder:     String(body.full_names || '').trim(),
        jobTitle:    String(body.job_title  || '').trim(),
        company:     String(body.company    || '').trim(),
        generatedAt: new Date().toISOString(),
        status:      'generated',
        warnings,
      },
    })
  } catch (error) { return next(error) }
}

module.exports = { submitFounderEmployment, getShareholderRegister }
