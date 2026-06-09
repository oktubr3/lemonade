/**
 * Lemonade Pass Manager - Content Script
 * Detects login forms and injects the floating lemon button
 */

// Domains where Lemonade should NOT inject (the app itself)
const EXCLUDED_DOMAINS = [
    'lemonadepass.app',
    'app.lemonadepass.app',
    'localhost',
    '127.0.0.1'
];

/**
 * Check if current site should be excluded from autofill
 */
function isExcludedDomain() {
    const hostname = window.location.hostname;
    return EXCLUDED_DOMAINS.some(domain =>
        hostname === domain || hostname.endsWith('.' + domain)
    );
}

// Cache for credentials check - avoid repeated API calls
let credentialsCache = null;
let credentialsCacheExpiry = 0;
const CACHE_DURATION = 30000; // 30 seconds

// Active save toast reference (prevent duplicates)
let activeSaveToast = null;

// Track last known input values (handles frameworks that clear .value on submit)
const trackedValues = new WeakMap();

// Skip injection on Lemonade's own domains
if (isExcludedDomain()) {
    // Skip injection on Lemonade app domain
} else if (window.lemonadeInjected) {
    // Already injected, skip
} else {
    window.lemonadeInjected = true;
    initLemonade();
}

function initLemonade() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            scanForLoginForms();
            setupFormSubmitInterception();
        });
    } else {
        scanForLoginForms();
        setupFormSubmitInterception();
    }

    // Watch for dynamic forms (SPAs)
    observeDOMChanges();

    // Check for pending credential from previous page (navigation survival)
    checkPendingCredential();
}

/**
 * Check if credentials exist for the current domain
 * Returns cached result if available
 */
async function hasCredentialsForCurrentDomain() {
    const now = Date.now();

    // Return cached result if still valid
    if (credentialsCache !== null && now < credentialsCacheExpiry) {
        return credentialsCache;
    }

    try {
        const domain = window.location.hostname;
        const response = await chrome.runtime.sendMessage({
            type: 'GET_CREDENTIALS',
            domain: domain
        });

        const hasCredentials = response && response.success && response.credentials && response.credentials.length > 0;

        // Cache the result
        credentialsCache = hasCredentials;
        credentialsCacheExpiry = now + CACHE_DURATION;

        return hasCredentials;
    } catch (error) {
        return false;
    }
}

/**
 * Scan the page for login forms
 * Only inject lemon button if credentials exist for this domain
 */
async function scanForLoginForms() {
    const passwordFields = findPasswordFields();

    if (passwordFields.length > 0) {
        // IMPORTANT: Only show lemon if user has saved credentials for this site
        const hasCredentials = await hasCredentialsForCurrentDomain();

        if (!hasCredentials) {
            return;
        }

        passwordFields.forEach(field => {
            if (!field.dataset.lemonadeProcessed) {
                field.dataset.lemonadeProcessed = 'true';
                injectLemonButton(field);
            }
        });
    }
}

/**
 * Find password input fields using multiple strategies
 */
function findPasswordFields() {
    const fields = [];

    // Strategy 1: Direct password inputs
    document.querySelectorAll('input[type="password"]').forEach(input => {
        if (isVisible(input)) {
            fields.push(input);
        }
    });

    // Strategy 2: Inputs with password-related attributes (for hidden type fields)
    const passwordKeywords = ['password', 'passwd', 'pwd', 'pass', 'contraseña'];
    document.querySelectorAll('input[type="text"], input:not([type])').forEach(input => {
        const name = (input.name || '').toLowerCase();
        const id = (input.id || '').toLowerCase();
        const autocomplete = (input.autocomplete || '').toLowerCase();

        if (passwordKeywords.some(kw => name.includes(kw) || id.includes(kw)) ||
            autocomplete === 'current-password' || autocomplete === 'new-password') {
            if (isVisible(input) && !fields.includes(input)) {
                fields.push(input);
            }
        }
    });

    return fields;
}

/**
 * Find the username field associated with a password field
 */
function findUsernameField(passwordField) {
    const form = passwordField.closest('form');
    const container = form || passwordField.parentElement?.parentElement || document.body;

    // Look for common username field patterns
    const usernameSelectors = [
        'input[type="email"]',
        'input[type="text"][autocomplete="username"]',
        'input[type="text"][autocomplete="email"]',
        'input[name*="user"]',
        'input[name*="email"]',
        'input[name*="login"]',
        'input[id*="user"]',
        'input[id*="email"]',
        'input[id*="login"]',
        'input[type="text"]',
        'input[type="tel"]'
    ];

    for (const selector of usernameSelectors) {
        const field = container.querySelector(selector);
        if (field && field !== passwordField && isVisible(field)) {
            return field;
        }
    }

    return null;
}

/**
 * Extract the value from an input field, handling framework-wrapped inputs
 * (e.g., Vuetify, Material UI) where .value may be empty despite visible text.
 * Vuetify 2 stores the real value in a sibling input[type="hidden"].
 */
function getFieldValue(field) {
    if (!field) return '';

    // Standard .value — works for most native inputs
    if (field.value) return field.value.trim();

    // Vuetify 2: the real value lives in a sibling/cousin input[type="hidden"]
    // Walk up to the component wrapper (.v-input or similar) and search within
    const wrapper = field.closest('.v-input, .v-text-field, [class*="v-input"]');
    if (wrapper) {
        const hidden = wrapper.querySelector('input[type="hidden"]');
        if (hidden && hidden.value) return hidden.value.trim();
    }

    // Fallback: check nearby hidden inputs in parent containers
    let parent = field.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
        const hidden = parent.querySelector('input[type="hidden"]');
        if (hidden && hidden.value) return hidden.value.trim();
        parent = parent.parentElement;
    }

    // Check the HTML value attribute (set by server-side rendering or hydration)
    const attrValue = field.getAttribute('value');
    if (attrValue) return attrValue.trim();

    return '';
}

/**
 * Check if an element is visible
 */
function isVisible(element) {
    if (!element) return false;

    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();

    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           rect.width > 0 &&
           rect.height > 0;
}

/**
 * Inject the floating lemon button near a password field
 */
function injectLemonButton(passwordField) {
    // Create shadow host for isolation
    const shadowHost = document.createElement('div');
    shadowHost.className = 'lemonade-shadow-host';
    shadowHost.style.cssText = 'position: absolute; z-index: 2147483647; pointer-events: none;';

    const shadow = shadowHost.attachShadow({ mode: 'closed' });

    // Create the lemon button with animated GIF
    const button = document.createElement('button');
    button.className = 'lemonade-btn';
    button.title = 'Autofill with Lemonade';

    const lemonImg = document.createElement('img');
    lemonImg.src = chrome.runtime.getURL('icons/lemon-animated.gif');
    lemonImg.alt = 'Lemonade';
    lemonImg.className = 'lemonade-img';
    button.appendChild(lemonImg);

    // Inject styles into shadow DOM
    const styles = document.createElement('style');
    styles.textContent = `
        .lemonade-btn {
            all: initial;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 48px;
            height: 48px;
            border: none;
            background: transparent;
            cursor: pointer;
            pointer-events: auto;
            transition: transform 0.2s ease;
            animation: lemonade-bounce 0.5s ease;
        }

        .lemonade-btn:active {
            transform: scale(0.95);
        }

        .lemonade-img {
            width: 48px;
            height: 48px;
            filter:
                drop-shadow(0 0 1.2px #000)
                drop-shadow(0 0 1.2px #000);
            transition: filter 0.2s ease;
        }

        .lemonade-btn:hover .lemonade-img {
            filter:
                drop-shadow(0 0 1.2px #000)
                drop-shadow(0 0 1.2px #000)
                drop-shadow(0 0 8px rgba(255,217,61,0.9));
        }

        @keyframes lemonade-bounce {
            0% { transform: scale(0); opacity: 0; }
            50% { transform: scale(1.2); }
            100% { transform: scale(1); opacity: 1; }
        }

        .lemonade-dropdown {
            position: absolute;
            top: 100%;
            right: 0;
            margin-top: 4px;
            min-width: 200px;
            max-width: 300px;
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.15);
            overflow: hidden;
            pointer-events: auto;
            animation: lemonade-fadeIn 0.2s ease;
        }

        .lemonade-dropdown-header {
            padding: 12px;
            background: linear-gradient(135deg, #FFD93D 0%, #F7DC6F 100%);
            color: #333;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 12px;
            font-weight: 600;
        }

        .lemonade-dropdown-item {
            display: flex;
            align-items: center;
            padding: 10px 12px;
            cursor: pointer;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            color: #333;
            border-bottom: 1px solid #f0f0f0;
            transition: background 0.15s ease;
        }

        .lemonade-dropdown-item:hover {
            background: #f8f9fa;
        }

        .lemonade-dropdown-item:last-child {
            border-bottom: none;
        }

        .lemonade-dropdown-icon {
            width: 32px;
            height: 32px;
            border-radius: 6px;
            background: #e9ecef;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-right: 10px;
            font-size: 14px;
        }

        .lemonade-dropdown-text {
            flex: 1;
            overflow: hidden;
        }

        .lemonade-dropdown-title {
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .lemonade-dropdown-subtitle {
            font-size: 11px;
            color: #666;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }

        .lemonade-empty {
            padding: 20px;
            text-align: center;
            color: #666;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
        }

        .lemonade-loading {
            padding: 20px;
            text-align: center;
        }

        .lemonade-spinner {
            width: 24px;
            height: 24px;
            border: 2px solid #f0f0f0;
            border-top-color: #FFD93D;
            border-radius: 50%;
            animation: lemonade-spin 0.8s linear infinite;
        }

        @keyframes lemonade-spin {
            to { transform: rotate(360deg); }
        }

        @keyframes lemonade-fadeIn {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
        }

        /* Fill animation when credential is selected */
        .lemonade-filling {
            position: relative;
            overflow: hidden;
            background: transparent !important;
        }

        .lemonade-filling::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            height: 100%;
            width: 100%;
            background: linear-gradient(90deg, #FFF4B8 0%, #FFD93D 50%, #FFF4B8 100%);
            background-size: 200% 100%;
            animation: lemonade-sweep 1s ease infinite;
            opacity: 0.4;
            z-index: 0;
            border-radius: 6px;
        }

        @keyframes lemonade-sweep {
            0% { background-position: 100% 0; }
            100% { background-position: -100% 0; }
        }

        .lemonade-fill-text {
            font-size: 12px;
            color: #B8860B;
            font-weight: 600;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            position: relative;
            z-index: 1;
        }

        .lemonade-fill-spinner {
            width: 20px;
            height: 20px;
            border: 2px solid #FFE88D;
            border-top-color: #D4A000;
            border-radius: 50%;
            animation: lemonade-spin 0.6s linear infinite;
            position: relative;
            z-index: 1;
        }

        /* Exit animations */
        .lemonade-exit {
            animation: lemonade-dropdown-exit 0.4s ease forwards;
        }

        @keyframes lemonade-dropdown-exit {
            0% { opacity: 1; transform: translateY(0) scale(1); }
            100% { opacity: 0; transform: translateY(-8px) scale(0.95); }
        }

        .lemonade-bye {
            animation: lemonade-fly-away 0.5s ease forwards;
        }

        @keyframes lemonade-fly-away {
            0% { transform: scale(1) rotate(0deg); opacity: 1; }
            50% { transform: scale(1.2) rotate(-10deg); opacity: 1; }
            100% { transform: scale(0) rotate(20deg) translateY(-30px); opacity: 0; }
        }
    `;

    shadow.appendChild(styles);
    shadow.appendChild(button);

    // Position the button
    positionLemonButton(shadowHost, passwordField);
    document.body.appendChild(shadowHost);

    // Store references
    const context = {
        shadowHost,
        shadow,
        button,
        passwordField,
        usernameField: findUsernameField(passwordField),
        dropdown: null
    };

    // Event handlers
    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleDropdown(context);
    });

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
        if (context.dropdown && !shadowHost.contains(e.target)) {
            closeDropdown(context);
        }
    });

    // Reposition on scroll/resize
    const repositionHandler = () => positionLemonButton(shadowHost, passwordField);
    window.addEventListener('scroll', repositionHandler, { passive: true });
    window.addEventListener('resize', repositionHandler, { passive: true });

    // Clean up if field is removed
    const observer = new MutationObserver(() => {
        if (!document.body.contains(passwordField)) {
            shadowHost.remove();
            observer.disconnect();
            window.removeEventListener('scroll', repositionHandler);
            window.removeEventListener('resize', repositionHandler);
        }
    });
    observer.observe(document.body, { childList: true, subtree: true });
}

/**
 * Position the lemon button relative to the password field
 */
function positionLemonButton(shadowHost, field) {
    const rect = field.getBoundingClientRect();
    const scrollX = window.scrollX || window.pageXOffset;
    const scrollY = window.scrollY || window.pageYOffset;

    shadowHost.style.left = `${rect.right + scrollX - 52}px`;
    shadowHost.style.top = `${rect.top + scrollY + (rect.height - 48) / 2}px`;
}

/**
 * Toggle the credentials dropdown
 */
function toggleDropdown(context) {
    if (context.dropdown) {
        closeDropdown(context);
    } else {
        openDropdown(context);
    }
}

/**
 * Open the credentials dropdown
 */
async function openDropdown(context) {
    const dropdown = document.createElement('div');
    dropdown.className = 'lemonade-dropdown';

    // Show loading state
    dropdown.innerHTML = `
        <div class="lemonade-dropdown-header">Lemonade Pass</div>
        <div class="lemonade-loading">
            <div class="lemonade-spinner"></div>
        </div>
    `;

    context.shadow.appendChild(dropdown);
    context.dropdown = dropdown;

    // Request credentials from background
    try {
        const domain = window.location.hostname;
        const response = await chrome.runtime.sendMessage({
            type: 'GET_CREDENTIALS',
            domain: domain
        });

        if (response && response.success && response.credentials.length > 0) {
            renderCredentials(context, response.credentials);
        } else if (response && response.needsLogin) {
            renderLoginPrompt(context);
        } else {
            renderEmpty(context, domain);
        }
    } catch (error) {
        renderError(context);
    }
}

/**
 * Close the credentials dropdown
 */
function closeDropdown(context) {
    if (context.dropdown) {
        context.dropdown.remove();
        context.dropdown = null;
    }
}

/**
 * Render credentials in the dropdown
 */
function renderCredentials(context, credentials) {
    const dropdown = context.dropdown;
    if (!dropdown) return;

    const itemsHtml = credentials.map((cred, index) => `
        <div class="lemonade-dropdown-item" data-index="${index}">
            <div class="lemonade-dropdown-icon">${getIconForUrl(cred.url)}</div>
            <div class="lemonade-dropdown-text">
                <div class="lemonade-dropdown-title">${escapeHtml(cred.title)}</div>
                <div class="lemonade-dropdown-subtitle">${escapeHtml(cred.username)}</div>
            </div>
        </div>
    `).join('');

    dropdown.innerHTML = `
        <div class="lemonade-dropdown-header">Select credential</div>
        ${itemsHtml}
    `;

    // Add click handlers
    dropdown.querySelectorAll('.lemonade-dropdown-item').forEach(item => {
        item.addEventListener('click', async () => {
            const index = parseInt(item.dataset.index);
            const cred = credentials[index];

            // Transform item into loading state
            item.classList.add('lemonade-filling');
            const textEl = item.querySelector('.lemonade-dropdown-text');
            const iconEl = item.querySelector('.lemonade-dropdown-icon');
            if (textEl) textEl.innerHTML = '<div class="lemonade-fill-text">Filling...</div>';
            if (iconEl) iconEl.innerHTML = '<div class="lemonade-fill-spinner"></div>';

            // Disable other items
            dropdown.querySelectorAll('.lemonade-dropdown-item').forEach(i => {
                if (i !== item) i.style.opacity = '0.3';
                i.style.pointerEvents = 'none';
            });

            await fillCredentials(context, cred);

            // Animate out: dropdown fades, lemon flies away
            dropdown.classList.add('lemonade-exit');
            context.button.classList.add('lemonade-bye');
            setTimeout(() => {
                closeDropdown(context);
                context.shadowHost.remove();
            }, 500);
        });
    });
}

/**
 * Render login prompt
 */
function renderLoginPrompt(context) {
    const dropdown = context.dropdown;
    if (!dropdown) return;

    dropdown.innerHTML = `
        <div class="lemonade-dropdown-header">Lemonade Pass</div>
        <div class="lemonade-empty">
            <p>Please log in to use Lemonade</p>
            <p style="font-size: 11px; margin-top: 8px;">Click the extension icon to log in</p>
        </div>
    `;
}

/**
 * Render empty state
 */
function renderEmpty(context, domain) {
    const dropdown = context.dropdown;
    if (!dropdown) return;

    dropdown.innerHTML = `
        <div class="lemonade-dropdown-header">Lemonade Pass</div>
        <div class="lemonade-empty">
            <p>No credentials for ${escapeHtml(domain)}</p>
            <p style="font-size: 11px; margin-top: 8px;">Add credentials in the Lemonade app</p>
        </div>
    `;
}

/**
 * Render error state
 */
function renderError(context) {
    const dropdown = context.dropdown;
    if (!dropdown) return;

    dropdown.innerHTML = `
        <div class="lemonade-dropdown-header">Lemonade Pass</div>
        <div class="lemonade-empty">
            <p>Error loading credentials</p>
            <p style="font-size: 11px; margin-top: 8px;">Please try again</p>
        </div>
    `;
}

/**
 * Fill credentials into the form
 */
async function fillCredentials(context, credential) {
    // Get decrypted password from background
    const response = await chrome.runtime.sendMessage({
        type: 'GET_DECRYPTED_PASSWORD',
        entryId: credential.id
    });

    if (!response || !response.success) {
        return;
    }

    const password = response.password;
    const username = credential.username;

    // Fill username if field exists
    if (context.usernameField && username) {
        fillField(context.usernameField, username);
    }

    // Fill password
    if (context.passwordField && password) {
        fillField(context.passwordField, password);
    }

}

/**
 * Fill a field and trigger appropriate events
 */
function fillField(field, value) {
    // Focus the field
    field.focus();

    // Set the value
    field.value = value;

    // Trigger events to notify frameworks (React, Angular, Vue, etc.)
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
    field.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));

    // Blur to trigger validation
    field.blur();
}

/**
 * Observe DOM changes to detect dynamically added forms
 */
function observeDOMChanges() {
    const observer = new MutationObserver((mutations) => {
        let shouldScan = false;

        for (const mutation of mutations) {
            if (mutation.addedNodes.length > 0) {
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        if (node.querySelector &&
                            (node.querySelector('input[type="password"]') ||
                             node.matches && node.matches('input[type="password"]'))) {
                            shouldScan = true;
                            break;
                        }
                    }
                }
            }
            if (shouldScan) break;
        }

        if (shouldScan) {
            // Debounce scanning
            clearTimeout(window.lemonadeScanTimeout);
            window.lemonadeScanTimeout = setTimeout(scanForLoginForms, 100);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}

/**
 * Get an icon emoji for a URL
 */
function getIconForUrl(url) {
    if (!url) return '🔑';

    const domain = url.toLowerCase();

    if (domain.includes('google')) return '🔵';
    if (domain.includes('github')) return '🐙';
    if (domain.includes('facebook') || domain.includes('meta')) return '📘';
    if (domain.includes('twitter') || domain.includes('x.com')) return '🐦';
    if (domain.includes('amazon')) return '📦';
    if (domain.includes('apple')) return '🍎';
    if (domain.includes('microsoft')) return '🪟';
    if (domain.includes('netflix')) return '🎬';
    if (domain.includes('spotify')) return '🎵';
    if (domain.includes('linkedin')) return '💼';

    return '🔑';
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// Form Submit Interception & Credential Capture
// ============================================================

/**
 * Set up listeners to intercept form submissions and SPA button clicks
 */
function setupFormSubmitInterception() {
    // Capture phase so we get the values before the page navigates
    document.addEventListener('submit', handleFormSubmit, true);
    document.addEventListener('click', handleButtonClick, true);
}

/**
 * Handle traditional form submit events
 */
function handleFormSubmit(event) {
    const form = event.target;
    if (!form || form.tagName !== 'FORM') return;

    const passwordFields = form.querySelectorAll('input[type="password"]');
    for (const pwField of passwordFields) {
        if (pwField.value) {
            captureAndHandle(form, pwField);
            return;
        }
    }
}

/**
 * Handle click events on submit-like buttons (for SPAs without <form> tags)
 */
function handleButtonClick(event) {
    const target = event.target.closest('button, input[type="submit"], a[role="button"], div[role="button"]');
    if (!target) return;

    // Skip type="submit" buttons inside forms — the submit event handler catches those.
    // type="button" inside forms must be processed here (common SPA pattern: form exists but
    // submission is handled via button click, not native form submit).
    if (target.closest('form') && target.type === 'submit') return;

    const buttonText = (target.textContent || target.value || '').toLowerCase().trim();
    const submitPatterns = [
        'sign up', 'sign in', 'register', 'log in', 'login', 'signin', 'signup',
        'create account', 'submit',
        'iniciar', 'registrar', 'entrar', 'crear cuenta'
    ];

    const isSubmitButton = submitPatterns.some(pattern => buttonText.includes(pattern));
    if (!isSubmitButton) return;

    // Look for a visible password field near this button
    const passwordFields = findPasswordFields();
    for (const pwField of passwordFields) {
        if (pwField.value) {
            // Use the closest shared container or body as context
            const container = target.closest('div[class], section, main') || document.body;
            captureAndHandle(container, pwField);
            return;
        }
    }
}

/**
 * Capture form data and pass to the credential handler
 */
function captureAndHandle(container, passwordField) {
    const capturedData = captureFormData(container, passwordField);
    if (capturedData && capturedData.password) {
        handleCapturedCredential(capturedData);
    }
}

/**
 * Extract credential data from a form container
 */
function captureFormData(container, passwordField) {
    const usernameField = findUsernameField(passwordField);
    const username = getFieldValue(usernameField);
    const password = passwordField.value;

    if (!password) return null;

    // Clean document.title — strip common suffixes
    let title = document.title || window.location.hostname;
    title = title.replace(/\s*[-|·—]\s*(sign\s*(in|up)|log\s*in|register|login|signup|create\s*account|iniciar\s*sesi[oó]n|registr(o|arse)).*$/i, '');
    title = title.trim();
    if (!title) title = window.location.hostname;

    return {
        title,
        username,
        password,
        url: window.location.hostname
    };
}

/**
 * Handle a captured credential — check auth, find existing, show toast
 */
async function handleCapturedCredential(capturedData) {
    try {
        // Check if this domain is permanently dismissed
        const { dismissedDomains = [] } = await chrome.storage.local.get('dismissedDomains');
        if (dismissedDomains.includes(capturedData.url)) return;

        // Check if user is logged in
        const authResponse = await chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' });
        if (!authResponse || !authResponse.isLoggedIn) {
            return;
        }

        // Check for existing credentials with the EXACT same hostname
        // (base domain fallback is useful for autofill, but not for save/update decisions)
        let existingEntry = null;
        try {
            const credResponse = await chrome.runtime.sendMessage({
                type: 'GET_CREDENTIALS',
                domain: capturedData.url
            });

            if (credResponse && credResponse.success && credResponse.credentials) {
                // Only match entries whose URL hostname is exactly this hostname
                const currentHost = capturedData.url.toLowerCase();
                existingEntry = credResponse.credentials.find(c => {
                    if (!c.username || c.username.toLowerCase() !== capturedData.username.toLowerCase()) return false;
                    try {
                        return new URL(c.url).hostname.toLowerCase() === currentHost;
                    } catch {
                        return c.url.toLowerCase() === currentHost;
                    }
                }) || null;
            }
        } catch (e) {
            // Failed to check existing — treat as new
        }

        // If exact match found, check if password actually changed
        if (existingEntry) {
            try {
                const pwResponse = await chrome.runtime.sendMessage({
                    type: 'GET_DECRYPTED_PASSWORD',
                    entryId: existingEntry.id
                });
                if (pwResponse && pwResponse.success && pwResponse.password === capturedData.password) {
                    return; // Same password — nothing to update
                }
            } catch (e) {
                // Failed to compare — show toast as fallback
            }
        }

        // Show toast immediately (SPA — page doesn't reload)
        showSaveToast(capturedData, existingEntry);

        // Store pending credential via background for navigation survival (classic form submits)
        try {
            await chrome.runtime.sendMessage({
                type: 'SET_PENDING_CREDENTIAL',
                credential: capturedData,
                existingEntry: existingEntry
            });
        } catch (e) {
            // Background may not be ready yet
        }
    } catch (error) {
        // Silently fail — never interrupt the user's flow
    }
}

/**
 * On page load, check for a pending credential from a previous page
 */
async function checkPendingCredential() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_PENDING_CREDENTIAL' });
        if (!response?.data?.pendingCredential) return;
        if (response.data.pendingCredential.url !== window.location.hostname) return;
        showSaveToast(response.data.pendingCredential, response.data.pendingExistingEntry);
    } catch (e) {
        // Silently fail
    }
}

// ============================================================
// Save Credential Toast Banner
// ============================================================

/**
 * Show a floating toast banner to save or update a credential
 */
function showSaveToast(capturedData, existingEntry) {
    // Prevent duplicate toasts
    if (activeSaveToast) {
        dismissToast(activeSaveToast);
    }

    const isUpdate = !!existingEntry;
    const headerText = isUpdate ? 'Update in Lemonade?' : 'Save to Lemonade?';
    const actionText = isUpdate ? 'Update' : 'Save';

    // Create shadow host
    const shadowHost = document.createElement('div');
    shadowHost.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 2147483647;';
    const shadow = shadowHost.attachShadow({ mode: 'closed' });
    shadowHost._lemonadeShadow = shadow;

    // Inject styles
    const styles = document.createElement('style');
    styles.textContent = `
        @keyframes lemonade-toast-slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes lemonade-toast-fadeOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(20px); }
        }
        @keyframes lemonade-toast-spin {
            to { transform: rotate(360deg); }
        }

        .lemonade-toast {
            width: 340px;
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.08);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            overflow: hidden;
            animation: lemonade-toast-slideUp 0.35s ease;
        }
        .lemonade-toast.fade-out {
            animation: lemonade-toast-fadeOut 0.3s ease forwards;
        }

        .lemonade-toast-header {
            display: flex;
            align-items: center;
            padding: 12px 14px;
            background: linear-gradient(135deg, #FFD93D 0%, #F7DC6F 100%);
            color: #333;
            font-size: 14px;
            font-weight: 600;
        }
        .lemonade-toast-header img {
            width: 28px;
            height: 28px;
            margin-right: 10px;
            filter: drop-shadow(0 0 1.2px #000) drop-shadow(0 0 1.2px #000);
        }
        .lemonade-toast-header-text {
            flex: 1;
        }
        .lemonade-toast-close {
            all: initial;
            cursor: pointer;
            font-size: 18px;
            color: #555;
            padding: 2px 6px;
            border-radius: 4px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        .lemonade-toast-close:hover {
            background: rgba(0,0,0,0.1);
        }

        .lemonade-toast-body {
            padding: 14px;
        }
        .lemonade-toast-row {
            margin-bottom: 10px;
        }
        .lemonade-toast-row:last-child {
            margin-bottom: 0;
        }
        .lemonade-toast-label {
            font-size: 11px;
            color: #888;
            margin-bottom: 3px;
            text-transform: uppercase;
            font-weight: 500;
            letter-spacing: 0.3px;
        }
        .lemonade-toast-value {
            font-size: 13px;
            color: #333;
            word-break: break-all;
        }
        /* (title & username inputs share .lemonade-toast-input styles above) */

        .lemonade-toast-input {
            all: initial;
            display: block;
            width: 100%;
            box-sizing: border-box;
            padding: 6px 8px;
            font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #333;
            border: 1px solid #ddd;
            border-radius: 6px;
            background: #fafafa;
        }
        .lemonade-toast-input:focus {
            outline: none;
            border-color: #FFD93D;
            background: #fff;
        }

        .lemonade-toast-error {
            display: none;
            padding: 8px 14px;
            font-size: 12px;
            color: #d32f2f;
            background: #ffeaea;
        }
        .lemonade-toast-error.visible {
            display: block;
        }

        .lemonade-toast-actions {
            display: flex;
            flex-wrap: wrap;
            padding: 10px 14px 14px;
            gap: 10px;
        }
        .lemonade-toast-never {
            all: initial;
            width: 100%;
            text-align: center;
            font-size: 11px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            color: #999;
            cursor: pointer;
            padding: 2px 0 0;
        }
        .lemonade-toast-never:hover {
            color: #666;
            text-decoration: underline;
        }
        .lemonade-toast-btn {
            all: initial;
            flex: 1;
            padding: 8px 14px;
            font-size: 13px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            border-radius: 8px;
            cursor: pointer;
            text-align: center;
            transition: opacity 0.15s ease;
        }
        .lemonade-toast-btn:hover {
            opacity: 0.85;
        }
        .lemonade-toast-btn.dismiss {
            background: #f0f0f0;
            color: #555;
            font-weight: 500;
        }
        .lemonade-toast-btn.save {
            background: linear-gradient(135deg, #FFD93D 0%, #F7DC6F 100%);
            color: #333;
            font-weight: 600;
        }
        .lemonade-toast-btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }
        .lemonade-toast-spinner {
            display: inline-block;
            width: 14px;
            height: 14px;
            border: 2px solid #e0c830;
            border-top-color: #333;
            border-radius: 50%;
            animation: lemonade-toast-spin 0.6s linear infinite;
            vertical-align: middle;
            margin-right: 6px;
        }
        .lemonade-toast-success {
            color: #2e7d32;
            font-weight: 600;
        }
    `;
    shadow.appendChild(styles);

    // Build toast container
    const toast = document.createElement('div');
    toast.className = 'lemonade-toast';

    // -- Header --
    const header = document.createElement('div');
    header.className = 'lemonade-toast-header';

    const lemonImg = document.createElement('img');
    lemonImg.src = chrome.runtime.getURL('icons/lemon-animated.gif');
    lemonImg.alt = 'Lemonade';

    const headerTextEl = document.createElement('span');
    headerTextEl.className = 'lemonade-toast-header-text';
    headerTextEl.textContent = headerText;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lemonade-toast-close';
    closeBtn.textContent = '\u00D7'; // multiplication sign (x)

    header.appendChild(lemonImg);
    header.appendChild(headerTextEl);
    header.appendChild(closeBtn);

    // -- Body --
    const body = document.createElement('div');
    body.className = 'lemonade-toast-body';

    // Title row (editable input)
    const titleRow = document.createElement('div');
    titleRow.className = 'lemonade-toast-row';
    const titleLabel = document.createElement('div');
    titleLabel.className = 'lemonade-toast-label';
    titleLabel.textContent = 'Title';
    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.className = 'lemonade-toast-input';
    titleInput.value = capturedData.title;
    titleRow.appendChild(titleLabel);
    titleRow.appendChild(titleInput);

    // User row (editable input)
    const userRow = document.createElement('div');
    userRow.className = 'lemonade-toast-row';
    const userLabel = document.createElement('div');
    userLabel.className = 'lemonade-toast-label';
    userLabel.textContent = 'User';
    const userInput = document.createElement('input');
    userInput.type = 'text';
    userInput.className = 'lemonade-toast-input';
    userInput.value = capturedData.username;
    userInput.placeholder = 'username or email';
    userRow.appendChild(userLabel);
    userRow.appendChild(userInput);

    // URL row (static)
    const urlRow = document.createElement('div');
    urlRow.className = 'lemonade-toast-row';
    const urlLabel = document.createElement('div');
    urlLabel.className = 'lemonade-toast-label';
    urlLabel.textContent = 'URL';
    const urlValue = document.createElement('div');
    urlValue.className = 'lemonade-toast-value';
    urlValue.textContent = capturedData.url;
    urlRow.appendChild(urlLabel);
    urlRow.appendChild(urlValue);

    body.appendChild(titleRow);
    body.appendChild(userRow);
    body.appendChild(urlRow);

    // -- Error area --
    const errorArea = document.createElement('div');
    errorArea.className = 'lemonade-toast-error';

    // -- Actions --
    const actions = document.createElement('div');
    actions.className = 'lemonade-toast-actions';

    const dismissBtn = document.createElement('button');
    dismissBtn.className = 'lemonade-toast-btn dismiss';
    dismissBtn.textContent = 'Dismiss';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'lemonade-toast-btn save';
    saveBtn.textContent = actionText;

    const neverBtn = document.createElement('button');
    neverBtn.className = 'lemonade-toast-never';
    neverBtn.textContent = 'Never for this site';

    actions.appendChild(dismissBtn);
    actions.appendChild(saveBtn);
    actions.appendChild(neverBtn);

    // Assemble toast
    toast.appendChild(header);
    toast.appendChild(body);
    toast.appendChild(errorArea);
    toast.appendChild(actions);
    shadow.appendChild(toast);

    // Add to page
    document.body.appendChild(shadowHost);
    activeSaveToast = shadowHost;

    // -- Auto-dismiss timer --
    let autoDismissTimer = setTimeout(() => dismissToast(shadowHost), 15000);
    const resetTimer = () => {
        clearTimeout(autoDismissTimer);
        autoDismissTimer = setTimeout(() => dismissToast(shadowHost), 15000);
    };

    // Reset timer on any interaction within the toast
    toast.addEventListener('click', resetTimer);
    toast.addEventListener('input', resetTimer);
    toast.addEventListener('focus', resetTimer, true);

    // -- Event handlers --
    closeBtn.addEventListener('click', () => {
        clearTimeout(autoDismissTimer);
        dismissToast(shadowHost);
    });

    dismissBtn.addEventListener('click', () => {
        clearTimeout(autoDismissTimer);
        dismissToast(shadowHost);
    });

    neverBtn.addEventListener('click', async () => {
        clearTimeout(autoDismissTimer);
        try {
            const { dismissedDomains = [] } = await chrome.storage.local.get('dismissedDomains');
            if (!dismissedDomains.includes(capturedData.url)) {
                dismissedDomains.push(capturedData.url);
                await chrome.storage.local.set({ dismissedDomains });
            }
        } catch (e) {
            // Silently fail
        }
        dismissToast(shadowHost);
    });

    saveBtn.addEventListener('click', async () => {
        // Disable buttons, show spinner via DOM (no innerHTML)
        saveBtn.disabled = true;
        dismissBtn.disabled = true;

        // Build spinner + "Saving..." text using DOM methods
        saveBtn.textContent = '';
        const spinner = document.createElement('span');
        spinner.className = 'lemonade-toast-spinner';
        const savingText = document.createTextNode(' Saving...');
        saveBtn.appendChild(spinner);
        saveBtn.appendChild(savingText);

        errorArea.classList.remove('visible');
        errorArea.textContent = '';

        const editedTitle = titleInput.value.trim() || capturedData.title;
        const editedUsername = userInput.value.trim();
        let url = capturedData.url;
        if (url && !url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }

        try {
            let response;
            if (isUpdate && existingEntry) {
                response = await chrome.runtime.sendMessage({
                    type: 'UPDATE_CREDENTIAL',
                    entryId: existingEntry.id,
                    credential: {
                        title: editedTitle,
                        username: editedUsername,
                        password: capturedData.password,
                        url: url
                    }
                });
            } else {
                response = await chrome.runtime.sendMessage({
                    type: 'SAVE_CREDENTIAL',
                    credential: {
                        title: editedTitle,
                        username: editedUsername,
                        password: capturedData.password,
                        url: url
                    }
                });
            }

            if (response && response.success) {
                // Invalidate credentials cache so lemon button picks up new data
                credentialsCache = null;
                credentialsCacheExpiry = 0;

                // Show success text via DOM (no innerHTML)
                saveBtn.textContent = '';
                const successSpan = document.createElement('span');
                successSpan.className = 'lemonade-toast-success';
                successSpan.textContent = isUpdate ? 'Updated!' : 'Saved!';
                saveBtn.appendChild(successSpan);

                clearTimeout(autoDismissTimer);
                setTimeout(() => dismissToast(shadowHost), 1500);
            } else {
                const errMsg = (response && response.error) || 'Failed to save credential';
                errorArea.textContent = errMsg;
                errorArea.classList.add('visible');
                saveBtn.disabled = false;
                dismissBtn.disabled = false;
                saveBtn.textContent = actionText;
            }
        } catch (err) {
            errorArea.textContent = 'Connection error. Please try again.';
            errorArea.classList.add('visible');
            saveBtn.disabled = false;
            dismissBtn.disabled = false;
            saveBtn.textContent = actionText;
        }
    });
}

/**
 * Dismiss and remove the save toast with a fade-out animation
 */
function dismissToast(shadowHost) {
    if (!shadowHost || !document.body.contains(shadowHost)) return;

    if (activeSaveToast === shadowHost) {
        activeSaveToast = null;
    }

    const shadow = shadowHost._lemonadeShadow;
    if (shadow) {
        const toast = shadow.querySelector('.lemonade-toast');
        if (toast) {
            toast.classList.add('fade-out');
            setTimeout(() => {
                shadowHost.remove();
            }, 300);
            return;
        }
    }

    // Fallback: remove immediately
    shadowHost.remove();
}

/**
 * Listen for autofill messages from popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'AUTOFILL') {
        const passwordFields = findPasswordFields();

        if (passwordFields.length > 0) {
            const passwordField = passwordFields[0];
            const usernameField = findUsernameField(passwordField);

            // Fill username
            if (usernameField && message.username) {
                fillField(usernameField, message.username);
            }

            // Fill password
            if (passwordField && message.password) {
                fillField(passwordField, message.password);
            }

            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'No password field found' });
        }
    }

    return true;
});
