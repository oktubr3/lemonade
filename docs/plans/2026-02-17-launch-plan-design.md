# Lemonade Launch Plan - Design Document

**Date:** 2026-02-17
**Version:** 0.8.0 -> 1.0.0
**Timeline:** This week
**Goal:** Product Hunt launch with security review, performance optimization, and polish

---

## Phase 1: Security Review (1-2 hours)

### 1.1 Cloud Functions CORS audit
- Verify `corsHandler` has origin whitelist (not `*`)
- If open, restrict to `app.lemonadepass.app`, `lemonadepass.app`, `localhost`

### 1.2 Console.log cleanup
- Remove all `console.log` from Chrome extension service-worker.js (logs tokens/auth data)
- Remove all `console.log` from Chrome extension popup.js
- Remove all `console.log` from Chrome extension content-script.js
- Audit PWA source for sensitive data in console.logs

### 1.3 Rate limiting documentation
- Current: in-memory Map per function instance (resets on cold start)
- Document as known limitation; not a blocker for launch
- Post-launch: consider Firestore-based rate limiting

### 1.4 Input sanitization verification
- Verify all Cloud Function endpoints sanitize input
- Verify URL validation on password entries
- Verify password length limits enforced server-side

---

## Phase 2: Performance Optimization

### 2.1 Lock screen before data (order fix)
**Problem:** Passwords load before lock screen appears, user sees flash of data.

**Fix in MainLayout.vue:**
1. Check `lemonade_lock_on_exit` + `lemonade_has_passkey` from localStorage (sync, instant)
2. If lock needed: show BiometricLockScreen IMMEDIATELY, skip all Firestore calls
3. On successful passkey unlock: THEN run `checkSessionExpiry()` and `fetchEntries()`

### 2.2 Parallel prefetch during unlock
**While user is authenticating with passkey:**
1. Start `fetchEntries()` in background (don't await)
2. Start `checkSessionExpiry()` in background
3. When passkey succeeds AND data is ready: show content instantly

### 2.3 Skeleton screens
- Replace spinner in IndexPage with skeleton cards/rows matching current view mode
- Use Quasar's `q-skeleton` component for consistency

### 2.4 Firestore persistence cache
- Enable `enableIndexedDbPersistence()` in firebase boot
- Second load serves from IndexedDB cache, then syncs
- Offline-capable password list (read-only)

---

## Phase 3: Product Hunt Preparation

### 3.1 Version bump to 1.0.0
- Run `npm run version:major` to bump 0.8.0 -> 1.0.0
- Signals maturity and production-readiness

### 3.2 Landing page updates
- Verify all current features are listed: Chrome/Firefox extensions, passkeys/WebAuthn, EnvVault, 10 languages, AI security analysis, password sharing
- Add extension store badges/links

### 3.3 Open Graph meta tags
- Add to landing `index.html`: og:title, og:description, og:image, og:url
- Add Twitter Card meta tags
- Create a 1200x630 social preview image

### 3.4 Console.log cleanup (PWA)
- Remove or guard behind `process.env.DEV` all console.logs in production builds
- Quasar config already strips in prod if using proper build - verify

### 3.5 Analytics
- Add lightweight privacy-first analytics to landing page
- Measure: page views, CTA clicks, conversion to app signup
- Decision deferred on specific tool (Plausible/Umami/Firebase Analytics)

---

## Out of Scope (post-launch)
- Firestore rules changes
- New features
- Infrastructure migration
- A/B testing
- Distributed rate limiting
- Component-level lazy loading
