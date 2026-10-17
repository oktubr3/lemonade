# Changelog

## v2.3.3 — dependency security updates (2026-10-17)

### Security
- **Cloud Functions** (all transitive): `proxy-addr` 2.0.8 (critical: IP spoofing
  through IPv4-mapped IPv6 trust subnets), `@fastify/busboy` 3.2.3, `@grpc/grpc-js`
  1.14.6, `brace-expansion` 2.1.7 and `qs` 6.16.1. `npm audit` reports none left.
- **App**: `@grpc/grpc-js` forced to `^1.14.6` with a pnpm override. Firestore still
  pins `~1.9.0` (also in its latest release); grpc-js is not in the browser bundle and
  only runs in Node tests, where the 74 rules tests pass with it.
- **Service worker build** (`src-pwa/`): `fast-uri` 3.1.8 and `brace-expansion`.
- Remaining: `braces` (build-time only, via the i18n plugin), which has no patched
  release yet.

## v2.3.2 — 2FA dialogs with older entries (2026-10-17)

### Fixed
- **Searching the entry list in "Import from Google Authenticator" crashed**
  (`Cannot read properties of undefined (reading 'toLowerCase')`) when the vault
  had entries saved by older versions, which keep their name in `name` instead
  of `title`. Both 2FA dialogs now read `title`, then `name`, then the site,
  like the vault list does, and an entry with none of them shows "Untitled".
- Exporting such an entry to Google Authenticator now carries its name as the
  issuer (`exportTotpAccountsHttp` also reads `name`).

## v2.3.1 — QR reading fixed in production (2026-10-17)

### Fixed
- **Reading a Google Authenticator QR failed in production**, both from an
  uploaded image ("no QR code found") and from the camera (nothing ever read).
  The QR library loads the image as a `blob:` URL and decodes in a `blob:`
  Worker (always, in Chrome on Apple-silicon Macs), and the app's Content
  Security Policy blocked both. The CSP now allows `blob:` for images and
  workers (`img-src`, new `worker-src`); `script-src` is unchanged.
- The 2FA end-to-end tests now run with the production CSP from
  `firebase.json` and without the native `BarcodeDetector`, the path that
  failed. Before the fix they fail with these exact two blocks.

## v2.3.0 — Google Authenticator import and export (2026-10-16)

### New
- **Import from Google Authenticator.** Settings → Google Authenticator reads the
  "Transfer accounts" QR codes (camera, a screenshot, or the pasted
  `otpauth-migration://` link), including exports split over several QR codes.
  Each account is matched to an entry by service and username, and can go to an
  existing entry, a new entry, or be skipped. The camera scans the whole frame
  (an export QR is dense and fills it) and ignores the QR it already read while
  it is still on screen. The whole batch is saved in one
  call (`importTotpAccountsHttp`): looping the single-account endpoints would hit
  their per-minute limits after five accounts.
- **Export to Google Authenticator.** Pick entries with 2FA and Lemonade draws
  the transfer QR codes (ten accounts per code, like the app itself does). The
  secrets come from `exportTotpAccountsHttp`, the only endpoint that returns a
  TOTP secret to the client: owner only, three calls a minute, audit-logged.
  Accounts with a period other than 30 s are left out and listed, because the
  transfer format cannot carry it.
- **8-digit, SHA256 and SHA512 codes.** The code generator now follows the
  parameters of the QR instead of assuming SHA1 / 6 digits / 30 s (checked
  against the RFC 6238 test vectors). Scanning a single-account QR keeps them too.
- Entries created by an import hold only the 2FA, with an empty password. Reading
  such an entry, the reused-password check and the security analysis now accept
  an empty password, and the edit form lets an entry with 2FA be saved without
  one.

### Fixed
- The 2FA code in the view dialog no longer freezes when one refresh fails: it
  retries after a few seconds. The countdown and the code layout follow the
  entry's period and digit count (`1234 5678`).
- Saving an entry with an empty password field no longer stores it as a bare
  string, which every reader treated as the retired legacy format.

## v2.2.27 — Admin panel: faster, stricter, live tickets (2026-10-13)

### Performance
- **The panel no longer waits on three cold functions.** Production logs showed
  where the time went: on the first load of the day the container took **14 s**
  to boot, and the request itself 1.3 s. The panel called three functions
  (users, stats, tickets), each its own container. Now the stats travel with the
  user list, tickets are read live from Firestore, and the one function left is
  kept warm (it takes `getOpenTicketsCountHttp`'s slot in `keepWarm`, which the
  live badge no longer needs).
- The list is requested when an admin's session starts, so the panel opens with
  the data already in memory and refreshes behind a thin progress bar instead of
  blanking the list.
- Password counts no longer download every entry of every vault (twice per
  load). One query reads only each entry's owner; above 20,000 entries it
  switches to one aggregation per user. Not what made the panel slow today
  (30 users, 341 entries), but it grew with the size of all vaults.
- Saving a user updates its row in place instead of reloading the whole list.
- **Every function the app calls is kept warm, not just the first screen.** The
  warm list had 17 entries, so the first save, delete, share or ticket reply
  after a quiet spell still waited 8–14 s for a container. It now holds all 49
  functions the web app and the extensions call; in three days of production logs
  15 of the 17 listed functions never booted cold, one did once and one six
  times. A test fails if the app starts calling a function that is in no list.
- Each cold start logs how long Node ran before `index.js` and how long the
  file took to load, to tell container start from module load.

### Security
- **Signing in as another account on the same tab no longer shows the previous
  user's tickets, or sends ticket actions with their token.** The tickets module
  kept its state and a hand-cached ID token (50 minutes) for the life of the
  page and nothing cleared them on sign-out. The same manual token cache was
  removed from emergency access.
- **Only a primary admin (verified `ADMIN_EMAILS`) can grant or revoke the admin
  role.** Any admin could before.
- **An admin cannot remove its own access** (role, disable, lock), in the screen
  and in the API.
- Admin endpoints check the ID token against revocation, so a suspended admin
  loses access at once instead of within the hour.
- Ticket endpoints validate types. `subject`, `message` and `content` were only
  length-checked, and an object has no length: `{"subject": {...}}` was stored
  as is. They are also POST-only and rate limited now, replies and status
  changes run in a transaction, and a ticket stops at 200 messages instead of
  growing until the document hits Firestore's 1 MB limit.
- An unknown role is rejected with 400. It used to be dropped silently while the
  call still answered "updated".

### Fixed
- **Saving any change to a user wiped its admin notes.** The list never returned
  the notes, so the dialog opened empty and sent that back. The dialog now sends
  only what changed.
- Admin endpoints counted every request twice against their rate limit (two
  limiter calls with the same key), so the panel hit 429 after half the
  advertised number of refreshes.
- "Activity (7d)" could never show more than 100: it was counted over the last
  100 audit logs.
- **Audit records were lost without a trace when any detail was undefined.**
  Firestore rejects such a document and `createAuditLog` only logs the error.
  Production lost four `getPasswordEntryHttp` records that way in the last 30
  days. Undefined details are dropped now and the record is kept.
- Dark mode in the panel: rows marked as waiting, locked or disabled kept their
  pastel background under white text, and the active ticket filter was grey on
  amber (its rule targeted a class QBtnToggle never adds).
- `firestore.indexes.json` was missing two composite indexes that exist in
  production (`tickets` by user and creation date, `shared_passwords` by status
  and recipient). Deploying indexes from the repo would have offered to delete
  them; the first one backs the daily ticket limit.

### Added
- Users: last sign-in and registration date (from Firebase Auth; the user
  documents never stored them), sorting, "show more" paging, subscription
  status, UID with copy, and a confirmation before anything that takes access
  away or grants admin.
- Tickets: live list and conversation on both sides, "awaiting reply" state
  (the badge counts those, not every open ticket), waiting tickets first, and
  reopening a closed ticket.

### Testing
- 10 new e2e tests for the panel and tickets (14 in total) and 18 unit tests for
  the panel's logic. Each was watched failing against a deliberate break; two
  needed strengthening first because a second, older rule was hiding the break.
- Firestore rules: 51 new checks that a signed-in user cannot read, list, edit
  or delete another user's passwords, notes, shares, emergency grants or
  tickets (74 total). The suite now runs in CI.

## v2.2.26 — End-to-end tests against the Firebase emulators (2026-10-12)

### Testing
- **Playwright e2e suite**, run with `pnpm run test:e2e` and on every pull
  request. It boots the Auth, Firestore and Functions emulators plus the dev
  server, signs in through the emulator's fake Google provider, seeds a vault
  and checks that the list loads, survives reloads, and that a search with regex
  metacharacters does not break it. Every test also fails on any page exception
  or `console.error`.
- **It cannot reach production by construction.** The project id is
  `demo-lemonade`, which Firebase never connects to the cloud; the app only
  talks to emulators behind `VITE_USE_EMULATORS` *and* `import.meta.env.DEV`, so
  the block is absent from production bundles (verified: no trace in `dist/`).
- **Each test was watched failing.** Reintroducing the search bug did not break
  the first version of its test — relevance scoring only runs with two or more
  results, and the seed had one. The seed now has two, and the mutation fails it.
- **Stated limit:** the intermittent empty-list failure fixed in v2.2.22 is not
  reproduced here. The original code passes these tests, because against a local
  emulator with no latency the race does not occur. They guard that loading
  works; they are not a reproduction of that bug.

### Changed
- The function warmup is skipped when running against emulators: a local
  emulator has no cold start, and its preflight handling rejects `OPTIONS`.
  Production behavior is unchanged.

## v2.2.25 — Polar API 2026-04 → 2026-10, ahead of the January cutoff (2026-10-06)

### Changed
- **Polar API version moved to `2026-10`**, three months before the January 2027
  release in which Polar removes `2026-04`. Since SDK 1.x the version is the
  import path, so this is one line — but the webhook endpoint is versioned
  separately on Polar's side, which is what makes the ordering matter.
- **The order used, and why it was safe.** All **11 event types** the handler
  branches on (`subscription.created/updated/active/canceled/revoked`,
  `order.created/paid/updated/refunded`, `checkout.created/updated`) were
  measured to parse **identically** under `2026-04` and `2026-10` — same keys,
  same types, zero differences. That makes the handler tolerant of either
  format, so the code could ship before the endpoint was switched rather than
  needing both to land in the same minute.

### Testing
- The signature test now also asserts that **each of the 11 event types parses**
  on the pinned version. If a future version bump stops parsing one of them,
  that branch silently stops running and the payment is lost while the endpoint
  still answers 200 — this turns that into a failing test.

## v2.2.24 — Polar SDK 1.x, and the CI blind spot that hid it (2026-10-06)

### Changed
- **`@polar-sh/sdk` 0.49 → 1.0.2.** The 1.0 release repackages the SDK into one
  module per dated API version, so **the import path is now the API version
  pin** — `require('@polar-sh/sdk/2026-04')` — and the `Polar-Version` header
  hook is gone, along with the `HTTPClient` it needed. The API version stays at
  `2026-04` deliberately: the SDK change already alters both the signing scheme
  and the payload shape, and moving to `2026-10` at the same time would make a
  silent payment failure impossible to attribute. That migration is a one-line
  import change plus a Polar dashboard step, due before January 2027.

### Fixed
- **Every field read from Polar had to change.** The 0.49 SDK was generated by
  Speakeasy and remapped `snake_case` to `camelCase` in both directions, and
  coerced dates to `Date`. The 1.x SDK is hand-written and passes the JSON
  through untouched. Left alone, every branch of the webhook `switch` would read
  `undefined`, the endpoint would answer 200, and **a customer would pay and
  never get their role**. Updated: `product_id`, `current_period_end`,
  `total_amount` in the handler; `customer_email`, `success_url`, `customer_id`
  in request bodies; `customer_portal_url` in the portal response.
  `current_period_end` is now explicitly wrapped in `new Date()` so Firestore
  keeps storing a Timestamp rather than a string.
- **`validateEvent` is async in 1.x and is now awaited.** Without the `await`, a
  rejected signature would be an unhandled promise rejection outside the `try`,
  and the endpoint would carry on processing an unverified event.
- **The dual-key-derivation wrapper now delegates to the SDK.** 0.49 only tried
  the legacy HMAC key, so `validatePolarEvent` retried by hand with the other
  derivation. That retry cannot be ported: it worked by passing a `Buffer` to
  `validateEvent`, and 1.x rejects a Buffer with `TypeError` — which is not a
  verification error, so it would leave the handler answering **500 instead of
  403**. The key derivation is the Polar SDK's own, and Polar both issues the
  secret and signs the delivery.

  Worth recording because it is the trap here: **this project's secret is
  prefixed `polar_whs_`, not `whsec_`**, and the derivation depends on that
  prefix. The test now uses the real format.

### Testing
- **`npm test` in `functions/`**, wired into CI. It signs a payload with each of
  the two key derivations and asserts both verify, that a **different secret is
  rejected either way**, and that the parsed event still exposes the exact fields
  the handler reads for `subscription.created` and `order.paid`.
- **CI now loads `index.js`.** The functions job only ran `npm ci`, so a major
  that breaks a `require()` passed green — exactly what this SDK bump did, by
  dropping the `/webhooks` and `/lib/http` subpaths. That would have taken all 76
  functions down on the next deploy with a green check on the PR.

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
