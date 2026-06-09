import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getAuth } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db, functions } from "boot/firebase";
import passwordSecurityService from "src/services/passwordSecurityService";
import { FUNCTIONS_URL } from "../config/functions";
import { onAppResume } from "src/utils/appResumeListeners";

export const usePasswordEntriesStore = defineStore("passwordEntries", () => {
    const entries = ref([]);
    const securityAnalysis = ref({}); // { entryId: { isCompromised, securityLevel, recommendations, etc } }
    const trashEntries = ref([]);
    const isLoadingTrash = ref(false);
    const reusedEntryIds = ref([]);
    
    // Token cache to avoid quota exceeded
    let tokenCache = {
        token: null,
        expires: 0,
        isRefreshing: false
    };

    // Invalidate cache when the app returns to the foreground.
    // onAppResume uses a single shared global listener (no one per store).
    onAppResume(() => {
        tokenCache.token = null;
        tokenCache.expires = 0;
    });

    // Firebase functions
    const getAuditLogsFn = httpsCallable(functions, 'getAuditLogs');

    // Smart function to get tokens (with cache to avoid quota exceeded)
    async function getCachedAuthToken() {
        const auth = getAuth();
        if (!auth.currentUser) {
            throw new Error("User not authenticated");
        }

        const now = Date.now();

        // If we have a valid token in cache, use it
        if (tokenCache.token && tokenCache.expires > now + 60000) { // 1 minute margin
            return tokenCache.token;
        }

        // If we are already refreshing, wait
        if (tokenCache.isRefreshing) {
            // Wait up to 5 seconds for the refresh
            for (let i = 0; i < 50; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                if (!tokenCache.isRefreshing && tokenCache.token) {
                    return tokenCache.token;
                }
            }
            throw new Error("Timeout waiting for token refresh");
        }

        try {
            tokenCache.isRefreshing = true;

            // Get token without forcing refresh (false instead of true)
            const token = await auth.currentUser.getIdToken(false);

            // Cache the token for 50 minutes (Firebase tokens last 1 hour)
            tokenCache.token = token;
            tokenCache.expires = now + (50 * 60 * 1000);

            return token;
        } catch (error) {
            console.error('Error getting token:', error);

            // If the normal token fails, try with refresh as a last resort
            if (error.code === 'auth/quota-exceeded') {
                throw new Error('Firebase Auth quota exceeded - try again later');
            }

            try {
                const refreshedToken = await auth.currentUser.getIdToken(true);
                tokenCache.token = refreshedToken;
                tokenCache.expires = now + (50 * 60 * 1000);
                return refreshedToken;
            } catch (refreshError) {
                console.error('Error getting token with refresh:', refreshError);
                throw refreshError;
            }
        } finally {
            tokenCache.isRefreshing = false;
        }
    }

    function invalidateTokenCache() {
        tokenCache.token = null;
        tokenCache.expires = 0;
    }

    async function authFetch(url, options = {}) {
        const token = await getCachedAuthToken();
        const response = await fetch(url, {
            ...options,
            headers: { ...options.headers, 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        if (response.status === 401) {
            invalidateTokenCache();
            const freshToken = await getAuth().currentUser.getIdToken(true);
            tokenCache.token = freshToken;
            tokenCache.expires = Date.now() + (50 * 60 * 1000);
            return fetch(url, {
                ...options,
                headers: { ...options.headers, 'Content-Type': 'application/json', 'Authorization': `Bearer ${freshToken}` }
            });
        }
        return response;
    }

    async function fetchEntries() {
        const auth = getAuth();
        if (auth.currentUser) {
            try {
                const userID = auth.currentUser.uid;
                const entriesCollection = collection(db, "password_entries");
                const q = query(
                    entriesCollection,
                    where("userId", "==", userID)
                );
                const querySnapshot = await getDocs(q);

                // Client-side filter: exclude trash entries. We deliberately keep
                // this as a post-query filter (rather than a Firestore .where clause)
                // for backward compatibility with pre-migration documents that have
                // no "status" field — those docs must still appear as active entries.
                entries.value = querySnapshot.docs
                    .filter((doc) => doc.data().status !== 'deleted')
                    .map((doc) => {
                        const data = doc.data();
                        return {
                            id: doc.id,
                            ...data,
                            // If it's an encrypted password (object), show as hidden
                            // If it's a plain password (string), keep it for compatibility
                            password: (typeof data.password === 'object' && data.password !== null) ? '***' : data.password,
                        };
                    });

                // Load security analysis cache from localStorage
                loadSecurityAnalysisCache(userID);
                // Load reused passwords cache (if enabled)
                if (isReusedCheckEnabled()) loadReusedCache(userID);
            } catch (error) {
                throw error;
                entries.value = [];
            }
        } else {
            throw new Error("No authenticated user.");
        }
    }

    // Check if an analysis has the new format (translation keys)
    function isNewTranslationFormat(analysis) {
        const checkArray = (arr) => {
            if (!arr || arr.length === 0) return true;
            // If at least one element starts with 'security.', it's the new format
            return arr.some(item => typeof item === 'string' && item.startsWith('security.'));
        };
        return checkArray(analysis.vulnerabilities) || checkArray(analysis.recommendations);
    }

    // Load security analysis cache from localStorage
    function loadSecurityAnalysisCache(userId) {
        try {
            const cacheKey = `security_analysis_${userId}`;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                const parsedCache = JSON.parse(cached);
                // Check that the cache is not too old (max 30 days)
                const maxCacheAge = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
                const now = new Date().getTime();

                Object.keys(parsedCache).forEach(entryId => {
                    const analysis = parsedCache[entryId];
                    if (analysis.lastChecked) {
                        const lastChecked = new Date(analysis.lastChecked).getTime();
                        // Only load if not too old AND has the new translation format
                        if (now - lastChecked < maxCacheAge && isNewTranslationFormat(analysis)) {
                            securityAnalysis.value[entryId] = analysis;
                        }
                    }
                });

            }
        } catch (error) {
            console.warn('Error loading security analysis cache:', error);
        }
    }

    // Save security analysis cache to localStorage
    function saveSecurityAnalysisCache() {
        try {
            const auth = getAuth();
            if (auth.currentUser) {
                const cacheKey = `security_analysis_${auth.currentUser.uid}`;
                // passwordHash is not persisted: it's an unsalted SHA-256 of the plaintext
                // and is only needed in memory to detect changes in the current session.
                const sanitized = Object.fromEntries(
                    Object.entries(securityAnalysis.value).map(([id, entry]) => {
                        const { passwordHash: _h, ...rest } = entry;
                        return [id, rest];
                    })
                );
                localStorage.setItem(cacheKey, JSON.stringify(sanitized));
            }
        } catch (error) {
            console.warn('Error saving security analysis cache:', error);
        }
    }

    // ============================================
    // REUSED PASSWORDS FUNCTIONS
    // ============================================

    function isReusedCheckEnabled() {
        try {
            const cached = localStorage.getItem('userSettings');
            if (cached) return JSON.parse(cached).enableReusedCheck === true;
        } catch {}
        return false;
    }

    async function checkReusedPasswords() {
        try {
            const response = await authFetch(`${FUNCTIONS_URL}/checkReusedPasswordsHttp`, {
                method: 'POST',
                body: JSON.stringify({})
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            if (data.success) {
                reusedEntryIds.value = data.reusedEntryIds || [];
                // Cache in localStorage
                const auth = getAuth();
                if (auth.currentUser) {
                    localStorage.setItem(`reused_passwords_${auth.currentUser.uid}`, JSON.stringify({
                        ids: reusedEntryIds.value,
                        checkedAt: new Date().toISOString()
                    }));
                }
            }
            return data;
        } catch (error) {
            console.error('Error checking reused passwords:', error);
            throw error;
        }
    }

    // Load cached reused data on init
    function loadReusedCache(userId) {
        try {
            const cached = localStorage.getItem(`reused_passwords_${userId}`);
            if (cached) {
                const data = JSON.parse(cached);
                // Only use cache if less than 7 days old
                const age = Date.now() - new Date(data.checkedAt).getTime();
                if (age < 7 * 24 * 60 * 60 * 1000) {
                    reusedEntryIds.value = data.ids || [];
                }
            }
        } catch (e) { /* ignore */ }
    }

    const reusedCount = computed(() => reusedEntryIds.value.length);
    const isReused = computed(() => (entryId) => reusedEntryIds.value.includes(entryId));

    async function addEntry(newEntry) {
        const auth = getAuth();
        if (!auth.currentUser) throw new Error("No autenticado");

        try {
            const response = await authFetch(`${FUNCTIONS_URL}/createPasswordEntryHttp`, {
                method: 'POST',
                body: JSON.stringify(newEntry)
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                await fetchEntries();
                if (isReusedCheckEnabled()) checkReusedPasswords().catch(() => {});
                return result;
            } else {
                throw new Error(result.message || 'Error al crear entrada');
            }
        } catch (error) {
            throw error;
        }
    }

    async function updateEntry(id, entryUpdate) {
        const auth = getAuth();
        if (!auth.currentUser) throw new Error("No autenticado");
        
        try {
            const response = await authFetch(`${FUNCTIONS_URL}/updatePasswordEntryHttp`, {
                method: 'POST',
                body: JSON.stringify({
                    entryId: id,
                    ...entryUpdate
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                await fetchEntries();
                if (isReusedCheckEnabled()) checkReusedPasswords().catch(() => {});
                return result;
            } else {
                throw new Error(result.message || 'Error al actualizar entrada');
            }
        } catch (error) {
            throw error;
        }
    }

    async function deleteEntry(id) {
        const auth = getAuth();
        if (!auth.currentUser) throw new Error("No autenticado");
        
        try {
            const response = await authFetch(`${FUNCTIONS_URL}/deletePasswordEntryHttp`, {
                method: 'POST',
                body: JSON.stringify({ entryId: id })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                // Optimistically move entry from active list to trash
                const index = entries.value.findIndex((e) => e.id === id);
                if (index !== -1) {
                    const deletedEntry = { ...entries.value[index], status: 'deleted', deletedAt: new Date().toISOString() };
                    trashEntries.value.unshift(deletedEntry);
                    entries.value.splice(index, 1);
                }
                return result;
            } else {
                throw new Error(result.message || 'Error al eliminar entrada');
            }
        } catch (error) {
            throw error;
        }
    }

    // New function to get a specific decrypted password
    async function getDecryptedPassword(entryId) {
        const auth = getAuth();
        if (!auth.currentUser) {
            throw new Error("User not authenticated");
        }

        try {
            // Check if it's a legacy password first
            const entry = entries.value.find(e => e.id === entryId);

            // If it's a legacy password (string), it needs server migration
            if (entry && entry.password && typeof entry.password === 'string' && entry.password !== '***') {
                // Legacy passwords are now decrypted on the server
                // The server has access to the legacy key from Firebase Secrets
            }

            // Use the HTTP function directly to avoid CORS
            const response = await authFetch(`${FUNCTIONS_URL}/getPasswordEntryHttp`, {
                method: 'POST',
                body: JSON.stringify({ entryId })
            });
            
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            
            const data = await response.json();
            return data;

        } catch (error) {
            throw error;
        }
    }

    // New function to get audit logs
    async function getAuditLogs(limit = 50, offset = 0) {
        try {
            const result = await getAuditLogsFn({ limit, offset });
            return result.data.logs;
        } catch (error) {
            throw error;
        }
    }

    // Check security of a specific password (with smart cache)
    async function checkPasswordSecurity(entryId, forceCheck = false) {
        try {
            const entry = entries.value.find(e => e.id === entryId);
            if (!entry) {
                throw new Error('Entry not found');
            }

            // Get the decrypted password first to detect changes
            const decryptedData = await getDecryptedPassword(entryId);
            const decryptedPassword = decryptedData.password || decryptedData;
            const currentPasswordHash = await generatePasswordHash(decryptedPassword);

            // Check if we already have a recent and valid analysis
            const existingAnalysis = securityAnalysis.value[entryId];
            const now = new Date();
            const cacheValidDays = 7; // Cache valid for 7 days

            // NEW: Detect password change
            const passwordChanged = existingAnalysis?.passwordHash &&
                                  existingAnalysis.passwordHash !== currentPasswordHash;

            if (passwordChanged) {
                // Delete previous analysis when the password changes
                delete securityAnalysis.value[entryId];
                forceCheck = true; // Force new verification
            }
            
            if (existingAnalysis && !forceCheck && !passwordChanged) {
                const lastChecked = new Date(existingAnalysis.lastChecked);
                const daysSinceCheck = (now - lastChecked) / (1000 * 60 * 60 * 24);
                
                if (daysSinceCheck < cacheValidDays) {
                    return existingAnalysis;
                }
            }

            
            // Check security with Gemini including URL/site info
            const analysis = await passwordSecurityService.checkPasswordSecurity(
                decryptedPassword,
                entry.title || entry.name,
                entry.url || entry.website || null // Pass URL if it exists
            );

            // Preserve previous dismissal state (only if the password didn't change)
            const previousAnalysis = securityAnalysis.value[entryId];
            const wasDismissed = !passwordChanged && (previousAnalysis?.isDismissed || false);

            // Save analysis in the store with timestamp
            securityAnalysis.value[entryId] = {
                ...analysis,
                lastChecked: now.toISOString(),
                passwordHash: currentPasswordHash, // To detect future changes
                isDismissed: wasDismissed // Preserve user's previous decision (if password didn't change)
            };

            // Save cache to localStorage
            saveSecurityAnalysisCache();

            return analysis;
        } catch (error) {
            console.error('Error checking password security:', error);
            throw error;
        }
    }

    // Helper function to generate password hash (to detect changes)
    async function generatePasswordHash(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    // Check security of all passwords in QUOTA-SAFE mode
    async function checkAllPasswordsSecurityQuotaSafe(progressCallback = null, shouldStopCallback = null) {
        try {

            const totalEntries = entries.value.length;
            const BATCH_SIZE = 3; // Only 3 passwords per batch
            const BATCH_DELAY = 10000; // 10 seconds between batches
            const TOKEN_REUSE_TIME = 300000; // Reuse token for 5 minutes
            
            let processed = 0;
            let fromCache = 0;
            let newChecks = 0;
            let errors = 0;
            
            // Use the cached token for the whole process
            let sharedToken = null;
            let tokenExpiry = 0;

            // Process in small batches
            for (let i = 0; i < totalEntries; i += BATCH_SIZE) {
                // Check whether the process should stop
                if (shouldStopCallback && shouldStopCallback()) {
                    if (progressCallback) {
                        progressCallback({
                            processed,
                            total: totalEntries,
                            fromCache,
                            newChecks,
                            errors,
                            stopped: true
                        });
                    }
                    return {
                        processed,
                        total: totalEntries,
                        fromCache,
                        newChecks,
                        errors,
                        stopped: true
                    };
                }
                
                const batch = entries.value.slice(i, i + BATCH_SIZE);
                
                
                // Refresh token if needed
                const now = Date.now();
                if (!sharedToken || now > tokenExpiry) {
                    try {
                        sharedToken = await getCachedAuthToken();
                        tokenExpiry = now + TOKEN_REUSE_TIME;
                    } catch (error) {
                        console.error('❌ Error refreshing token:', error);
                        if (error.message.includes('quota')) {
                            break;
                        }
                    }
                }
                
                // Process each entry in the batch
                for (const entry of batch) {
                    try {
                        const securityStatus = getEntrySecurityStatus.value(entry.id);
                        
                        if (securityStatus) {
                            fromCache++;
                        } else {
                            await checkPasswordSecurity(entry.id, false);
                            newChecks++;
                            
                            // Mini delay between passwords in the same batch
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                        
                        processed++;
                        
                        // Report progress
                        if (progressCallback) {
                            progressCallback({
                                processed,
                                total: totalEntries,
                                fromCache,
                                newChecks,
                                errors,
                                currentEntry: entry.title || entry.name
                            });
                        }
                    } catch (error) {
                        errors++;
                        console.warn(`⚠️ Error checking ${entry.title || entry.name}:`, error.message);
                        
                        if (error.message.includes('quota')) {
                            if (progressCallback) {
                                progressCallback({
                                    processed,
                                    total: totalEntries,
                                    fromCache,
                                    newChecks,
                                    errors,
                                    quotaExceeded: true
                                });
                            }
                            return;
                        }
                    }
                }
                
                // Long delay between batches (only if not the last batch)
                if (i + BATCH_SIZE < totalEntries) {
                    await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
                }
            }
            
            
            return {
                processed,
                total: totalEntries,
                fromCache,
                newChecks,
                errors
            };
            
        } catch (error) {
            console.error('QUOTA-SAFE check error:', error);
            throw error;
        }
    }

    // Check security of all passwords (SMART - with cache and limits)
    async function checkAllPasswordsSecurity(forceCheck = false) {
        try {

            const now = new Date();
            const cacheValidDays = 7;
            const maxChecksPerSession = 10; // Max 10 checks per session
            let checksPerformed = 0;
            let fromCache = 0;
            let skipped = 0;

            // Filter only entries that need to be checked
            const entriesToCheck = [];

            for (const entry of entries.value) {
                const existingAnalysis = securityAnalysis.value[entry.id];

                if (existingAnalysis && !forceCheck) {
                    const lastChecked = new Date(existingAnalysis.lastChecked);
                    const daysSinceCheck = (now - lastChecked) / (1000 * 60 * 60 * 24);

                    if (daysSinceCheck < cacheValidDays) {
                        fromCache++;
                        continue; // Use cache
                    }
                }

                // Only check if we have not reached the limit
                if (checksPerformed < maxChecksPerSession) {
                    entriesToCheck.push(entry);
                } else {
                    skipped++;
                }
            }


            // If all are cached, return existing statistics
            if (entriesToCheck.length === 0) {
                const analyses = Object.values(securityAnalysis.value);
                return {
                    total: analyses.length,
                    compromised: analyses.filter(a => a.isCompromised).length,
                    weak: analyses.filter(a => a.securityLevel === 'weak' || a.securityLevel === 'very_weak').length,
                    medium: analyses.filter(a => a.securityLevel === 'medium').length,
                    strong: analyses.filter(a => a.securityLevel === 'strong').length,
                    results: analyses.map(a => ({ id: a.entryId || 'unknown', ...a })),
                    fromCache: fromCache,
                    newChecks: 0
                };
            }

            // Check only the necessary ones, one by one to avoid rate limiting
            const delay = 500; // 500ms between checks

            for (const entry of entriesToCheck) {
                try {
                    await checkPasswordSecurity(entry.id, forceCheck);
                    checksPerformed++;

                    // Pause between checks
                    if (checksPerformed < entriesToCheck.length) {
                        await new Promise(resolve => setTimeout(resolve, delay));
                    }
                } catch (error) {
                    console.warn(`⚠️ Error verificando ${entry.title || entry.name}:`, error.message);
                }
            }

            // Generate final statistics
            const allAnalyses = Object.values(securityAnalysis.value);
            const stats = {
                total: allAnalyses.length,
                compromised: allAnalyses.filter(a => a.isCompromised).length,
                weak: allAnalyses.filter(a => a.securityLevel === 'weak' || a.securityLevel === 'very_weak').length,
                medium: allAnalyses.filter(a => a.securityLevel === 'medium').length,
                strong: allAnalyses.filter(a => a.securityLevel === 'strong').length,
                results: allAnalyses.map(a => ({ id: a.entryId || 'unknown', ...a })),
                fromCache: fromCache,
                newChecks: checksPerformed,
                skipped: skipped
            };

            return stats;

        } catch (error) {
            console.error('Error checking all passwords security:', error);
            throw error;
        }
    }

    // Get security status of an entry (respects dismissed warnings)
    const getEntrySecurityStatus = computed(() => {
        return (entryId) => {
            const analysis = securityAnalysis.value[entryId];
            if (!analysis) return null;

            // If the warning was dismissed, do not show (applies to weak and compromised)
            if (analysis.isDismissed) {
                return null;
            }

            return analysis;
        };
    });

    // Function to check if there is any analysis (including dismissed) - to avoid re-analysis
    const hasSecurityAnalysis = computed(() => {
        return (entryId) => {
            return securityAnalysis.value[entryId] !== undefined;
        };
    });

    // Get general security statistics
    const securityStats = computed(() => {
        const analyses = Object.values(securityAnalysis.value);
        
        return {
            total: analyses.length,
            compromised: analyses.filter(a => a.isCompromised).length,
            weak: analyses.filter(a => a.securityLevel === 'weak' || a.securityLevel === 'very_weak').length,
            medium: analyses.filter(a => a.securityLevel === 'medium').length,
            strong: analyses.filter(a => a.securityLevel === 'strong').length,
            lastUpdate: analyses.length > 0 ? 
                Math.max(...analyses.map(a => new Date(a.lastChecked).getTime())) : null
        };
    });

    // Function to reset all security analyses
    function resetAllSecurityAnalysis() {
        const auth = getAuth();
        if (auth.currentUser) {
            const cacheKey = `security_analysis_${auth.currentUser.uid}`;

            // Clear localStorage
            localStorage.removeItem(cacheKey);

            // Clear analysis in memory
            securityAnalysis.value = {};
            
            
            return true;
        }
        return false;
    }


    // Function to dismiss security warnings (weak and compromised)
    function dismissSecurityWarning(entryId) {
        const analysis = securityAnalysis.value[entryId];
        if (analysis) {
            securityAnalysis.value[entryId] = {
                ...analysis,
                isDismissed: true
            };

            // Save to localStorage
            saveSecurityAnalysisCache();

            return true;
        }

        return false;
    }

    // Function to reset dismissed analysis (when the user wants to re-analyze)
    function resetDismissedWarning(entryId) {
        const analysis = securityAnalysis.value[entryId];
        if (analysis && analysis.isDismissed) {
            // Completely remove the analysis so it's re-evaluated from scratch
            delete securityAnalysis.value[entryId];

            // Save changes to localStorage
            saveSecurityAnalysisCache();

            return true;
        }

        return false;
    }

    // ============================================
    // TRASH FUNCTIONS
    // ============================================

    async function fetchTrashEntries() {
        isLoadingTrash.value = true;
        try {
            const token = await getCachedAuthToken();
            const response = await fetch(`${FUNCTIONS_URL}/getTrashEntriesHttp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({})
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const result = await response.json();
            if (result.success) {
                trashEntries.value = result.entries || [];
            }
        } catch (error) {
            trashEntries.value = [];
            throw error;
        } finally {
            isLoadingTrash.value = false;
        }
    }

    async function restoreEntry(id) {
        const token = await getCachedAuthToken();
        const response = await fetch(`${FUNCTIONS_URL}/restorePasswordEntryHttp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ entryId: id })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error restoring entry');
        }
        const result = await response.json();
        if (result.success) {
            trashEntries.value = trashEntries.value.filter(e => e.id !== id);
            await fetchEntries();
        }
        return result;
    }

    async function permanentDeleteEntry(id) {
        const token = await getCachedAuthToken();
        const response = await fetch(`${FUNCTIONS_URL}/permanentDeletePasswordEntryHttp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ entryId: id })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error deleting entry');
        }
        const result = await response.json();
        if (result.success) {
            trashEntries.value = trashEntries.value.filter(e => e.id !== id);
        }
        return result;
    }

    const trashCount = computed(() => trashEntries.value.length);

    // ============================================
    // FUNCIONES PARA HISTORIAL DE PASSWORDS
    // ============================================

    async function getPasswordHistory(entryId) {
        const token = await getCachedAuthToken();
        const response = await fetch(`${FUNCTIONS_URL}/getPasswordHistoryHttp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ entryId })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return data.history || [];
    }

    // ============================================
    // FUNCIONES PARA COMPARTIR PASSWORDS
    // ============================================

    const systemUsers = ref([]);
    const pendingShares = ref([]);
    const isLoadingUsers = ref(false);
    const isLoadingPending = ref(false);

    // Base URL of the HTTP functions (auto-detects emulators)

    // Migrate all existing users to the users collection (run only once)
    async function migrateAllUsers() {
        try {
            const token = await getCachedAuthToken();
            const response = await fetch(`${FUNCTIONS_URL}/migrateAllUsersHttp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({})
            });

            if (!response.ok) {
                const error = await response.json();
                console.error('Migration failed:', error);
                return false;
            }

            const result = await response.json();
            return result;
        } catch (error) {
            console.error('Error migrating users:', error);
            return false;
        }
    }

    // Register current user in the users collection (to enable sharing)
    async function registerCurrentUser() {
        try {
            const token = await getCachedAuthToken();
            const response = await fetch(`${FUNCTIONS_URL}/registerUserHttp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({})
            });

            if (!response.ok) {
                console.warn('Could not register user:', response.status);
                return false;
            }

            const result = await response.json();
            return result.success;
        } catch (error) {
            console.warn('Error registering user:', error);
            return false;
        }
    }

    // Get system users (search or recent)
    async function fetchSystemUsers(searchQuery = '') {
        isLoadingUsers.value = true;
        try {
            const token = await getCachedAuthToken();
            const body = searchQuery.length >= 3 ? { searchQuery } : {};
            const response = await fetch(`${FUNCTIONS_URL}/getSystemUsersHttp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                systemUsers.value = result.users;
                return { users: result.users, mode: result.mode };
            } else {
                throw new Error(result.error || 'Error fetching users');
            }
        } catch (error) {
            console.error('Error fetching system users:', error);
            throw error;
        } finally {
            isLoadingUsers.value = false;
        }
    }

    // Block user
    async function blockUser(blockedUserId, shareId = null) {
        try {
            const token = await getCachedAuthToken();
            const response = await fetch(`${FUNCTIONS_URL}/blockUserHttp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ blockedUserId, shareId })
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to block user');
            }

            const result = await response.json();

            // Remove the rejected share from pending list
            if (shareId) {
                pendingShares.value = pendingShares.value.filter(s => s.id !== shareId);
            }

            return result;
        } catch (error) {
            console.error('Error blocking user:', error);
            throw error;
        }
    }

    // Share password with another user
    async function sharePassword(entryId, toUserId) {
        try {
            const token = await getCachedAuthToken();
            const response = await fetch(`${FUNCTIONS_URL}/sharePasswordEntryHttp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ entryId, toUserId })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                return result;
            } else {
                throw new Error(result.error || 'Error sharing password');
            }
        } catch (error) {
            console.error('Error sharing password:', error);
            throw error;
        }
    }

    // Get pending shared passwords
    async function fetchPendingSharedPasswords() {
        isLoadingPending.value = true;
        try {
            const token = await getCachedAuthToken();
            const response = await fetch(`${FUNCTIONS_URL}/getPendingSharedPasswordsHttp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({})
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                pendingShares.value = result.pendingShares;
                return result.pendingShares;
            } else {
                throw new Error(result.error || 'Error fetching pending shares');
            }
        } catch (error) {
            console.error('Error fetching pending shares:', error);
            throw error;
        } finally {
            isLoadingPending.value = false;
        }
    }

    // Accept shared password
    async function acceptSharedPassword(shareId) {
        try {
            const token = await getCachedAuthToken();
            const response = await fetch(`${FUNCTIONS_URL}/acceptSharedPasswordHttp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ shareId })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                // Remove from pendingShares
                pendingShares.value = pendingShares.value.filter(s => s.id !== shareId);
                // Reload entries to show the new one
                await fetchEntries();
                return result;
            } else {
                throw new Error(result.error || 'Error accepting shared password');
            }
        } catch (error) {
            console.error('Error accepting shared password:', error);
            throw error;
        }
    }

    // Reject shared password
    async function rejectSharedPassword(shareId) {
        try {
            const token = await getCachedAuthToken();
            const response = await fetch(`${FUNCTIONS_URL}/rejectSharedPasswordHttp`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ shareId })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            const result = await response.json();

            if (result.success) {
                // Remover de pendingShares
                pendingShares.value = pendingShares.value.filter(s => s.id !== shareId);
                return result;
            } else {
                throw new Error(result.error || 'Error rejecting shared password');
            }
        } catch (error) {
            console.error('Error rejecting shared password:', error);
            throw error;
        }
    }

    const pendingSharesCount = computed(() => pendingShares.value.length);
    const entriesCount = computed(() => entries.value.length);

    // ============================================
    // FUNCIONES PARA TOTP
    // ============================================

    async function saveTotpSecret(entryId, totpSecret) {
        const token = await getCachedAuthToken();
        const response = await fetch(`${FUNCTIONS_URL}/saveTotpSecretHttp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ entryId, totpSecret })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Error saving TOTP');
        }
        const result = await response.json();
        return result;
    }

    async function getTotpCode(entryId) {
        const token = await getCachedAuthToken();
        const response = await fetch(`${FUNCTIONS_URL}/getTotpCodeHttp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ entryId })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Error getting TOTP code');
        }
        const data = await response.json();
        return { code: data.code, timeRemaining: data.timeRemaining };
    }

    async function removeTotpSecret(entryId) {
        const token = await getCachedAuthToken();
        const response = await fetch(`${FUNCTIONS_URL}/removeTotpSecretHttp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ entryId })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Error removing TOTP');
        }
        const result = await response.json();
        return result;
    }

    return {
        entries,
        securityAnalysis,
        fetchEntries,
        addEntry,
        updateEntry,
        deleteEntry,
        getDecryptedPassword,
        getAuditLogs,
        checkPasswordSecurity,
        checkAllPasswordsSecurity,
        checkAllPasswordsSecurityQuotaSafe,
        getEntrySecurityStatus,
        hasSecurityAnalysis,
        securityStats,
        resetAllSecurityAnalysis,
        dismissSecurityWarning,
        resetDismissedWarning,
        saveSecurityAnalysisCache,
        entriesCount,
        // Reused passwords functions
        reusedEntryIds,
        checkReusedPasswords,
        reusedCount,
        isReused,
        // Trash functions
        trashEntries,
        isLoadingTrash,
        fetchTrashEntries,
        restoreEntry,
        permanentDeleteEntry,
        trashCount,
        // History functions
        getPasswordHistory,
        // Sharing functions
        systemUsers,
        pendingShares,
        isLoadingUsers,
        isLoadingPending,
        migrateAllUsers,
        registerCurrentUser,
        fetchSystemUsers,
        sharePassword,
        fetchPendingSharedPasswords,
        acceptSharedPassword,
        rejectSharedPassword,
        blockUser,
        pendingSharesCount,
        // TOTP functions
        saveTotpSecret,
        getTotpCode,
        removeTotpSecret,
    };
});
