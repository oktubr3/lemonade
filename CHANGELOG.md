# Changelog

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
