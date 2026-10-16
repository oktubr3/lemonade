// Suggests which vault entry an authenticator account belongs to. Only a
// suggestion: the import screen shows it and the user can change it.

const normalize = (text) => String(text || '').toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9@.]+/g, ' ').trim()

const hostOf = (url) => {
  try {
    return new URL(/^[a-z]+:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

// "Google" matches "Gmail personal"? No. "GitHub" matches "GitHub (work)" and github.com.
function issuerMatches (issuer, entry) {
  const wanted = normalize(issuer)
  if (!wanted) return false
  const title = normalize(entry.title || entry.name)
  const host = normalize(hostOf(entry.url || ''))
  const firstWord = wanted.split(' ')[0]
  return (title && (title.includes(wanted) || wanted.includes(title))) ||
    (host && (host.split('.').includes(firstWord) || host.includes(wanted.replace(/ /g, ''))))
}

const usernameMatches = (name, entry) =>
  !!name && normalize(name) === normalize(entry.username)

// Returns the id of the best entry, or null when nothing (or more than one
// equally good entry) fits. An entry already claimed by another account of the
// same import is skipped: two 2FA secrets cannot go to one entry.
export function suggestEntry (account, entries, taken = new Set()) {
  const candidates = entries.filter((entry) => !taken.has(entry.id))
  const both = candidates.filter((entry) => issuerMatches(account.issuer, entry) && usernameMatches(account.name, entry))
  if (both.length === 1) return both[0].id
  if (both.length > 1) return null
  const byIssuer = candidates.filter((entry) => issuerMatches(account.issuer, entry))
  if (byIssuer.length === 1) return byIssuer[0].id
  const byName = candidates.filter((entry) => usernameMatches(account.name, entry))
  if (!account.issuer && byName.length === 1) return byName[0].id
  return null
}

export function suggestAll (accounts, entries) {
  const taken = new Set()
  return accounts.map((account) => {
    const id = account.supported === false ? null : suggestEntry(account, entries, taken)
    if (id) taken.add(id)
    return id
  })
}
