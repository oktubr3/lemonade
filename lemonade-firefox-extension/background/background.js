/**
 * Lemonade Pass Manager - Background Script (Firefox)
 * Handles Firebase authentication and credential management
 */

// Firebase configuration (same as PWA)
const FIREBASE_CONFIG = {
    apiKey: "AIzaSyDGEDyUu_XxXcWV5oeKAH1q6JSeW17ua50",
    authDomain: "passmanager-d2b6d.firebaseapp.com",
    projectId: "passmanager-d2b6d",
    storageBucket: "passmanager-d2b6d.firebasestorage.app",
    messagingSenderId: "824994283249",
    appId: "1:824994283249:web:c99da8bfb0f3335511b350"
};

// Cloud Functions base URL
const FUNCTIONS_URL = 'https://us-central1-passmanager-d2b6d.cloudfunctions.net';

// Google OAuth Client ID (Web application type for Chrome extension)
const GOOGLE_CLIENT_ID = '824994283249-a5bc9h45cjqj8op01lubv0dsfbv2m44u.apps.googleusercontent.com';

/**
 * Message handler - Firefox uses Promises natively
 */
browser.runtime.onMessage.addListener((message, sender) => {
    return handleMessage(message, sender)
        .catch(error => {
            return { success: false, error: error.message };
        });
});

/**
 * Handle incoming messages
 */
async function handleMessage(message, sender) {
    switch (message.type) {
        case 'GET_AUTH_STATE':
            return getAuthState();

        case 'LOGIN_WITH_GOOGLE':
            return loginWithGoogle();

        case 'LOGOUT':
            return logout();

        case 'GET_ALL_CREDENTIALS':
            return getAllCredentials();

        case 'GET_CREDENTIALS':
            return getCredentialsForDomain(message.domain);

        case 'GET_DECRYPTED_PASSWORD':
            return getDecryptedPassword(message.entryId);

        case 'SAVE_CREDENTIAL':
            return saveCredential(message.credential);

        case 'UPDATE_CREDENTIAL':
            return updateCredential(message.entryId, message.credential);

        case 'SET_PENDING_CREDENTIAL':
            return setPendingCredential(message.credential, message.existingEntry);

        case 'GET_PENDING_CREDENTIAL':
            return getPendingCredential();

        case 'CLEAR_PENDING_CREDENTIAL':
            return clearPendingCredential();

        default:
            return { success: false, error: 'Unknown message type' };
    }
}

async function setPendingCredential(credential, existingEntry) {
    await browser.storage.session.set({
        pendingCredential: credential,
        pendingExistingEntry: existingEntry,
        pendingTimestamp: Date.now()
    });
    return { success: true };
}

async function getPendingCredential() {
    const data = await browser.storage.session.get(['pendingCredential', 'pendingExistingEntry', 'pendingTimestamp']);
    if (!data.pendingCredential || !data.pendingTimestamp) return { success: true, data: null };
    if (Date.now() - data.pendingTimestamp > 30000) {
        await browser.storage.session.remove(['pendingCredential', 'pendingExistingEntry', 'pendingTimestamp']);
        return { success: true, data: null };
    }
    await browser.storage.session.remove(['pendingCredential', 'pendingExistingEntry', 'pendingTimestamp']);
    return { success: true, data };
}

async function clearPendingCredential() {
    await browser.storage.session.remove(['pendingCredential', 'pendingExistingEntry', 'pendingTimestamp']);
    return { success: true };
}

/**
 * Get current authentication state
 */
async function getAuthState() {
    const stored = await browser.storage.local.get(['user', 'authToken', 'tokenExpiry']);

    if (stored.user && stored.authToken) {
        const now = Date.now();
        const isValid = stored.tokenExpiry && now < stored.tokenExpiry;

        if (isValid) {
            return {
                isLoggedIn: true,
                user: stored.user
            };
        }
    }

    return { isLoggedIn: false };
}

/**
 * Get the redirect URL for Firefox OAuth
 * Firefox uses a different redirect URL format than Chrome
 */
function getRedirectURL() {
    const baseUrl = browser.identity.getRedirectURL();

    // Firefox returns URLs like: https://[extension-id].extensions.allizom.org/
    // We need to return this directly (without trailing slash for Google OAuth)
    return baseUrl.replace(/\/$/, '');
}

/**
 * Login with Google using Web Auth Flow
 */
async function loginWithGoogle() {
    try {
        // Get Firefox-specific redirect URL
        const redirectUrl = getRedirectURL();

        const state = Array.from(crypto.getRandomValues(new Uint8Array(16)),
            b => b.toString(16).padStart(2, '0')).join('');

        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
        authUrl.searchParams.set('redirect_uri', redirectUrl);
        authUrl.searchParams.set('response_type', 'token');
        authUrl.searchParams.set('scope', 'email profile openid');
        authUrl.searchParams.set('prompt', 'select_account');
        authUrl.searchParams.set('state', state);

        // Launch auth flow - Firefox uses Promises
        const responseUrl = await browser.identity.launchWebAuthFlow({
            url: authUrl.toString(),
            interactive: true
        });

        if (!responseUrl) {
            throw new Error('No response from auth flow');
        }

        // Parse the access token from response URL
        const url = new URL(responseUrl);
        const hash = url.hash.substring(1);
        const params = new URLSearchParams(hash);

        if (params.get('state') !== state) {
            throw new Error('OAuth state mismatch');
        }

        const accessToken = params.get('access_token');

        if (!accessToken) {
            throw new Error('No access token received');
        }

        // Exchange Google access token for Firebase ID token
        const firebaseResponse = await fetch(
            `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_CONFIG.apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    postBody: `access_token=${accessToken}&providerId=google.com`,
                    requestUri: redirectUrl,
                    returnSecureToken: true,
                    returnIdpCredential: true
                })
            }
        );

        if (!firebaseResponse.ok) {
            const error = await firebaseResponse.json();
            throw new Error(error.error?.message || 'Firebase auth failed');
        }

        const firebaseData = await firebaseResponse.json();

        // Store user data
        const user = {
            uid: firebaseData.localId,
            email: firebaseData.email,
            displayName: firebaseData.displayName || firebaseData.email,
            photoUrl: firebaseData.photoUrl
        };

        const authToken = firebaseData.idToken;
        // Default to 1 hour if expiresIn is not provided
        const expiresInSeconds = parseInt(firebaseData.expiresIn) || 3600;
        const tokenExpiry = Date.now() + (expiresInSeconds * 1000);

        await browser.storage.local.set({
            user: user,
            authToken: authToken,
            tokenExpiry: tokenExpiry,
            refreshToken: firebaseData.refreshToken
        });

        return {
            success: true,
            user: user
        };

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Logout
 */
async function logout() {
    try {
        await browser.storage.local.remove(['user', 'authToken', 'tokenExpiry', 'refreshToken', 'credentials']);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Get valid auth token (refresh if needed)
 */
async function getValidToken() {
    const stored = await browser.storage.local.get(['authToken', 'tokenExpiry', 'refreshToken']);

    if (stored.authToken && stored.tokenExpiry && Date.now() < stored.tokenExpiry - 60000) {
        return stored.authToken;
    }

    if (stored.refreshToken) {
        try {
            const response = await fetch(
                `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_CONFIG.apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        grant_type: 'refresh_token',
                        refresh_token: stored.refreshToken
                    })
                }
            );

            if (response.ok) {
                const data = await response.json();
                const newExpiry = Date.now() + (parseInt(data.expires_in) * 1000);

                await browser.storage.local.set({
                    authToken: data.id_token,
                    tokenExpiry: newExpiry,
                    refreshToken: data.refresh_token
                });

                return data.id_token;
            }
        } catch (error) {
            // Token refresh failed
        }
    }

    return null;
}

/**
 * Get all credentials for the user
 */
async function getAllCredentials() {
    try {
        const token = await getValidToken();

        if (!token) {
            return { success: false, needsLogin: true };
        }

        const stored = await browser.storage.local.get(['user']);
        const userId = stored.user?.uid;

        if (!userId) {
            return { success: false, needsLogin: true };
        }

        // Use structured query to filter by userId (required by security rules)
        const response = await fetch(
            `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents:runQuery`,
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    structuredQuery: {
                        from: [{ collectionId: 'password_entries' }],
                        where: {
                            fieldFilter: {
                                field: { fieldPath: 'userId' },
                                op: 'EQUAL',
                                value: { stringValue: userId }
                            }
                        },
                        limit: 500
                    }
                })
            }
        );

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || 'Failed to fetch credentials');
        }

        const data = await response.json();
        // runQuery returns array of {document: ...} objects
        const documents = data
            .filter(item => item.document)
            .map(item => item.document);

        const credentials = documents
            .filter(doc => {
                const status = doc.fields?.status?.stringValue;
                return status !== 'deleted';
            })
            .map(doc => {
                const fields = doc.fields;
                const id = doc.name.split('/').pop();

                return {
                    id: id,
                    // Support both 'title' and 'name' fields (PWA uses both)
                    title: fields.title?.stringValue || fields.name?.stringValue || '',
                    username: fields.username?.stringValue || '',
                    url: fields.url?.stringValue || fields.website?.stringValue || '',
                    notes: fields.notes?.stringValue || '',
                    highlighted: fields.highlighted?.booleanValue || false
                };
            });

        await browser.storage.local.set({ credentials });

        return {
            success: true,
            credentials: credentials
        };

    } catch (error) {
        const cached = await browser.storage.local.get(['credentials']);
        if (cached.credentials) {
            return {
                success: true,
                credentials: cached.credentials,
                fromCache: true
            };
        }

        return { success: false, error: error.message };
    }
}

/**
 * Extract base domain from a hostname (handles subdomains)
 * e.g., "auth.afip.gob.ar" -> "afip.gob.ar"
 */
function getBaseDomain(hostname) {
    const parts = hostname.toLowerCase().split('.');

    // Handle special TLDs like .gob.ar, .com.ar, .co.uk, etc.
    const specialTLDs = ['gob.ar', 'com.ar', 'org.ar', 'gov.ar', 'co.uk', 'com.br', 'org.br'];

    for (const tld of specialTLDs) {
        if (hostname.endsWith('.' + tld) || hostname === tld) {
            const tldParts = tld.split('.').length;
            if (parts.length > tldParts) {
                return parts.slice(-(tldParts + 1)).join('.');
            }
            return hostname;
        }
    }

    // Standard TLD: return last 2 parts (e.g., example.com)
    if (parts.length >= 2) {
        return parts.slice(-2).join('.');
    }

    return hostname;
}

/**
 * Get credentials for a specific domain (exact hostname only — no base-domain fallback
 * to avoid cross-origin injection on shared-suffix hosts like github.io or vercel.app).
 */
async function getCredentialsForDomain(domain) {
    const result = await getAllCredentials();

    if (!result.success) {
        return result;
    }

    const targetHost = domain.toLowerCase();

    const exactMatches = result.credentials.filter(cred => {
        if (!cred.url) return false;
        try {
            return new URL(cred.url).hostname.toLowerCase() === targetHost;
        } catch {
            return false;
        }
    });

    return { success: true, credentials: exactMatches };
}

/**
 * Get decrypted password from Cloud Function
 */
async function getDecryptedPassword(entryId) {
    try {
        const token = await getValidToken();

        if (!token) {
            return { success: false, needsLogin: true };
        }

        const response = await fetch(`${FUNCTIONS_URL}/getPasswordEntryHttp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ entryId })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || 'Failed to decrypt password');
        }

        const data = await response.json();

        return {
            success: true,
            password: data.password
        };

    } catch (error) {
        return { success: false, error: error.message };
    }
}

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
        await browser.storage.local.remove(['credentials']);

        return { success: true, entryId: data.entryId };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

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
        await browser.storage.local.remove(['credentials']);

        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

browser.runtime.onInstalled.addListener((details) => {
    browser.storage.session.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
});
