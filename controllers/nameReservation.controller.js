const { checkProposedName } = require('../mock-data/cipcNameRegister')
const { addAuditLog } = require('../mock-data/audit')
const { getSmeByEmail } = require('../services/authService')

function isValidSaId(value) {
  const id = String(value || '').trim()
  if (!/^\d{13}$/.test(id)) return false
  const month = Number(id.slice(2, 4)); const day = Number(id.slice(4, 6))
  if (month < 1 || month > 12 || day < 1 || day > new Date(2000 + Number(id.slice(0, 2)), month, 0).getDate()) return false
  let sum = 0
  for (let index = 0; index < 12; index += 1) { let digit = Number(id[index]); if (index % 2) { digit *= 2; if (digit > 9) digit -= 9 }; sum += digit }
  return (10 - (sum % 10)) % 10 === Number(id[12])
}

const normalise = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()

function snapshotApplicant(user) {
  return {
    snapshotId: user.companySnapshotId || `snapshot_${user.userId}`,
    fullNames: user.individualFullNames || '',
    idNumber: user.idNumber || '',
    streetNumber: user.unitNumber || '',
    building: user.building || '',
    streetName: user.streetName || '',
    suburb: user.suburb || '',
    city: user.city || '',
    province: user.province || '',
    postalCode: user.postalCode || '',
    country: user.country || 'South Africa',
    email: user.email || user.businessEmail || '',
    mobile: user.phone || user.businessPhone || '',
  }
}

function validateApplicantSnapshot(payload, user) {
  if (!user) return 'Complete your Company Snapshot before submitting the reservation.'
  const snapshot = snapshotApplicant(user)
  const applicant = payload.applicant || {}
  const address = applicant.address || {}
  if (String(payload.applicant_snapshot_id || '').trim() !== snapshot.snapshotId) {
    return 'Applicant details must be confirmed from the current Company Snapshot.'
  }
  const fields = [
    ['full names', applicant.full_names, snapshot.fullNames],
    ['identity number', applicant.id_number, snapshot.idNumber],
    ['unit or street number', address.street_number, snapshot.streetNumber],
    ['complex or building', address.building, snapshot.building],
    ['street name', address.street_name, snapshot.streetName],
    ['suburb', address.suburb, snapshot.suburb],
    ['city or town', address.city, snapshot.city],
    ['province', address.province, snapshot.province],
    ['postal code', address.postal_code, snapshot.postalCode],
    ['country', address.country, snapshot.country],
    ['applicant email', payload.applicant_email, snapshot.email],
    ['applicant mobile', payload.applicant_mobile, snapshot.mobile],
  ]
  const stale = fields.find(([, submitted, current]) => normalise(submitted) !== normalise(current))
  return stale ? `Applicant ${stale[0]} does not match the Company Snapshot. Update Profile and reopen this Blueprint.` : null
}

function validateApplicant(payload) {
  const applicant = payload.applicant || {}
  const address = applicant.address || {}
  const missing = []
  if (payload.applicant_confirmed !== true) missing.push('applicant_confirmed')
  if (!String(applicant.full_names || '').trim()) missing.push('applicant.full_names')
  if (!isValidSaId(applicant.id_number)) missing.push('applicant.id_number')
  for (const key of ['street_number', 'street_name', 'suburb', 'city', 'postal_code']) if (!String(address[key] || '').trim()) missing.push(`applicant.address.${key}`)
  if (address.country === 'South Africa' && !String(address.province || '').trim()) missing.push('applicant.address.province')
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(payload.applicant_email || '').trim())) missing.push('applicant_email')
  if (!/^(\+27|0)[1-9]\d{8}$/.test(String(payload.applicant_mobile || '').replace(/[\s-]/g, ''))) missing.push('applicant_mobile')
  if (payload.reservation_for === 'An existing company name change' && !String(payload.existing_company_id || '').trim()) missing.push('existing_company_id')
  if (payload.has_tm === true && !String(payload.tm_number || '').trim()) missing.push('tm_number')
  return missing
}

function checkName(req, res, next) {
  try {
    const name = String(req.body?.name || '').trim()
    if (!name) return res.status(400).json({ success: false, message: 'A proposed name is required.' })
    return res.json({ success: true, data: checkProposedName(name) })
  } catch (error) { return next(error) }
}

function submitReservation(req, res, next) {
  try {
    const payload = req.body || {}
    const names = ['name_1', 'name_2', 'name_3', 'name_4'].map(key => String(payload[key] || '').trim())
    if (names.some(name => !name)) return res.status(422).json({ success: false, message: 'Four proposed names are required.' })
    const email = req.user?.email || 'thabo@company.co.za'
    const snapshotError = validateApplicantSnapshot(payload, getSmeByEmail(email))
    if (snapshotError) return res.status(422).json({ success: false, message: snapshotError })

    const missing = validateApplicant(payload)
    if (missing.length) return res.status(422).json({ success: false, message: `Missing or invalid required fields: ${missing.join(', ')}` })

    const checks = names.map(checkProposedName)
    const restricted = checks.filter(check => check.restricted)
    if (restricted.length) {
      return res.status(422).json({ success: false, message: 'Restricted words block a Company Name Reservation submission.', gate: { type: 'block', route: 'counsel', names: restricted } })
    }

    const duplicateNames = checks.filter(check => check.duplicate).map(check => check.name)
    const acknowledgements = Array.isArray(payload.duplicateAcknowledgements) ? payload.duplicateAcknowledgements : []
    const acknowledgedNames = new Set(acknowledgements.map(item => String(item?.name || '').trim().toUpperCase()))
    const unacknowledged = duplicateNames.filter(name => !acknowledgedNames.has(name.toUpperCase()))
    if (unacknowledged.length) {
      return res.status(422).json({ success: false, message: 'Exact register duplicates require a user acknowledgement.', gate: { type: 'prompt', names: unacknowledged } })
    }

    acknowledgements.forEach(item => addAuditLog({
      action: 'cipc.name_reservation.duplicate_acknowledged',
      email,
      role: 'sme',
      ip: req.ip,
      meta: { name: item.name, instruction: item.instruction || 'Proceed on user instruction', acknowledgedAt: item.acknowledgedAt || new Date().toISOString() },
    }))
    addAuditLog({ action: 'cipc.name_reservation.submitted', email, role: 'sme', ip: req.ip, meta: { names, reservationFor: payload.reservation_for } })
    return res.status(201).json({ success: true, data: { submissionId: `cor91_${Date.now()}`, submittedAt: new Date().toISOString(), status: 'submitted' } })
  } catch (error) { return next(error) }
}

module.exports = { checkName, submitReservation }
