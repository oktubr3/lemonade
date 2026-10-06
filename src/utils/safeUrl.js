/**
 * Safe URL utilities - only http(s) values may become a navigation.
 * Stored and shared entries can carry schemes like `javascript:` or `data:`,
 * so anything that reaches window.open must go through toSafeHttpUrl first.
 */

// RFC 3986 scheme: a letter followed by letters, digits, "+", "-" or "."
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i

/**
 * Returns a normalized absolute http(s) URL string, or null if the value
 * is empty, unparseable or uses any other scheme.
 * "example.com" (no scheme at all) is treated as "https://example.com".
 */
export const toSafeHttpUrl = (value) => {
    if (typeof value !== 'string') return null
    // Strip control chars and whitespace the URL parser would also ignore
    const trimmed = value.replace(/[\u0000-\u001F\u007F]/g, '').trim()
    if (!trimmed) return null

    // "host:port/path" looks like a scheme to the regex; only prepend
    // https:// when there is no scheme, otherwise let the parser decide
    const candidate = SCHEME_RE.test(trimmed) && !/^[^:/]+:\d+(\/|$)/.test(trimmed)
        ? trimmed
        : `https://${trimmed}`

    let parsed
    try {
        parsed = new URL(candidate)
    } catch {
        return null
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    if (!parsed.hostname) return null
    return parsed.href
}
