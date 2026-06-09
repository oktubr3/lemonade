# Extension Save Credentials Feature - Design Document

## Overview

Add the ability for Chrome and Firefox extensions to detect form submissions containing credentials and offer to save them to Lemonade. Currently extensions are read-only (autofill only). This feature makes them full credential managers.

## Trigger: Form Submit Interception

The content script listens for `submit` events on all `<form>` elements containing a password field, using `capture: true` to grab values before navigation.

### Data Captured

- **Username**: nearest `input[type=email]`, `input[type=text]`, or input with name/id matching `user`, `email`, `login`, `account` within the same form
- **Password**: value of `input[type=password]` (first one if multiple)
- **URL**: `window.location.hostname` (base domain)
- **Title**: `document.title` cleaned (strip suffixes like " - Sign Up", " | Register")

### Navigation Survival

- **Classic navigation** (form reloads page): captured data stored in `chrome.storage.session` / `browser.storage.session`. On next page load, content script checks for pending data and shows toast.
- **SPAs** (no reload): data kept in memory, toast shown immediately after submit.

### SPA Button Detection

For forms without `<form>` tags, listen for click events on buttons near password fields with text/attributes matching submit/register/signup patterns.

## UI: Toast Banner

Floating banner injected via Shadow DOM (closed), positioned fixed bottom-right. Same isolation pattern as existing lemon button/dropdown.

### Layout

```
┌──────────────────────────────────────────┐
│ 🍋  Save to Lemonade?              ✕    │
│                                          │
│ Title: [ GitHub                    ] ✏️  │
│ User:  john@email.com                    │
│ URL:   github.com                        │
│                                          │
│              [Dismiss]  [💾 Save]        │
└──────────────────────────────────────────┘
```

### Behavior

- **Title**: only editable field, pre-filled from `document.title`
- **User/URL**: static display text
- **Save button**: lemon gradient style, triggers save via service worker
- **Dismiss / X**: close with fade-out animation
- **Auto-dismiss**: 15 seconds if no interaction
- **Animation**: slide-up + fade-in on appear, fade-out on dismiss
- **Dark theme**: same CSS variables as existing dropdown

### States

- **Saving**: button shows spinner + "Saving..."
- **Success**: toast transforms to "Saved! ✓" (green), fades out
- **Error**: error message in red, button returns to Save for retry

### Update vs Save

Before showing toast, content script queries existing credentials for the domain. If a match exists with same username, button says "Update" and calls update endpoint instead of create.

## Service Worker Messages

### New: `SAVE_CREDENTIAL`

```javascript
// Request
{ type: 'SAVE_CREDENTIAL', credential: { title, username, password, url } }

// Service worker: POST createPasswordEntryHttp with Bearer token
// Response: { success: true, entryId } or { success: false, error }
// Side effect: invalidate credential cache for domain
```

### New: `UPDATE_CREDENTIAL`

```javascript
// Request
{ type: 'UPDATE_CREDENTIAL', entryId: "id", credential: { title, username, password, url } }

// Service worker: POST updatePasswordEntryHttp with Bearer token
// Response: { success: true } or { success: false, error }
// Side effect: invalidate credential cache for domain
```

### Existing: `GET_CREDENTIALS`

Reused to check for existing credentials before showing toast. Content script does username matching locally.

## Backend

No changes required. Existing Cloud Functions endpoints:
- `createPasswordEntryHttp` - accepts { title, username, password, url }
- `updatePasswordEntryHttp` - accepts { entryId, title, username, password, url }

## Chrome vs Firefox Differences

| Aspect | Chrome | Firefox |
|--------|--------|---------|
| API namespace | `chrome.*` | `browser.*` |
| Session storage | `chrome.storage.session` | `browser.storage.session` |
| Message listener | callback + `return true` | return Promise |
| Background file | service-worker.js | background.js |

Content script and toast UI are identical between both extensions.

## Edge Cases

- **No username field**: show toast with empty User field, let user decide
- **Multiple password fields** (confirm password): use first `input[type=password]`
- **No `<form>` tag** (SPA buttons): detect submit/register buttons near password fields
- **Cross-origin iframes**: not supported (browser security limitation)
- **User not logged in**: no interception, toast never shown
- **Permissions**: no new manifest permissions needed

## Security

- Passwords captured only on form submit, held in memory or session storage briefly
- Session storage auto-clears when browser closes
- Credential sent to backend encrypted in transit (HTTPS)
- Backend encrypts with AES-256-GCM before Firestore storage
- Only authenticated users (valid Firebase token) can save
