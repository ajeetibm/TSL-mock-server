/**
 * controllers/boardResolution.controller.js
 *
 * Mock implementation for the Board Resolution blueprint.
 * POST /api/v1/sme/board-resolution/submit
 *
 * Gates (matching the HTML blueprint):
 *   • Block: round robin where the MOI does not permit written resolutions
 *   • Warn only (non-blocking): quorum not met, vote threshold not met
 *   • Prompt: solvency confirmation required (share issue / dividend / financial assistance)
 *
 * Production: replace COMPANIES / REGISTER with DB/company snapshot queries.
 */

const { addAuditLog } = require('../mock-data/audit')

const COMPANIES = {
  'The Startup Legal (Pty) Ltd': { allowsWrittenResolutions: true  },
  'Karoo Labs (Pty) Ltd':        { allowsWrittenResolutions: false },
  'Bluegum Studio (Pty) Ltd':    { allowsWrittenResolutions: true  },
}

const SUBJECTS_NEEDING_SOLVENCY = ['Issue shares', 'Declare a dividend']
const SUBJECTS = [
  'Open a bank account', 'Appoint signatories', 'Approve a contract',
  'Issue shares', 'Declare a dividend', 'Borrow funds', 'Appoint a director',
  'Change auditors', 'Approve financial statements', 'Other',
]
const RESOLUTION_TYPES = [
  'Board resolution', 'Ordinary shareholder resolution', 'Special shareholder resolution',
]
const DIRECTORS = ['Thandi Nkosi', 'Pieter van Wyk', 'Aisha Patel']

const THRESHOLDS = {
  'Board resolution':                { pct: 50 },
  'Ordinary shareholder resolution': { pct: 50 },
  'Special shareholder resolution':  { pct: 75 },
}

function validateSubject(body) {
  const missing = []
  if (!String(body.company       || '').trim()) missing.push('company')
  if (!String(body.company_id    || '').trim()) missing.push('company_id')
  if (!String(body.resolution_type || '').trim()) missing.push('resolution_type')
  if (!String(body.subject       || '').trim()) missing.push('subject')
  if (!String(body.wording       || '').trim()) missing.push('wording')

  if (missing.length) return { message: `Missing required Subject fields: ${missing.join(', ')}` }
  if (!RESOLUTION_TYPES.includes(String(body.resolution_type).trim())) {
    return { message: 'Select a valid resolution type.' }
  }
  if (!SUBJECTS.includes(String(body.subject).trim())) {
    return { message: 'Select a valid subject from the resolution library.' }
  }

  const detail = body.detail || {}
  const hasText = (value) => String(value || '').trim().length > 0
  const positive = (value) => Number.isFinite(Number(value)) && Number(value) > 0
  const subject = String(body.subject).trim()
  if (subject === 'Open a bank account' && (!hasText(detail.bank_name) || !Array.isArray(detail.bank_signatories) || detail.bank_signatories.length === 0)) {
    return { message: 'Enter the bank name and select at least one account signatory.' }
  }
  if (subject === 'Appoint signatories' && (!Array.isArray(detail.appointed_signatories) || detail.appointed_signatories.length === 0)) {
    return { message: 'Select at least one authorised signatory.' }
  }
  if (subject === 'Approve a contract' && (!hasText(detail.counterparty) || !positive(detail.contract_value))) {
    return { message: 'Enter the counterparty and a positive contract value.' }
  }
  if (subject === 'Issue shares' && (!positive(detail.share_count) || !positive(detail.share_price))) {
    return { message: 'Enter a positive share count and price per share.' }
  }
  if (subject === 'Declare a dividend' && !positive(detail.dividend_per_share)) {
    return { message: 'Enter a positive dividend per share.' }
  }
  if (subject === 'Borrow funds' && (!positive(detail.facility_amount) || !hasText(detail.lender))) {
    return { message: 'Enter the facility amount and lender.' }
  }

  // Solvency gate
  const needsSolvency =
    SUBJECTS_NEEDING_SOLVENCY.includes(String(body.subject || '').trim()) ||
    /financial assistance/i.test(String(body.wording || ''))
  if (needsSolvency && body.solvency_confirmed !== true) {
    return { message: 'The board must confirm the solvency and liquidity test before continuing.', gate: { type: 'prompt', reason: 'solvency_required' } }
  }

  return null
}

function validateMeeting(body) {
  const missing = []
  const company    = String(body.company      || '').trim()
  const meetType   = String(body.meeting_type || '').trim()
  const signatories = Array.isArray(body.signatories) ? body.signatories : []

  if (!['meeting', 'rr'].includes(meetType)) missing.push('meeting_type')

  // Round-robin block gate
  if (meetType === 'rr' && company && COMPANIES[company]?.allowsWrittenResolutions === false) {
    return {
      message: `Written resolutions are not permitted by the MOI of ${company}.`,
      gate: { type: 'block', reason: 'rr_not_permitted', company },
    }
  }

  if (!String(body.meeting_date || '').trim()) missing.push('meeting_date')
  if (!Array.isArray(body.attendees) || body.attendees.length === 0) missing.push('attendees')

  if (meetType === 'meeting') {
    if (!String(body.meeting_time  || '').trim()) missing.push('meeting_time')
    if (!String(body.meeting_venue || '').trim()) missing.push('meeting_venue')
    if (!String(body.chairperson   || '').trim()) missing.push('chairperson')
  }

  const f = parseInt(body.votes_for)
  const a = parseInt(body.votes_against)
  const abs = parseInt(body.votes_abstain)
  if (isNaN(f) || f < 0) missing.push('votes_for')
  if (isNaN(a) || a < 0) missing.push('votes_against')
  if (isNaN(abs) || abs < 0) missing.push('votes_abstain')

  if (signatories.length === 0) missing.push('signatories')
  if (meetType === 'rr' && DIRECTORS.some((director) => !signatories.includes(director))) {
    return { message: 'All directors must sign a round robin resolution.' }
  }

  return missing.length ? { message: `Missing required Meeting fields: ${missing.join(', ')}` } : null
}

function submitResolution(req, res, next) {
  try {
    const body = req.body || {}

    // Subject + solvency validation
    const subjectError = validateSubject(body)
    if (subjectError) return res.status(422).json({ success: false, ...subjectError })

    // Meeting validation
    const meetingError = validateMeeting(body)
    if (meetingError) return res.status(422).json({ success: false, ...meetingError })

    const needsSolvency = SUBJECTS_NEEDING_SOLVENCY.includes(String(body.subject || '').trim()) ||
      /financial assistance/i.test(String(body.wording || ''))
    const finalWording = needsSolvency
      ? `${String(body.wording).trim()}\n\nThe board confirms that it has applied the solvency and liquidity test and reasonably concludes that the company will satisfy it immediately after this transaction.`
      : String(body.wording).trim()

    // Audit log
    const email = req.user?.email || 'thabo@company.co.za'
    addAuditLog({
      action: 'board_resolution.submitted',
      email,
      role: 'sme',
      ip: req.ip,
      meta: {
        company:        String(body.company        || '').trim(),
        companyId:      String(body.company_id     || '').trim(),
        resolutionType: String(body.resolution_type || '').trim(),
        subject:        String(body.subject        || '').trim(),
        meetingType:    String(body.meeting_type   || '').trim(),
        meetingDate:    String(body.meeting_date   || '').trim(),
        signatories:    Array.isArray(body.signatories) ? body.signatories : [],
        solvencyConfirmed: body.solvency_confirmed === true,
        wording: finalWording,
      },
    })

    return res.status(201).json({
      success: true,
      data: {
        resolutionId: `BR-${Date.now()}`,
        subject:      String(body.subject || '').trim(),
        wording:      finalWording,
        generatedAt:  new Date().toISOString(),
        status:       'generated',
      },
    })
  } catch (error) { return next(error) }
}

module.exports = { submitResolution }
