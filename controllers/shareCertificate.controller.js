/**
 * controllers/shareCertificate.controller.js
 *
 * Mock implementation for the Share Certificate Issuance blueprint.
 *
 * Endpoints (mounted at /api/v1/sme/share-certificate):
 *   POST /submit  — validate and record a share certificate issue
 *
 * Gates:
 *   • Over-issue: share_count exceeds authorised minus issued
 *   • No authorising resolution
 *   • Non-cash consideration (prompt, user may acknowledge and proceed)
 *   • Signatory rule: two directors, or one director + company secretary
 *
 * Production: replace in-memory COMPANIES register with DB/company snapshot queries.
 */

const { addAuditLog } = require('../mock-data/audit')

/* ── Same register used by the HTML blueprint ──────────────────────────── */
const COMPANIES = {
  'The Startup Legal (Pty) Ltd': {
    authorised: 1000, issued: 400, lastCert: 3,
    classes: ['Ordinary no par value'],
    officers: [
      { name: 'Thandi Nkosi',    role: 'Director' },
      { name: 'Pieter van Wyk',  role: 'Director' },
      { name: 'Aisha Patel',     role: 'Director' },
      { name: 'Lerato Mokoena',  role: 'Company secretary' },
    ],
    resolutions: [
      'Board resolution · Issue shares · 12 September 2026',
      'Board resolution · Issue shares · 02 June 2026',
    ],
  },
  'Karoo Labs (Pty) Ltd': {
    authorised: 1000, issued: 1000, lastCert: 5,
    classes: ['Ordinary no par value'],
    officers: [
      { name: 'Annelie Botha', role: 'Director' },
      { name: 'Marc Jacobs',   role: 'Director' },
    ],
    resolutions: [],
  },
  'Bluegum Studio (Pty) Ltd': {
    authorised: 5000, issued: 2000, lastCert: 11,
    classes: ['Ordinary no par value', 'Class A preference'],
    officers: [
      { name: 'Zanele Khumalo', role: 'Director' },
      { name: 'Ravi Naidoo',    role: 'Director' },
      { name: 'Hanlie Smit',    role: 'Company secretary' },
    ],
    resolutions: ['Board resolution · Issue shares · 20 August 2026'],
  },
}

const MOCK_SNAPSHOT_RECORD = COMPANIES['The Startup Legal (Pty) Ltd']

function companyRegister(body) {
  const company = String(body.company || '').trim()
  const companyId = String(body.company_id || '').trim()
  if (!company || !companyId) return null
  return COMPANIES[company] || MOCK_SNAPSHOT_RECORD
}

function isValidSaId(value) {
  const id = String(value || '').trim()
  if (!/^\d{13}$/.test(id)) return false
  const month = Number(id.slice(2, 4))
  const day   = Number(id.slice(4, 6))
  if (month < 1 || month > 12 || day < 1 || day > new Date(2000 + Number(id.slice(0, 2)), month, 0).getDate()) return false
  let sum = 0
  for (let i = 0; i < 12; i++) {
    let digit = Number(id[i])
    if (i % 2) { digit *= 2; if (digit > 9) digit -= 9 }
    sum += digit
  }
  return (10 - (sum % 10)) % 10 === Number(id[12])
}

function validateIssue(body) {
  const missing = []
  const company   = String(body.company   || '').trim()
  const companyId = String(body.company_id || '').trim()
  const sharehold = String(body.shareholder || '').trim()
  const shareClass = String(body.share_class || '').trim()
  const certNum   = String(body.cert_number || '').trim()
  const issueDate = String(body.issue_date  || '').trim()
  const count     = Number(body.share_count)

  if (!company)   missing.push('company')
  if (!companyId) missing.push('company_id')
  if (!sharehold) missing.push('shareholder')

  if (sharehold === '__new') {
    const t  = String(body.new_party_type   || '').trim()
    const nm = String(body.new_party_name   || '').trim()
    const id = String(body.new_party_idnum  || '').trim()
    const em = String(body.new_party_email  || '').trim()
    if (!t)  missing.push('new_party_type')
    if (!nm) missing.push('new_party_name')
    if (!id) {
      missing.push('new_party_idnum')
    } else if (t === 'Individual' && !isValidSaId(id)) {
      return { message: 'An identity number must be a valid 13-digit South African ID number.' }
    }
    if (!/^\S+@\S+\.\S+$/.test(em)) missing.push('new_party_email')
    const address = body.new_party_address || {}
    for (const key of ['street_number', 'street_name', 'suburb', 'city', 'postal_code']) {
      if (!String(address[key] || '').trim()) missing.push(`new_party_address.${key}`)
    }
    if (String(address.country || 'South Africa') === 'South Africa' && !String(address.province || '').trim()) missing.push('new_party_address.province')
    if (t !== 'Individual') {
      if (!String(body.new_party_signatory_name || '').trim()) missing.push('new_party_signatory_name')
      if (!String(body.new_party_signatory_capacity || '').trim()) missing.push('new_party_signatory_capacity')
    }
  }

  if (!shareClass) missing.push('share_class')
  if (isNaN(count) || count < 1 || !Number.isInteger(count)) missing.push('share_count')
  if (!certNum)   missing.push('cert_number')
  if (!issueDate) missing.push('issue_date')

  return missing.length ? { message: `Missing required Issue fields: ${missing.join(', ')}` } : null
}

function validateConsideration(body) {
  const missing = []
  const ctype     = String(body.consideration_type || '').trim()
  const resolution = String(body.resolution || '').trim()
  const signatories = Array.isArray(body.signatories) ? body.signatories : []

  // Resolution gate
  if (!resolution || resolution === '__upload') {
    return {
      message: 'A share certificate cannot be generated without an authorising resolution.',
      gate: { type: 'block', reason: 'no_resolution' },
    }
  }

  if (ctype === 'cash') {
    const amt = parseFloat(body.consideration_amount)
    if (isNaN(amt) || amt <= 0) missing.push('consideration_amount')
  } else if (ctype === 'noncash') {
    if (!String(body.consideration_description || '').trim()) missing.push('consideration_description')
    if (body.nc_acknowledged !== true) {
      return {
        message: 'Non-cash consideration requires a user acknowledgement before the certificate can be generated.',
        gate: { type: 'prompt', reason: 'noncash_consideration' },
      }
    }
  } else {
    missing.push('consideration_type')
  }

  if (!['yes', 'no'].includes(String(body.fully_paid || '').trim())) missing.push('fully_paid')

  // Signatory rule: two directors, or one director + company secretary
  const co = companyRegister(body)
  if (co) {
    const officerMap = Object.fromEntries(co.officers.map(o => [o.name, o.role]))
    const selectedSigs = signatories.map(n => String(n).trim()).filter(n => officerMap[n])
    const dirs = selectedSigs.filter(n => officerMap[n] === 'Director').length
    const secs = selectedSigs.filter(n => officerMap[n] === 'Company secretary').length
    if (!(dirs >= 2 || (dirs >= 1 && secs >= 1))) {
      missing.push('signatories')
    }
  }

  return missing.length ? { message: `Missing required Consideration fields: ${missing.join(', ')}` } : null
}

/* ── Gate: over-issue check ─────────────────────────────────────────────── */
function checkOverIssue(body) {
  const company = String(body.company || '').trim()
  const co = companyRegister(body)
  if (!co) return null
  const count = Number(body.share_count)
  const available = co.authorised - co.issued
  if (!isNaN(count) && count > available) {
    return {
      message: `Authorised shares exceeded. Only ${available} shares remain unissued for ${company}.`,
      gate: { type: 'block', reason: 'over_issue', available, requested: count },
    }
  }
  return null
}

/* ── Controller ─────────────────────────────────────────────────────────── */
function submitCertificate(req, res, next) {
  try {
    const body = req.body || {}

    // 1. Over-issue gate (hardest block)
    const overIssueError = checkOverIssue(body)
    if (overIssueError) return res.status(422).json({ success: false, ...overIssueError })

    // 2. Issue field validation
    const issueError = validateIssue(body)
    if (issueError) return res.status(422).json({ success: false, ...issueError })

    // 3. Consideration + signatory validation
    const considerationError = validateConsideration(body)
    if (considerationError) return res.status(422).json({ success: false, ...considerationError })

    // 4. Record audit log
    const email = req.user?.email || 'thabo@company.co.za'
    const shareholder = body.shareholder === '__new'
      ? String(body.new_party_name || '').trim()
      : String(body.shareholder || '').trim()

    addAuditLog({
      action: 'share_certificate.issued',
      email,
      role: 'sme',
      ip: req.ip,
      meta: {
        company:     String(body.company     || '').trim(),
        companyId:   String(body.company_id  || '').trim(),
        shareholder,
        shareClass:  String(body.share_class || '').trim(),
        shareCount:  Number(body.share_count),
        certNumber:  String(body.cert_number || '').trim(),
        issueDate:   String(body.issue_date  || '').trim(),
        consideration: {
          type:      String(body.consideration_type || '').trim(),
          fullyPaid: String(body.fully_paid || '').trim(),
          ncAcknowledged: body.nc_acknowledged === true,
        },
        signatories: Array.isArray(body.signatories) ? body.signatories : [],
        resolution:  String(body.resolution || '').trim(),
      },
    })

    return res.status(201).json({
      success: true,
      data: {
        certificateId: `SC-${Date.now()}`,
        certNumber: String(body.cert_number || '').trim(),
        issuedAt:   new Date().toISOString(),
        status:     'issued',
      },
    })
  } catch (error) { return next(error) }
}

module.exports = { submitCertificate }
