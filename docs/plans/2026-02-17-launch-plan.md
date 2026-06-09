# Lemonade v1.0.0 Launch Plan - Implementation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship Lemonade v1.0.0 with security hardening, performance optimization, and Product Hunt readiness.

**Architecture:** Three sequential phases - security review first (catch blockers), then performance (user-facing improvements), then polish (marketing readiness). Each phase is independently deployable.

**Tech Stack:** Quasar v2 + Vue 3, Firebase (Auth, Firestore, Cloud Functions), Chrome/Firefox extensions

---

## Phase 1: Security Review

### Task 1: Chrome Extension - Remove console.logs exposing sensitive data

**Files:**
- Modify: `lemonade-chrome-extension/background/service-worker.js` (15 console.log occurrences)
- Modify: `lemonade-chrome-extension/content/content-script.js` (7 console.log occurrences)
- Modify: `lemonade-chrome-extension/popup/popup.js`

**Step 1: Remove all console.log/console.error from service-worker.js**

Remove every `console.log` and `console.error` line. These log tokens, auth data, user emails, and credential counts in production. Search for `console.` and delete each line.

Key sensitive lines to remove:
- Line 71: logs `!!stored.user`, `!!stored.authToken`, `stored.tokenExpiry`
- Line 104: logs `redirectUrl` (OAuth redirect)
- Line 105: logs full auth URL
- Line 158: logs full Firebase response JSON (`JSON.stringify(firebaseData)`)
- Line 183: logs `user.email`
- Line 269: logs `userId`

**Step 2: Remove all console.log/console.error from content-script.js**

Remove all `console.log` and `console.error` lines. These log domain names and credential match info.

**Step 3: Remove all console.error from popup.js**

Remove `console.error` lines (lines 41, 99, 246, 269, 319).

**Step 4: Regenerate Chrome extension zip**

```bash
rm lemonade-chrome-extension.zip
cd lemonade-chrome-extension && zip -r ../lemonade-chrome-extension.zip . -x "README.md" "CHANGELOG.md" ".DS_Store"
```

**Step 5: Commit**

```bash
git add lemonade-chrome-extension/
git commit -m "fix: remove all console.logs from Chrome extension for production"
```

---

### Task 2: Firefox Extension - Remove console.logs

**Files:**
- Modify: `lemonade-firefox-extension/background/background.js`
- Modify: `lemonade-firefox-extension/content/content-script.js`
- Modify: `lemonade-firefox-extension/popup/popup.js`

**Step 1: Remove all console.log/console.error from all Firefox extension files**

Same pattern as Chrome - remove all `console.log` and `console.error` lines.

**Step 2: Regenerate Firefox extension zip**

```bash
rm lemonade-firefox-extension.zip
cd lemonade-firefox-extension && zip -r ../lemonade-firefox-extension.zip . -x "README.md" "CHANGELOG.md" ".DS_Store"
```

**Step 3: Commit**

```bash
git add lemonade-firefox-extension/
git commit -m "fix: remove all console.logs from Firefox extension for production"
```

---

### Task 3: Security audit - Cloud Functions CORS and input sanitization

**Files:**
- Read: `functions/index.js`

**Step 1: Verify CORS whitelist**

CORS is already properly configured at `functions/index.js:18-31`:
```js
const corsHandler = cors({
  origin: [
    'http://localhost:9000', 'http://localhost:9001', 'http://localhost:9200',
    'https://passmanager-d2b6d.web.app', 'https://passmanager-d2b6d.firebaseapp.com',
    'https://app.lemonadepass.app', 'https://lemonadepass.app'
  ],
  credentials: true,
  ...
});
```
**Status: PASS** - No wildcard `*`, origins are explicitly whitelisted.

**Step 2: Verify input sanitization**

Search `functions/index.js` for all `req.body` usages. Verify each has:
- `sanitizeInput()` on string fields
- URL validation via `new URL()`
- Password length limits (1-500 chars)

Document any gaps found and fix them.

**Step 3: Verify rate limiting covers critical endpoints**

Check that `createPasswordEntry`, `updatePasswordEntry`, `deletePasswordEntry`, and `getPasswordEntry` all have rate limit checks. Document that rate limiting is in-memory (resets on cold start) as a known limitation.

**Step 4: Commit if any fixes needed**

```bash
git commit -m "fix: security hardening for Cloud Functions"
```

---

## Phase 2: Performance Optimization

### Task 4: Lock screen before data - restructure MainLayout.vue loading order

**Files:**
- Modify: `src/layouts/MainLayout.vue:266-328` (onMounted block)

**Step 1: Add immediate lock-on-exit check BEFORE any async operations**

Current flow in `onMounted`:
1. `themeStore.initializeTheme()` (sync)
2. A11y filters (sync)
3. Background timeout check (sync, good)
4. `await checkSessionExpiry()` ← **SLOW: Firestore network call**
5. Admin role fetch

New flow:
1. Theme + a11y (sync, keep as-is)
2. Background timeout check (sync, keep as-is)
3. **NEW: Lock-on-exit immediate check** - if `lemonade_lock_on_exit === 'true'` AND `lemonade_has_passkey` exists AND there's no valid `lemonade_last_login` → show lock screen and `return` immediately
4. `checkSessionExpiry()` (only if no lock needed)
5. Admin role fetch

Replace the `onMounted` block starting after the background timeout check (after line 299) with:

```js
// Lock-on-exit: check if we should lock immediately (before any network calls)
const lockOnExitSetting = localStorage.getItem('lemonade_lock_on_exit') === 'true';
if (lockOnExitSetting && hasRegisteredPasskey()) {
    const lastLogin = localStorage.getItem(SESSION_LOGIN_KEY);
    if (!lastLogin) {
        // No valid login timestamp = needs re-auth
        const userId = auth.currentUser?.uid || getStoredUserId();
        if (userId) {
            lockedUserId.value = userId;
            showBiometricLock.value = true;
            return; // Don't load any data
        }
    }
}
```

Insert this block at line 300 (after the existing background timeout check, before `checkSessionExpiry`).

**Step 2: Verify lock screen appears before any data flash**

Test manually:
1. Login, enable lock-on-exit in settings
2. Close tab, reopen app
3. Lock screen should appear INSTANTLY with no password data visible behind it

**Step 3: Commit**

```bash
git add src/layouts/MainLayout.vue
git commit -m "perf: show lock screen before any Firestore calls"
```

---

### Task 5: Parallel data prefetch during passkey unlock

**Files:**
- Modify: `src/layouts/MainLayout.vue` (handleBiometricUnlocked function)

**Step 1: Prefetch data while user is on lock screen**

Current `handleBiometricUnlocked` (line 141):
```js
const handleBiometricUnlocked = () => {
    showBiometricLock.value = false;
    lockedUserId.value = null;
    startSessionCheck();
};
```

Problem: After unlock, the user still waits for IndexPage to mount and call `fetchEntries()`.

Fix: Start session check and let IndexPage handle data loading normally, but ensure session is validated:

```js
const handleBiometricUnlocked = async () => {
    showBiometricLock.value = false;
    lockedUserId.value = null;
    // Validate session and start periodic checks
    if (auth.currentUser) {
        const valid = await checkSessionExpiry();
        if (!valid) {
            await handleSessionExpired();
            return;
        }
    }
    startSessionCheck();
};
```

**Step 2: Commit**

```bash
git add src/layouts/MainLayout.vue
git commit -m "perf: validate session on biometric unlock before loading data"
```

---

### Task 6: Skeleton screens in IndexPage

**Files:**
- Modify: `src/pages/IndexPage.vue` (replace LemonadeLoader with skeletons)

**Step 1: Replace full-screen loader with skeleton UI**

Find the loading section (around line 1527-1528):
```html
<LemonadeLoader v-if="isLoading" :message="t('passwords.loading')" />
```

Replace with skeleton cards that match the grid/list/table layout:

```html
<!-- Skeleton loading state -->
<div v-if="isLoading" class="q-pa-md">
    <div class="row q-gutter-sm">
        <div v-for="n in 8" :key="n" class="col-12 col-sm-6 col-md-4 col-lg-3">
            <q-card flat bordered class="q-pa-md">
                <div class="row items-center q-gutter-sm q-mb-sm">
                    <q-skeleton type="QAvatar" size="32px" />
                    <q-skeleton type="text" width="60%" />
                </div>
                <q-skeleton type="text" width="80%" />
                <q-skeleton type="text" width="40%" class="q-mt-sm" />
            </q-card>
        </div>
    </div>
</div>
```

Keep the `LemonadeLoader` for the decryption loading state (`isLoadingPreview`).

**Step 2: Commit**

```bash
git add src/pages/IndexPage.vue
git commit -m "perf: replace full-screen loader with skeleton cards"
```

---

### Task 7: Enable Firestore IndexedDB persistence

**Files:**
- Modify: `src/boot/firebase.js`

**Step 1: Enable offline persistence**

Add `enableIndexedDbPersistence` after Firestore initialization:

```js
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";

// After db initialization:
enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
        // Multiple tabs open - persistence only works in one tab
    } else if (err.code === 'unimplemented') {
        // Browser doesn't support IndexedDB
    }
});
```

This makes the second load instant because Firestore serves from local IndexedDB first, then syncs.

**Step 2: Verify it works**

1. Open app, load passwords
2. Go offline (DevTools Network tab → Offline)
3. Refresh page - passwords should still show from cache

**Step 3: Commit**

```bash
git add src/boot/firebase.js
git commit -m "perf: enable Firestore IndexedDB persistence for instant second load"
```

---

## Phase 3: Product Hunt Preparation

### Task 8: Version bump to 1.0.0

**Step 1: Bump version**

```bash
npm run version:major
```

This runs `version.sh` to bump 0.8.0 → 1.0.0 in package.json.

**Step 2: Commit**

```bash
git add package.json
git commit -m "feat: bump version to 1.0.0 for public launch"
```

---

### Task 9: Landing page - Add Twitter Card meta tags and verify OG tags

**Files:**
- Modify: `docs/index.html`

**Step 1: Add Twitter Card tags**

The landing page already has OG tags but is missing Twitter Card tags and og:url. Add after existing OG tags (after line 14):

```html
<meta property="og:url" content="https://lemonadepass.app">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Lemonade - Password Manager for Developers">
<meta name="twitter:description" content="The only password manager with Env Vault. Manage .env files, API keys, and secrets securely.">
<meta name="twitter:image" content="https://lemonadepass.app/assets/images/og-image.png">
```

**Step 2: Verify OG image exists**

The OG image at `docs/assets/images/og-image.png` is currently MISSING. Create a 1200x630 social preview image with:
- Lemonade logo
- Tagline: "The Password Manager Developers Actually Need"
- Key features: Env Vault, Passkeys, Browser Extensions
- Brand colors: #FFD93D yellow, #2C3E50 dark

**Step 3: Commit**

```bash
git add docs/index.html
git commit -m "feat: add Twitter Card meta tags and og:url to landing page"
```

---

### Task 10: Landing page - Verify feature list matches current capabilities

**Files:**
- Modify: `docs/index.html`

**Step 1: Audit landing page content against actual features**

Verify these features are listed:
- [x] Password management with AES-256-GCM encryption
- [ ] Chrome extension (newly approved)
- [ ] Firefox extension (newly approved)
- [x] Env Vault for .env files
- [x] WebAuthn/Passkeys biometric lock
- [ ] 10 languages
- [x] AI security analysis (Gemini)
- [x] Password sharing
- [ ] Background timeout lock
- [ ] Accessibility filters

**Step 2: Add browser extension badges/links**

Add Chrome Web Store and Firefox Add-ons links to the landing page.

**Step 3: Commit**

```bash
git add docs/index.html
git commit -m "feat: update landing page with browser extensions and latest features"
```

---

### Task 11: Clean console.logs from PWA source

**Files:**
- Audit: `src/` directory for console.log statements with sensitive data

**Step 1: Audit console.logs in PWA**

Search for console.log in src/ and categorize:
- Sensitive (tokens, passwords, user data) → REMOVE
- Debug info (component lifecycle) → REMOVE
- Error handling (console.error in catch blocks) → KEEP

**Step 2: Remove non-essential console.logs**

Focus on stores and composables that might log auth tokens or user data.

**Step 3: Commit**

```bash
git commit -m "fix: remove sensitive console.logs from PWA source"
```

---

### Task 12: Final build, deploy, and verify

**Step 1: Build v1.0.0**

```bash
npm run build:manual
```

Use `build:manual` since we already bumped the version.

**Step 2: Deploy to Firebase**

```bash
firebase deploy
```

**Step 3: Verify production**

1. Open https://app.lemonadepass.app
2. Login with Google
3. Verify passwords load fast (skeleton → data)
4. Verify lock-on-exit shows lock before data
5. Verify Chrome extension login works
6. Open https://lemonadepass.app - verify landing page, OG tags

**Step 4: Final commit and tag**

```bash
git tag v1.0.0
```
