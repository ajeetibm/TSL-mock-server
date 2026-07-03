const { mockState } = require('../mock-state')
const { getFirstSmeUser, getSmeByEmail, normalizeEmail, sendJson } = require('./helpers')

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

function handleSmeRoutes(req, res, relPath) {
  if (req.method === 'GET' && relPath === 'api/v1/sme/profile') {
    const email = normalizeEmail(req.query.email || req.body.email || 'thabo@company.co.za')
    const profile = getSmeByEmail(email) || getFirstSmeUser()

    return sendJson(res, 200, {
      success: true,
      data: publicSmeProfile(profile),
    })
  }

  if (req.method === 'PUT' && relPath === 'api/v1/sme/profile') {
    const incomingEmail = normalizeEmail(req.body.email || 'thabo@company.co.za')
    const existingUser = getSmeByEmail(incomingEmail) || getSmeByEmail('thabo@company.co.za') || getFirstSmeUser()
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
