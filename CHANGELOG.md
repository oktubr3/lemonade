# Changelog

## v2.2.23 — A test suite that can actually fail (2026-10-06)

### Fixed
- **Searching for `c++` (or any regex metacharacter) broke the list.** The
  relevance scorer interpolated the raw search term into a `RegExp` for its
  whole-word bonus, so a term like `c++` built `/\bc++\b/` — not a valid
  expression. It threw instead of returning a score, and because the scoring
  runs inside the computed that renders the list, the list broke rather than
  simply not matching. It only triggered when the term also appeared in an
  entry, which is what kept it hidden. The term is now escaped. Reachable from
  the search box on Passwords, Env Vault and Notes.

### Testing
- **`npm test` no longer reports a false green.** It was
  `echo "No test specified" && exit 0`: it passed whatever the state of the
  code, which made a green CI meaningless. It now runs Vitest — 44 unit tests
  over `safeUrl` and `searchUtils`, including the metacharacter regression
  above and the `javascript:` / `data:` / `file:` rejections that keep a stored
  URL from becoming script execution.
- **Unit tests run in CI** on every pull request and push to `main`, between
  lint and build. The Firestore rules suite still needs the emulator and Java,
  so it stays on `test:rules` for now.

## v2.2.22 — The password list no longer comes up empty (2026-10-05)

### Fixed
- **Empty list after signing in.** `IndexPage` fetched the entries on mount
  with `fetchEntries(auth.currentUser.uid)`. The store takes no argument, so
  that `.uid` read did nothing except throw if `currentUser` was null — and the
  `catch` was empty, so the list stayed empty with nothing in the console.
  Leaving the page and coming back remounted the component and refilled it,
  which is why it looked intermittent. The empty `catch` also destroyed the
  evidence, so the exact throw is not recoverable: the likeliest candidate is
  the first Firestore read racing a freshly minted ID token. The load now waits
  for `auth.authStateReady()`, retries once, and reports a real error with a
  Retry action if it still fails — so a next occurrence is diagnosable.
- **One failed load no longer takes the rest of the page with it.** The entries
  fetch was the first `await` of a single `try`, so its failure also skipped
  the user settings, the three `window` listeners, the share registration and
  the pending shared passwords. The listeners are now registered before any
  `await`, and the independent loads run under `Promise.allSettled` so each one
  fails on its own and gets logged.

## v2.2.21 — Fix the role listener broken in 2.2.19 (2026-09-22)

### Fixed
- **`ReferenceError: fetchUserRole is not defined` on every sign-in.** The
  dedupe in v2.2.19 pointed the module-level auth-state listener at
  `fetchUserRole`, which lives inside `useAdmin()`. The listener threw instead
  of refreshing the role, so after a user switch the admin menu only appeared
  after a remount. The role helpers now live at module scope, where the
  listener can reach them.
- **No more `Error fetching user role: User not authenticated` while signed
  out.** With no session there is nothing to ask for: `fetchUserRole()` returns
  the default role instead of throwing, so the login screen's console stays
  clean.

## v2.2.20 — Last of the startup round trips (2026-09-22)

### Performance
- **`getOpenTicketsCountHttp` is requested once.** `MainLayout` asked for it in
  `onMounted` right after resolving the role, and an `isAdmin` watcher asked
  again when that same resolution flipped the flag. The watcher is now the only
  caller, with `immediate: true` so a remount with a known role still updates
  the badge.
- **Warmer at 17 targets:** added `getPendingSharedPasswordsHttp` and
  `getOpenTicketsCountHttp`, the last two calls of the first screen that could
  still hit a cold container.

## v2.2.19 — One role fetch per load (2026-09-22)

### Performance
- **`getUserRoleHttp` is called once per app load instead of twice.** Verified
  in the browser right after the v2.2.18 deploy: `MainLayout.fetchUserRole()`
  and the `useAdmin` auth-state listener each fired their own request as soon
  as the session resolved. `fetchUserRole()` is now the single entry point; it
  joins the in-flight request and skips the call when the role for the current
  uid is already loaded. Removed the now-dead `refetchRoleForCurrentUser`.

## v2.2.18 — Cold starts and duplicate calls on the way in (2026-09-22)

Measured from production logs during a real passkey registration and sign-in.
No errors: the delay was cold starts and redundant requests.

### Performance
- **The passkey path is kept warm.** `webauthnVerifyAuthenticationHttp` — the
  call that mints the session on every passkey sign-in — was not in the
  scheduled warmer and ran ~10s cold. The registration pair (~11s + ~15s) was
  missing too. The client-side warmup cannot help: it runs after login, these
  run before it.
- **The app startup path is kept warm.** `getUserRoleHttp` (every app load) and
  `registerUserHttp` (login) were also missing. The warmer went from 10 to 15
  targets.
- **`registerUserHttp` is called once per session instead of six times.** The
  login page called it on sign-in and again from its auth-state listener, and
  the index page called it on every mount; each call was a Firestore write on
  the critical path. `src/utils/registerUser.js` now caches the result per uid,
  collapses concurrent calls, and clears itself on sign-out.

### Infrastructure (no code change)
- `maxInstances: 20` on the two unauthenticated WebAuthn endpoints.
- Firestore TTL policy on `webauthn_challenges.expiresAt`.

## v2.2.17 — Security audit fixes (2026-09-22)

Result of a full source audit (sandboxed, source-and-local only). All server
fixes take effect on deploy; no client update is needed for them.

### Security
- **Identity is no longer resolved from `users.email`.** That profile field was
  client-writable and was used to pick emergency-access trustees, share
  recipients, admin roles and the Polar billing fallback. People are now
  resolved through Firebase Auth with a verified email, `email` is no longer a
  client-writable key in the rules, and emergency-access authorization requires
  a verified email that matches the grant and its bound uid (which also voids
  any binding made the old way).
- **Email-based admin gates require `email_verified`.** `migrateUserRolesHttp`
  derives admin from the Auth record and keeps paid and founder roles instead of
  resetting them. The primary-admin guard reads the Auth record too, and now
  also refuses disabling or locking the primary admin.
- **Emergency-access transitions are atomic.** Request, approve, deny, revoke
  and the hourly auto-approve run in Firestore transactions, so a revoke or
  deny can no longer be overwritten by a concurrent transition. A request
  without `requestedAt` is never auto-approved.
- **Suspend, disable and lock are enforced.** `adminUpdateUserHttp` disables the
  Firebase Auth user and revokes its refresh tokens (and re-enables it when the
  resulting state is clear).
- **Support tickets:** the admin view, replying as Support and closing other
  users' tickets are limited to role `admin`; `founder` no longer grants them.
- **Polar webhook:** no fallback to the buyer-supplied customer email when
  `metadata.user_id` is missing, and billing events never overwrite the `admin`,
  `founder` or `suspended` roles.
- **Firestore rules:** removed the unrestricted admin `update` on `users/*` (all
  admin writes go through `adminUpdateUserHttp`), and no new plaintext
  `contentPreview` can be written to `env_context_files`.
- **Env Vault is zero-knowledge again for AI context files.** The first 150
  characters of files such as `.mcp.json` were stored in plaintext as a
  preview. The preview is now decrypted locally after unlock, and existing
  plaintext previews are removed on the next unlock.
- **URLs:** stored entry URLs must be `http(s)` (server) and only `http(s)` URLs
  are opened from the vault (client), since entries are shared between users.
- **WebAuthn:** unauthenticated `userId` is type- and size-checked, the origin is
  validated before any rate-limit write, and verify adds a per-IP bucket that
  cannot be bypassed by varying `userId`. `purgeEphemeralDocs` drains its
  backlog instead of stopping at 2000 documents.
- **Browser extensions (Chrome 1.1.4, Firefox 1.1.5):** save/update capture
  ignores script-dispatched events, and the injected autofill and save UI
  ignores clicks unless it is genuinely visible, unobscured and has been shown
  for 500 ms.

### Added
- Rules tests for `users/{uid}` (server-owned email, no direct admin writes) and
  for the `contentPreview` restriction. The suite now honours
  `FIRESTORE_EMULATOR_HOST`, so it runs when port 8080 is taken.

## v2.2.16 — Env Vault write fix (2026-07-16)

### Fixed
- **Env Vault writes were rejected in production.** The rules hardening in
  v2.2.x validated `encryptedValue` / `encryptedContent` as `is string`, but
  the app has always stored them as `{encrypted, iv}` maps. Every write to
  `env_variables` and `env_context_files` failed with "Missing or insufficient
  permissions" — updating or merging a project was impossible. Rules now
  validate the real blob shape (map with hex `encrypted` + `iv`, size-bounded)
  and still reject strings, malformed blobs and extra keys.
- **Key migrations could never complete.** `upgradeToHkdfKeys`,
  `upgradeKdfIterations` and `changeMasterPassword` rotated the salt, which the
  rules make immutable — so the batch was denied. The salt is now reused; HKDF
  already domain-separates the encryption key from the verifier, so a new salt
  was never needed.
- **Undecryptable AI context files aborted the migration.** Context files were
  excluded from key migrations until May 2026, leaving vaults migrated before
  then with files encrypted under a lost key. A single `OperationError` from one
  of them aborted the whole migration, so the vault never reached verifier v3.
  They are now skipped with a warning instead.

### Added
- `pnpm run test:rules` — Firestore rules tests covering Env Vault writes, salt
  immutability, blob validation and cross-user isolation. Rules compilation
  passes regardless of whether real documents can be written; only these tests
  catch that.

## v2.2.15 — Open source release (2026-06-09)

This release ships Lemonade as a public AGPLv3 project. The hosted product at
`lemonadepass.com` is unchanged for current users; the change is structural —
the codebase moves from private to [oktubr3/lemonade](https://github.com/oktubr3/lemonade).

### Business model
- One-time US$ 29 lifetime hosted account replaces the prior $2.99/mo
  subscription. "Lifetime" means while the project exists; if the hosted
  service shuts down, data exports cleanly and the OSS code is yours to
  self-host.
- Self-host is free on a Firebase project of your own. No feature gating
  between self-host and hosted — same code, same features.
- Payment platform migrated from Lemon Squeezy to Polar one-time products.
- Legacy subscription users keep their access; the `welcomePremium` /
  `manageSubscription` Stripe-style portal stays available for them.

### Open source plumbing
- AGPLv3 LICENSE, CONTRIBUTING, CODE_OF_CONDUCT, CLA, SECURITY policy.
- `dev-docs/ARCHITECTURE.md`, `dev-docs/SELF_HOSTING.md`, and operational
  `dev-docs/INCIDENT_RESPONSE.md` playbook.
- CLA Assistant signing required on first contribution.
- GitHub Security stack enabled at flip: Dependabot alerts + automated
  security updates, CodeQL default setup (JS/TS), Secret Scanning with push
  protection, branch protection on `main` (enforce admins, no force-push,
  no deletions, require PR).

### Firestore rules hardening (pre-flip audit)
- Salt in `env_vault_settings` is immutable after creation. Master password
  rotation must go through a Cloud Function that re-encrypts atomically.
- `kdfIterations` can only increase. Users can strengthen PBKDF2 work factor
  but never weaken it.
- Type and size limits on user-writable string fields across `users` and
  `env_*` collections to bound storage abuse.
- Backup of Firestore captured to
  `gs://passmanager-d2b6d-firestore-backups/pre-oss-flip-20260608-214757`
  before the flip.

### Cleanup
- Removed `usePremiumUpsells`, `FREE_PASSWORD_LIMIT` gates, and all paywall
  UI from the client.
- Renamed `useSubscription` → `useEntitlements`, `SettingsSubscription.vue`
  → `SettingsAccount.vue`.
- 10 deprecated Secret Manager versions disabled (`LEMONSQUEEZY_*`,
  `LEGACY_CLIENT_KEY`, `LEGACY_ENCRYPTION_KEY`, `ORIGINAL_CLIENT_KEY`).
- Deleted `src-capacitor/` — Capacitor mobile wrapper not actively distributed,
  resolves 15 transitive Dependabot alerts and removes 157 MB of source.

### Security fixes
- `functions/index.js sanitizeInput`: iterative HTML-tag stripping closes
  nested-pattern bypass (`<scr<script>ipt>` → `<script>` after single-pass).
  Vue 3 already auto-escapes template output; this is defense in depth.
- Browser extensions `getIconForUrl`: replace substring `url.includes('x.com')`
  with hostname suffix-match against the parsed URL. Prevents brand-emoji
  matching against attacker-controlled paths like `evil.x.com.attacker.com`.
- Updated `axios` to ≥1.16.0 (6 high-severity CVEs) and
  `@babel/plugin-transform-modules-systemjs` to ≥7.29.4 (arbitrary code
  generation on malicious input).

### Internationalization
- All 10 PWA locales aligned with the OSS lifetime model.
  `Premium/Subscription/Free` framing removed where it implied gated features.
  Prices in upgrade CTAs updated from `$2.99/mo` to `US$ 29 lifetime`.
- Landing (`lemonadepass.com`) and docs site (`docs.lemonadepass.app`)
  consolidated to a two-card pricing layout (Self-host / Hosted $29 lifetime)
  across 8–10 languages each.

### Bug fixes carried in this release
- `vue-i18n` v11 strictness: `useI18n()` and `useQuasar()` moved to top-of
  `<script setup>` in `SettingsAccount.vue`. v11 throws
  `SyntaxError code 26 (MUST_BE_CALL_SETUP_TOP)` when these hooks are called
  inside `onMounted` or after an async `import('vue-i18n')`.
- Admin state survives across sign-out: `useAdmin.js` now subscribes to
  `onAuthStateChanged` and clears module-level refs when UID changes.
- Post-payment UI race: `useEntitlements` now uses `onSnapshot(users/{uid})`
  instead of a 2-second `setTimeout`. The Polar webhook updates the role
  before the snapshot fires, eliminating the prior race window.

## v2.2.4 (2026-04-18)

### Performance
- Consolidated the per-store `document.addEventListener('visibilitychange', ...)` pattern into a shared `src/utils/appResumeListeners.js` helper. The DOM now carries a single global listener that fan-outs to subscribed callbacks, regardless of how many stores exist. Idempotent under HMR
- Added `font-display: swap` override for the locally-bundled Roboto face (prevents FOIT while the woff downloads) and `font-display: block` for Material Icons (avoids fallback text flashing)
- Added `preconnect` hints for `firestore.googleapis.com` and `identitytoolkit.googleapis.com`, and `dns-prefetch` for `securetoken.googleapis.com`, `cloudfunctions.net` and `cloud.umami.is`. Cuts DNS+TCP+TLS off the critical path for the first auth and Firestore request

## v2.2.3 (2026-04-18)

### Performance
- PWA icon assets optimized with pngquant (quality 85-95) + oxipng lossless pass: 1.3 MB → 605 KB (-54%). maskable-icon-512x512 went from 293 KB to 20 KB (-93%), icon-1024x1024 from 203 KB to 52 KB (-75%)
- Env Vault batch crypto parallelized across all bulk operations: sequential `for/await` replaced with `Promise.all` so Web Crypto operations pipeline through the native layer
  - `changeMasterPassword`: decrypt N + re-encrypt N (was O(N) serial)
  - `exportProjectAsEnv`: decrypt N variables
  - `importProjects`: encrypt all variables and AI context files
  - `mergeProject`: encrypt incoming variables and AI context files
  - `addVariablesToFile`: encrypt new variables

## v2.2.2 (2026-04-18)

### Performance
- PBKDF2 (100k iter SHA-256) moved to a Web Worker so unlocking, setting up or changing the Env Vault master password no longer blocks the UI (~200-500ms on mobile)
- Worker derives raw 256 bits that the main thread imports as an AES-GCM CryptoKey (fast path, ~microseconds)
- Transparent fallback to main-thread derivation if module workers are not supported
- lemonade.png (43KB, 200x200 RGBA) replaced with lemonade.webp (6.1KB) — 85% size reduction, same visual
- Updated references in MainLayout, BiometricLockScreen, LemonadeLoader and LoginPage

## v2.2.1 (2026-04-17)

### Performance
- Vite manualChunks: split Firebase (firestore/auth/core/functions), Quasar, Vue core, i18n, qr-scanner and webauthn into separate chunks for better HTTP/2 parallelism and browser caching
- Updates now redownload only app chunks (20-40KB gzip) instead of the whole vendor bundle (108KB gzip)
- Async components for heavy dialogs in IndexPage: PasswordEntryForm, PasswordPreviewDialog, SharePasswordDialog, TrashSection, PendingSharesSection now load on demand
- Password search: 150ms debounce + precomputed normalized text cache (WeakMap) avoids re-normalizing 179+ entries per keystroke
- Replaced sortByRelevance import path with fast-path matchesNormalized helper
- requestAnimationFrame throttle on window resize handler (recalcScrollHeight)
- Lazy loading + async decoding on non-critical avatar images (admin, settings, shared users)

## Extensions v1.1.0 (2026-03-01)

### Features
- Form submit interception: detects login/registration forms and offers to save credentials
- Save toast with editable title and username fields
- "Never for this site" permanent dismiss option per domain
- Smart update detection: only prompts when password actually changed
- Vuetify 2 hidden input value extraction for framework-heavy sites

### Fixes
- Filter out soft-deleted credentials from extension queries
- Exact hostname matching for subdomain distinction (app.example.com vs dashboard.example.com)
- SPA support: handle type="button" inside forms (common in Vuetify/Material UI)
- Session storage access for content scripts via setAccessLevel
- Pending credential toast limited to same hostname only

## v2.2.0 (2026-02-21)

### Refactor
- Decomposed IndexPage.vue monolith (4,892 → 1,248 lines, 75% reduction)
- Extracted 5 composables: usePasswordForm, usePasswordPreview, usePasswordShare, usePasswordSecurity, usePasswordTrash
- Extracted 9 components into src/components/PasswordIndex/ following EnvVault pattern
- Shared security indicator CSS extracted to password-security.css

## v2.1.0 (2026-02-20)

### Performance
- Virtual scrolling for all 3 views (list, grid, table) - DOM reduced from ~2,200 to ~100 elements
- Pre-computed security status map eliminating ~1,300 redundant reactive lookups per render
- Lazy-loaded i18n locales on demand, reducing initial bundle by 254KB (only active locale loads)

### UI/UX
- Sticky table headers when scrolling
- Eliminated double scrollbar across all views
- Custom Lemonade-themed scrollbar (orange light mode, subtle gray dark mode)
- Responsive grid columns for tablet (3 portrait, 4 landscape)
- Compact list view typography on mobile
- Restored full-size lemon logo on mobile header

## v2.0.2 (2026-02-20)

### Fixes
- Landing page: removed AI Security Analysis references (feature not implemented)
- Landing page: fixed contact email to maurohabbaby.dev@gmail.com
- Landing page: GitHub link points to profile instead of private repo
- Documentation site: added extension store links (Chrome + Firefox)
- Documentation site: removed AI references from all 8 languages
- Privacy policy and terms: updated contact email
- Unified version to 2.0.2 across all project files

### Features
- Landing page: added Docs link in nav, mobile menu, and footer
- Created 8 Product Hunt gallery images (1270x760)
- Created Product Hunt thumbnail (240x240)
- Added 1024x1024 icon and base SVG icon

## v2.0.0 (2026-02-17)

### Features
- **Trash / Soft Delete**: 30-day trash with restore and permanent delete, auto-purge scheduler
- **Password History**: Track all previous password versions with timestamps
- **Reused Password Detection**: Server-side check for passwords used across multiple entries
- **Custom Fields**: Add encrypted custom fields (PIN, security questions, etc.) to entries
- **Secure Notes**: Encrypted standalone notes with trash support (premium feature)
- **TOTP Authenticator**: Built-in 2FA code generator with server-side secret storage
- **Emergency Access**: Trusted contacts with configurable waiting periods and auto-approve
- Emergency requests notification badge on Settings button
- Landing page updated with new v2 feature cards (8 languages)

### Architecture
- New Pinia store: `secureNotes.js`
- New composable: `useEmergencyAccess.js`
- New page: `SecureNotesPage.vue` with route `/notes`
- Notes tab in navigation alongside Passwords and Env Vault
- Cloud Functions: 20+ new endpoints for all v2 features
- Firestore indexes: composite indexes for trash queries
- i18n: all 10 locales updated with new feature translations

## v1.0.13 (2026-02-17)

### Fixes
- Loader: shadow card with fixed size behind content (splash + Vue loader)
- Loader: dark mode text contrast (white on dark background)
- Loader: solid background on initial load, transparent on decrypt preview
- Table: dark mode header text contrast on desktop (moved to unscoped styles)
- Cloud Functions: removed duplicate HTTP exports overriding sanitized versions
- Cloud Functions: added `sanitizeInput()` to ticket endpoints
- Extensions: removed all console.logs exposing sensitive data (Chrome + Firefox)
- PWA: removed debug console.logs from source files

### Performance
- Cloud Functions warmup ping on login/unlock to reduce first decrypt cold start
- Firestore IndexedDB persistence for instant cache loads

### Features
- Landing page: OG image, Twitter Card meta tags, feature cards
- Lock screen appears before any data loads (sync localStorage check)

## v1.0.0 (2026-02-17)

- Initial public release
- Chrome and Firefox extensions approved
- Security hardening, performance optimization, Product Hunt readiness
