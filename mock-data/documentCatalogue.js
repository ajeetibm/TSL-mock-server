/**
 * TSL Document Catalogue — the sole source of truth for Blueprint units.
 * Prices/entitlements must never define or duplicate individual document cost.
 */
const documentCatalogue = [
  ['name-reservation', 'Name Reservation', 1, 'cipc-submission'],
  ['nda', 'Non-Disclosure Agreement (NDA)', 1, 'final-download'],
  ['board-resolution', 'Board Resolution', 1, 'final-download'],
  ['demand-letter', 'Demand Letter', 1, 'final-download'],
  ['share-certificate', 'Share Certificate', 1, 'final-download'],
  ['registered-address-change', 'Registered Address Change', 1, 'cipc-submission'],
  ['financial-year-end-change', 'Financial Year End Change', 1, 'cipc-submission'],
  ['moa', 'Memorandum of Agreement', 2, 'final-download'],
  ['aod', 'Acknowledgement of Debt', 2, 'final-download'],
  ['employment-offer-letter', 'Employment Offer Letter', 2, 'final-download'],
  ['fixed-term-employment', 'Fixed-term Employment Contract', 2, 'final-download'],
  ['founder-employment', 'Founder Employment Contract', 2, 'final-download'],
  ['contractor-agreement', 'Contractor Agreement', 2, 'final-download'],
  ['influencer-agreement', 'Influencer Agreement', 2, 'final-download'],
  ['director-filing', 'Director Filing', 2, 'cipc-submission'],
  ['privacy-policy', 'Privacy Policy', 2, 'final-download'],
  ['cookies-policy', 'Cookies Policy', 2, 'final-download'],
  ['minor-moi', 'Minor MOI Amendment', 2, 'cipc-submission'],
  ['other-moi', 'Other MOI Amendment', 3, 'cipc-submission'],
  ['moi', 'Memorandum of Incorporation', 3, 'final-download'],
  ['employment-pack', 'Employment Contract Pack', 3, 'final-download'],
  ['hr-manual', 'HR Manual', 3, 'final-download'],
  ['popia-starter-kit', 'POPIA Starter Kit', 3, 'final-download'],
  ['software-development-agreement', 'Software Development Agreement', 3, 'final-download'],
  ['service-level-agreement', 'Service Level Agreement (SLA)', 3, 'final-download'],
  ['company-registration', 'Company Registration', 4, 'cipc-submission'],
  ['founders-agreement-ip', 'Founders Agreement and IP Assignment', 4, 'final-download'],
  ['shareholders-agreement', 'Shareholders Agreement', 6, 'final-download'],
].map(([blueprintId, name, blueprintUnitWeight, consumptionPoint]) => ({ blueprintId, name, blueprintUnitWeight, consumptionPoint }))

// Legacy UI names resolve to a catalogue id; their weights never live here.
const aliases = {
  employment: 'employment-offer-letter',
  'founder-agreement': 'shareholders-agreement',
  'service-agreement': 'contractor-agreement',
  'company-registration-package': 'company-registration',
  'shareholder-resolutions': 'board-resolution',
  'data-processing-agreement': 'contractor-agreement',
}

function normalise(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function getBlueprint(value) {
  const key = aliases[normalise(value)] || normalise(value)
  return documentCatalogue.find((blueprint) => blueprint.blueprintId === key) || null
}

module.exports = { documentCatalogue, getBlueprint }
