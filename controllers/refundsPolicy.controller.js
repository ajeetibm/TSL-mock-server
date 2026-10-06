/**
 * controllers/refundsPolicy.controller.js
 *
 * Mock implementation for the Refunds and Cancellation Policy blueprint.
 *
 * Endpoint:
 *   POST /api/v1/sme/refunds-policy/submit
 *
 * Gates:
 *   • Warning / Gate: offers_refunds = 'No': statutory rights to return faulty or
 *     unsuitable goods cannot be excluded; policy must state CPA preservation.
 *   • Help text: cooling-off representations.
 */

const { addAuditLog } = require('../mock-data/audit')

const hasText = (v) => String(v || '').trim().length > 0
const isEmail = (v) => /^\S+@\S+\.\S+$/.test(String(v || ''))
const isPositiveWholeNumber = (v) => /^[1-9]\d*$/.test(String(v || '').trim())
const isIsoDate = (v) => {
  const value = String(v || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return !Number.isNaN(new Date(`${value}T00:00:00`).getTime())
}
const hasOnlyOptions = (values, options) => values.every((value) => options.includes(value))

const PRODUCT_TYPES_OPTIONS = [
  'Physical goods',
  'Digital downloads',
  'Subscriptions',
  'Services',
  'Event tickets',
]

const SALES_CHANNEL_OPTIONS = [
  'Website only',
  'Website and in person',
  'Marketplace',
]

const REFUND_CONDITION_OPTIONS = [
  'Unused and in original packaging',
  'Faulty or not as described',
  'Any reason within the window',
]

const DIGITAL_EXCLUSIONS_OPTIONS = [
  'No refund once downloaded',
  'No refund once a licence key is issued',
]

const RETURN_SHIPPING_OPTIONS = [
  'Customer unless faulty',
  'Business always',
]

const REFUND_INFO_REQUIRED_OPTIONS = [
  'Order number',
  'Proof of purchase',
  'Photograph of the item',
  'Reason for the request',
]

const CANCELLATION_APPROACH_OPTIONS = [
  'Cancel any time, access continues to period end',
  'Cancel with notice',
  'No cancellation during the term',
]

const REFUND_PROCESS_OPTIONS = [
  'Email',
  'Web form',
  'Account dashboard',
]

const REFUND_METHOD_OPTIONS = [
  'Original payment method',
  'Store credit',
  'Customer choice',
]

function validateRefundsPolicy(body) {
  const missing = []

  // Step 1: Business and products
  if (!hasText(body.companyId) || !hasText(body.company)) missing.push('companySnapshot')
  if (!isEmail(body.refundsEmail)) {
    return { message: 'Enter a valid contact email address for refunds.' }
  }
  const productTypes = Array.isArray(body.productTypes) ? body.productTypes : []
  if (!productTypes.length) {
    missing.push('productTypes (select at least one)')
  } else if (!hasOnlyOptions(productTypes, PRODUCT_TYPES_OPTIONS)) {
    return { message: 'Select valid product types.' }
  }
  if (!SALES_CHANNEL_OPTIONS.includes(String(body.salesChannel || ''))) {
    missing.push('salesChannel')
  }

  // Step 2: Refund rules
  if (!['Yes', 'No'].includes(String(body.offersRefunds || ''))) {
    missing.push('offersRefunds')
  }
  if (body.offersRefunds === 'Yes') {
    if (!isPositiveWholeNumber(body.refundDays)) {
      return { message: 'Enter a valid refund window (at least 1 day).' }
    }
    const refundCondition = Array.isArray(body.refundCondition) ? body.refundCondition : []
    if (!refundCondition.length) {
      missing.push('refundCondition (select at least one condition)')
    } else if (!hasOnlyOptions(refundCondition, REFUND_CONDITION_OPTIONS)) {
      return { message: 'Select valid refund conditions.' }
    }
  }
  if (productTypes.includes('Digital downloads')) {
    const digitalExclusions = Array.isArray(body.digitalExclusions) ? body.digitalExclusions : []
    if (!hasOnlyOptions(digitalExclusions, DIGITAL_EXCLUSIONS_OPTIONS)) {
      return { message: 'Select valid digital download exclusions.' }
    }
  }
  if (productTypes.includes('Services') && !['Yes', 'No'].includes(String(body.servicesExclusion || ''))) {
    missing.push('servicesExclusion')
  }
  if (productTypes.includes('Physical goods')) {
    if (!RETURN_SHIPPING_OPTIONS.includes(String(body.returnShipping || ''))) {
      missing.push('returnShipping')
    }
  }

  // Step 3: Cancellations (if Subscriptions)
  if (productTypes.includes('Subscriptions')) {
    if (!CANCELLATION_APPROACH_OPTIONS.includes(String(body.cancellationApproach || ''))) {
      missing.push('cancellationApproach')
    }
    if (body.cancellationApproach === 'Cancel with notice') {
      if (!isPositiveWholeNumber(body.cancellationNoticeDays)) {
        return { message: 'Enter a valid cancellation notice period in days.' }
      }
    }
    if (!['Yes', 'No'].includes(String(body.prorataRefund || ''))) {
      missing.push('prorataRefund')
    }
  }

  // Step 4: Process
  if (!REFUND_PROCESS_OPTIONS.includes(String(body.refundProcess || ''))) {
    missing.push('refundProcess')
  }
  if (!isPositiveWholeNumber(body.refundProcessingDays)) {
    return { message: 'Enter a valid processing time in business days.' }
  }
  const refundInfo = Array.isArray(body.refundInfoRequired) ? body.refundInfoRequired : []
  if (!refundInfo.length) {
    missing.push('refundInfoRequired (select at least one required item)')
  } else if (!hasOnlyOptions(refundInfo, REFUND_INFO_REQUIRED_OPTIONS)) {
    return { message: 'Select valid refund information requirements.' }
  }
  if (!REFUND_METHOD_OPTIONS.includes(String(body.refundMethod || ''))) {
    missing.push('refundMethod')
  }
  if (!isIsoDate(body.effectiveDate)) {
    missing.push('effectiveDate')
  }

  return missing.length ? { message: `Missing required fields: ${missing.join(', ')}` } : null
}

function submitRefundsPolicy(req, res, next) {
  try {
    const body = req.body?.data || req.body || {}
    const email = req.user?.email || 'thabo@company.co.za'

    const error = validateRefundsPolicy(body)
    if (error) return res.status(422).json({ success: false, ...error })

    const productTypes = Array.isArray(body.productTypes) ? body.productTypes : []

    addAuditLog({
      action: 'refunds_policy.submitted',
      email,
      role: 'sme',
      ip: req.ip,
      meta: {
        company:       String(body.company       || '').trim(),
        refundsEmail:  String(body.refundsEmail  || '').trim(),
        productTypes,
        salesChannel:  String(body.salesChannel  || '').trim(),
        offersRefunds: String(body.offersRefunds || '').trim(),
        effectiveDate: String(body.effectiveDate || '').trim(),
      },
    })

    return res.status(201).json({
      success: true,
      data: {
        documentId:   `RF-${Date.now()}`,
        business:     String(body.company || '').trim(),
        productTypes,
        effectiveDate: String(body.effectiveDate || '').trim(),
        generatedAt:  new Date().toISOString(),
        status:       'generated',
      },
    })
  } catch (error) { return next(error) }
}

module.exports = { validateRefundsPolicy, submitRefundsPolicy }
