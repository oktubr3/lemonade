# Extension Save Credentials - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add form submit interception + save credential toast to Chrome and Firefox extensions, making Lemonade a full credential manager (not just autofill).

**Architecture:** Content script intercepts form submissions with password fields, captures username/password/URL, shows a Shadow DOM toast banner offering to save. Service worker handles SAVE_CREDENTIAL and UPDATE_CREDENTIAL messages via existing Cloud Functions endpoints. Session storage survives classic navigation; in-memory for SPAs.

**Tech Stack:** Vanilla JS (content scripts), Chrome/Firefox Extension APIs, Shadow DOM, `chrome.storage.session` / `browser.storage.session`

**Branch:** `feat/extension-save-credentials` (from `main`)

**Design doc:** `docs/plans/2026-03-01-extension-save-credentials-design.md`

**Security note:** All user-provided values rendered in the toast are sanitized via the existing `escapeHtml()` function already present in the content script. The toast DOM is built using safe DOM creation methods (`document.createElement`, `textContent`) for dynamic values, with `escapeHtml()` as an additional defense layer. The toast lives inside a closed Shadow DOM for CSS/DOM isolation.

---

### Task 1: Create feature branch

**Step 1: Create and push branch**

```bash
git checkout main && git pull origin main
git checkout -b feat/extension-save-credentials
git push -u origin feat/extension-save-credentials
```

**Step 2: Verify branch**

Run: `git branch --show-current`
Expected: `feat/extension-save-credentials`

---

### Task 2: Chrome service worker - SAVE_CREDENTIAL handler

**Files:**
- Modify: `lemonade-chrome-extension/background/service-worker.js`

**Step 1: Add SAVE_CREDENTIAL case to handleMessage switch**

At line 56 (before `default:`), add the new case:

```javascript
case 'SAVE_CREDENTIAL':
    return saveCredential(message.credential);
```

**Step 2: Add saveCredential function**

After `getDecryptedPassword()` function (after line 425), add:

```javascript
/**
 * Save a new credential via Cloud Function
 */
async function saveCredential(credential) {
    try {
        const token = await getValidToken();
        if (!token) {
            return { success: false, needsLogin: true };
        }

        const response = await fetch(`${FUNCTIONS_URL}/createPasswordEntryHttp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                title: credential.title,
                username: credential.username,
                password: credential.password,
                url: credential.url
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to save credential');
        }

        const data = await response.json();

        // Invalidate credential cache
        await chrome.storage.local.remove(['credentials']);

        return { success: true, entryId: data.entryId };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
```

**Step 3: Verify no syntax errors**

Load extension in `chrome://extensions` -> click reload. Check for errors in service worker console.

**Step 4: Commit**

```bash
git add lemonade-chrome-extension/background/service-worker.js
git commit -m "feat: add SAVE_CREDENTIAL handler to Chrome service worker"
```

---

### Task 3: Chrome service worker - UPDATE_CREDENTIAL handler

**Files:**
- Modify: `lemonade-chrome-extension/background/service-worker.js`

**Step 1: Add UPDATE_CREDENTIAL case to handleMessage switch**

Right after the SAVE_CREDENTIAL case:

```javascript
case 'UPDATE_CREDENTIAL':
    return updateCredential(message.entryId, message.credential);
```

**Step 2: Add updateCredential function**

After `saveCredential()`:

```javascript
/**
 * Update an existing credential via Cloud Function
 */
async function updateCredential(entryId, credential) {
    try {
        const token = await getValidToken();
        if (!token) {
            return { success: false, needsLogin: true };
        }

        const response = await fetch(`${FUNCTIONS_URL}/updatePasswordEntryHttp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                entryId: entryId,
                title: credential.title,
                username: credential.username,
                password: credential.password,
                url: credential.url
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to update credential');
        }

        // Invalidate credential cache
        await chrome.storage.local.remove(['credentials']);

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}
```

**Step 3: Reload extension, verify no errors**

**Step 4: Commit**

```bash
git add lemonade-chrome-extension/background/service-worker.js
git commit -m "feat: add UPDATE_CREDENTIAL handler to Chrome service worker"
```

---

### Task 4: Chrome content script - form submit interception

**Files:**
- Modify: `lemonade-chrome-extension/content/content-script.js`

This task adds form submit detection. The toast UI comes in Task 5.

**Step 1: Add form submit listener in initLemonade()**

Modify `initLemonade()` (line 39) to also set up form submit interception:

```javascript
function initLemonade() {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            scanForLoginForms();
            setupFormSubmitInterception();
        });
    } else {
        scanForLoginForms();
        setupFormSubmitInterception();
    }

    observeDOMChanges();

    // Check for pending credential from previous page (navigation survival)
    checkPendingCredential();
}
```

**Step 2: Add form interception functions**

After `initLemonade()`, add all form interception functions. Key implementation notes:
- `setupFormSubmitInterception()`: attaches `submit` event listener (capture phase) and `click` listener for SPA buttons
- `handleFormSubmit()`: extracts password field from submitted form, calls `captureFormData()`
- `handleButtonClick()`: detects submit/register/signup buttons near password fields (SPA without `<form>` tags)
- `captureFormData()`: uses existing `findUsernameField()` to find username, cleans `document.title` for title
- `handleCapturedCredential()`: checks auth state, queries existing credentials for domain, stores in `chrome.storage.session` for navigation survival, and calls `showSaveToast()`
- `checkPendingCredential()`: on page load, checks `chrome.storage.session` for data saved before navigation, shows toast if found (expires after 30s)

SPA button text patterns to match: `sign up`, `sign in`, `register`, `log in`, `create account`, `submit`, `iniciar`, `registrar`, `entrar`, `crear cuenta`

**Step 3: Add showSaveToast placeholder**

```javascript
function showSaveToast(capturedData, existingEntry) {
    // Placeholder - full implementation in Task 5
    console.log('[Lemonade] Credential captured:', capturedData.username, '@', capturedData.url);
}
```

**Step 4: Reload extension, test on a login form**

1. Navigate to any site with a login form
2. Enter credentials, submit
3. Check browser console for `[Lemonade] Credential captured:` message

**Step 5: Commit**

```bash
git add lemonade-chrome-extension/content/content-script.js
git commit -m "feat: add form submit interception to Chrome content script"
```

---

### Task 5: Chrome content script - save credential toast banner

**Files:**
- Modify: `lemonade-chrome-extension/content/content-script.js`

**Step 1: Replace showSaveToast placeholder with full implementation**

Build the toast using safe DOM creation methods:
- Create closed Shadow DOM host, positioned `fixed; bottom: 20px; right: 20px; z-index: 2147483647`
- Store shadow reference as `shadowHost._lemonadeShadow = shadow` (needed because closed shadow DOM has no `.shadowRoot`)
- Track `activeSaveToast` variable to prevent duplicates
- Inject scoped CSS via `<style>` element in shadow root (same gradient theme as existing dropdown: `linear-gradient(135deg, #FFD93D, #F7DC6F)`)
- Build toast structure with `document.createElement()` calls:
  - Header: lemon GIF icon (`chrome.runtime.getURL('icons/lemon-animated.gif')`) + title text ("Save to Lemonade?" or "Update in Lemonade?")
  - Close button (X)
  - Body: Title field (editable `<input>`), User (static text via `textContent`), URL (static text via `textContent`)
  - Error area (hidden by default)
  - Actions: Dismiss button + Save/Update button

Key behaviors:
- Auto-dismiss after 15 seconds, reset on interaction
- Save button click: gets edited title from input, sends `SAVE_CREDENTIAL` or `UPDATE_CREDENTIAL` message, shows spinner while saving, success state ("Saved!") then auto-dismiss after 1.5s, error state shows message and re-enables button
- `dismissToast()`: uses `shadowHost._lemonadeShadow` to access toast element, applies fadeOut animation, removes after 300ms
- URL is prefixed with `https://` if it doesn't start with `http` (the hostname from `window.location.hostname` doesn't include protocol)

Animation CSS:
- `slideUp`: entry animation (translateY 20px -> 0, opacity 0 -> 1)
- `fadeOut`: exit animation (translateY 0 -> 20px, opacity 1 -> 0)
- `spin`: button spinner

**Step 2: Reload extension, test full flow**

1. Log in to extension
2. Navigate to a signup form
3. Fill username + password, submit
4. Toast should appear bottom-right
5. Edit title, click Save
6. Verify credential appears in Lemonade app

**Step 3: Commit**

```bash
git add lemonade-chrome-extension/content/content-script.js
git commit -m "feat: add save credential toast banner to Chrome content script"
```

---

### Task 6: Chrome manifest - verify storage permission

**Files:**
- Check: `lemonade-chrome-extension/manifest.json`

**Step 1: Verify `storage` permission exists**

`chrome.storage.session` requires the `storage` permission. Check manifest. The extension already uses `chrome.storage.local` so it should already be declared. If missing, add it.

**Step 2: Commit if changed**

---

### Task 7: Port to Firefox - background script

**Files:**
- Modify: `lemonade-firefox-extension/background/background.js`

Apply the same changes as Tasks 2-3 but with `browser.*` API:
- `chrome.storage.local.remove` -> `browser.storage.local.remove`
- Everything else is identical (fetch API, JSON structure, Cloud Functions URL)

**Step 1: Add cases to handleMessage switch (line 55, before `default:`)**

```javascript
case 'SAVE_CREDENTIAL':
    return saveCredential(message.credential);

case 'UPDATE_CREDENTIAL':
    return updateCredential(message.entryId, message.credential);
```

**Step 2: Add saveCredential and updateCredential functions**

Same as Chrome Tasks 2-3 but using `browser.storage.local.remove` instead of `chrome.storage.local.remove`.

**Step 3: Commit**

```bash
git add lemonade-firefox-extension/background/background.js
git commit -m "feat: add SAVE_CREDENTIAL and UPDATE_CREDENTIAL to Firefox background"
```

---

### Task 8: Port to Firefox - content script

**Files:**
- Modify: `lemonade-firefox-extension/content/content-script.js`

Apply the same content script changes as Tasks 4-5 but replace `chrome.*` with `browser.*`:
- `chrome.runtime.sendMessage` -> `browser.runtime.sendMessage`
- `chrome.storage.session` -> `browser.storage.session`
- `chrome.runtime.getURL` -> `browser.runtime.getURL`

All DOM code, CSS, animations, and logic are identical.

**Step 1: Modify initLemonade() same as Chrome**

**Step 2: Add all form interception functions (browser.* namespace)**

**Step 3: Add full toast implementation (browser.* namespace)**

**Step 4: Commit**

```bash
git add lemonade-firefox-extension/content/content-script.js
git commit -m "feat: add save credential interception and toast to Firefox content script"
```

---

### Task 9: Firefox manifest - verify storage permission

**Files:**
- Check: `lemonade-firefox-extension/manifest.json`

Same as Task 6 for Firefox. `browser.storage.session` requires the `storage` permission.

---

### Task 10: Manual testing

Test both extensions end-to-end:

**Chrome testing checklist:**
- [ ] Load extension in `chrome://extensions` (developer mode)
- [ ] Log in to extension via popup
- [ ] Navigate to a site with a registration form
- [ ] Fill email + password, click submit
- [ ] Toast appears bottom-right with captured data
- [ ] Edit title, click Save -> success state
- [ ] Verify credential appears in Lemonade PWA
- [ ] Test with existing credential -> toast says "Update"
- [ ] Test Dismiss button -> toast fades out
- [ ] Test X close button -> toast fades out
- [ ] Test auto-dismiss -> wait 15s, toast disappears
- [ ] Test classic navigation (form reloads page) -> toast shows after reload
- [ ] Test SPA (no reload) -> toast shows immediately
- [ ] Test with no username field -> toast shows with "(empty)" user
- [ ] Test while logged out -> no toast appears

**Firefox testing checklist:**
- [ ] Load extension in `about:debugging#/runtime/this-firefox`
- [ ] Same checklist as Chrome above
- [ ] Verify `browser.storage.session` works (Firefox 115+)

---

### Task 11: Final commit and PR

**Step 1: Verify all changes**

```bash
git status
git diff feat/extension-save-credentials..main --stat
```

**Step 2: Push and create PR**

```bash
git push origin feat/extension-save-credentials
```

Create PR with title: `feat: extension save credentials on form submit`

Body summary:
- Chrome and Firefox extensions now detect form submissions with password fields
- Shows a toast banner offering to save/update credentials to Lemonade
- Supports classic navigation (session storage) and SPAs (in-memory)
- No backend changes needed (uses existing createPasswordEntryHttp/updatePasswordEntryHttp)

Files changed:
- Chrome: service-worker.js (SAVE/UPDATE handlers), content-script.js (interception + toast)
- Firefox: background.js (SAVE/UPDATE handlers), content-script.js (interception + toast)

Test plan:
- Chrome: save new credential, update existing, dismiss/auto-dismiss, navigation survival
- Firefox: same tests
- No regressions on existing autofill functionality
