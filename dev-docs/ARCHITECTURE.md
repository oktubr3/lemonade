# Architecture Overview

> **Status:** Draft. Expanded as the open-source codebase stabilizes.

This document describes how Lemonade is put together, the boundaries that matter for security, and the trade-offs that shape the design. The intended reader is a contributor or auditor who needs context before changing a public interface or evaluating the security posture.

For the security model specifically, see [`../SECURITY.md`](../SECURITY.md). This document is the broader engineering view.

## Stack

| Layer | Technology |
|---|---|
| Frontend (PWA) | Quasar Framework v2 / Vue 3 (Composition API), Pinia, i18n |
| Service worker | Workbox (InjectManifest mode), custom update-notification flow |
| Backend | Firebase Cloud Functions (Node 22, plain JS) |
| Database | Cloud Firestore (production mode rules) |
| Auth | Firebase Authentication (Google OAuth, WebAuthn / passkeys) |
| Secrets | Firebase Secret Manager (server-side only) |
| Billing (hosted) | Polar.sh (subject to change — see plan) |
| Browser extensions | Chrome MV3 (Service Worker), Firefox MV3 (Background Scripts) |

## Repository layout

```
/                            repo root, pnpm workspace
├── src/                     PWA (Vue components, pages, composables, stores)
├── functions/               Cloud Functions (npm workspace, separate package.json)
├── lemonade-chrome-extension/   Chrome MV3 extension
├── lemonade-firefox-extension/  Firefox MV3 extension
├── src-pwa/                 PWA-specific (service worker, manifest)
├── docs/                    Firebase Hosting target (public site, NOT dev docs)
├── dev-docs/                Developer / contributor documentation (this file lives here)
├── firestore.rules          Firestore security rules
├── firestore.indexes.json   Firestore composite indexes
└── quasar.config.cjs        Quasar build configuration
```

## Encryption model

There are **two distinct vaults** with different threat models:

1. **Main vault** (passwords, secure notes, TOTP seeds) — server-side AES-256-GCM. The encryption key lives in Firebase Secret Manager and is only accessible to Cloud Functions. Lemonade is **not zero-knowledge** for the main vault. The trade-off is documented and intentional; see `SECURITY.md`.
2. **Env Vault** (environment variables) — client-side end-to-end encryption. Key derived from the user's master password via PBKDF2-SHA256 (600k iterations) plus HKDF domain separation. The server stores ciphertext and a verifier; it cannot decrypt the values. This is the path for users who require true zero-knowledge.

Why two models? Main vault entries are used in places where server-side automation matters (sharing, autofill APIs, emergency access). Env Vault values are read by the user only, so the extra UX cost of remembering a master password is acceptable.

## Authentication and session flow

1. Client signs in with Google OAuth via Firebase Auth (or with a passkey via WebAuthn).
2. Firebase Auth issues an ID token; the client attaches it to every Cloud Function call.
3. Cloud Functions validate the ID token, look up the user's role in Firestore (`users/{uid}.role`), and authorize the request.
4. Browser extensions perform the OAuth handoff in a popup, exchange the token, and store a refresh token in `storage.local`. The extension does not auto-lock today; see the Known Limitations in `SECURITY.md`.

## Cloud Functions surface

Functions are organized by domain. Approximate categories at the time of writing:

| Category | Examples |
|---|---|
| Password CRUD | `createPasswordEntry`, `updatePasswordEntry`, `deletePasswordEntry`, `decryptPasswordEntry` |
| Secure notes / TOTP | `createSecureNote`, `decryptSecureNote`, `createTotpEntry` |
| Sharing | `sharePasswordEntry`, `acceptSharedPassword`, `revokeShare` |
| WebAuthn | `webauthnGetRegistrationOptions`, `webauthnVerifyRegistration`, `webauthnGetAuthenticationOptions`, `webauthnVerifyAuthentication` |
| Emergency access | `inviteEmergencyContact`, `requestEmergencyAccess`, `grantEmergencyAccess` |
| Env Vault | (no server-side decryption — only ciphertext storage and metadata) |
| Admin | `adminGetUsers`, `adminUpdateUser`, `blockUser`, `unblockUser` |
| Billing (subject to change) | `createCheckoutUrl`, `getCustomerPortalUrl`, `handlePolarWebhook`, `getUserRoleHttp` |
| Tickets / support | `createTicket`, `updateTicket`, `closeTicket` |
| Audit | `getAuditLogs` |

A full inventory is generated at build time; see `functions/index.js`.

## Data model summary

Top-level Firestore collections:

| Collection | Purpose |
|---|---|
| `users` | Profile, role (`user` / `lifetime_hosted` / `founder` / `admin`), settings |
| `password_entries` | Encrypted main vault entries (server-side AES) |
| `secure_notes` | Encrypted notes |
| `totp_entries` | Encrypted TOTP seeds |
| `shared_passwords` | Sharing graph + ciphertext-per-recipient |
| `env_projects`, `env_variables`, `env_context_files` | Env Vault E2EE data |
| `emergency_contacts` | Emergency access invitations and grants |
| `webauthn_challenges` | Short-lived WebAuthn challenges |
| `webauthn_credentials` | Registered passkeys per user |
| `rate_limits` | Distributed rate-limiter buckets |
| `audit_logs` | Server-side audit trail of sensitive operations |
| `blocked_users` | Admin block list |
| `tickets` | Support tickets (hosted only) |

Document-level access is enforced by `firestore.rules`. For the most sensitive collections (`password_entries`, `secure_notes`, `shared_passwords`, `webauthn_*`), **all client writes are blocked**; only Cloud Functions (running with admin privileges) can mutate them.

## Browser extensions

Both extensions are MV3. They share the same authentication primitives (OAuth via the host browser identity API) and the same autofill heuristics, but differ in runtime:

| Aspect | Chrome | Firefox |
|---|---|---|
| Background context | Service Worker | Background Scripts |
| API namespace | `chrome.*` | `browser.*` (native Promises) |
| OAuth redirect domain | `chromiumapp.org` | `extensions.allizom.org` |
| Manifest signing | `key` field (Chrome Web Store) | `browser_specific_settings.gecko` |

For self-hosters, the published extensions in the Chrome Web Store and Firefox Add-ons point at the official hosted backend. Pointing them at a self-hosted backend currently requires loading the extension unpacked and patching the backend URL — making the URL configurable is a planned follow-up.

## PWA update notification

Lemonade is a password manager, so security updates must reach all users quickly. The update flow is:

1. The new service worker is downloaded in the background.
2. It enters `waiting` state without activating.
3. The `register-service-worker` package fires the `updated(reg)` callback.
4. A Quasar Dialog asks the user to update now or snooze 30 minutes.
5. On accept, a `SKIP_WAITING` message activates the new SW and reloads.

> **Do not bypass this flow.** Calling `self.skipWaiting()` at the top of the custom service worker, or adding a `controllerchange → reload` handler, will silently update users without consent. This breaks the security guarantee that users decide when to take an update.

## Versioning

- App PWA: semantic versioning, patch bump on every build via `version.sh`.
- Extensions: independent semver per extension. Currently `lemonade-chrome-extension@1.1.x` and `lemonade-firefox-extension@1.1.x`.

## Known constraints

- **Firebase coupling.** The current architecture assumes Firebase. Migration to a backend-agnostic stack (e.g. PostgreSQL + a generic Functions-as-a-Service runtime) is a multi-month project and is not on the immediate roadmap.
- **`unsafe-inline` in CSP.** Required by the Vue 3 + Quasar runtime. Compensating controls are documented in `SECURITY.md`.
- **No mobile native apps.** The PWA is the only client; native iOS/Android apps are not currently in scope.

## Future work

The following items are tracked as candidates for future work but are not commitments:

- Backend-agnostic deployment option (PostgreSQL backend)
- Argon2id key derivation once the Web Crypto API supports it
- Multi-instance federation for sharing between self-hosted instances
- Configurable backend URL in published browser extensions
- Mobile native apps
