<script setup>
// Define component name for ESLint multi-word rule
import { defineOptions } from 'vue'

defineOptions({
    name: 'IndexPage'
})
// Imports de Vue y Quasar
import {
    ref,
    onMounted,
    onBeforeUnmount,
    computed,
    watch,
    nextTick,
    defineAsyncComponent,
} from "vue";
import { useRouter } from "vue-router";
import { useQuasar } from "quasar";

// Imports de Firebase
import { signOut } from "firebase/auth";

// Imports personalizados
import { auth } from "boot/firebase";
import { usePasswordEntriesStore } from "stores/passwordEntries";
import { useUserPreferences } from "../composables/useUserPreferences";
import { useAdmin } from "../composables/useAdmin";
import { useEmergencyAccess } from "../composables/useEmergencyAccess";
import { usePasswordForm } from "../composables/usePasswordForm";
import { usePasswordPreview } from "../composables/usePasswordPreview";
import { usePasswordShare } from "../composables/usePasswordShare";
import { usePasswordSecurity } from "../composables/usePasswordSecurity";
import { usePasswordTrash } from "../composables/usePasswordTrash";
import vFocus from "../directives/vFocus";
import { useI18n } from "vue-i18n";
import { matchesNormalized, splitSearchWords, normalizeText, sortByRelevance } from "src/utils/searchUtils";
import LemonadeLoader from "../components/LemonadeLoader.vue";

// Extracted components
// Main views: loaded synchronously because one is always needed
import PasswordListView from "../components/PasswordIndex/PasswordListView.vue";
import PasswordGridView from "../components/PasswordIndex/PasswordGridView.vue";
import PasswordTableView from "../components/PasswordIndex/PasswordTableView.vue";

// Sections and dialogs: async so they don't load in the initial bundle.
// Only mounted when the user opens them for the first time.
const TrashSection = defineAsyncComponent(() =>
    import("../components/PasswordIndex/TrashSection.vue")
);
const PendingSharesSection = defineAsyncComponent(() =>
    import("../components/PasswordIndex/PendingSharesSection.vue")
);
const PasswordEntryForm = defineAsyncComponent(() =>
    import("../components/PasswordIndex/PasswordEntryForm.vue")
);
const PasswordPreviewDialog = defineAsyncComponent(() =>
    import("../components/PasswordIndex/PasswordPreviewDialog.vue")
);
const SharePasswordDialog = defineAsyncComponent(() =>
    import("../components/PasswordIndex/SharePasswordDialog.vue")
);
// TotpSetupDialog kept inline - needs template ref for video element

// Quasar and Vue Router instances and hooks
const $q = useQuasar();
const router = useRouter();

// Access i18n translate function (Composition API mode)
const { t } = useI18n();

// Pinia store for password entries
const passwordEntriesStore = usePasswordEntriesStore();

// User preferences for privacy controls
const {
    userPreferences,
    loadPreferences,
    listenToSettingsChanges,
    canUseAIAnalysis,
    canCheckPasswordAge,
    shouldShowSecurityButtons
} = useUserPreferences();

// Admin status (role-based access for admin features only)
const { isAdmin } = useAdmin();

// Emergency access (for pending requests badge on Settings button)
const { fetchMyContacts, pendingRequestsCount } = useEmergencyAccess();

// ============================================
// COMPOSABLES
// ============================================

// Password Form composable
const {
    form,
    originalFormData,
    editingEntry,
    isPwd,
    isSaving,
    showDialog,
    editEntryHasTotp,
    dialogTitle,
    hasFormChanges,
    dialogCardStyle,
    customFieldTypeOptions,
    resetForm,
    addCustomField,
    editEntry,
    submitForm,
    generatePassword,
    focusFirstInput
} = usePasswordForm({
    passwordEntriesStore, $q, t, router
});

// Password Preview composable
const {
    showPreviewDialog,
    previewEntry,
    isLoadingPreview,
    previewCustomFields,
    showCustomFieldValue,
    passwordHistory,
    isLoadingHistory,
    showHistoryPassword,
    previewHasTotp,
    totpCode,
    totpTimeRemaining,
    totpSecretInput,
    isSavingTotp,
    showTotpSetupDialog,
    showQrScanner,
    qrVideoElement,
    showPreview,
    loadPasswordHistory,
    formatHistoryDate,
    copyHistoryPassword,
    loadTotpCode,
    copyTotpCode,
    saveTotpSecret,
    removeTotpFromEntry,
    startQrScanner,
    stopQrScanner,
    handleQrResult,
    cleanup: previewCleanup
} = usePasswordPreview({
    passwordEntriesStore, $q, t, canUseAIAnalysis, editingEntry, editEntryHasTotp
});

// Password Share composable
const {
    showShareDialog,
    entryToShare,
    selectedUser,
    userSearchText,
    isSharing,
    searchResultsMode,
    searchDebounceTimer,
    isBlocking,
    isAccepting,
    isRejecting,
    onUserSearchInput,
    loadRecentContacts,
    openShareDialog,
    shareWithUser,
    acceptPendingShare,
    rejectPendingShare,
    blockPendingShareUser
} = usePasswordShare({ passwordEntriesStore, $q, t });

// Password Trash composable
const {
    showTrash,
    confirmDeleteDialog,
    confirmPermanentDeleteDialog,
    entryToDelete,
    entryToPermanentDelete,
    isDeleting,
    isRestoringEntry,
    isPermanentDeleting,
    confirmDelete,
    deleteEntry,
    toggleTrash,
    restoreTrashEntry,
    confirmPermanentDelete,
    permanentDeleteEntry,
    formatDeletedDate
} = usePasswordTrash({ passwordEntriesStore, $q, t });

// Reactive state (remaining in IndexPage)
const isLoading = ref(false);
const confirmLogoutDialog = ref(false);
const searchText = ref("");
// searchTextDebounced avoids recomputing filter on every keystroke (150ms debounce)
const searchTextDebounced = ref("");
let _searchDebounceTimer = null;
watch(searchText, (val) => {
    clearTimeout(_searchDebounceTimer);
    // If the user clears the input, update immediately
    if (!val) {
        searchTextDebounced.value = "";
        return;
    }
    _searchDebounceTimer = setTimeout(() => {
        searchTextDebounced.value = val;
    }, 150);
});
const sortDirection = ref("asc");
const defaultViewMode = $q.screen.lt.sm ? "table" : $q.screen.lt.lg ? "list" : "grid";
const viewMode = ref(localStorage.getItem('viewMode') || defaultViewMode);
const userSettings = ref({
    mobileColumns: 3,
    desktopColumns: 8
});

// Computed properties for reactive grid (moved up for proper initialization)
const currentGridColumns = computed(() => {
    if (!$q.screen) {
        return 3; // fallback
    }

    const mobileCols = typeof userSettings.value.mobileColumns === 'object'
        ? userSettings.value.mobileColumns.value
        : userSettings.value.mobileColumns;
    const desktopCols = typeof userSettings.value.desktopColumns === 'object'
        ? userSettings.value.desktopColumns.value
        : userSettings.value.desktopColumns;
    if ($q.screen.lt.sm) return mobileCols;
    if ($q.screen.lt.md) return 3; // tablet portrait
    if ($q.screen.lt.lg) return 4; // tablet landscape
    return desktopCols;
});

const gridContainerStyle = computed(() => {
    const cols = currentGridColumns.value;
    return {
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gap: '12px',
        padding: '8px'
    };
});

// Grid rows chunked for virtual scroll (each row = one virtual scroll item)
const gridRows = computed(() => {
    const cols = currentGridColumns.value;
    const entries = filteredAndSortedEntries.value;
    const rows = [];
    for (let i = 0; i < entries.length; i += cols) {
        rows.push(entries.slice(i, i + cols));
    }
    return rows;
});

// Estimated height per grid row for virtual scroll
const gridRowHeight = computed(() => {
    if ($q.screen.lt.sm) return 130;
    if ($q.screen.lt.lg) return 140;
    return 160;
});

// Dynamic height for virtual scroll containers
const entriesAreaRef = ref(null);
const scrollContainerHeight = ref('60vh');
const tableScrollHeight = ref('55vh');
const gridScrollHeight = ref('58vh');

// rAF-throttled: multiple resize events in the same frame only trigger 1 recalc
let _scrollHeightRaf = null;
const _doRecalcScrollHeight = () => {
    _scrollHeightRaf = null;
    if (!entriesAreaRef.value) {
        scrollContainerHeight.value = '60vh';
        return;
    }
    const top = entriesAreaRef.value.getBoundingClientRect().top;
    const available = window.innerHeight - top - 12;
    scrollContainerHeight.value = `${Math.max(300, available)}px`;
    gridScrollHeight.value = `${Math.max(300, available - 10)}px`;
    tableScrollHeight.value = `${Math.max(300, available - 20)}px`;
};
const recalcScrollHeight = () => {
    if (_scrollHeightRaf !== null) return;
    _scrollHeightRaf = requestAnimationFrame(_doRecalcScrollHeight);
};

// Listen for settings changes from other tabs/pages
const handleStorageChange = (event) => {
    if (event.key === 'userSettings' && event.newValue) {
        try {
            const newSettings = JSON.parse(event.newValue);
            userSettings.value.mobileColumns = newSettings.mobileColumns || 3;
            userSettings.value.desktopColumns = newSettings.desktopColumns || 8;
        } catch (error) {
            console.error('Error parsing settings from storage:', error);
        }
    }
};

// Listen for custom settings change events (same tab updates)
const handleSettingsChange = (event) => {
    const newSettings = event.detail;
    userSettings.value.mobileColumns = newSettings.mobileColumns || 3;
    userSettings.value.desktopColumns = newSettings.desktopColumns || 8;
};

// Function to refresh settings from current page (for same-tab updates)
const refreshUserSettings = async () => {
    try {
        if (auth.currentUser) {
            const { doc, getDoc } = await import('firebase/firestore');
            const { db } = await import('boot/firebase');

            const settingsDoc = await getDoc(doc(db, 'user_settings', auth.currentUser.uid));
            if (settingsDoc.exists()) {
                const settings = settingsDoc.data();
                userSettings.value.mobileColumns = settings.mobileColumns || 3;
                userSettings.value.desktopColumns = settings.desktopColumns || 8;
            }
        }
    } catch (error) {
        console.error('Error refreshing user settings:', error);
    }
};

// Props
const props = defineProps({ showSearch: Boolean });

// Lifecycle hooks
onMounted(async () => {
    isLoading.value = true;
    try {
        await passwordEntriesStore.fetchEntries(auth.currentUser.uid);
        await loadUserSettings();

        // Listen for storage changes from settings page
        window.addEventListener('storage', handleStorageChange);

        // Listen for custom settings change events
        window.addEventListener('userSettingsChanged', handleSettingsChange);

        // Listen for focus events to refresh settings when returning to this page
        window.addEventListener('focus', refreshUserSettings);

        // Load user preferences for privacy controls
        await loadPreferences();
        listenToSettingsChanges();

        // Register user to be able to share passwords
        await passwordEntriesStore.registerCurrentUser();

        // Load pending shared passwords
        await passwordEntriesStore.fetchPendingSharedPasswords();

        // Fetch emergency contacts for pending requests badge
        fetchMyContacts().catch(() => {});

    } catch (error) {
        // Error fetching documents
    } finally {
        isLoading.value = false;
        nextTick(() => recalcScrollHeight());
    }

    window.addEventListener('resize', recalcScrollHeight);
});


onBeforeUnmount(() => {
    window.removeEventListener('storage', handleStorageChange);
    window.removeEventListener('userSettingsChanged', handleSettingsChange);
    window.removeEventListener('focus', refreshUserSettings);
    window.removeEventListener('resize', recalcScrollHeight);
    previewCleanup();
});

// Per-entry normalized text cache to avoid re-normalizing on every keystroke.
// Uses WeakMap keyed by sig{title|name|username|url} to invalidate when fields change.
const _normalizedCache = new WeakMap();
const getNormalizedSearchable = (entry) => {
    const cached = _normalizedCache.get(entry);
    const sig = `${entry.title || ''}\u0000${entry.name || ''}\u0000${entry.username || ''}\u0000${entry.url || ''}`;
    if (cached && cached.sig === sig) return cached.text;
    const text = normalizeText([entry.title, entry.name, entry.username, entry.url].filter(Boolean).join(' '));
    _normalizedCache.set(entry, { sig, text });
    return text;
};

const filteredAndSortedEntries = computed(() => {
    const entries = passwordEntriesStore.entries;
    if (!Array.isArray(entries)) return [];
    const query = searchTextDebounced.value;

    if (query) {
        const words = splitSearchWords(query);
        if (words.length === 0) return entries;
        const matched = [];
        for (let i = 0; i < entries.length; i++) {
            if (matchesNormalized(words, getNormalizedSearchable(entries[i]))) {
                matched.push(entries[i]);
            }
        }
        return sortByRelevance(matched, query, 'title');
    }

    // No query: sort alphabetically. Copy to avoid mutating store.
    const asc = sortDirection.value === "asc";
    const sorted = entries.slice();
    sorted.sort((a, b) => {
        const aName = a.title || a.name || '';
        const bName = b.title || b.name || '';
        return asc ? aName.localeCompare(bName) : bName.localeCompare(aName);
    });
    return sorted;
});

// Security composable (depends on filteredAndSortedEntries)
const {
    entrySecurityMap,
    isBatchCheckRunning,
    shouldStopBatchCheck,
    startBatchSecurityCheck,
    stopBatchSecurityCheck,
    showSecurityDetails,
    dismissWeakWarning,
    resetDismissedWarning,
    getSecurityTooltip,
    isPasswordOld,
    getPasswordAge
} = usePasswordSecurity({
    passwordEntriesStore, $q, t, filteredAndSortedEntries, canUseAIAnalysis, canCheckPasswordAge, router, editEntry
});

// Column configuration for table view (dynamic based on screen)
const tableColumns = computed(() => {
    const isMobile = $q.screen.lt.sm;

    const columns = [];

    // Security column only on tablet/desktop
    if (!isMobile) {
        columns.push({
            name: 'security',
            label: '',
            field: 'id',
            align: 'center',
            style: 'width: 32px; padding: 4px 2px;',
            headerStyle: 'width: 32px;'
        });
    }

    columns.push({
        name: 'title',
        label: t('passwords.sortBy.site'),
        field: row => row.title || row.name,
        align: 'left',
        sortable: true,
        style: 'font-weight: 600;'
    });

    // User column only on tablet/desktop
    if (!isMobile) {
        columns.push({
            name: 'username',
            label: t('passwords.sortBy.user'),
            field: 'username',
            align: 'left',
            style: 'max-width: 150px; overflow: hidden; text-overflow: ellipsis;'
        });
    }

    columns.push(
        {
            name: 'highlighted',
            label: '',
            field: 'highlighted',
            align: 'center',
            style: 'width: 36px; padding: 4px;'
        },
        {
            name: 'actions',
            label: '',
            field: 'id',
            align: 'right',
            style: isMobile ? 'width: 100px;' : 'width: 130px;'
        }
    );

    return columns;
});

const toggleViewMode = () => {
    const modes = ['list', 'grid', 'table'];
    const currentIndex = modes.indexOf(viewMode.value);
    const nextIndex = (currentIndex + 1) % modes.length;
    viewMode.value = modes[nextIndex];
    localStorage.setItem('viewMode', viewMode.value);
};

// Computed properties for the view toggle
const viewModeIcon = computed(() => {
    switch(viewMode.value) {
        case 'list': return 'grid_view';
        case 'grid': return 'table_chart';
        case 'table': return 'list';
        default: return 'list';
    }
});

const viewModeLabel = computed(() => {
    switch(viewMode.value) {
        case 'list': return t('passwords.mosaicView');
        case 'grid': return t('passwords.tableView');
        case 'table': return t('passwords.listView');
        default: return t('passwords.changeView');
    }
});

// Watchers
watch(
    () => props.showSearch,
    (newVal) => {
        if (!newVal) clearSearchInput();
    }
);

// Funciones

const showLogoutConfirmation = () => {
    confirmLogoutDialog.value = true;
};

const logout = async () => {
    confirmLogoutDialog.value = false;
    try {
        localStorage.removeItem('lemonade_last_login');
        await signOut(auth);
        await router.push("/login");
    } catch (error) {
        $q.notify({
            color: "negative",
            position: "top",
            message: t('passwords.messages.logoutError') + ': ' + error.message,
            icon: "report_problem",
        });
    }
};

const toggleSortDirection = () => {
    sortDirection.value = sortDirection.value === "asc" ? "desc" : "asc";
};

const copyToClipboard = (text, silent = false) => {
    if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard
            .writeText(text)
            .then(() => {
                if (silent) return;
                $q.notify({
                    color: "positive",
                    position: "top",
                    message: t('common.copied'),
                    icon: "content_copy",
                });
            })
            .catch(() => {
                $q.notify({
                    color: "negative",
                    position: "top",
                    message: t('common.copyError'),
                    icon: "error",
                });
            });
    } else {
        let textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            // @ts-ignore - legacy API
            let successful = document.execCommand("copy");
            if (successful) {
                if (!silent) {
                    $q.notify({
                        color: "positive",
                        position: "top",
                        message: t('common.copied'),
                        icon: "content_copy",
                    });
                }
            } else {
                throw new Error('No se pudo ejecutar document.execCommand("copy").');
            }
        } catch (err) {
            $q.notify({
                color: "negative",
                position: "top",
                message: t('common.copyError'),
                icon: "error",
            });
        }
        document.body.removeChild(textArea);
    }
};

const copyUsername = (username) => copyToClipboard(username);
const copyPassword = async (entry) => {
    try {
        let passwordToCopy;
        if (typeof entry === 'string') {
            passwordToCopy = entry;
        } else {
            const decryptedData = await passwordEntriesStore.getDecryptedPassword(entry.id);
            passwordToCopy = decryptedData.password || decryptedData;
        }
        copyToClipboard(passwordToCopy);
    } catch (error) {
        $q.notify({
            color: "negative",
            position: "top",
            message: t('common.copyError'),
            icon: "error",
        });
    }
};

const copyAllData = async (entry) => {
    try {
        const decryptedData = await passwordEntriesStore.getDecryptedPassword(entry.id);
        const decryptedPassword = decryptedData.password || decryptedData;
        const title = entry.title || entry.name || 'Sin nombre';
        const username = entry.username || '';
        const url = entry.url || '';
        const notes = entry.notes || '';

        let formattedText = `\u{1F34B} LEMONADE PASSWORD MANAGER
\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501
\u{1F4DB} ${title}`;

        if (username) {
            formattedText += `\n\u{1F464} ${username}`;
        }

        formattedText += `\n\u{1F510} ${decryptedPassword}`;

        if (url) {
            formattedText += `\n\u{1F310} ${url}`;
        }

        if (notes) {
            formattedText += `\n\u{1F4DD} ${notes}`;
        }

        formattedText += `\n\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501\u2501`;

        copyToClipboard(formattedText, true);
        $q.notify({
            color: "positive",
            position: "top",
            message: t('passwords.messages.dataCopied'),
            icon: "content_copy",
        });
    } catch (error) {
        $q.notify({
            color: "negative",
            position: "top",
            message: t('common.copyError'),
            icon: "error",
        });
    }
};

const resetFormAndTotp = () => {
    resetForm();
    totpSecretInput.value = '';
    showTotpSetupDialog.value = false;
};

const openDialogForNewEntry = () => {
    resetFormAndTotp();
    originalFormData.value = null;
    showDialog.value = true;
};

const openUrl = () => {
    if (typeof window !== "undefined" && previewEntry.value.url) {
        window.open(previewEntry.value.url, '_blank', 'noopener,noreferrer');
    } else {
        $q.notify({
            color: "negative",
            position: "top",
            message: t('passwords.messages.invalidUrl'),
            icon: "error",
        });
    }
};

const openEntryUrl = (entry) => {
    if (typeof window !== "undefined" && entry.url) {
        window.open(entry.url, '_blank', 'noopener,noreferrer');
    }
};

const toggleHighlight = async (entry) => {
    entry.highlighted = !entry.highlighted;
    try {
        await passwordEntriesStore.updateEntry(entry.id, {
            highlighted: entry.highlighted,
        });
    } catch (error) {
        entry.highlighted = !entry.highlighted;
    }
};

const clearSearchInput = () => (searchText.value = "");

const loadUserSettings = async () => {
    try {
        const localSettings = localStorage.getItem('userSettings');
        if (localSettings) {
            const settings = JSON.parse(localSettings);
            userSettings.value.mobileColumns = settings.mobileColumns || 3;
            userSettings.value.desktopColumns = settings.desktopColumns || 8;
        }

        if (auth.currentUser) {
            const { doc, getDoc } = await import('firebase/firestore');
            const { db } = await import('boot/firebase');

            try {
                const settingsDoc = await getDoc(doc(db, 'user_settings', auth.currentUser.uid));
                if (settingsDoc.exists()) {
                    const settings = settingsDoc.data();
                    userSettings.value.mobileColumns = settings.mobileColumns || 3;
                    userSettings.value.desktopColumns = settings.desktopColumns || 8;
                    localStorage.setItem('userSettings', JSON.stringify(settings));
                }
            } catch (firestoreError) {
                console.error('Could not load Firestore settings, using defaults:', firestoreError.message);
            }
        }
    } catch (error) {
        console.error('Error loading user settings:', error);
        userSettings.value.mobileColumns = 3;
        userSettings.value.desktopColumns = 6;
    }
};

// Handler for share dialog search
const handleShareSearch = (value) => {
    userSearchText.value = value;
    onUserSearchInput(value);
};

const handleShareClearSearch = () => {
    userSearchText.value = '';
    loadRecentContacts();
};

// Prepare password history items with formatted dates
const formattedPasswordHistory = computed(() => {
    return passwordHistory.value.map(item => ({
        ...item,
        formattedDate: formatHistoryDate(item.changedAt)
    }));
});

</script>

<template>
    <q-page padding class="index-page-no-scroll">
        <!-- Loading state -->
        <LemonadeLoader v-if="isLoading" :message="t('passwords.loading')" />

        <!-- Loader para desencriptar -->
        <LemonadeLoader v-if="isLoadingPreview" :message="t('passwords.decrypting')" transparent />

        <!-- Boton flotante (FAB) - hidden in trash mode -->
        <q-page-sticky v-if="!showTrash" position="bottom-right" :offset="[17, 17]" class="high-z-index">
            <q-btn fab icon="add" color="primary"
                @click="openDialogForNewEntry"
                :aria-label="t('passwords.addPassword')" />
        </q-page-sticky>

        <q-page-sticky position="bottom-left" :offset="[10, 17]" class="high-z-index">
            <div class="row q-gutter-xs">
                <q-btn v-if="shouldShowSecurityButtons" round :icon="isBatchCheckRunning ? 'stop' : 'security'"
                    :color="isBatchCheckRunning ? 'red-7' : 'orange-7'" size="sm"
                    @click="isBatchCheckRunning ? stopBatchSecurityCheck() : startBatchSecurityCheck()"
                    :aria-label="isBatchCheckRunning ? t('passwords.security.stopBulkCheck') : t('passwords.security.bulkCheckTooltip')">
                    <q-badge v-if="passwordEntriesStore.reusedCount > 0" color="orange-9" floating>
                        {{ passwordEntriesStore.reusedCount }}
                    </q-badge>
                    <q-tooltip :class="isBatchCheckRunning ? 'bg-red-7 text-white' : 'bg-orange-7 text-white'">
                        {{ isBatchCheckRunning ? t('passwords.security.stopBulkCheck') : t('passwords.security.bulkCheckTooltip') }}
                        <span v-if="passwordEntriesStore.reusedCount > 0"> | {{ t('passwords.reused.found', { count: passwordEntriesStore.reusedCount }) }}</span>
                    </q-tooltip>
                </q-btn>
                <q-btn round icon="settings" color="grey-7" size="sm" @click="router.push('/settings')"
                    :aria-label="t('nav.settings')">
                    <q-badge v-if="pendingRequestsCount > 0" color="red" floating>{{ pendingRequestsCount }}</q-badge>
                </q-btn>
                <q-btn round icon="logout" color="green-7" size="sm" @click="showLogoutConfirmation"
                    :aria-label="t('passwords.logout')" />
            </div>
        </q-page-sticky>

        <q-page-sticky position="bottom" :offset="[10, 17]" class="high-z-index">
            <div class="row q-gutter-xs" v-if="!isLoading && (filteredAndSortedEntries.length > 0 || showTrash)">
                <q-btn v-if="!showTrash" size="10px" color="grey-7" :label="sortDirection === 'asc' ? t('passwords.sortZA') : t('passwords.sortAZ')"
                    @click="toggleSortDirection" />
                <q-btn v-if="!showTrash" size="10px" color="grey-7" :icon="viewModeIcon"
                    @click="toggleViewMode" :aria-label="viewModeLabel">
                    <q-tooltip>{{ viewModeLabel }}</q-tooltip>
                </q-btn>
                <q-btn size="10px" :color="showTrash ? 'orange-7' : 'grey-7'" icon="delete_outline"
                    @click="toggleTrash" :aria-label="t('passwords.trash.title')">
                    <q-badge v-if="passwordEntriesStore.trashCount > 0" color="orange" floating>
                        {{ passwordEntriesStore.trashCount }}
                    </q-badge>
                    <q-tooltip>{{ t('passwords.trash.title') }}</q-tooltip>
                </q-btn>
            </div>
        </q-page-sticky>

        <!-- ============================================ -->
        <!-- DIALOGS (extracted components) -->
        <!-- ============================================ -->

        <!-- Add/Edit Dialog -->
        <PasswordEntryForm
            v-model="showDialog"
            :form="form"
            :editing-entry="editingEntry"
            :is-pwd="isPwd"
            :is-saving="isSaving"
            :has-form-changes="hasFormChanges"
            :dialog-title="dialogTitle"
            :dialog-card-style="dialogCardStyle"
            :custom-field-type-options="customFieldTypeOptions"
            :edit-entry-has-totp="editEntryHasTotp"
            @submit="submitForm"
            @reset="resetFormAndTotp"
            @toggle-password="isPwd = !isPwd"
            @add-custom-field="addCustomField"
            @generate-password="generatePassword"
            @setup-totp="showTotpSetupDialog = true"
            @remove-totp="removeTotpFromEntry"
            @focus-first-input="focusFirstInput"
            @update-form="Object.assign(form, $event)"
        />

        <!-- Delete Confirmation Dialog -->
        <q-dialog v-model="confirmDeleteDialog">
            <q-card>
                <q-card-section class="row items-center">
                    <q-icon name="warning" color="amber" />
                    <span class="q-ml-sm">{{ t('passwords.deleteConfirm') }}</span>
                </q-card-section>
                <q-card-actions align="right">
                    <q-btn flat :label="t('common.cancel')" color="primary" v-close-popup :disable="isDeleting" />
                    <q-btn flat :label="t('common.delete')" color="negative" @click="deleteEntry" :loading="isDeleting"
                        :disable="isDeleting" />
                </q-card-actions>
            </q-card>
        </q-dialog>

        <!-- Permanent Delete Confirmation Dialog -->
        <q-dialog v-model="confirmPermanentDeleteDialog">
            <q-card>
                <q-card-section class="row items-center">
                    <q-icon name="delete_forever" color="red" />
                    <span class="q-ml-sm">{{ t('passwords.trash.confirmPermanent') }}</span>
                </q-card-section>
                <q-card-actions align="right">
                    <q-btn flat :label="t('common.cancel')" color="primary" v-close-popup />
                    <q-btn flat :label="t('passwords.trash.deleteForever')" color="negative"
                        @click="permanentDeleteEntry"
                        :loading="entryToPermanentDelete && isPermanentDeleting[entryToPermanentDelete.id]" />
                </q-card-actions>
            </q-card>
        </q-dialog>

        <!-- Logout Confirmation Dialog -->
        <q-dialog v-model="confirmLogoutDialog">
            <q-card>
                <q-card-section class="row items-center">
                    <q-icon name="exit_to_app" color="orange" />
                    <span class="q-ml-sm">{{ t('passwords.logoutConfirm') }}</span>
                </q-card-section>
                <q-card-actions align="right">
                    <q-btn flat :label="t('common.cancel')" color="primary" v-close-popup />
                    <q-btn flat :label="t('passwords.logout')" color="negative" @click="logout" />
                </q-card-actions>
            </q-card>
        </q-dialog>

        <!-- Preview Dialog -->
        <PasswordPreviewDialog
            v-model="showPreviewDialog"
            :entry="previewEntry"
            :custom-fields="previewCustomFields"
            :show-custom-field-value="showCustomFieldValue"
            :has-totp="previewHasTotp"
            :totp-code="totpCode"
            :totp-time-remaining="totpTimeRemaining"
            :password-history="formattedPasswordHistory"
            :is-loading-history="isLoadingHistory"
            :show-history-password="showHistoryPassword"
            :is-loading-preview="isLoadingPreview"
            :is-pwd="isPwd"
            @toggle-password="isPwd = !isPwd"
            @copy-username="copyUsername"
            @copy-password="copyPassword"
            @open-url="openUrl"
            @copy-url="copyToClipboard"
            @toggle-custom-field="(label) => showCustomFieldValue[label] = !showCustomFieldValue[label]"
            @copy-custom-field="copyToClipboard"
            @load-history="loadPasswordHistory"
            @copy-history-password="copyHistoryPassword"
            @toggle-history-password="(id) => showHistoryPassword[id] = !showHistoryPassword[id]"
            @copy-totp="copyTotpCode"
        />

        <!-- TOTP Setup Dialog (inline - needs template ref for video element) -->
        <q-dialog v-model="showTotpSetupDialog" @hide="stopQrScanner">
            <q-card style="min-width: 350px; max-width: 450px;">
                <q-card-section>
                    <div class="text-h6">{{ t('passwords.totp.setup') }}</div>
                </q-card-section>
                <q-card-section>
                    <div v-if="showQrScanner" class="qr-scanner-container q-mb-md">
                        <video ref="qrVideoElement" class="qr-video"></video>
                        <q-btn round flat icon="close" color="white" class="qr-close-btn" @click="stopQrScanner" />
                    </div>
                    <div v-else class="text-center q-mb-md">
                        <q-btn outline icon="qr_code_scanner" :label="t('passwords.totp.scanQr')"
                            color="primary" @click="startQrScanner" class="full-width" />
                    </div>
                    <div class="text-center text-caption text-grey q-mb-sm">{{ t('passwords.totp.orManual') }}</div>
                    <q-input v-model="totpSecretInput" outlined
                        :label="t('passwords.totp.secret')"
                        :hint="t('passwords.totp.secretHint')" />
                </q-card-section>
                <q-card-actions align="right">
                    <q-btn flat :label="t('common.cancel')" v-close-popup />
                    <q-btn color="primary" :label="t('common.save')"
                        :loading="isSavingTotp" :disable="!totpSecretInput"
                        @click="saveTotpSecret" />
                </q-card-actions>
            </q-card>
        </q-dialog>

        <!-- Share Dialog -->
        <SharePasswordDialog
            v-model="showShareDialog"
            :entry="entryToShare"
            :users="passwordEntriesStore.systemUsers"
            :is-loading-users="passwordEntriesStore.isLoadingUsers"
            :is-sharing="isSharing"
            :search-results-mode="searchResultsMode"
            :user-search-text="userSearchText"
            @search="handleShareSearch"
            @share="shareWithUser"
            @clear-search="handleShareClearSearch"
        />

        <!-- ============================================ -->
        <!-- SEARCH INPUT -->
        <!-- ============================================ -->
        <q-input v-model="searchText" dense :placeholder="t('passwords.searchPlaceholder')" v-if="props.showSearch && !showTrash"
            class="q-mb-md q-mt-sm q-mx-md" ref="searchInput" v-focus clearable outlined @clear="clearSearchInput" />

        <!-- ============================================ -->
        <!-- TRASH VIEW -->
        <!-- ============================================ -->
        <TrashSection
            v-if="showTrash"
            :trash-entries="passwordEntriesStore.trashEntries"
            :is-loading-trash="passwordEntriesStore.isLoadingTrash"
            :is-restoring-entry="isRestoringEntry"
            :is-permanent-deleting="isPermanentDeleting"
            @restore="restoreTrashEntry"
            @permanent-delete="confirmPermanentDelete"
            @close="showTrash = false"
        />

        <!-- ============================================ -->
        <!-- NORMAL VIEW (not trash) -->
        <!-- ============================================ -->

        <!-- Pending Shares Section -->
        <PendingSharesSection
            v-if="!showTrash && !isLoading && passwordEntriesStore.pendingShares.length > 0"
            :shares="passwordEntriesStore.pendingShares"
            :is-accepting="isAccepting"
            :is-rejecting="isRejecting"
            :is-blocking="isBlocking"
            @accept="acceptPendingShare"
            @reject="rejectPendingShare"
            @block="blockPendingShareUser"
        />

        <!-- Empty state -->
        <div v-if="!showTrash && !isLoading && filteredAndSortedEntries.length === 0" class="text-center q-my-xl">
            <q-icon name="lock" size="4rem" color="grey-5" class="q-mb-md" />
            <div class="text-h6 text-grey-7 q-mb-sm">{{ $t('passwords.noPasswords') }}</div>
            <div class="text-body2 text-grey-6 q-mb-lg">{{ $t('passwords.noPasswordsHint') }}</div>
        </div>

        <!-- User info and count -->
        <div class="q-gutter-md flex justify-between items-center q-mr-md q-ml-none q-mb-xs"
            v-if="!showTrash && !isLoading && filteredAndSortedEntries.length > 0">
            <q-chip dense class="user-chip transparent-chip">
                <q-avatar>
                    <img :src="auth.currentUser.photoURL" />
                </q-avatar>
                {{ auth.currentUser.displayName }}
            </q-chip>
            <q-chip dense class="passwords-count-chip transparent-chip">
                {{ t('passwords.count', { count: passwordEntriesStore.entriesCount }) }}
            </q-chip>
        </div>

        <!-- Entries list -->
        <transition appear enter-active-class="animated fadeIn" leave-active-class="animated fadeOut">
            <div v-if="!showTrash && !isLoading && filteredAndSortedEntries.length > 0" ref="entriesAreaRef" style="overflow: hidden; padding-top: 4px; flex: 1; min-height: 0;">

                <!-- Vista Lista -->
                <PasswordListView
                    v-if="viewMode === 'list'"
                    :entries="filteredAndSortedEntries"
                    :security-map="entrySecurityMap"
                    :scroll-height="scrollContainerHeight"
                    :can-use-a-i-analysis="canUseAIAnalysis"
                    @preview="showPreview"
                    @edit="editEntry"
                    @delete="confirmDelete"
                    @share="openShareDialog"
                    @highlight="toggleHighlight"
                    @copy-username="copyUsername"
                    @copy-password="copyPassword"
                    @copy-all="copyAllData"
                    @open-url="openEntryUrl"
                    @security-details="showSecurityDetails"
                    @dismiss-warning="dismissWeakWarning"
                    @reset-warning="resetDismissedWarning"
                />

                <!-- Vista Mosaico -->
                <PasswordGridView
                    v-if="viewMode === 'grid'"
                    :grid-rows="gridRows"
                    :grid-row-height="gridRowHeight"
                    :grid-container-style="gridContainerStyle"
                    :scroll-height="gridScrollHeight"
                    :security-map="entrySecurityMap"
                    :can-use-a-i-analysis="canUseAIAnalysis"
                    :current-grid-columns="currentGridColumns"
                    @preview="showPreview"
                    @edit="editEntry"
                    @delete="confirmDelete"
                    @share="openShareDialog"
                    @highlight="toggleHighlight"
                    @copy-username="copyUsername"
                    @copy-password="copyPassword"
                    @copy-all="copyAllData"
                    @open-url="openEntryUrl"
                    @security-details="showSecurityDetails"
                    @dismiss-warning="dismissWeakWarning"
                    @reset-warning="resetDismissedWarning"
                />

                <!-- Vista Tabla -->
                <PasswordTableView
                    v-if="viewMode === 'table'"
                    :entries="filteredAndSortedEntries"
                    :columns="tableColumns"
                    :security-map="entrySecurityMap"
                    :scroll-height="tableScrollHeight"
                    :can-use-a-i-analysis="canUseAIAnalysis"
                    @preview="showPreview"
                    @edit="editEntry"
                    @delete="confirmDelete"
                    @share="openShareDialog"
                    @highlight="toggleHighlight"
                    @copy-username="copyUsername"
                    @copy-password="copyPassword"
                    @copy-all="copyAllData"
                    @open-url="openEntryUrl"
                    @security-details="showSecurityDetails"
                    @dismiss-warning="dismissWeakWarning"
                    @reset-warning="resetDismissedWarning"
                />
            </div>
        </transition>
    </q-page>
</template>

<style scoped>
.qr-scanner-container {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    background: #000;
    aspect-ratio: 1;
    max-height: 300px;
}

.qr-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.qr-close-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1;
}

.high-z-index {
    z-index: 9999;
}

.index-page-no-scroll {
    display: flex !important;
    flex-direction: column;
    overflow: hidden !important;
    max-height: calc(100vh - 50px);
}

/* Estilos para chips transparentes */
.transparent-chip {
    background: transparent !important;
    border: none !important;
    color: var(--text-primary) !important;
    transition: all 0.3s ease;
}

.transparent-chip:hover {
    background: rgba(255, 255, 255, 0.05) !important;
}

.user-chip.transparent-chip {
    .q-avatar img {
        border-radius: 50% !important;
    }
}

.passwords-count-chip.transparent-chip {
    font-weight: 500;
}

/* Estilos especificos para tema claro */
.lemonade-light .transparent-chip:hover {
    background: rgba(0, 0, 0, 0.03) !important;
}

/* Lemonade-styled scrollbar */
.index-page-no-scroll :deep(::-webkit-scrollbar) {
    width: 5px;
    height: 5px;
}

.index-page-no-scroll :deep(::-webkit-scrollbar-track) {
    background: transparent;
}

.index-page-no-scroll :deep(::-webkit-scrollbar-thumb) {
    background: rgba(255, 109, 0, 0.3);
    border-radius: 10px;
}

.index-page-no-scroll :deep(::-webkit-scrollbar-thumb:hover) {
    background: rgba(255, 109, 0, 0.6);
}

/* Dialog compact styles */
.q-dialog .q-card {
    max-height: 70vh !important;
    overflow-y: auto;
}

.q-dialog .q-card__section {
    padding: 16px 20px !important;
}

.q-dialog .q-card__actions {
    padding: 12px 20px !important;
    gap: 8px;
}

.q-dialog .q-dialog__message {
    line-height: 1.4 !important;
    font-size: 14px !important;
}

.q-dialog .q-dialog__message .text-h6 {
    font-size: 18px !important;
    margin-bottom: 12px !important;
}

.q-dialog .q-dialog__message ul {
    margin: 8px 0 !important;
    padding-left: 20px !important;
}

.q-dialog .q-dialog__message li {
    margin-bottom: 4px !important;
    font-size: 13px !important;
}

/* Disable hover movement on dialog cards */
.q-dialog .q-card {
    transform: none !important;
    transition: none !important;
}
</style>

<style>
/* Dark mode scrollbar */
.lemonade-dark .index-page-no-scroll :deep(::-webkit-scrollbar-thumb),
.body--dark .index-page-no-scroll :deep(::-webkit-scrollbar-thumb) {
    background: rgba(139, 148, 158, 0.3);
}

.lemonade-dark .index-page-no-scroll :deep(::-webkit-scrollbar-thumb:hover),
.body--dark .index-page-no-scroll :deep(::-webkit-scrollbar-thumb:hover) {
    background: rgba(139, 148, 158, 0.5);
}
</style>
