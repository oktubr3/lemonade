import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getAuth } from "firebase/auth";
import { FUNCTIONS_URL } from "../config/functions";
import { onAppResume } from "src/utils/appResumeListeners";

export const useSecureNotesStore = defineStore("secureNotes", () => {
    const notes = ref([]);
    const trashNotes = ref([]);
    const isLoading = ref(false);
    const isLoadingTrash = ref(false);

    // Token cache to avoid quota exceeded
    let tokenCache = {
        token: null,
        expires: 0,
        isRefreshing: false
    };

    // Invalidate cache when the app returns to the foreground (shared global listener)
    onAppResume(() => {
        tokenCache.token = null;
        tokenCache.expires = 0;
    });

    async function getCachedAuthToken() {
        const auth = getAuth();
        if (!auth.currentUser) throw new Error("Not authenticated");

        const now = Date.now();

        if (tokenCache.token && tokenCache.expires > now + 60000) {
            return tokenCache.token;
        }

        if (tokenCache.isRefreshing) {
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
            const token = await auth.currentUser.getIdToken(false);
            tokenCache.token = token;
            tokenCache.expires = now + (50 * 60 * 1000);
            return token;
        } catch (error) {
            if (error.code === 'auth/quota-exceeded') {
                throw new Error('Firebase Auth quota exceeded');
            }
            try {
                const refreshedToken = await auth.currentUser.getIdToken(true);
                tokenCache.token = refreshedToken;
                tokenCache.expires = now + (50 * 60 * 1000);
                return refreshedToken;
            } catch (refreshError) {
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

    async function fetchNotes() {
        isLoading.value = true;
        try {
            const response = await authFetch(`${FUNCTIONS_URL}/getSecureNotesHttp`, {
                method: 'POST',
                body: JSON.stringify({})
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const data = await response.json();
            notes.value = data.notes || [];
        } catch (error) {
            notes.value = [];
            throw error;
        } finally {
            isLoading.value = false;
        }
    }

    async function getNote(noteId) {
        const response = await authFetch(`${FUNCTIONS_URL}/getSecureNoteHttp`, {
            method: 'POST',
            body: JSON.stringify({ noteId })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        return data.note;
    }

    async function addNote(title, content) {
        const response = await authFetch(`${FUNCTIONS_URL}/createSecureNoteHttp`, {
            method: 'POST',
            body: JSON.stringify({ title, content })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Error creating note');
        }
        const result = await response.json();
        if (result.success) await fetchNotes();
        return result;
    }

    async function updateNote(noteId, updates) {
        const response = await authFetch(`${FUNCTIONS_URL}/updateSecureNoteHttp`, {
            method: 'POST',
            body: JSON.stringify({ noteId, ...updates })
        });
        if (!response.ok) {
            const err = await response.json();
            throw new Error(err.error || 'Error updating note');
        }
        const result = await response.json();
        if (result.success) await fetchNotes();
        return result;
    }

    async function deleteNote(noteId) {
        const response = await authFetch(`${FUNCTIONS_URL}/deleteSecureNoteHttp`, {
            method: 'POST',
            body: JSON.stringify({ noteId })
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.error || 'Error deleting note');
        }
        const result = await response.json();
        if (result.success) {
            const deleted = notes.value.find(n => n.id === noteId);
            notes.value = notes.value.filter(n => n.id !== noteId);
            if (deleted) {
                trashNotes.value.unshift({
                    ...deleted,
                    status: 'deleted',
                    deletedAt: new Date().toISOString()
                });
            }
        }
        return result;
    }

    async function restoreNote(noteId) {
        const response = await authFetch(`${FUNCTIONS_URL}/restoreSecureNoteHttp`, {
            method: 'POST',
            body: JSON.stringify({ noteId })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error restoring note');
        }
        const result = await response.json();
        if (result.success) {
            trashNotes.value = trashNotes.value.filter(n => n.id !== noteId);
            await fetchNotes();
        }
        return result;
    }

    async function permanentDeleteNote(noteId) {
        const response = await authFetch(`${FUNCTIONS_URL}/permanentDeleteSecureNoteHttp`, {
            method: 'POST',
            body: JSON.stringify({ noteId })
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error deleting note permanently');
        }
        const result = await response.json();
        if (result.success) {
            trashNotes.value = trashNotes.value.filter(n => n.id !== noteId);
        }
        return result;
    }

    async function fetchTrashNotes() {
        // No dedicated Cloud Function for trash notes listing.
        // Trash notes are tracked optimistically in trashNotes ref
        // after deleteNote moves them from active to trash locally.
        // This function is a no-op placeholder for consistency.
        isLoadingTrash.value = true;
        try {
            // If trashNotes is empty, we can't fetch from server
            // since there's no getTrashSecureNotesHttp endpoint.
            // The trash list persists during the session from deletes.
        } finally {
            isLoadingTrash.value = false;
        }
    }

    const notesCount = computed(() => notes.value.length);
    const trashCount = computed(() => trashNotes.value.length);

    return {
        notes,
        trashNotes,
        isLoading,
        isLoadingTrash,
        fetchNotes,
        getNote,
        addNote,
        updateNote,
        deleteNote,
        restoreNote,
        permanentDeleteNote,
        fetchTrashNotes,
        notesCount,
        trashCount
    };
});
