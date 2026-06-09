# Lemonade Password Manager — Security Architecture

## Encryption Model

### Main Vault (password entries, secure notes, TOTP)
Encrypted **server-side** using AES-256-GCM. The encryption key is stored in Firebase Secret Manager and accessed exclusively by Cloud Functions. The client never receives raw passwords in the API — only decrypted values for display, fetched per-request with a valid auth token.

**Implication:** Lemonade is *not* a zero-knowledge service for the main vault. A compromise of the Cloud Functions deployment, Secret Manager, or the GCP project could expose user passwords. Users with high confidentiality requirements should use the Env Vault.

### Env Vault (environment variables)
True **client-side E2EE**. The master password never leaves the browser.

- Key derivation: PBKDF2-SHA256 (600,000 iterations) + HKDF domain separation
  - `encKey = HKDF(PBKDF2(password, salt), info="lemonade-enc-v1")`
  - `verifier = HKDF(PBKDF2(password, salt), info="lemonade-ver-v1")`
- Encryption: AES-256-GCM per variable, random IV
- The server stores only ciphertext and a HKDF-derived verifier — the AES key cannot be derived from the verifier

## Authentication
- Firebase Authentication (Google OAuth)
- WebAuthn / passkeys supported
- Session tokens validated server-side on every Cloud Function call

## Security Controls

### Firestore Rules
- `password_entries`, `secure_notes`, `shared_passwords`, `webauthn_*`: client writes blocked entirely (Cloud Functions only)
- Env Vault collections: owner-only read/write, `userId` field immutable on update

### Rate Limiting
- Sensitive endpoints (decrypt, share, admin, HIBP): Firestore-backed global rate limiting across all Cloud Run instances
- CRUD operations: in-memory per-instance limiting (first line of defense)

### HTTP Security Headers
- HSTS, X-Content-Type-Options, Referrer-Policy, COOP
- CSP: `unsafe-eval` removed; `frame-ancestors 'self'`; `unsafe-inline` retained (required by Vue 3 + Quasar runtime)

### Browser Extensions
- OAuth state parameter validation (CSRF protection)
- Session storage scoped to `TRUSTED_CONTEXTS` only
- Autofill validates domain match before injecting credentials

## Known Limitations

| Area | Status |
|------|--------|
| Main vault zero-knowledge | Not implemented — server holds encryption keys |
| CSP `unsafe-inline` | Required by Vue 3/Quasar; no XSS vectors identified |
| Refresh tokens in extension `storage.local` | Persisted for session continuity. The extension does not implement auto-lock; a compromised browser profile can access the stored token. Accepted trade-off — exploitation requires local access to the browser profile. |
| PBKDF2 (not Argon2id) | Browser Web Crypto API does not support Argon2; PBKDF2-600k is the current standard |
| Emergency contact email enumeration | The emergency-access endpoint returns `active` vs `invited` status, which reveals whether an email has a Lemonade account. Accepted trade-off — the endpoint requires authentication, and full account enumeration is constrained by the persistent rate limiter. |
| Main vault server-side encryption | The main vault (passwords, notes, TOTP) uses server-side AES-256-GCM. The encryption key lives in Firebase Secret Manager. A compromise of Cloud Functions or the GCP project could expose vault data. Migrating to client-side zero-knowledge is a multi-month architectural project. Accepted trade-off — documented explicitly; users requiring zero-knowledge should use Env Vault. |
| CSP `unsafe-inline` for scripts | The Quasar/Vite build runtime injects inline scripts; removing `unsafe-inline` would break the PWA. Compensating controls: Vue 3 auto-escapes all template output; no user-controlled `v-html`; `frame-ancestors`, `object-src none`, and `base-uri self` limit post-XSS blast radius. |

## Responsible Disclosure

If you find a security vulnerability, open a private GitHub Security Advisory at:
https://github.com/oktubr3/lemonade/security/advisories/new
