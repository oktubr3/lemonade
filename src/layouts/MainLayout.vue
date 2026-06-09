<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { useQuasar } from "quasar";
import { useThemeStore } from "stores/theme";
import { useAdmin } from "src/composables/useAdmin";
import { useTickets } from "src/composables/useTickets";
import { usePasskeys } from "src/composables/usePasskeys";
import BiometricLockScreen from "src/components/BiometricLockScreen.vue";
import { auth, db } from "boot/firebase";
import { signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import FUNCTIONS_URL from "src/config/functions";

const { t } = useI18n();
const $q = useQuasar();
const route = useRoute();
const router = useRouter();
const themeStore = useThemeStore();
const { isAdmin, fetchUserRole } = useAdmin();
const { openTicketsCount, fetchOpenTicketsCount } = useTickets();
const { hasRegisteredPasskey, getStoredUserId } = usePasskeys();
const showSearchInput = ref(false);
const showBiometricLock = ref(false);
const lockedUserId = ref(null);

// Session expiry constants and functions
const SESSION_LOGIN_KEY = 'lemonade_last_login';
const SESSION_CHECK_INTERVAL = 60000; // Check every minute
let sessionCheckInterval = null;

/**
 * Validates the stored login timestamp
 * @param {string|null} timestampStr - The timestamp as a string
 * @returns {{valid: boolean, timestamp: number}} - Validation result
 */
const validateTimestamp = (timestampStr) => {
    if (!timestampStr) {
        return { valid: false, timestamp: 0 };
    }

    const timestamp = parseInt(timestampStr, 10);

    // Check that it is not NaN
    if (isNaN(timestamp)) {
        console.warn('Session timestamp is corrupted (NaN)');
        return { valid: false, timestamp: 0 };
    }

    // Check that it is not a future timestamp (possible tampering)
    const now = Date.now();
    if (timestamp > now) {
        console.warn('Session timestamp is in the future (possible tampering)');
        return { valid: false, timestamp: 0 };
    }

    // Check that it is a reasonable timestamp (after year 2020)
    const minValidTimestamp = new Date('2020-01-01').getTime();
    if (timestamp < minValidTimestamp) {
        console.warn('Session timestamp is too old (invalid)');
        return { valid: false, timestamp: 0 };
    }

    return { valid: true, timestamp };
};

const checkSessionExpiry = async () => {
    if (!auth.currentUser) return true;

    try {
        // Load user settings
        const settingsDoc = await getDoc(doc(db, 'user_settings', auth.currentUser.uid));
        const timeoutDays = settingsDoc.exists()
            ? (settingsDoc.data().sessionTimeoutDays ?? 7)
            : 7;

        // If 0, there is no limit
        if (timeoutDays === 0) return true;

        const lastLoginStr = localStorage.getItem(SESSION_LOGIN_KEY);

        // Validar el timestamp (detecta NaN, futuro, corrupto)
        const { valid, timestamp } = validateTimestamp(lastLoginStr);

        if (!valid) {
            // Invalid, corrupted, or tampered timestamp = expire for security
            return false;
        }

        const daysPassed = (Date.now() - timestamp) / (1000 * 60 * 60 * 24);

        return daysPassed <= timeoutDays;
    } catch (error) {
        console.error('Error checking session expiry:', error);
        // On Firestore error, force expiration for security
        // Better to ask for re-login than to allow potentially unauthorized access
        return false;
    }
};

const handleSessionExpired = async () => {
    // Stop periodic check
    stopSessionCheck();

    localStorage.removeItem(SESSION_LOGIN_KEY);

    // Check if user has a registered passkey for biometric unlock
    if (hasRegisteredPasskey()) {
        const userId = auth.currentUser?.uid || getStoredUserId();
        if (userId) {
            lockedUserId.value = userId;

            // Pre-warm Cloud Functions while lock screen renders
            warmupCloudFunctions();

            // Sign out first, then show biometric lock
            try {
                await signOut(auth);
            } catch (error) {
                console.error('Error signing out:', error);
            }

            showBiometricLock.value = true;
            return;
        }
    }

    $q.notify({
        type: 'warning',
        message: t('session.expired'),
        icon: 'schedule',
        timeout: 5000,
    });

    try {
        await signOut(auth);
    } catch (error) {
        console.error('Error signing out:', error);
    }

    router.push('/login');
};

// Fire-and-forget warmup ping to wake up Cloud Functions
const warmupCloudFunctions = () => {
    fetch(`${FUNCTIONS_URL}/healthCheck`).catch(() => {});
};

const handleBiometricUnlocked = () => {
    showBiometricLock.value = false;
    lockedUserId.value = null;
    // Skip session check - we just authenticated with passkey, session is fresh
    startSessionCheck();
};

const handleBiometricFallback = async () => {
    showBiometricLock.value = false;
    lockedUserId.value = null;
    try { await signOut(auth); } catch {}
    router.push('/login');
};

// Periodic session check
const startSessionCheck = () => {
    if (sessionCheckInterval) return; // Already running

    sessionCheckInterval = setInterval(async () => {
        if (auth.currentUser) {
            const valid = await checkSessionExpiry();
            if (!valid) {
                await handleSessionExpired();
            }
        }
    }, SESSION_CHECK_INTERVAL);
};

const stopSessionCheck = () => {
    if (sessionCheckInterval) {
        clearInterval(sessionCheckInterval);
        sessionCheckInterval = null;
    }
};

// Background timeout: lock after X minutes in background
const BACKGROUND_TIMEOUT_MOBILE = 3 * 60 * 1000;  // 3 minutes
const BACKGROUND_TIMEOUT_DESKTOP = 15 * 60 * 1000; // 15 minutes
let backgroundSince = null;
let isPageReloading = false;

const getBackgroundTimeout = () => {
    return $q.platform.is.mobile ? BACKGROUND_TIMEOUT_MOBILE : BACKGROUND_TIMEOUT_DESKTOP;
};

// Lock on exit: platform-based background timeout
const handleVisibilityChange = async () => {
    if (document.visibilityState === 'hidden') {
        if (isPageReloading) return;
        const lockOnExit = localStorage.getItem('lemonade_lock_on_exit') === 'true';
        if (lockOnExit && auth.currentUser) {
            backgroundSince = Date.now();
            localStorage.setItem('lemonade_background_since', String(backgroundSince));
        }
    } else if (document.visibilityState === 'visible') {
        const lockOnExit = localStorage.getItem('lemonade_lock_on_exit') === 'true';
        if (lockOnExit && auth.currentUser) {
            const bgSince = parseInt(localStorage.getItem('lemonade_background_since') || '0', 10);
            localStorage.removeItem('lemonade_background_since');
            backgroundSince = null;

            if (bgSince > 0) {
                const elapsed = Date.now() - bgSince;
                if (elapsed >= getBackgroundTimeout()) {
                    // Timeout exceeded: lock
                    localStorage.removeItem(SESSION_LOGIN_KEY);
                    const userId = auth.currentUser?.uid || getStoredUserId();
                    if (userId && hasRegisteredPasskey()) {
                        lockedUserId.value = userId;
                        warmupCloudFunctions();
                        try { await signOut(auth); } catch {}
                        showBiometricLock.value = true;
                        stopSessionCheck();
                        return;
                    }
                }
            }
        }
        // Normal: session expiry check (with Firestore)
        if (auth.currentUser) {
            checkSessionExpiry().then(valid => {
                if (!valid) {
                    handleSessionExpired();
                }
            });
        }
    }
};

// Check on every route navigation
router.beforeEach(async (to, from, next) => {
    // Only check if we're not going to login and there is an authenticated user
    if (to.path !== '/login' && auth.currentUser) {
        const valid = await checkSessionExpiry();
        if (!valid) {
            await handleSessionExpired();
            next('/login');
            return;
        }
    }
    next();
});

// Determines whether to show the toolbar based on the current route
const showToolbar = computed(() => route.path !== "/login");

// Navigation tabs
const currentTab = ref(
    route.path === '/env-vault' ? 'env-vault'
        : route.path === '/notes' ? 'notes'
            : 'passwords'
);

// Sync tab with route
watch(() => route.path, (path) => {
    currentTab.value = path === '/env-vault' ? 'env-vault'
        : path === '/notes' ? 'notes'
            : 'passwords';
});

const showTabs = computed(() => {
    return route.path === '/' || route.path === '/env-vault' || route.path === '/notes';
});

function navigateToTab(tab) {
    if (tab === 'passwords') {
        router.push('/');
    } else if (tab === 'env-vault') {
        router.push('/env-vault');
    } else if (tab === 'notes') {
        router.push('/notes');
    }
}

// Initialize theme on mount
onMounted(async () => {
    themeStore.initializeTheme();
    // Update theme-color meta tag when theme changes
    updateThemeColorMeta();

    // Apply accessibility filters from localStorage
    if (localStorage.getItem('lemonade-a11y-focus') === 'true') {
        document.body.classList.add('a11y-focus');
    }
    if (localStorage.getItem('lemonade-a11y-high-contrast') === 'true') {
        document.body.classList.add('a11y-high-contrast');
    }
    if (localStorage.getItem('lemonade-a11y-grayscale') === 'true') {
        document.body.classList.add('a11y-grayscale');
    }

    // Fast path: lock-on-exit check with background timeout
    const lockOnExit = localStorage.getItem('lemonade_lock_on_exit') === 'true';
    if (lockOnExit) {
        const bgSince = parseInt(localStorage.getItem('lemonade_background_since') || '0', 10);
        if (bgSince > 0) {
            const elapsed = Date.now() - bgSince;
            localStorage.removeItem('lemonade_background_since');
            if (elapsed >= getBackgroundTimeout()) {
                localStorage.removeItem(SESSION_LOGIN_KEY);
                const userId = auth.currentUser?.uid || getStoredUserId();
                if (userId && hasRegisteredPasskey()) {
                    lockedUserId.value = userId;
                    warmupCloudFunctions();
                    try { await signOut(auth); } catch {}
                    showBiometricLock.value = true;
                    return;
                }
            }
        }
    }

    // Lock-on-exit: if no valid login timestamp, lock immediately (before any network calls)
    const lockOnExitSetting = localStorage.getItem('lemonade_lock_on_exit') === 'true';
    if (lockOnExitSetting && hasRegisteredPasskey()) {
        const lastLogin = localStorage.getItem(SESSION_LOGIN_KEY);
        if (!lastLogin) {
            const userId = auth.currentUser?.uid || getStoredUserId();
            if (userId) {
                lockedUserId.value = userId;
                warmupCloudFunctions();
                try { await signOut(auth); } catch {}
                showBiometricLock.value = true;
                return; // Don't load any data until unlocked
            }
        }
    }

    // Check session expiry before any other initialization
    if (auth.currentUser) {
        warmupCloudFunctions();
        const sessionValid = await checkSessionExpiry();
        if (!sessionValid) {
            await handleSessionExpired();
            return; // Do not continue with initialization
        }

        // Start periodic session check
        startSessionCheck();
    }

    // Listen for visibility changes for lock on exit
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // Detect reload to avoid triggering lock-on-exit
    window.addEventListener('beforeunload', () => { isPageReloading = true; });

    // Check if user is admin (silently, for menu visibility)
    try {
        await fetchUserRole();
        // If admin, fetch open tickets count
        if (isAdmin.value) {
            fetchOpenTicketsCount().catch(() => {});
        }
    } catch {
        // Silently fail for non-authenticated users
    }
});

// Cleanup on unmount
onUnmounted(() => {
    stopSessionCheck();
    document.removeEventListener('visibilitychange', handleVisibilityChange);
});

// Watch for isAdmin changes (e.g., after login)
watch(isAdmin, (newVal) => {
    if (newVal) {
        fetchOpenTicketsCount().catch(() => {});
    }
});

// Function to update theme-color meta tag
const updateThemeColorMeta = () => {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
        metaThemeColor.content = themeStore.isDarkMode ? '#21262D' : '#F7DC6F';
    }
};

// Watch for theme changes
themeStore.$subscribe(() => {
    updateThemeColorMeta();
});
</script>

<template>
    <q-layout view="lHh Lpr lFf" :class="themeStore.themeClass">
        <q-header v-if="showToolbar" class="header-glass">
            <q-toolbar class="toolbar-gradient">

                <q-avatar class="logo-avatar clickable-logo" @click="router.push('/')">
                    <q-img src="~assets/lemonade.webp" style="height: 32px; width: 32px" alt="Lemonade logo" />
                    <q-tooltip :delay="500">{{ $t('nav.home') }}</q-tooltip>
                </q-avatar>

                <q-toolbar-title class="app-title">
                    <div class="title-full">
                        <span class="title-lemonade">Lemonade</span>
                        <span class="title-password">{{ t('login.passwordManager') }}</span>
                    </div>
                </q-toolbar-title>

                <div class="toolbar-actions">
                    <q-btn
                        v-if="isAdmin"
                        flat
                        round
                        dense
                        icon="admin_panel_settings"
                        @click="router.push('/admin/users')"
                        class="toolbar-btn admin-btn"
                        :aria-label="$t('nav.admin')"
                    >
                        <q-badge
                            v-if="openTicketsCount > 0"
                            color="red"
                            floating
                            :label="openTicketsCount"
                        />
                        <q-tooltip :delay="800">{{ $t('nav.admin') }}</q-tooltip>
                    </q-btn>

                    <q-btn flat round dense :icon="themeStore.isDarkMode ? 'light_mode' : 'dark_mode'"
                        @click="themeStore.toggleDarkMode($event)" class="theme-toggle"
                        :aria-label="themeStore.isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'">
                        <q-tooltip :delay="800">
                            {{ themeStore.isDarkMode ? $t('settings.themeLight') : $t('settings.themeDark') }}
                        </q-tooltip>
                    </q-btn>

                    <q-btn flat round dense icon="search" @click="showSearchInput = !showSearchInput"
                        class="toolbar-btn" aria-label="Search">
                        <q-tooltip :delay="800">{{ $t('common.search') }}</q-tooltip>
                    </q-btn>
                </div>
            </q-toolbar>

            <!-- Tabs de navegación con QTabs -->
            <q-toolbar v-if="showTabs" class="tabs-toolbar">
                <q-tabs
                    v-model="currentTab"
                    class="col nav-tabs"
                    align="center"
                    no-caps
                    inline-label
                    dense
                    indicator-color="transparent"
                >
                    <q-tab name="passwords" icon="key" :label="$t('nav.passwords')" @click="navigateToTab('passwords')" />
                    <q-tab name="env-vault" icon="lock" :label="$t('nav.envVault')" @click="navigateToTab('env-vault')" />
                    <q-tab name="notes" icon="note" :label="$t('nav.notes')" @click="navigateToTab('notes')" />
                </q-tabs>
            </q-toolbar>
        </q-header>


        <q-page-container>
            <router-view :show-search="showSearchInput" />
        </q-page-container>

        <BiometricLockScreen
            v-if="showBiometricLock && lockedUserId"
            :user-id="lockedUserId"
            @unlocked="handleBiometricUnlocked"
            @fallback="handleBiometricFallback"
        />
    </q-layout>
</template>

<style lang="scss" scoped>
// Header and Toolbar Styling
.header-glass {
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);

    :deep(.q-layout__section--marginal) {
        background-color: transparent !important;
    }
}

.toolbar-gradient {
    background: linear-gradient(135deg, #F7DC6F 0%, #F8C471 100%);
    color: #2C3E50;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.lemonade-dark .toolbar-gradient {
    background: linear-gradient(135deg, #21262D 0%, #161B22 100%);
    color: #F0F6FC;
    border-bottom: 1px solid #30363D;
}

// Logo and Title
.logo-avatar {
    margin-right: 4px;
    transition: transform 0.3s ease;
    flex-shrink: 0;


    &:hover {
        transform: rotate(10deg) scale(1.1);
    }
}

.clickable-logo {
    cursor: pointer;
}

.app-title {
    flex: 1;
    overflow: hidden;

    .title-full {
        display: flex;
        align-items: baseline;
        gap: 5px;
        white-space: nowrap;
    }

    .title-lemonade {
        color: #2C3E50;
        font-weight: 700;
        font-size: 1.1rem;

        @media (max-width: 420px) {
            font-size: 0.95rem;
        }
    }

    .title-password {
        color: #7D6608;
        font-weight: 500;
        font-size: 1.05rem;

        @media (max-width: 420px) {
            font-size: 0.85rem;
        }

        @media (max-width: 340px) {
            display: none;
        }
    }
}

.lemonade-dark .app-title {
    .title-lemonade {
        color: #F0F6FC;
    }

    .title-password {
        color: #FFD700;
    }
}

// Toolbar Actions
.toolbar-actions {
    display: flex;
    gap: 4px;
    align-items: center;
    flex-shrink: 0; // Prevent buttons from shrinking

    @media (max-width: 520px) {
        gap: 2px;
    }
}

.toolbar-btn {
    color: #2C3E50;
    transition: all 0.3s ease;

    &:hover {
        background-color: rgba(255, 255, 255, 0.2);
        transform: scale(1.1);
    }
}

.lemonade-dark .toolbar-btn {
    color: #F0F6FC;

    &:hover {
        background-color: rgba(255, 215, 0, 0.1);
    }
}

// Admin Button - distinctive amber glow
.admin-btn {
    color: #B8860B !important;

    &:hover {
        background: rgba(255, 193, 7, 0.2) !important;
        transform: scale(1.1);
    }
}

.lemonade-dark .admin-btn {
    color: #FFC107 !important;

    &:hover {
        background: rgba(255, 193, 7, 0.2) !important;
        box-shadow: 0 0 12px rgba(255, 193, 7, 0.3);
    }
}

// Special Theme Toggle Button
.theme-toggle {
    position: relative;
    color: #2C3E50;
    transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);

    &:hover {
        transform: scale(1.15) rotate(15deg);
        background: radial-gradient(circle, rgba(255, 215, 0, 0.2) 0%, transparent 70%);
    }

    &:active {
        transform: scale(0.95) rotate(-15deg);
    }
}

.lemonade-dark .theme-toggle {
    color: #FFD700;

    &:hover {
        background: radial-gradient(circle, rgba(255, 215, 0, 0.3) 0%, transparent 70%);
        box-shadow: 0 0 20px rgba(255, 215, 0, 0.4);
    }
}

// Add smooth animations
* {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

// Navigation Tabs
.tabs-toolbar {
    min-height: 40px;
    padding: 0;
    background: #ffffff !important;
}

.lemonade-dark .tabs-toolbar {
    background: #0d1117 !important;
}

.nav-tabs {
    :deep(.q-tab) {
        color: rgba(44, 62, 80, 0.5);
        font-weight: 500;
    }

    :deep(.q-tab--active) {
        color: #2C3E50;
        font-weight: 700;
    }

    :deep(.q-tab__indicator) {
        background: #2C3E50 !important;
        height: 3px;
    }

    :deep(.q-focus-helper) {
        display: none !important;
    }

    :deep(.q-ripple) {
        display: none !important;
    }
}

.lemonade-dark .nav-tabs {
    :deep(.q-tab) {
        color: rgba(255, 255, 255, 0.4);
    }

    :deep(.q-tab--active) {
        color: #F7DC6F;
        font-weight: 700;
    }

    :deep(.q-tab__indicator) {
        background: #F7DC6F !important;
    }
}
</style>

<style lang="scss">
// Global override - not scoped so that it applies
.q-layout__section--marginal {
    background-color: transparent !important;
}

.q-tab__indicator {
    background-color: transparent !important;
}

.q-tabs__content {
    background-color: transparent !important;
}

.q-tab {
    background-color: transparent !important;
}

.q-focus-helper {
    background: transparent !important;
}
</style>
