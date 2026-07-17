const { mockState } = require('../mock-state')
const { getFirstSmeUser, getSmeByEmail, normalizeEmail, sendJson } = require('./helpers')

function titleCaseFromEmail(email) {
  const localPart = normalizeEmail(email).split('@')[0] || 'user'
  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'User'
}

function createDefaultSmeUser(email) {
  const fullName = titleCaseFromEmail(email)
  return {
    userId: 'usr_' + String(mockState.nextSmeId++).padStart(4, '0'),
    fullName,
    email,
    role: 'sme',
    portal: 'sme',
    plan: 'Operator',
    status: 'Active',
    joinedAt: new Date().toISOString().slice(0, 10),
    companyName: '',
    registrationNumber: '',
    phone: '',
    physicalAddress: '',
    contactPerson: fullName,
    updatedAt: new Date().toISOString(),
  }
}

function normalizeSmeProfilePayload(payload, existingUser) {
  const nextEmail = normalizeEmail(payload.email || existingUser?.email || 'thabo@company.co.za')
  const contactPerson = String(payload.contactPerson || existingUser?.contactPerson || existingUser?.fullName || '').trim()
  const companyName = String(payload.companyName || existingUser?.companyName || '').trim()

  return {
    ...(existingUser || {}),
    userId: existingUser?.userId || 'usr_8f3k2m9x',
    role: 'sme',
    portal: 'sme',
    fullName: contactPerson || existingUser?.fullName || companyName || 'Thabo Molefe',
    email: nextEmail,
    plan: existingUser?.plan || 'Operator',
    status: existingUser?.status || 'Active',
    joinedAt: existingUser?.joinedAt || '2025-09-15',
    companyName,
    registrationNumber: String(payload.registrationNumber || existingUser?.registrationNumber || '').trim(),
    phone: String(payload.phone || existingUser?.phone || '').trim(),
    physicalAddress: String(payload.physicalAddress || existingUser?.physicalAddress || '').trim(),
    contactPerson,
    updatedAt: new Date().toISOString(),
  }
}

function publicSmeProfile(user) {
  return {
    userId: user.userId,
    fullName: user.fullName,
    email: user.email,
    role: user.role,
    portal: user.portal,
    plan: user.plan,
    status: user.status,
    joinedAt: user.joinedAt,
    companyName: user.companyName,
    registrationNumber: user.registrationNumber,
    phone: user.phone,
    physicalAddress: user.physicalAddress,
    contactPerson: user.contactPerson,
    updatedAt: user.updatedAt,
  }
}

function createPaystackReference() {
  return `TSL_PAYSTACK_${Date.now()}_${String(mockState.nextPaymentId++).padStart(4, '0')}`
}

function normalizePaymentAmount(value) {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? amount : 999
}

function handleSmeRoutes(req, res, relPath) {
  if (req.method === 'GET' && relPath === 'api/v1/sme/profile') {
    const email = normalizeEmail(req.query.email || req.body.email || 'thabo@company.co.za')
    let profile = getSmeByEmail(email)
    if (!profile) {
      profile = createDefaultSmeUser(email)
      mockState.smeUsers.set(email, profile)
    }

    return sendJson(res, 200, {
      success: true,
      data: publicSmeProfile(profile),
    })
  }

  if (req.method === 'PUT' && relPath === 'api/v1/sme/profile') {
    const incomingEmail = normalizeEmail(req.body.email || 'thabo@company.co.za')
    const existingUser = getSmeByEmail(incomingEmail) || createDefaultSmeUser(incomingEmail)
    const previousEmail = normalizeEmail(existingUser?.email)
    const updatedUser = normalizeSmeProfilePayload(req.body, existingUser)

    if (previousEmail && previousEmail !== updatedUser.email) {
      mockState.smeUsers.delete(previousEmail)
    }
    mockState.smeUsers.set(updatedUser.email, updatedUser)

    return sendJson(res, 200, {
      success: true,
      message: 'Profile updated successfully.',
      data: publicSmeProfile(updatedUser),
    })
  }

  if (req.method === 'POST' && relPath === 'api/v1/sme/payments/paystack/initialize') {
    const amount = normalizePaymentAmount(req.body.amount)
    const currency = String(req.body.currency || 'ZAR').toUpperCase()
    const email = normalizeEmail(req.body.email || 'thabo@company.co.za')
    const reference = createPaystackReference()
    const transaction = {
      reference,
      amount,
      currency,
      email,
      plan: req.body.plan || 'Operator',
      paymentMethod: req.body.paymentMethod || 'Credit/Debit Cards',
      selectedWizards: Array.isArray(req.body.selectedWizards) ? req.body.selectedWizards : [],
      status: 'initialized',
      createdAt: new Date().toISOString(),
    }

    mockState.paymentTransactions.set(reference, transaction)

    return sendJson(res, 200, {
      success: true,
      message: 'Paystack transaction initialized in sandbox mode.',
      data: {
        provider: 'paystack',
        mode: 'test',
        reference,
        accessCode: `mock_access_code_${reference}`,
        authorizationUrl: `https://checkout.paystack.com/mock_${reference}`,
        publicKey: 'pk_test_mock_tsl_paystack',
        amount,
        amountInKobo: Math.round(amount * 100),
        currency,
        email,
        plan: transaction.plan,
      },
    })
  }

  if (req.method === 'POST' && relPath === 'api/v1/sme/payments/paystack/verify') {
    const reference = String(req.body.reference || '')
    const outcome = String(req.body.outcome || 'success').toLowerCase()
    const transaction = mockState.paymentTransactions.get(reference)

    if (!transaction) {
      return sendJson(res, 404, {
        success: false,
        message: 'Payment reference not found.',
        error: 'PAYMENT_NOT_FOUND',
      })
    }

    const status = outcome === 'cancelled' ? 'cancelled' : outcome === 'failed' ? 'failed' : 'success'
    const gatewayResponse = {
      success: 'Approved by Paystack sandbox.',
      failed: 'Declined by Paystack sandbox.',
      cancelled: 'Cancelled by customer.',
    }[status]

    transaction.status = status
    transaction.verifiedAt = new Date().toISOString()
    if (status === 'success') {
      transaction.paidAt = transaction.verifiedAt
    }
    mockState.paymentTransactions.set(reference, transaction)

    return sendJson(res, 200, {
      success: true,
      message: gatewayResponse,
      data: {
        provider: 'paystack',
        reference,
        status,
        gatewayResponse,
        paidAt: transaction.paidAt,
      },
    })
  }

  if (req.method === 'GET' && relPath === 'api/v1/sme/counsel/credits') {
    return sendJson(res, 200, {
      success: true,
      data: mockState.smeCredits,
    })
  }

  if (req.method === 'GET' && relPath === 'api/v1/sme/counsel/requests') {
    const requests = mockState.adminRequests.map((request) => ({
      requestId: request.requestId,
      subject: request.subject,
      status: request.status,
      assignedCounsel: request.assignedCounselName || null,
      submittedAt: request.submittedAt || request.receivedAt,
      description: request.description || '',
      relatedWizard: request.relatedWizard || null,
      attachments: request.attachments || [],
      counselResponse: request.counselResponse || null,
      responseDate: request.completedAt || null,
      completedAt: request.completedAt || null,
      responseUrl: request.responseUrl || null,
    }))

    return sendJson(res, 200, {
      success: true,
      data: requests,
    })
  }

  if (req.method === 'POST' && relPath === 'api/v1/sme/counsel/requests') {
    const subject = req.body.subject || req.body.title || 'Review of SaaS Service Agreement'
    const userEmail = req.body.userEmail || req.body.email || 'thabo@company.co.za'
    const now = new Date()
    const duplicateWindowMs = 30000
    const existingPendingRequest = mockState.adminRequests.find((request) => {
      const sameUser = normalizeEmail(request.userEmail) === normalizeEmail(userEmail)
      const sameSubject = String(request.subject || '').trim().toLowerCase() === String(subject).trim().toLowerCase()
      const submittedAt = new Date(request.submittedAt || request.receivedAt || 0).getTime()
      return request.status === 'pending' && sameUser && sameSubject && now.getTime() - submittedAt < duplicateWindowMs
    })

    if (existingPendingRequest) {
      return sendJson(res, 200, {
        success: true,
        message: 'Duplicate request ignored. Existing pending request returned.',
        data: {
          requestId: existingPendingRequest.requestId,
          subject: existingPendingRequest.subject,
          status: existingPendingRequest.status,
          creditsRemaining: mockState.smeCredits.creditsRemaining,
          submittedAt: existingPendingRequest.submittedAt || existingPendingRequest.receivedAt,
          duplicate: true,
        },
      })
    }

    if (mockState.smeCredits.creditsRemaining > 0) {
      mockState.smeCredits.creditsUsed += 1
      mockState.smeCredits.usageThisMonth += 1
      mockState.smeCredits.creditsRemaining -= 1
    }

    const requestId = 'req_' + mockState.nextRequestId++
    const submittedAt = now.toISOString()
    const request = {
      requestId,
      subject,
      fromUser: req.body.fromUser || req.body.fullName || 'Thabo Molefe',
      userEmail,
      company: req.body.company || 'FibreGents (Pty) Ltd',
      receivedAt: submittedAt,
      submittedAt,
      status: 'pending',
      description: req.body.description || req.body.notes || 'Please review the attached legal request.',
      relatedWizard: req.body.relatedWizard || null,
      attachments: Array.isArray(req.body.attachments) ? req.body.attachments : [],
      assignedBy: 'Admin Sarah',
      earnings: Number(req.body.earnings || 500),
      currency: 'ZAR',
    }
    mockState.adminRequests.unshift(request)

    return sendJson(res, 201, {
      success: true,
      data: {
        requestId,
        subject: request.subject,
        status: request.status,
        creditsRemaining: mockState.smeCredits.creditsRemaining,
        submittedAt: request.submittedAt,
      },
    })
  }

  return false
}

module.exports = { handleSmeRoutes }
