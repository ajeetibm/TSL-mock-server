/**
 * Mock CIPC name register and restricted-word checks for Blueprint 10.1.
 * Production: replace with the live CIPC name-search API.
 */

const RESTRICTED_PHRASES = [
  'reserve bank',
  'sars',
  'bank',
  'national',
  'government',
  'municipal',
]

/** Names already on the mock register. Matched after normalisation. */
const REGISTERED_NAMES = [
  'SUNRISE HOLDINGS',
  'ACME TRADING',
  'BLUE SKY VENTURES',
  'THE STARTUP LEGAL',
]

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeName(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[().,'"/\\-]/g, ' ')
    .replace(/\b(PTY|LTD|LIMITED|PROPRIETARY|INC|INCORPORATED)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function findRestrictedWords(name) {
  const source = String(name || '')
  if (!source.trim()) return []
  const lower = source.toLowerCase()
  return RESTRICTED_PHRASES.filter((phrase) => new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'i').test(lower))
}

function isExactDuplicate(name) {
  const normalized = normalizeName(name)
  if (!normalized) return false
  return REGISTERED_NAMES.some((entry) => normalizeName(entry) === normalized)
}

function checkProposedName(name) {
  const restrictedWords = findRestrictedWords(name)
  const duplicate = isExactDuplicate(name)
  return {
    name: String(name || '').trim(),
    restricted: restrictedWords.length > 0,
    restrictedWords,
    duplicate,
  }
}

module.exports = {
  RESTRICTED_PHRASES,
  REGISTERED_NAMES,
  normalizeName,
  findRestrictedWords,
  isExactDuplicate,
  checkProposedName,
}
