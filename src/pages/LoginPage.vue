<script setup>
import { useRouter } from "vue-router";
import { useQuasar } from "quasar";
import { auth, db } from "boot/firebase";
import { GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { FUNCTIONS_URL } from "../config/functions";
import { useThemeStore } from "stores/theme";
import { useI18n } from "vue-i18n";
import { ref, onMounted, onUnmounted } from "vue";
import { usePasskeys } from "../composables/usePasskeys";
import { supportedLanguages, getSavedLanguage, setLanguage } from "../boot/i18n";
import LemonadeLoader from "../components/LemonadeLoader.vue";

// Access i18n translate function (Composition API mode)
const { t } = useI18n();

// Language selector
const currentLocale = ref(getSavedLanguage() || 'en-US');

const changeLocale = async (locale) => {
    await setLanguage(locale);
    currentLocale.value = locale;
};
const $q = useQuasar();
const router = useRouter();
const themeStore = useThemeStore();
const googleProvider = new GoogleAuthProvider();

const isLoading = ref(true); // Starts true to verify initial auth
const isCheckingAuth = ref(true);
const biometricLoading = ref(false);
const accountLocked = ref(false);
const lockedEmail = ref('');

const SESSION_LOGIN_KEY = 'lemonade_last_login';

const { hasRegisteredPasskey, getStoredUserId, authenticateWithPasskey } = usePasskeys();
const showBiometricButton = ref(false);

let unsubscribeAuth = null;

const syncLanguageFromFirestore = async (uid) => {
    try {
        const settingsDoc = await getDoc(doc(db, 'user_settings', uid));
        if (settingsDoc.exists()) {
            const data = settingsDoc.data();
            if (data.language) {
                await setLanguage(data.language);
                currentLocale.value = data.language;
            }
        }
    } catch (error) {
        console.error('Error syncing language:', error);
    }
};

const checkAccountLock = async (user) => {
    try {
        const token = await user.getIdToken();
        const response = await fetch(`${FUNCTIONS_URL}/registerUserHttp`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({})
        });
        if (response.ok) {
            const result = await response.json();
            return result.locked === true;
        }
    } catch (error) {
        console.warn('Error checking account lock:', error);
    }
    return false;
};

const signInWithGoogle = async () => {
    isLoading.value = true;
    try {
        const result = await signInWithPopup(auth, googleProvider);

        // Check if account is locked due to inactivity
        const isLocked = await checkAccountLock(result.user);
        if (isLocked) {
            lockedEmail.value = result.user.email || '';
            await signOut(auth);
            localStorage.removeItem(SESSION_LOGIN_KEY);
            accountLocked.value = true;
            isLoading.value = false;
            return;
        }

        // Save login timestamp to control session expiration
        localStorage.setItem(SESSION_LOGIN_KEY, Date.now().toString());
        // Sync language preference from Firestore
        await syncLanguageFromFirestore(result.user.uid);
        // Keep loading while navigating - do NOT set false here
        await router.push("/");
        // The loading state stays until the navigation completes
    } catch (error) {
        // Only clear loading on error
        isLoading.value = false;
        $q.notify({
            color: "negative",
            position: "top",
            message: t('login.error.generic') + ": " + error.message,
            icon: "report_problem",
        });
    }
    // There is NO finally that sets isLoading = false
};

const signInWithBiometric = async () => {
    biometricLoading.value = true;
    try {
        const userId = getStoredUserId();
        if (!userId) throw new Error('No user ID found');
        await authenticateWithPasskey(userId);
        localStorage.setItem(SESSION_LOGIN_KEY, Date.now().toString());
        await router.push("/");
    } catch (error) {
        biometricLoading.value = false;
        if (error.name !== 'NotAllowedError') {
            $q.notify({
                color: "negative",
                position: "top",
                message: t('biometric.unlockError'),
                icon: "report_problem",
            });
        }
    }
};

// Initialize theme on mount and check if already authenticated
onMounted(() => {
    themeStore.initializeTheme();

    // Check if there is already an authenticated user
    unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
        if (user) {
            // Check if account is locked
            const isLocked = await checkAccountLock(user);
            if (isLocked) {
                lockedEmail.value = user.email || '';
                await signOut(auth);
                localStorage.removeItem(SESSION_LOGIN_KEY);
                accountLocked.value = true;
                isLoading.value = false;
                isCheckingAuth.value = false;
                return;
            }
            // User exists, redirect to home
            // Check if it has a login timestamp (valid session)
            const lastLogin = localStorage.getItem(SESSION_LOGIN_KEY);
            if (!lastLogin) {
                // Logged-in user without timestamp (old session), create one
                localStorage.setItem(SESSION_LOGIN_KEY, Date.now().toString());
            }
            await router.push("/");
        } else {
            // No user, show login form
            isLoading.value = false;
            isCheckingAuth.value = false;
            // Check if biometric login is available
            showBiometricButton.value = hasRegisteredPasskey() && !!getStoredUserId();
        }
    });
});

onUnmounted(() => {
    if (unsubscribeAuth) {
        unsubscribeAuth();
    }
});
</script>

<template>
    <q-page class="login-page" :class="themeStore.themeClass">
        <!-- Top Actions: Language + Theme Toggle -->
        <div class="login-top-actions">
            <q-btn
                flat
                round
                dense
                icon="translate"
                class="top-action-btn"
                aria-label="Change language"
            >
                <q-menu anchor="bottom right" self="top right">
                    <q-list dense style="min-width: 180px">
                        <q-item
                            v-for="lang in supportedLanguages"
                            :key="lang.value"
                            clickable
                            v-close-popup
                            @click="changeLocale(lang.value)"
                            :active="currentLocale === lang.value"
                            active-class="text-yellow-8"
                        >
                            <q-item-section>{{ lang.nativeLabel }}</q-item-section>
                            <q-item-section v-if="currentLocale === lang.value" side>
                                <q-icon name="check" size="xs" color="yellow-8" />
                            </q-item-section>
                        </q-item>
                    </q-list>
                </q-menu>
            </q-btn>

            <q-btn
                flat
                round
                dense
                :icon="themeStore.isDarkMode ? 'light_mode' : 'dark_mode'"
                @click="themeStore.toggleDarkMode"
                class="top-action-btn"
                :aria-label="themeStore.isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'"
            >
                <q-tooltip :delay="800">
                    {{ themeStore.isDarkMode ? $t('settings.themeLight') : $t('settings.themeDark') }}
                </q-tooltip>
            </q-btn>
        </div>

        <!-- Loading Animation -->
        <LemonadeLoader v-if="isLoading" :message="$t('login.signingIn')" />

        <!-- Account Locked -->
        <div v-else-if="accountLocked" class="login-content locked-content">
            <div class="logo-container">
                <img
                    alt="Lemonade Logo"
                    src="~assets/lemonade.webp"
                    class="logo-image"
                />
            </div>

            <div class="locked-icon">
                <q-icon name="lock" size="48px" />
            </div>

            <h1 class="app-title">
                <span class="title-main">{{ $t('login.locked.title') }}</span>
            </h1>

            <p class="locked-message">{{ $t('login.locked.message') }}</p>

            <p v-if="lockedEmail" class="locked-email">{{ lockedEmail }}</p>

            <a
                href="mailto:maurohabbaby.dev@gmail.com?subject=Lemonade%20Account%20Unlock%20Request"
                class="locked-contact-link"
            >
                <q-icon name="mail" size="18px" />
                {{ $t('login.locked.contact') }}
            </a>

            <q-btn
                flat
                no-caps
                :label="$t('login.locked.tryAgain')"
                class="locked-retry-btn"
                @click="accountLocked = false"
            />
        </div>

        <!-- Login Content -->
        <div v-else class="login-content">
            <div class="logo-container">
                <img
                    alt="Lemonade Logo"
                    src="~assets/lemonade.webp"
                    class="logo-image"
                />
                <div class="logo-glow"></div>
            </div>

            <h1 class="app-title">
                <span class="title-main">{{ $t('common.appName') }}</span>
                <span class="title-sub">{{ $t('login.passwordManager') }}</span>
            </h1>

            <p class="subtitle">{{ $t('login.tagline') }}</p>

            <div class="cta-section">
                <q-btn
                    v-if="showBiometricButton"
                    rounded
                    outline
                    :label="$t('biometric.unlockButton')"
                    icon="fingerprint"
                    :loading="biometricLoading"
                    @click="signInWithBiometric"
                    class="login-btn biometric-btn"
                    no-caps
                />

                <q-btn
                    rounded
                    unelevated
                    color="amber-3"
                    text-color="dark"
                    :label="$t('login.signInWithGoogle')"
                    icon="login"
                    @click="signInWithGoogle"
                    class="login-btn"
                    no-caps
                />

                <p class="signup-text">
                    {{ $t('login.termsNotice') }}
                </p>
            </div>
        </div>
    </q-page>
</template>

<style scoped>
/* ===========================================
   LOGIN PAGE - Premium Proportions
   Base unit: 8px for consistent rhythm
   =========================================== */

/* Login Page Layout */
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  padding: 24px;
  background: linear-gradient(160deg, #FEFDFB 0%, #FDF8EE 50%, #FBF4E4 100%);
  transition: background 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.lemonade-dark.login-page {
  background: linear-gradient(160deg, #0D1117 0%, #0A0E14 50%, #010409 100%);
}

/* Top Actions (Language + Theme) */
.login-top-actions {
  position: absolute;
  top: 20px;
  right: 20px;
  z-index: 10;
  display: flex;
  gap: 4px;
}

.top-action-btn {
  color: #5A6B7A;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.lemonade-dark .top-action-btn {
  color: #8B949E;
}

.top-action-btn:hover {
  transform: scale(1.15) rotate(12deg);
  color: #F1C40F;
}

.lemonade-dark .top-action-btn:hover {
  color: #FFD700;
}

/* Login Content Card */
.login-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  width: 100%;
  max-width: 360px;
  padding: 40px 32px 36px;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 20px;
  border: 1px solid rgba(218, 178, 60, 0.12);
  backdrop-filter: blur(16px);
  box-shadow:
    0 4px 6px rgba(0, 0, 0, 0.02),
    0 12px 24px rgba(0, 0, 0, 0.06),
    0 24px 48px rgba(0, 0, 0, 0.04);
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.lemonade-dark .login-content {
  background: rgba(22, 27, 34, 0.94);
  border: 1px solid rgba(48, 54, 61, 0.8);
  box-shadow:
    0 4px 6px rgba(0, 0, 0, 0.1),
    0 12px 24px rgba(0, 0, 0, 0.2),
    0 24px 48px rgba(0, 0, 0, 0.15);
}

/* Logo Styling */
.logo-container {
  position: relative;
  margin-bottom: 20px;
}

.logo-image {
  width: 88px;
  height: 88px;
  transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
  filter: drop-shadow(0 4px 12px rgba(200, 165, 40, 0.2));
}

.lemonade-dark .logo-image {
  filter: drop-shadow(0 4px 16px rgba(255, 215, 0, 0.35));
}

.logo-container:hover .logo-image {
  transform: scale(1.05) rotate(-3deg);
}

.logo-glow {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100px;
  height: 100px;
  background: radial-gradient(circle, rgba(200, 165, 40, 0.1) 0%, transparent 65%);
  border-radius: 50%;
  animation: glow-pulse 4s ease-in-out infinite;
  pointer-events: none;
}

.lemonade-dark .logo-glow {
  background: radial-gradient(circle, rgba(255, 215, 0, 0.18) 0%, transparent 65%);
}

@keyframes glow-pulse {
  0%, 100% {
    transform: translate(-50%, -50%) scale(1);
    opacity: 0.6;
  }
  50% {
    transform: translate(-50%, -50%) scale(1.08);
    opacity: 0.9;
  }
}

/* Typography */
.app-title {
  font-size: 1.75rem;
  font-weight: 700;
  margin: 0 0 4px 0;
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.title-main {
  display: block;
  background: linear-gradient(135deg, #C8A020 0%, #B8920A 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.lemonade-dark .title-main {
  background: linear-gradient(135deg, #FFD700 0%, #FFC400 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.title-sub {
  color: #64748B;
  font-size: 0.95rem;
  font-weight: 400;
  display: block;
  margin-top: 2px;
  letter-spacing: 0.01em;
}

.lemonade-dark .title-sub {
  color: #8B949E;
}

.subtitle {
  color: #94A3B8;
  font-size: 0.8rem;
  margin: 12px 0 0 0;
  font-weight: 400;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.lemonade-dark .subtitle {
  color: #6B7280;
}

/* CTA Section */
.cta-section {
  margin-top: 28px;
  width: 100%;
}

/* Login Button */
.login-btn {
  width: 100%;
  font-weight: 600;
  padding: 14px 24px;
  font-size: 0.938rem;
  letter-spacing: 0.01em;
  box-shadow: 0 4px 14px rgba(200, 165, 40, 0.2);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}

.login-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 20px rgba(200, 165, 40, 0.3);
}

.login-btn:active {
  transform: translateY(0);
  box-shadow: 0 2px 8px rgba(200, 165, 40, 0.15);
}

.biometric-btn {
  margin-bottom: 16px;
  color: #c9a800;
  border-color: #c9a800;
}

.lemonade-dark .biometric-btn {
  color: #e6c200;
  border-color: #e6c200;
}

/* Signup Text */
.signup-text {
  color: #94A3B8;
  font-size: 0.813rem;
  margin: 16px 0 0 0;
  font-weight: 400;
  line-height: 1.5;
}

.lemonade-dark .signup-text {
  color: #6B7280;
}

.signup-highlight {
  display: block;
  color: #B8860B;
  font-weight: 500;
  margin-top: 2px;
}

.lemonade-dark .signup-highlight {
  color: #D4A600;
}

/* ===========================================
   Account Locked State
   =========================================== */

.locked-icon {
  color: #E74C3C;
  margin-bottom: 16px;
  opacity: 0.9;
}

.lemonade-dark .locked-icon {
  color: #FF6B6B;
}

.locked-message {
  color: #64748B;
  font-size: 0.875rem;
  line-height: 1.6;
  margin: 12px 0 8px 0;
  max-width: 280px;
}

.lemonade-dark .locked-message {
  color: #8B949E;
}

.locked-email {
  color: #94A3B8;
  font-size: 0.8rem;
  font-family: monospace;
  margin: 0 0 20px 0;
  padding: 6px 14px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 8px;
}

.lemonade-dark .locked-email {
  color: #6B7280;
  background: rgba(255, 255, 255, 0.04);
}

.locked-contact-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: #C8A020;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9rem;
  padding: 12px 24px;
  border-radius: 12px;
  border: 1px solid rgba(200, 165, 40, 0.3);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  margin-bottom: 12px;
}

.locked-contact-link:hover {
  background: rgba(200, 165, 40, 0.08);
  border-color: rgba(200, 165, 40, 0.5);
  transform: translateY(-1px);
}

.lemonade-dark .locked-contact-link {
  color: #FFD700;
  border-color: rgba(255, 215, 0, 0.3);
}

.lemonade-dark .locked-contact-link:hover {
  background: rgba(255, 215, 0, 0.08);
  border-color: rgba(255, 215, 0, 0.5);
}

.locked-retry-btn {
  color: #94A3B8;
  font-size: 0.8rem;
  margin-top: 4px;
}

.lemonade-dark .locked-retry-btn {
  color: #6B7280;
}

/* ===========================================
   Responsive Design - Mobile First
   =========================================== */

/* Small phones */
@media (max-width: 359px) {
  .login-content {
    padding: 32px 24px 28px;
  }

  .logo-image {
    width: 72px;
    height: 72px;
  }

  .logo-glow {
    width: 84px;
    height: 84px;
  }

  .app-title {
    font-size: 1.5rem;
  }

  .title-sub {
    font-size: 0.875rem;
  }
}

/* Tablets and larger */
@media (min-width: 600px) {
  .login-content {
    max-width: 380px;
    padding: 48px 40px 44px;
  }

  .logo-image {
    width: 96px;
    height: 96px;
  }

  .logo-glow {
    width: 112px;
    height: 112px;
  }

  .logo-container {
    margin-bottom: 24px;
  }

  .app-title {
    font-size: 2rem;
  }

  .cta-section {
    margin-top: 32px;
  }

  .login-btn {
    padding: 16px 28px;
    font-size: 1rem;
  }

  .signup-text {
    margin-top: 20px;
  }
}

/* Desktop */
@media (min-width: 1024px) {
  .login-content {
    max-width: 400px;
    padding: 52px 48px 48px;
  }

  .logo-image {
    width: 104px;
    height: 104px;
  }

  .logo-glow {
    width: 120px;
    height: 120px;
  }
}
</style>
