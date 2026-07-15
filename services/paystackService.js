/**
 * services/paystackService.js
 * Paystack Sandbox integration.
 * Uses real Paystack Verify API to confirm payment before marking as successful.
 * PRODUCTION: replace PAYSTACK_SECRET_KEY with process.env.PAYSTACK_SECRET_KEY.
 * PRODUCTION: remove sandbox-fallback logic.
 */
const https = require('https')
const logger = require('../utils/logger')

// MOCK: use sandbox secret key. PRODUCTION: process.env.PAYSTACK_SECRET_KEY
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || 'sk_test_replace_with_real_sandbox_key'

/**
 * Verify a Paystack transaction via the real Paystack Verify API.
 * Returns the verified transaction data from Paystack.
 * PRODUCTION: this exact call works in production — just use live secret key.
 */
function verifyPaystackTransaction(reference) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.paystack.co',
      path: `/transaction/verify/${encodeURIComponent(reference)}`,
      method: 'GET',
      headers: {
        Authorization: `Bearer ${PAYSTACK_SECRET}`,
        'Content-Type': 'application/json',
      },
    }

    const req = https.request(options, (res) => {
      let raw = ''
      res.on('data', chunk => { raw += chunk })
      res.on('end', () => {
        try {
          const payload = JSON.parse(raw)
          if (!payload.status) {
            return reject(new Error(payload.message || 'Paystack verification failed.'))
          }
          resolve(payload.data)
        } catch (e) {
          reject(new Error('Failed to parse Paystack response.'))
        }
      })
    })
    req.on('error', reject)
    req.end()
  })
}

/**
 * MOCK fallback verification — used when Paystack secret key is not configured.
 * It can simulate a payment outcome, but must not fabricate card details.
 * Paystack's inline callback intentionally does not expose card metadata.
 */
function mockVerifyTransaction(reference, requestedStatus = 'success') {
  logger.warn('paystackService', 'Using MOCK verification — card details require PAYSTACK_SECRET_KEY', { reference })
  const status = ['success', 'failed', 'cancelled'].includes(requestedStatus) ? requestedStatus : 'success'

  return Promise.resolve({
    reference,
    status,
    gateway_response: status === 'success' ? 'Approved' : status === 'failed' ? 'Declined' : 'Cancelled',
    paid_at: status === 'success' ? new Date().toISOString() : null,
    amount: 399900,
    currency: 'ZAR',
    // Only Paystack's server-side Verify API may supply authorization details.
    authorization: null,
    _mock: true,
  })
}

/**
 * Smart verify — uses real Paystack API if secret key is configured, mock otherwise.
 * PRODUCTION: remove the mock fallback and always use verifyPaystackTransaction.
 */
async function smartVerify(reference, mockStatus) {
  const isRealKey = PAYSTACK_SECRET && !PAYSTACK_SECRET.includes('replace_with_real')
  if (isRealKey) {
    return verifyPaystackTransaction(reference)
  }
  return mockVerifyTransaction(reference, mockStatus)
}

module.exports = { verifyPaystackTransaction, mockVerifyTransaction, smartVerify }
