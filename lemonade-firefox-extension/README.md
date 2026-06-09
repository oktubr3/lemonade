# Lemonade Pass Manager - Firefox Extension

Autofill passwords from Lemonade Pass Manager for Firefox.

## Features

- Google OAuth authentication
- Autofill credentials on login forms
- Animated lemon button indicator
- Search and filter passwords
- Copy password to clipboard
- Sync with Firebase backend

## Installation (Development)

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select the `manifest.json` file from this directory

## Installation (Production)

The extension will be available on Firefox Add-ons (AMO) once published.

## OAuth Configuration (REQUIRED)

Before using the extension, you **must** configure OAuth in Google Cloud Console:

### Step 1: Get your Firefox redirect URL

1. Load the extension temporarily in Firefox
2. Open the browser console (F12 → Console tab)
3. Run: `browser.identity.getRedirectURL()`
4. Copy the URL (format: `https://[ID].extensions.allizom.org/`)

### Step 2: Configure Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials
2. Edit your **OAuth 2.0 Client ID** (Web application type)
3. Add to **Authorized JavaScript origins**:
   ```
   https://[ID].extensions.allizom.org
   ```
4. Add to **Authorized redirect URIs** (add BOTH versions):
   ```
   https://[ID].extensions.allizom.org
   https://[ID].extensions.allizom.org/
   ```
5. Click **Save**
6. Wait 1-2 minutes for changes to propagate

### Important Notes

- **Add BOTH redirect URIs** (with and without trailing slash) - Google is sensitive to this
- The extension ID changes each time you load it temporarily. For permanent testing, use `web-ext run` which maintains a consistent ID
- Chrome and Firefox use different redirect URLs, so you need both configured in Google Cloud Console

## Development

### Using web-ext (recommended)

```bash
npm install -g web-ext
cd lemonade-firefox-extension
web-ext run    # Opens Firefox with extension loaded
web-ext lint   # Validates the extension
web-ext build  # Creates .zip for publishing
```

### Manual testing

1. Make changes to the source files
2. Go to `about:debugging#/runtime/this-firefox`
3. Click "Reload" on the extension

## Differences from Chrome Extension

| Aspect | Chrome | Firefox |
|--------|--------|---------|
| API Namespace | `chrome.*` | `browser.*` |
| Background | Service Worker | Background Scripts |
| Message Handling | Callbacks | Promises |
| OAuth Redirect | `chromiumapp.org` | `extensions.allizom.org` |
| Manifest | `key` field | `browser_specific_settings` |

## File Structure

```
lemonade-firefox-extension/
├── manifest.json          # Extension manifest (MV3)
├── background/
│   └── background.js      # Background script
├── content/
│   ├── content-script.js  # Content script for autofill
│   └── styles.css         # Content styles
├── popup/
│   ├── popup.html         # Popup UI
│   ├── popup.js           # Popup logic
│   └── popup.css          # Popup styles
├── icons/                  # Extension icons
└── README.md
```

## Porting from Chrome to Firefox

Key changes made when porting:

1. **API Namespace**: Replace `chrome.*` → `browser.*`
2. **Message Listeners**: Use Promise returns instead of `sendResponse` callback
3. **Manifest**: Remove `key` and `offscreen`, add `browser_specific_settings.gecko`
4. **Background**: Change `service_worker` to `scripts` array
5. **OAuth**: Use `browser.identity.getRedirectURL()` format

## Publishing to Firefox Add-ons

1. Create account at https://addons.mozilla.org/developers/
2. Run `web-ext build` to create .zip
3. Upload to AMO
4. Complete listing information
5. Wait for review (typically 1-2 days)

**Advantages over Chrome Web Store:**
- Free to publish (no $5 fee)
- Supports MV2 and MV3
- Allows self-hosting

## License

MIT
