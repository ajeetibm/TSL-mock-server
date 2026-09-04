const mockState = {
  nextCounselId: 8,
  nextSmeId: 2,
  nextRequestId: 7800,
  nextAdminNotificationId: 1,
  nextPaymentId: 1,
  availability: 'available',
  // Per-user counsel credits: Map<normalizedEmail, CreditRecord>
  smeCreditsByUser: new Map(),
  // Legacy single-user object kept for backward compat — do not reference directly.
  smeCredits: { plan: 'free', includedCredits: 0, creditsTotal: 0, creditsUsed: 0, creditsRemaining: 0, usageThisMonth: 0, topUpRate: 500, currency: 'ZAR', resetDate: '2026-07-10' },
  smeUsers: new Map([
    ['thabo@company.co.za', {
      userId: 'usr_8f3k2m9x',
      fullName: 'Thabo Molefe',
      email: 'thabo@company.co.za',
      password: '',
      role: 'sme',
      portal: 'sme',
      plan: 'Operator',
      status: 'Active',
      joinedAt: '2025-09-15',
      companyName: 'FibreGents (Pty) Ltd',
      registrationNumber: '2025/123456/07',
      phone: '+27 82 123 4567',
      physicalAddress: '123 Main Street, Sandton, Johannesburg, 2196',
      contactPerson: 'Thabo Molefe',
      updatedAt: '2026-06-10T09:30:00Z',
    }],
    // ── Pre-seeded named user accounts (password reset allowed) ─────────────
    // These are the only user emails that can request a password reset.
    // Password for all: User@1234
    ['nomsa.dlamini@startup.co.za', {
      userId: 'usr_nd001',
      fullName: 'Nomsa Dlamini',
      email: 'nomsa.dlamini@startup.co.za',
      password: 'User@1234',
      role: 'sme',
      portal: 'sme',
      plan: 'free',
      status: 'Active',
      joinedAt: '2025-11-01',
      companyName: 'Dlamini Creative Studios (Pty) Ltd',
      registrationNumber: '2025/200001/07',
      phone: '+27 79 100 0001',
      physicalAddress: '5 Bloom Street, Cape Town, 8000',
      contactPerson: 'Nomsa Dlamini',
      updatedAt: '2026-05-15T10:00:00Z',
    }],
    ['keanu.petersen@techrise.co.za', {
      userId: 'usr_kp002',
      fullName: 'Keanu Petersen',
      email: 'keanu.petersen@techrise.co.za',
      password: 'User@1234',
      role: 'sme',
      portal: 'sme',
      plan: 'free',
      status: 'Active',
      joinedAt: '2025-12-10',
      companyName: 'TechRise Solutions (Pty) Ltd',
      registrationNumber: '2025/200002/07',
      phone: '+27 83 200 0002',
      physicalAddress: '88 Innovation Ave, Pretoria, 0002',
      contactPerson: 'Keanu Petersen',
      updatedAt: '2026-05-20T11:00:00Z',
    }],
    ['zanele.khumalo@nexusgroup.co.za', {
      userId: 'usr_zk003',
      fullName: 'Zanele Khumalo',
      email: 'zanele.khumalo@nexusgroup.co.za',
      password: 'User@1234',
      role: 'sme',
      portal: 'sme',
      plan: 'free',
      status: 'Active',
      joinedAt: '2026-01-05',
      companyName: 'Nexus Group (Pty) Ltd',
      registrationNumber: '2026/200003/07',
      phone: '+27 71 300 0003',
      physicalAddress: '12 Corporate Park, Sandton, 2196',
      contactPerson: 'Zanele Khumalo',
      updatedAt: '2026-06-01T08:30:00Z',
    }],
    ['andre.botha@growsmart.co.za', {
      userId: 'usr_ab004',
      fullName: 'André Botha',
      email: 'andre.botha@growsmart.co.za',
      password: 'User@1234',
      role: 'sme',
      portal: 'sme',
      plan: 'free',
      status: 'Active',
      joinedAt: '2026-02-14',
      companyName: 'GrowSmart Enterprises (Pty) Ltd',
      registrationNumber: '2026/200004/07',
      phone: '+27 72 400 0004',
      physicalAddress: '7 Market Street, Durban, 4001',
      contactPerson: 'André Botha',
      updatedAt: '2026-06-05T09:00:00Z',
    }],
    ['priya.naidoo@brightpath.co.za', {
      userId: 'usr_pn005',
      fullName: 'Priya Naidoo',
      email: 'priya.naidoo@brightpath.co.za',
      password: 'User@1234',
      role: 'sme',
      portal: 'sme',
      plan: 'free',
      status: 'Active',
      joinedAt: '2026-03-20',
      companyName: 'BrightPath Advisory (Pty) Ltd',
      registrationNumber: '2026/200005/07',
      phone: '+27 61 500 0005',
      physicalAddress: '34 Gateway Road, Umhlanga, 4319',
      contactPerson: 'Priya Naidoo',
      updatedAt: '2026-06-08T07:45:00Z',
    }],
    // ── Pre-seeded test accounts with active subscriptions ──────────────────
    // Use these to test the subscriber flow without going through payment.
    // Password for all three: Test@1234
    ['launchpad@tsl.co.za', {
      userId: 'usr_test_lp01',
      fullName: 'Lerato Dlamini',
      email: 'launchpad@tsl.co.za',
      password: 'Test@1234',
      role: 'sme',
      portal: 'sme',
      plan: 'Launchpad',
      status: 'Active',
      joinedAt: '2026-01-01',
      companyName: 'Dlamini Ventures (Pty) Ltd',
      registrationNumber: '2026/000001/07',
      phone: '+27 71 111 0001',
      physicalAddress: '10 Startup Lane, Cape Town, 8001',
      contactPerson: 'Lerato Dlamini',
      updatedAt: '2026-06-01T08:00:00Z',
    }],
    ['operator@tsl.co.za', {
      userId: 'usr_test_op01',
      fullName: 'Sipho Khumalo',
      email: 'operator@tsl.co.za',
      password: 'Test@1234',
      role: 'sme',
      portal: 'sme',
      plan: 'Operator',
      status: 'Active',
      joinedAt: '2026-02-01',
      companyName: 'Khumalo Tech (Pty) Ltd',
      registrationNumber: '2026/000002/07',
      phone: '+27 72 222 0002',
      physicalAddress: '22 Growth Road, Johannesburg, 2196',
      contactPerson: 'Sipho Khumalo',
      updatedAt: '2026-06-01T08:00:00Z',
    }],
    ['boardroom@tsl.co.za', {
      userId: 'usr_test_br01',
      fullName: 'Ayanda Nkosi',
      email: 'boardroom@tsl.co.za',
      password: 'Test@1234',
      role: 'sme',
      portal: 'sme',
      plan: 'Boardroom',
      status: 'Active',
      joinedAt: '2026-03-01',
      companyName: 'Nkosi Holdings (Pty) Ltd',
      registrationNumber: '2026/000003/07',
      phone: '+27 73 333 0003',
      physicalAddress: '33 Corporate Drive, Sandton, 2196',
      contactPerson: 'Ayanda Nkosi',
      updatedAt: '2026-06-01T08:00:00Z',
    }],
  ]),
  adminUsers: new Map([
    ['super@thestartuplegal.co.za', {
      userId: 'adm_000',
      fullName: 'Super Admin',
      firstName: 'Super',
      lastName: 'Admin',
      email: 'super@thestartuplegal.co.za',
      password: '',
      role: 'super_admin',
      portal: 'admin',
      phone: '+27 11 000 0000',
      location: '123 Main Street, Sandton, Johannesburg, 2196',
      jobTitle: 'Super Administrator',
      status: 'active',
      joinedAt: '2025-01-01',
      lastLogin: '',
      updatedAt: '2026-06-10T09:30:00Z',
    }],
    ['given@thestartuplegal.co.za', {
      userId: 'adm_001',
      fullName: 'Given Kibanza',
      firstName: 'Given',
      lastName: 'Kibanza',
      email: 'given@thestartuplegal.co.za',
      password: '',
      role: 'admin',
      portal: 'admin',
      phone: '+27 11 234 5678',
      location: '123 Main Street, Sandton, Johannesburg, 2196',
      jobTitle: 'Platform Administrator',
      status: 'active',
      joinedAt: '2025-12-01',
      lastLogin: 'January 9, 2026 - 14:23',
      updatedAt: '2026-06-10T09:30:00Z',
    }],
  ]),
  counselUsers: new Map([
    ['s.nkosi@tsl.co.za', {
      userId: 'con_002',
      fullName: 'Adv. Sipho Nkosi',
      email: 's.nkosi@tsl.co.za',
      password: 'temporary',
      role: 'counsel',
      portal: 'counsel',
      mustResetPassword: true,
      status: 'active',
    }],
  ]),
  counselDirectory: [
    {
      counselId: 'con_002',
      fullName: 'Adv. Sipho Nkosi',
      name: 'Adv. Sipho Nkosi',
      email: 's.nkosi@tsl.co.za',
      phone: '+27 11 234 5678',
      specialty: 'Commercial & Contract Law',
      expertise: 'SaaS & Technology Contracts',
      status: 'Available',
      availability: 'Available',
      experience: '12 years exp',
      location: 'Johannesburg, Gauteng',
    },
  ],
  adminRequests: [],
  // Mock equivalent of the persisted admin notification/audit table.
  adminNotifications: [],
  paymentTransactions: new Map(),
  counselRequests: [
    {
      requestId: 'req_77b2',
      subject: 'Contract Review for SaaS Agreement',
      fromUser: 'Michael Chen',
      userEmail: 'michael.chen@company.com',
      company: 'FibreGents (Pty) Ltd',
      earnings: 550,
      currency: 'ZAR',
      status: 'pending',
      assignedBy: 'Admin Sarah',
      assignedCounselId: 'con_002',
      assignedCounselEmail: 's.nkosi@tsl.co.za',
      date: '2026-01-12',
      assignedAt: '2026-01-12T10:10:00Z',
      timeAgo: '12 min ago',
    },
    {
      requestId: 'req_77b3',
      subject: 'Employment Contract Consultation',
      fromUser: 'Jessica Williams',
      userEmail: 'jessica.w@startup.co.za',
      company: 'Growth Ventures',
      earnings: 450,
      currency: 'ZAR',
      status: 'pending',
      assignedBy: 'Admin Sarah',
      assignedCounselId: 'con_002',
      assignedCounselEmail: 's.nkosi@tsl.co.za',
      date: '2026-01-12',
      assignedAt: '2026-01-12T09:57:00Z',
      timeAgo: '25 min ago',
    },
    {
      requestId: 'req_77b4',
      subject: 'Shareholder Agreement Review',
      fromUser: 'David Brown',
      userEmail: 'david.brown@tech.com',
      company: 'Digital Solutions',
      earnings: 550,
      currency: 'ZAR',
      status: 'completed',
      assignedBy: 'Admin John',
      assignedCounselId: 'con_002',
      assignedCounselEmail: 's.nkosi@tsl.co.za',
      date: '2026-01-11',
    },
    {
      requestId: 'req_77b5',
      subject: 'NDA Review & Modification',
      fromUser: 'Sarah Johnson',
      userEmail: 'sarah.j@business.co.za',
      company: 'TechStart Inc.',
      earnings: 500,
      currency: 'ZAR',
      status: 'completed',
      assignedBy: 'Admin Sarah',
      assignedCounselId: 'con_002',
      assignedCounselEmail: 's.nkosi@tsl.co.za',
      date: '2026-01-10',
    },
    {
      requestId: 'req_77b7',
      subject: 'Intellectual Property Review',
      fromUser: 'Emily Davis',
      userEmail: 'emily.d@innovation.co.za',
      company: 'Innovation Labs',
      earnings: 450,
      currency: 'ZAR',
      status: 'rejected',
      assignedBy: 'Admin Sarah',
      assignedCounselId: 'con_002',
      assignedCounselEmail: 's.nkosi@tsl.co.za',
      date: '2026-01-09',
    },
  ],
}

const defaultAssignableCounsel = [
  {
    counselId: 'con_101',
    fullName: 'Sarah Mitchell',
    name: 'Sarah Mitchell',
    email: 'sarah.mitchell@legaltech.com',
    phone: '+27 11 101 1001',
    specialty: 'SaaS & Technology Contracts',
    expertise: 'SaaS & Technology Contracts',
    status: 'Available',
    availability: 'Available',
    experience: '12 years exp',
    location: 'Johannesburg, Gauteng',
  },
  {
    counselId: 'con_102',
    fullName: 'David Thompson',
    name: 'David Thompson',
    email: 'david.thompson@legaltech.com',
    phone: '+27 11 101 1002',
    specialty: 'Intellectual Property & IP Law',
    expertise: 'Intellectual Property & IP Law',
    status: 'Available',
    availability: 'Available',
    experience: '15 years exp',
    location: 'Cape Town, Western Cape',
  },
  {
    counselId: 'con_103',
    fullName: 'Emily Chen',
    name: 'Emily Chen',
    email: 'emily.chen@legaltech.com',
    phone: '+27 11 101 1003',
    specialty: 'Employment Law & HR Compliance',
    expertise: 'Employment Law & HR Compliance',
    status: 'Busy',
    availability: 'Busy',
    experience: '8 years exp',
    location: 'Durban, KwaZulu-Natal',
  },
  {
    counselId: 'con_104',
    fullName: 'Robert Anderson',
    name: 'Robert Anderson',
    email: 'robert.anderson@legaltech.com',
    phone: '+27 11 101 1004',
    specialty: 'Corporate Law & M&A',
    expertise: 'Corporate Law & M&A',
    status: 'Available',
    availability: 'Available',
    experience: '18 years exp',
    location: 'Pretoria, Gauteng',
  },
  {
    counselId: 'con_105',
    fullName: 'Jennifer Williams',
    name: 'Jennifer Williams',
    email: 'jennifer.williams@legaltech.com',
    phone: '+27 11 101 1005',
    specialty: 'Commercial Contracts & Compliance',
    expertise: 'Commercial Contracts & Compliance',
    status: 'Busy',
    availability: 'Busy',
    experience: '10 years exp',
    location: 'Johannesburg, Gauteng',
  },
  {
    counselId: 'con_106',
    fullName: 'Marcus Rodriguez',
    name: 'Marcus Rodriguez',
    email: 'marcus.rodriguez@legaltech.com',
    phone: '+27 11 101 1006',
    specialty: 'SaaS & Technology Contracts',
    expertise: 'SaaS & Technology Contracts',
    status: 'Available',
    availability: 'Available',
    experience: '6 years exp',
    location: 'Stellenbosch, Western Cape',
  },
  {
    counselId: 'con_107',
    fullName: 'Olivia Zhang',
    name: 'Olivia Zhang',
    email: 'olivia.zhang@legaltech.com',
    phone: '+27 11 101 1007',
    specialty: 'Intellectual Property & IP Law',
    expertise: 'Intellectual Property & IP Law',
    status: 'Available',
    availability: 'Available',
    experience: '14 years exp',
    location: 'Johannesburg, Gauteng',
  },
]

mockState.counselDirectory = defaultAssignableCounsel
defaultAssignableCounsel.forEach((member) => {
  const email = member.email.toLowerCase()
  if (!mockState.counselUsers.has(email)) {
    mockState.counselUsers.set(email, {
      userId: member.counselId,
      fullName: member.fullName,
      email,
      password: 'temporary',
      role: 'counsel',
      portal: 'counsel',
      mustResetPassword: true,
      status: 'active',
      phone: member.phone,
      specialty: member.specialty,
      expertise: member.expertise,
      location: member.location,
      experience: member.experience,
    })
  }
})

// wizardDrafts: Map<userId_wizardType, WizardDraft>
mockState.wizardDrafts = new Map()

const COUNSEL_TIERS = {
  free: { name: 'Free', includedCredits: 0, topUpRate: 550, sla: '—' },
  launchpad: { name: 'Launchpad', includedCredits: 0, topUpRate: 550, sla: '2 business days' },
  operator: { name: 'Operator', includedCredits: 2, topUpRate: 500, sla: '1 business day' },
  boardroom: { name: 'Boardroom', includedCredits: 6, topUpRate: 450, sla: '8 business hours' },
}

function resetCounselCreditsIfDue() {
  // Superseded by per-user logic in syncCounselCreditsForUser — kept for export compat.
  return mockState.smeCredits
}

// Per-user counsel credits — each email gets its own record so accounts
// never overwrite each other's balance.
function syncCounselCreditsForUser(email, activePlanId) {
  const key = String(email || '').trim().toLowerCase()
  const subscriber = mockState.smeUsers.get(key)
  const tier = COUNSEL_TIERS[String(activePlanId || subscriber?.plan || 'free').toLowerCase()] || COUNSEL_TIERS.free

  // Initialise the per-user record on first access
  if (!mockState.smeCreditsByUser.has(key)) {
    const nextReset = new Date()
    nextReset.setUTCMonth(nextReset.getUTCMonth() + 1)
    nextReset.setUTCDate(1)
    mockState.smeCreditsByUser.set(key, {
      plan: tier.name,
      includedCredits: tier.includedCredits,
      creditsTotal: tier.includedCredits,
      creditsUsed: 0,
      creditsRemaining: tier.includedCredits,
      usageThisMonth: 0,
      topUpRate: tier.topUpRate,
      currency: 'ZAR',
      resetDate: nextReset.toISOString().slice(0, 10),
    })
  }

  const credits = mockState.smeCreditsByUser.get(key)

  // Monthly reset if due
  const now = new Date()
  let resetAt = new Date(credits.resetDate + 'T00:00:00.000Z')
  if (!Number.isNaN(resetAt.getTime()) && now >= resetAt) {
    const resetTier = tier || COUNSEL_TIERS[String(credits.plan || '').toLowerCase()] || COUNSEL_TIERS.free
    credits.plan = resetTier.name
    credits.includedCredits = resetTier.includedCredits
    credits.topUpRate = resetTier.topUpRate
    credits.creditsTotal = resetTier.includedCredits
    credits.creditsUsed = 0
    credits.usageThisMonth = 0
    credits.creditsRemaining = resetTier.includedCredits
    do { resetAt.setUTCMonth(resetAt.getUTCMonth() + 1) } while (resetAt <= now)
    credits.resetDate = resetAt.toISOString().slice(0, 10)
  }

  // If the user's subscription plan changed, re-sync included credits
  // but preserve any top-up buffer accumulated above the included amount.
  if (credits.plan !== tier.name) {
    const topUpBuffer = Math.max(0, credits.creditsRemaining - credits.includedCredits)
    credits.plan = tier.name
    credits.includedCredits = tier.includedCredits
    credits.topUpRate = tier.topUpRate
    credits.creditsTotal = tier.includedCredits + topUpBuffer
    credits.creditsRemaining = tier.includedCredits + topUpBuffer
  }

  return credits
}

// Subscription changes are an entitlement reset, not a credit top-up. Keep this
// per account so one user's upgrade cannot change any other user's balance.
function setCounselTierForUser(email, planId) {
  const key = String(email || '').trim().toLowerCase()
  const tier = COUNSEL_TIERS[String(planId || 'free').toLowerCase()] || COUNSEL_TIERS.free
  const nextReset = new Date()
  nextReset.setUTCMonth(nextReset.getUTCMonth() + 1, 1)
  const credits = {
    plan: tier.name,
    includedCredits: tier.includedCredits,
    creditsTotal: tier.includedCredits,
    creditsUsed: 0,
    creditsRemaining: tier.includedCredits,
    usageThisMonth: 0,
    topUpRate: tier.topUpRate,
    currency: 'ZAR',
    resetDate: nextReset.toISOString().slice(0, 10),
  }
  mockState.smeCreditsByUser.set(key, credits)
  return credits
}

module.exports = { mockState, COUNSEL_TIERS, resetCounselCreditsIfDue, syncCounselCreditsForUser, setCounselTierForUser }
