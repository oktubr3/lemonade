/**
 * Lemonade Pass Manager - Popup Script (Firefox)
 */

// DOM Elements
const loginView = document.getElementById('login-view');
const mainView = document.getElementById('main-view');
const errorView = document.getElementById('error-view');
const googleLoginBtn = document.getElementById('google-login-btn');
const logoutBtn = document.getElementById('logout-btn');
const userEmail = document.getElementById('user-email');
const userAvatar = document.getElementById('user-avatar');
const searchInput = document.getElementById('search-input');
const credentialsList = document.getElementById('credentials-list');
const errorText = document.getElementById('error-text');
const retryBtn = document.getElementById('retry-btn');
const sortBtn = document.getElementById('sort-btn');
const sortLabel = document.getElementById('sort-label');

// State
let credentials = [];
let currentUser = null;
let sortOrder = 'asc'; // 'asc' = A-Z, 'desc' = Z-A

/**
 * Initialize popup
 */
async function init() {
    try {
        // Check if user is logged in
        const response = await browser.runtime.sendMessage({ type: 'GET_AUTH_STATE' });

        if (response && response.isLoggedIn) {
            currentUser = response.user;
            showMainView();
            await loadCredentials();
        } else {
            showLoginView();
        }
    } catch (error) {
        showError('Failed to initialize');
    }
}

/**
 * Show login view
 */
function showLoginView() {
    loginView.classList.remove('hidden');
    mainView.classList.add('hidden');
    errorView.classList.add('hidden');
}

/**
 * Show main view
 */
function showMainView() {
    loginView.classList.add('hidden');
    mainView.classList.remove('hidden');
    errorView.classList.add('hidden');

    // Update user info
    if (currentUser) {
        userEmail.textContent = currentUser.email || 'User';
        userAvatar.textContent = (currentUser.email || 'U').charAt(0).toUpperCase();
    }
}

/**
 * Show error view
 */
function showError(message) {
    loginView.classList.add('hidden');
    mainView.classList.add('hidden');
    errorView.classList.remove('hidden');
    errorText.textContent = message;
}

/**
 * Load credentials from background
 */
async function loadCredentials() {
    credentialsList.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
        </div>
    `;

    try {
        const response = await browser.runtime.sendMessage({ type: 'GET_ALL_CREDENTIALS' });

        if (response && response.success) {
            credentials = response.credentials || [];
            renderCredentials(credentials);
        } else {
            renderEmpty();
        }
    } catch (error) {
        credentialsList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">⚠️</div>
                <p>Failed to load credentials</p>
            </div>
        `;
    }
}

/**
 * Sort credentials - highlighted first, then alphabetically
 */
function sortCredentials(items) {
    return [...items].sort((a, b) => {
        // Highlighted items first
        if (a.highlighted && !b.highlighted) return -1;
        if (!a.highlighted && b.highlighted) return 1;

        // Then sort alphabetically
        const titleA = (a.title || '').toLowerCase();
        const titleB = (b.title || '').toLowerCase();

        if (sortOrder === 'asc') {
            return titleA.localeCompare(titleB);
        } else {
            return titleB.localeCompare(titleA);
        }
    });
}

/**
 * Render credentials list
 */
function renderCredentials(items) {
    if (items.length === 0) {
        renderEmpty();
        return;
    }

    const sortedItems = sortCredentials(items);

    credentialsList.innerHTML = sortedItems.map((cred, index) => `
        <div class="credential-item ${cred.highlighted ? 'highlighted' : ''}" data-index="${index}" data-id="${cred.id}">
            <div class="credential-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4"></path>
                </svg>
            </div>
            <div class="credential-details">
                <div class="credential-title">${escapeHtml(cred.title)}</div>
                ${cred.username ? `<div class="credential-username">${escapeHtml(cred.username)}</div>` : ''}
            </div>
            ${cred.highlighted ? `
                <div class="credential-star">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#4CAF50" stroke="#4CAF50" stroke-width="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                </div>
            ` : ''}
            <button class="credential-copy" data-id="${cred.id}" title="Copy password">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                </svg>
            </button>
        </div>
    `).join('');

    // Add click handlers for items
    credentialsList.querySelectorAll('.credential-item').forEach(item => {
        item.addEventListener('click', async (e) => {
            // Don't trigger if clicking copy button or star
            if (e.target.closest('.credential-copy') || e.target.closest('.credential-star')) return;

            const id = item.dataset.id;
            const cred = credentials.find(c => c.id === id);
            if (cred) await autofillCredential(cred);
        });
    });

    // Add click handlers for copy buttons
    credentialsList.querySelectorAll('.credential-copy').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = btn.dataset.id;
            const cred = credentials.find(c => c.id === id);
            if (cred) await copyPassword(cred);
        });
    });
}

/**
 * Render empty state
 */
function renderEmpty() {
    credentialsList.innerHTML = `
        <div class="empty-state">
            <div class="empty-icon">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
            </div>
            <p>No passwords saved yet</p>
            <p style="font-size: 12px; margin-top: 4px; opacity: 0.7;">Add passwords in the Lemonade app</p>
        </div>
    `;
}

/**
 * Autofill credential to active tab
 */
async function autofillCredential(credential) {
    try {
        // Get decrypted password
        const response = await browser.runtime.sendMessage({
            type: 'GET_DECRYPTED_PASSWORD',
            entryId: credential.id
        });

        if (!response || !response.success) {
            showToast('Failed to get password');
            return;
        }

        // Get active tab
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];

        if (!tab) {
            showToast('No active tab');
            return;
        }

        // Validate origin match before autofilling to prevent cross-site/cross-scheme injection
        if (credential.url) {
            const tabUrl = new URL(tab.url);
            const credUrl = new URL(credential.url);
            const tabHost = tabUrl.hostname.replace(/^www\./, '');
            const credHost = credUrl.hostname.replace(/^www\./, '');
            if (tabUrl.protocol !== credUrl.protocol || tabHost !== credHost) {
                showToast(`URL mismatch: cannot autofill here`);
                return;
            }
        }

        // Send credentials to content script
        await browser.tabs.sendMessage(tab.id, {
            type: 'AUTOFILL',
            username: credential.username,
            password: response.password
        });

        showToast('Credentials filled!');

        // Close popup after a short delay
        setTimeout(() => window.close(), 500);
    } catch (error) {
        showToast('Failed to autofill');
    }
}

/**
 * Copy password to clipboard
 */
async function copyPassword(credential) {
    try {
        const response = await browser.runtime.sendMessage({
            type: 'GET_DECRYPTED_PASSWORD',
            entryId: credential.id
        });

        if (!response || !response.success) {
            showToast('Failed to get password');
            return;
        }

        await navigator.clipboard.writeText(response.password);
        showToast('Password copied!');
    } catch (error) {
        showToast('Failed to copy');
    }
}

/**
 * Handle Google login
 */
async function handleGoogleLogin() {
    try {
        googleLoginBtn.disabled = true;
        googleLoginBtn.textContent = 'Signing in...';

        const response = await browser.runtime.sendMessage({ type: 'LOGIN_WITH_GOOGLE' });

        if (response && response.success) {
            currentUser = response.user;
            showMainView();
            await loadCredentials();
        } else {
            showError(response?.error || 'Login failed');
        }
    } catch (error) {
        showError('Login failed');
    } finally {
        googleLoginBtn.disabled = false;
        googleLoginBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#fff" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#fff" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#fff" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#fff" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Sign in with Google
        `;
    }
}

/**
 * Handle logout
 */
async function handleLogout() {
    try {
        await browser.runtime.sendMessage({ type: 'LOGOUT' });
        currentUser = null;
        credentials = [];
        showLoginView();
    } catch (error) {
        // Logout failed silently
    }
}

/**
 * Handle search
 */
function handleSearch(query) {
    const filtered = credentials.filter(cred => {
        const q = query.toLowerCase();
        return (cred.title || '').toLowerCase().includes(q) ||
               (cred.username || '').toLowerCase().includes(q) ||
               (cred.url || '').toLowerCase().includes(q);
    });
    renderCredentials(filtered);
}

/**
 * Show toast notification
 */
function showToast(message) {
    // Remove existing toast
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => toast.remove(), 2000);
}


/**
 * Escape HTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Toggle sort order
 */
function toggleSort() {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    sortLabel.textContent = sortOrder === 'asc' ? 'A-Z' : 'Z-A';
    renderCredentials(credentials);
}

// Event listeners
googleLoginBtn.addEventListener('click', handleGoogleLogin);
logoutBtn.addEventListener('click', handleLogout);
retryBtn.addEventListener('click', init);
searchInput.addEventListener('input', (e) => handleSearch(e.target.value));
sortBtn.addEventListener('click', toggleSort);

// Listen for autofill messages from content script
browser.runtime.onMessage.addListener((message, sender) => {
    if (message.type === 'AUTOFILL_COMPLETE') {
        showToast('Credentials filled!');
    }
    return false;
});

// Initialize
init();
