/**
 * controllers/websiteTerms.controller.js
 *
 * Mock implementation for the Website Terms of Use blueprint.
 *
 * Endpoint:
 *   POST /api/v1/sme/website-terms/submit
 *
 * Gates:
 *   • Prompt : site_purpose = 'Provides a platform between users' requires
 *              platform_acknowledged = true (intermediary liability).
 */

const { addAuditLog } = require('../mock-data/audit')
const { getSmeByEmail } = require('../services/authService')

const hasText = (v) => String(v || '').trim().length > 0
const isEmail = (v) => /^\S+@\S+\.\S+$/.test(String(v || ''))
const REG_RE  = /^\d{4}\/\d{6}\/\d{2}$/

const normalise = (value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()

function companySnapshotStreet(profile) {
  return [profile.unitNumber, profile.building, profile.streetName]
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .join(', ')
}

function validateSnapshotOperator(body, profile) {
  if (!profile) return { message: 'Complete your Company Snapshot before generating Website Terms.' }

  const snapshotId = profile.companySnapshotId || `snapshot_${profile.userId}`
  const entityType = String(profile.entityType || '').trim()
  const operatorName = entityType === 'Individual'
    ? String(profile.individualFullNames || '').trim()
    : String(profile.legalName || '').trim()
  const snapshotEmail = String(profile.businessEmail || profile.email || '').trim()
  const requiredSnapshotValues = [
    ['entity type', entityType],
    ['operator name', operatorName],
    ['street address', companySnapshotStreet(profile)],
    ['suburb', profile.suburb],
    ['city or town', profile.city],
    ['country', profile.country],
    ['postal code', profile.postalCode],
    ['business email', snapshotEmail],
  ]

  if (entityType === 'Individual') {
    requiredSnapshotValues.push(['identity number', profile.idNumber])
  } else {
    requiredSnapshotValues.push(
      ['registration number', profile.registrationNumber],
      ['signatory full names', profile.signatoryName],
      ['signatory capacity', profile.signatoryCapacity],
    )
  }
  if (profile.country === 'South Africa') requiredSnapshotValues.push(['province', profile.province])

  const missing = requiredSnapshotValues.filter(([, value]) => !hasText(value)).map(([label]) => label)
  if (missing.length) {
    return { message: `Complete the Company Snapshot before generating Website Terms. Missing: ${missing.join(', ')}.` }
  }

  if (body.companyConfirmed !== true || String(body.companyId || '').trim() !== snapshotId) {
    return { message: 'Confirm the current Company Snapshot before generating Website Terms.' }
  }
  if (normalise(body.company) !== normalise(operatorName) || normalise(body.entityType) !== normalise(entityType)) {
    return { message: 'The Operator must be pre-filled from the current Company Snapshot. Reconfirm the snapshot and try again.' }
  }

  const comparisons = entityType === 'Individual'
    ? [['full names', body.fullNames, profile.individualFullNames], ['identity number', body.idNumber, profile.idNumber]]
    : [
      ['registered name', body.legalName, profile.legalName],
      ['registration number', body.regNumber, profile.registrationNumber],
      ['signatory full names', body.signatoryName, profile.signatoryName],
      ['signatory capacity', body.signatoryCapacity, profile.signatoryCapacity],
    ]
  comparisons.push(
    ['street address', body.street, companySnapshotStreet(profile)],
    ['suburb', body.suburb, profile.suburb],
    ['city or town', body.city, profile.city],
    ['province', body.province, profile.province],
    ['postal code', body.postalCode, profile.postalCode],
    ['country', body.country, profile.country],
    ['operator email', body.email, snapshotEmail],
  )

  const staleField = comparisons.find(([, submitted, current]) => normalise(submitted) !== normalise(current))
  if (staleField) {
    return { message: `The Operator ${staleField[0]} no longer matches the Company Snapshot. Reconfirm the snapshot and try again.` }
  }
  return null
}

function validateOperator(body) {
  const missing = []

  // At least one domain
  const domains = Array.isArray(body.domains) ? body.domains : []
  if (!domains.some(d => hasText(d.domain))) {
    missing.push('domains (at least one required)')
  }

  if (!hasText(body.entityType)) missing.push('entityType')

  if (body.entityType === 'Individual') {
    if (!hasText(body.fullNames))  missing.push('fullNames')
    if (!/^\d{13}$/.test(String(body.idNumber || ''))) {
      return { message: 'idNumber must be a valid 13-digit South African identity number.' }
    }
  } else {
    if (!hasText(body.legalName)) missing.push('legalName')
    if (!REG_RE.test(String(body.regNumber || ''))) {
      return { message: 'regNumber must use the format 2021/123456/07.' }
    }
    if (!hasText(body.signatoryName))     missing.push('signatoryName')
    if (!hasText(body.signatoryCapacity)) missing.push('signatoryCapacity')
  }

  if (!hasText(body.street))  missing.push('street')
  if (!hasText(body.suburb))  missing.push('suburb')
  if (!hasText(body.city))    missing.push('city')
  if (!hasText(body.country)) missing.push('country')
  if (body.country === 'South Africa') {
    if (!hasText(body.province))   missing.push('province')
    if (!/^\d{4}$/.test(String(body.postalCode || ''))) {
      return { message: 'postalCode must be a 4-digit South African postal code.' }
    }
  } else {
    if (!hasText(body.postalCode)) missing.push('postalCode')
  }

  if (!isEmail(body.email))        return { message: 'Enter a valid email address.' }
  if (!isEmail(body.contactEmail)) return { message: 'Enter a valid contact email address.' }
  if (!hasText(body.sitePurpose))  missing.push('sitePurpose')

  // Platform intermediary gate
  if (body.sitePurpose === 'Provides a platform between users' && body.platformAcknowledged !== true) {
    return {
      message: 'A site that facilitates transactions between users requires acknowledgement of the intermediary liability prompt before the terms can be generated.',
      gate: { type: 'prompt', reason: 'platform_intermediary' },
    }
  }

  return missing.length ? { message: `Missing required fields: ${missing.join(', ')}` } : null
}

function validateFeatures(body) {
  const yesNoFields = ['hasAccounts', 'hasUgc', 'hasPayments', 'hasThirdPartyLinks']
  const missingValue = yesNoFields.find(field => !['Yes', 'No'].includes(String(body[field] || '')))
  if (missingValue) return { message: `${missingValue} must be Yes or No.` }

  if (body.hasAccounts === 'Yes') {
    const grounds = Array.isArray(body.accountSuspensionGrounds) ? body.accountSuspensionGrounds : []
    if (!grounds.length) {
      return { message: 'Select at least one account suspension ground when user accounts are enabled.' }
    }
  }
  if (body.hasUgc === 'Yes') {
    if (!['Non-exclusive licence to host and display', 'Broad licence including promotion'].includes(String(body.ugcLicence || ''))) {
      return { message: 'Select a licence over user content when users can post content.' }
    }
    if (!['Yes', 'No'].includes(String(body.ugcTakedown || ''))) {
      return { message: 'ugcTakedown must be Yes or No when users can post content.' }
    }
  }
  return null
}

function validateLegal(body) {
  const missing = []
  const acceptable = Array.isArray(body.acceptableUse) ? body.acceptableUse : []
  if (!['Yes', 'No'].includes(String(body.adviceDisclaimer || ''))) missing.push('adviceDisclaimer')
  if (!acceptable.length) missing.push('acceptableUse (at least one restriction required)')
  if (!['Limited to the extent permitted by law', 'A stated amount'].includes(String(body.liabilityCap || ''))) missing.push('liabilityCap')
  if (body.liabilityCap === 'A stated amount') {
    if (!(parseFloat(body.liabilityAmount) > 0)) {
      return { message: 'liabilityAmount must be a positive number when a stated liability cap is chosen.' }
    }
  }
  if (String(body.governingLaw || '') !== 'South African law') missing.push('governingLaw')
  if (!['Johannesburg', 'Pretoria', 'Cape Town', 'Durban', 'Bloemfontein', 'Gqeberha'].includes(String(body.jurisdictionCity || ''))) missing.push('jurisdictionCity')
  if (!hasText(body.effectiveDate)) missing.push('effectiveDate')
  return missing.length ? { message: `Missing required fields: ${missing.join(', ')}` } : null
}

function submitWebsiteTerms(req, res, next) {
  try {
    const body = req.body || {}
    const email = req.user?.email || 'thabo@company.co.za'
    const snapshotError = validateSnapshotOperator(body, getSmeByEmail(email))
    if (snapshotError) return res.status(422).json({ success: false, ...snapshotError })

    const operatorError = validateOperator(body)
    if (operatorError) return res.status(422).json({ success: false, ...operatorError })

    const featuresError = validateFeatures(body)
    if (featuresError) return res.status(422).json({ success: false, ...featuresError })

    const legalError = validateLegal(body)
    if (legalError) return res.status(422).json({ success: false, ...legalError })

    const domains = Array.isArray(body.domains) ? body.domains.filter(d => hasText(d.domain)).map(d => d.domain) : []

    addAuditLog({
      action: 'website_terms.submitted',
      email,
      role: 'sme',
      ip: req.ip,
      meta: {
        entityType:    String(body.entityType    || '').trim(),
        legalName:     String(body.legalName     || body.fullNames || '').trim(),
        domains,
        sitePurpose:   String(body.sitePurpose   || '').trim(),
        effectiveDate: String(body.effectiveDate || '').trim(),
        platformAcknowledged: body.platformAcknowledged === true,
      },
    })

    return res.status(201).json({
      success: true,
      data: {
        documentId:   `WTU-${Date.now()}`,
        domains,
        operator:     String(body.legalName || body.fullNames || '').trim(),
        effectiveDate: String(body.effectiveDate || '').trim(),
        generatedAt:  new Date().toISOString(),
        status:       'generated',
      },
    })
  } catch (error) { return next(error) }
}

module.exports = { submitWebsiteTerms }
