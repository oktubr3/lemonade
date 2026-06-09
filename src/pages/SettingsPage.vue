<script setup>
import { ref, onMounted, computed, watch, defineOptions } from 'vue';
import { useI18n } from 'vue-i18n';

defineOptions({
  name: 'SettingsPage'
});

import { useRouter } from 'vue-router';
import { useQuasar, Dark } from 'quasar';
import { auth, db } from 'boot/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useThemeStore } from '../stores/theme';
import { usePasskeys } from '../composables/usePasskeys';
import { supportedLanguages, getSavedLanguage, setLanguage } from '../boot/i18n';
import packageJson from '../../package.json';
import LemonadeLoader from '../components/LemonadeLoader.vue';

// Extracted components
import SettingsAccount from '../components/Settings/SettingsAccount.vue';
import SettingsSecurity from '../components/Settings/SettingsSecurity.vue';
import SettingsEmergencyAccess from '../components/Settings/SettingsEmergencyAccess.vue';
import SettingsExportImport from '../components/Settings/SettingsExportImport.vue';
import SettingsSupport from '../components/Settings/SettingsSupport.vue';
import SettingsGridConfig from '../components/Settings/SettingsGridConfig.vue';

const $q = useQuasar();
const { t } = useI18n();
const router = useRouter();
const themeStore = useThemeStore();

// Passkeys / Biometric auth
const {
  isWebAuthnSupported,
  hasPlatformAuth,
  userPasskeys,
  isLoading: passkeysLoading,
  registerPasskey,
  fetchUserPasskeys,
  removePasskey,
  checkSupport
} = usePasskeys();

// Language state
const selectedLanguage = ref(getSavedLanguage());
const languageOptions = supportedLanguages;

// Account ref (accessed from child component)
const accountRef = ref(null);

// Session timeout options
const sessionTimeoutOptions = computed(() => [
  { label: t('settings.security.sessionOptions.oneDay'), value: 1 },
  { label: t('settings.security.sessionOptions.threeDays'), value: 3 },
  { label: t('settings.security.sessionOptions.oneWeek'), value: 7 },
  { label: t('settings.security.sessionOptions.twoWeeks'), value: 14 },
  { label: t('settings.security.sessionOptions.oneMonth'), value: 30 },
  { label: t('settings.security.sessionOptions.never'), value: 0 }
]);

const themeOptions = computed(() => [
  { label: t('settings.appearance.themeAuto'), value: 'auto', icon: 'brightness_auto' },
  { label: t('settings.appearance.themeLight'), value: 'light', icon: 'light_mode' },
  { label: t('settings.appearance.themeDark'), value: 'dark', icon: 'dark_mode' }
]);

// Core state
const loading = ref(false);
const autoSaving = ref(false);
const isInitialLoad = ref(true);
const currentUser = computed(() => auth.currentUser);

const userSettings = ref({
  mobileColumns: 3,
  desktopColumns: 6,
  theme: 'auto',
  notifications: true,
  biometricAuth: false,
  enableAISecurityAnalysis: false,
  enablePasswordAgeCheck: false,
  enableReusedCheck: false,
  enableAccessibilityFocus: false,
  enableHighContrast: false,
  enableGrayscale: false,
  sessionTimeoutDays: 7,
  lockOnExit: false
});

// Lifecycle
onMounted(async () => {
  await Promise.all([
    loadUserSettings(),
    checkSupport()
  ]);

  if (isWebAuthnSupported.value && hasPlatformAuth.value && currentUser.value) {
    fetchUserPasskeys();
  }
});

// ============ Watchers for auto-save ============

watch(() => userSettings.value.mobileColumns, async (newValue) => {
  if (newValue !== undefined && !isInitialLoad.value) {
    await autoSaveSettings();
  }
});

watch(() => userSettings.value.desktopColumns, async (newValue) => {
  if (newValue !== undefined && !isInitialLoad.value) {
    await autoSaveSettings();
  }
});

watch(() => userSettings.value.theme, async (newValue) => {
  if (newValue !== undefined && !isInitialLoad.value) {
    applyTheme();
    await autoSaveSettings();
  }
});

watch(() => userSettings.value.notifications, async (newValue) => {
  if (newValue !== undefined && !isInitialLoad.value) {
    await autoSaveSettings();
  }
});

watch(() => userSettings.value.enableAISecurityAnalysis, async (newValue) => {
  if (newValue !== undefined && !isInitialLoad.value) {
    await autoSaveSettings();
  }
});

watch(() => userSettings.value.enablePasswordAgeCheck, async (newValue) => {
  if (newValue !== undefined && !isInitialLoad.value) {
    await autoSaveSettings();
  }
});

watch(() => userSettings.value.enableReusedCheck, async (newValue) => {
  if (newValue !== undefined && !isInitialLoad.value) {
    await autoSaveSettings();
  }
});

watch(() => userSettings.value.enableAccessibilityFocus, async (newValue) => {
  if (newValue !== undefined && !isInitialLoad.value) {
    applyAccessibilityFocus(newValue);
    await autoSaveSettings();
  }
});

watch(() => userSettings.value.enableHighContrast, async (newValue) => {
  if (newValue !== undefined && !isInitialLoad.value) {
    applyA11yFilter('a11y-high-contrast', newValue);
    await autoSaveSettings();
  }
});

watch(() => userSettings.value.enableGrayscale, async (newValue) => {
  if (newValue !== undefined && !isInitialLoad.value) {
    applyA11yFilter('a11y-grayscale', newValue);
    await autoSaveSettings();
  }
});

watch(() => userSettings.value.sessionTimeoutDays, async (newValue) => {
  if (newValue !== undefined && !isInitialLoad.value) {
    await autoSaveSettings();
  }
});

watch(() => userSettings.value.lockOnExit, async (newValue) => {
  if (newValue !== undefined && !isInitialLoad.value) {
    localStorage.setItem('lemonade_lock_on_exit', newValue ? 'true' : 'false');
    await autoSaveSettings();
  }
});

// ============ Core Functions ============

const loadUserSettings = async () => {
  if (!currentUser.value) return;

  loading.value = true;
  try {
    const settingsDoc = await getDoc(doc(db, 'user_settings', currentUser.value.uid));
    if (settingsDoc.exists()) {
      const data = settingsDoc.data();
      userSettings.value = { ...userSettings.value, ...data };
      applyAccessibilityFocus(userSettings.value.enableAccessibilityFocus);
      applyA11yFilter('a11y-high-contrast', userSettings.value.enableHighContrast);
      applyA11yFilter('a11y-grayscale', userSettings.value.enableGrayscale);
      localStorage.setItem('lemonade_lock_on_exit', userSettings.value.lockOnExit ? 'true' : 'false');
      if (data.language) {
        await setLanguage(data.language);
        selectedLanguage.value = data.language;
      }
    }
  } catch (error) {
    console.error('Error loading settings:', error);
    $q.notify({
      color: 'negative',
      position: 'top',
      message: t('settings.messages.errorLoading'),
      icon: 'error'
    });
  } finally {
    loading.value = false;
    setTimeout(() => {
      isInitialLoad.value = false;
    }, 100);
  }
};

const autoSaveSettings = async () => {
  if (!currentUser.value) return;

  autoSaving.value = true;

  try {
    const settingsRef = doc(db, 'user_settings', currentUser.value.uid);

    const settingsToSave = {
      ...userSettings.value,
      mobileColumns: typeof userSettings.value.mobileColumns === 'object'
        ? userSettings.value.mobileColumns.value
        : userSettings.value.mobileColumns,
      desktopColumns: typeof userSettings.value.desktopColumns === 'object'
        ? userSettings.value.desktopColumns.value
        : userSettings.value.desktopColumns,
      updatedAt: new Date()
    };

    await setDoc(settingsRef, settingsToSave, { merge: true });

    localStorage.setItem('userSettings', JSON.stringify(settingsToSave));

    window.dispatchEvent(new CustomEvent('userSettingsChanged', {
      detail: settingsToSave
    }));

    $q.notify({
      message: t('common.saved'),
      color: 'positive',
      position: 'top-right',
      timeout: 1000,
      icon: 'check_circle',
      classes: 'auto-save-notification'
    });

  } catch (error) {
    console.error('Error auto-saving settings:', error);

    $q.notify({
      message: t('settings.messages.errorSaving'),
      color: 'negative',
      position: 'top-right',
      timeout: 2000,
      icon: 'error'
    });
  } finally {
    setTimeout(() => {
      autoSaving.value = false;
    }, 800);
  }
};

const applyTheme = () => {
  const theme = userSettings.value.theme;
  const body = document.body;

  let shouldBeDark = false;
  if (theme === 'auto') {
    shouldBeDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  } else {
    shouldBeDark = theme === 'dark';
  }

  if (document.startViewTransition) {
    document.startViewTransition(() => {
      Dark.set(shouldBeDark);
      themeStore.isDarkMode = shouldBeDark;
      body.classList.toggle('lemonade-dark', shouldBeDark);
      body.classList.toggle('lemonade-light', !shouldBeDark);
      localStorage.setItem('lemonade-dark-mode', shouldBeDark);
    });
  } else {
    body.style.transition = 'background-color 0.4s cubic-bezier(0.4, 0, 0.2, 1), color 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    Dark.set(shouldBeDark);
    themeStore.isDarkMode = shouldBeDark;
    body.classList.toggle('lemonade-dark', shouldBeDark);
    body.classList.toggle('lemonade-light', !shouldBeDark);
    localStorage.setItem('lemonade-dark-mode', shouldBeDark);
    setTimeout(() => {
      body.style.transition = '';
    }, 400);
  }
};

const applyAccessibilityFocus = (enabled) => {
  document.body.classList.toggle('a11y-focus', enabled);
  localStorage.setItem('lemonade-a11y-focus', enabled);
};

const applyA11yFilter = (className, enabled) => {
  document.body.classList.toggle(className, enabled);
  localStorage.setItem(`lemonade-${className}`, enabled);
};

const goBack = () => {
  router.push('/');
};

// Language change handler
const changeLanguage = async (newLanguage) => {
  selectedLanguage.value = newLanguage;
  await setLanguage(newLanguage);

  if (currentUser.value) {
    try {
      await setDoc(doc(db, 'user_settings', currentUser.value.uid), { language: newLanguage }, { merge: true });
    } catch (error) {
      console.error('Error saving language to Firestore:', error);
    }
  }

  $q.notify({
    message: 'Language updated',
    color: 'positive',
    position: 'top-right',
    timeout: 1000,
    icon: 'check_circle',
    classes: 'auto-save-notification'
  });
};

// ============ Passkey handlers ============

const handleRegisterPasskey = async ({ done }) => {
  try {
    await registerPasskey();
    $q.notify({
      color: 'positive',
      message: t('biometric.registerSuccess'),
      icon: 'fingerprint'
    });
  } catch (err) {
    if (err.name !== 'NotAllowedError') {
      $q.notify({
        color: 'negative',
        message: err.message || t('common.error'),
        icon: 'error'
      });
    }
  } finally {
    done();
  }
};

const handleRemovePasskey = async (passkey) => {
  try {
    await removePasskey(passkey.id);
    $q.notify({
      color: 'positive',
      message: t('biometric.removeSuccess'),
      icon: 'check_circle'
    });
  } catch (err) {
    $q.notify({
      color: 'negative',
      message: err.message || t('common.error'),
      icon: 'error'
    });
  }
};

</script>

<template>
  <q-page padding>
    <div class="q-pa-md">
      <div class="settings-header text-center">
        <h4 class="q-ma-none">
          {{ $t('settings.title') }}
          <transition
            enter-active-class="animated fadeIn"
            leave-active-class="animated fadeOut"
          >
            <q-spinner-dots
              v-if="autoSaving"
              color="primary"
              size="1.2em"
              class="q-ml-sm"
            />
          </transition>
        </h4>
      </div>

      <div v-if="loading" class="flex flex-center" style="min-height: 300px;">
        <LemonadeLoader :fullscreen="false" />
      </div>

      <div v-else class="row q-col-gutter-lg">
        <!-- Profile Card (inline - small) -->
        <div class="col-12">
          <q-card flat bordered class="settings-card animate-entrance">
            <q-card-section>
              <div class="text-h6 q-mb-md animate-fade-in">{{ $t('settings.profile.title') }}</div>
              <div class="row items-center q-gutter-md">
                <q-avatar size="80px">
                  <img :src="currentUser?.photoURL || 'https://cdn.quasar.dev/img/avatar.png'" :alt="currentUser?.displayName || 'User avatar'" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
                </q-avatar>
                <div>
                  <div class="text-h6">{{ currentUser?.displayName }}</div>
                  <div class="text-caption text-grey">{{ currentUser?.email }}</div>
                </div>
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Subscription -->
        <div class="col-12">
          <SettingsAccount ref="accountRef" />
        </div>

        <!-- Privacy (inline - small) -->
        <div class="col-12 col-md-6">
          <q-card flat bordered class="settings-card full-height animate-entrance" style="animation-delay: 0.15s;">
            <q-card-section>
              <div class="text-h6 q-mb-md">
                <q-icon name="privacy_tip" color="primary" class="q-mr-sm animate-bounce-subtle" />
                {{ $t('settings.privacy.title') }}
              </div>

              <q-item class="animate-hover">
                <q-item-section>
                  <q-item-label>{{ $t('settings.privacy.aiAnalysis') }}</q-item-label>
                  <q-item-label caption>{{ $t('settings.privacy.aiAnalysisHint') }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-toggle v-model="userSettings.enableAISecurityAnalysis" color="primary" class="animate-hover" />
                </q-item-section>
              </q-item>

              <q-separator class="q-my-sm" />

              <q-item class="animate-hover">
                <q-item-section>
                  <q-item-label>{{ $t('settings.privacy.passwordAge') }}</q-item-label>
                  <q-item-label caption>{{ $t('settings.privacy.passwordAgeHint') }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-toggle v-model="userSettings.enablePasswordAgeCheck" color="primary" class="animate-hover" />
                </q-item-section>
              </q-item>

              <q-separator class="q-my-sm" />

              <q-item class="animate-hover">
                <q-item-section>
                  <q-item-label>{{ $t('settings.privacy.reusedCheck') }}</q-item-label>
                  <q-item-label caption>{{ $t('settings.privacy.reusedCheckHint') }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-toggle v-model="userSettings.enableReusedCheck" color="primary" class="animate-hover" />
                </q-item-section>
              </q-item>

              <q-banner v-if="!userSettings.enableAISecurityAnalysis && !userSettings.enablePasswordAgeCheck && !userSettings.enableReusedCheck"
                        class="bg-info text-white q-mt-md" dense>
                <template v-slot:avatar>
                  <q-icon name="info" />
                </template>
                {{ $t('settings.privacy.allDisabled') }}
              </q-banner>
            </q-card-section>
          </q-card>
        </div>

        <!-- Security -->
        <div class="col-12 col-md-6">
          <SettingsSecurity
            :user-settings="userSettings"
            :is-web-authn-supported="isWebAuthnSupported"
            :has-platform-auth="hasPlatformAuth"
            :user-passkeys="userPasskeys"
            :passkeys-loading="passkeysLoading"
            :session-timeout-options="sessionTimeoutOptions"
            @register-passkey="handleRegisterPasskey"
            @remove-passkey="handleRemovePasskey"
            @update-setting="Object.assign(userSettings, $event)"
          />
        </div>

        <!-- Emergency Access -->
        <div class="col-12">
          <SettingsEmergencyAccess />
        </div>

        <!-- Accessibility (inline - small) -->
        <div class="col-12 col-md-6">
          <q-card flat bordered class="settings-card full-height animate-entrance" style="animation-delay: 0.2s;">
            <q-card-section>
              <div class="text-h6 q-mb-md">
                <q-icon name="accessibility_new" color="primary" class="q-mr-sm animate-bounce-subtle" />
                {{ $t('settings.accessibility.title') }}
              </div>

              <q-item class="animate-hover">
                <q-item-section>
                  <q-item-label>{{ $t('settings.accessibility.focusIndicators') }}</q-item-label>
                  <q-item-label caption>{{ $t('settings.accessibility.focusIndicatorsHint') }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-toggle v-model="userSettings.enableAccessibilityFocus" color="primary" />
                </q-item-section>
              </q-item>

              <q-separator class="q-my-sm" />

              <q-item class="animate-hover">
                <q-item-section>
                  <q-item-label>{{ $t('settings.accessibility.highContrast') }}</q-item-label>
                  <q-item-label caption>{{ $t('settings.accessibility.highContrastHint') }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-toggle v-model="userSettings.enableHighContrast" color="primary" />
                </q-item-section>
              </q-item>

              <q-separator class="q-my-sm" />

              <q-item class="animate-hover">
                <q-item-section>
                  <q-item-label>{{ $t('settings.accessibility.grayscale') }}</q-item-label>
                  <q-item-label caption>{{ $t('settings.accessibility.grayscaleHint') }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-toggle v-model="userSettings.enableGrayscale" color="primary" />
                </q-item-section>
              </q-item>
            </q-card-section>
          </q-card>
        </div>

        <!-- Language (inline - small) -->
        <div class="col-12 col-md-6">
          <q-card flat bordered class="settings-card full-height animate-entrance" style="animation-delay: 0.25s;">
            <q-card-section>
              <div class="text-h6 q-mb-md">
                <q-icon name="translate" color="primary" class="q-mr-sm animate-bounce-subtle" />
                {{ $t('settings.language.title') }}
              </div>

              <q-item class="animate-hover">
                <q-item-section>
                  <q-item-label>{{ $t('settings.language.appLanguage') }}</q-item-label>
                  <q-item-label caption>{{ $t('settings.language.languageHint') }}</q-item-label>
                </q-item-section>
              </q-item>

              <q-item>
                <q-item-section>
                  <q-select
                    v-model="selectedLanguage"
                    :options="languageOptions"
                    option-value="value"
                    option-label="nativeLabel"
                    outlined
                    dense
                    emit-value
                    map-options
                    @update:model-value="changeLanguage"
                  >
                    <template v-slot:option="{ opt, selected, toggleOption }">
                      <q-item clickable @click="toggleOption(opt)" :active="selected">
                        <q-item-section avatar>
                          <q-avatar size="24px" class="flag-avatar">
                            {{ opt.value === 'ar-SA' ? '🇸🇦' : opt.value === 'zh-CN' ? '🇨🇳' : opt.value === 'hi-IN' ? '🇮🇳' : opt.value === 'pt-BR' ? '🇧🇷' : opt.value === 'bn-BD' ? '🇧🇩' : opt.value === 'ru-RU' ? '🇷🇺' : opt.value === 'ja-JP' ? '🇯🇵' : opt.value === 'fr-FR' ? '🇫🇷' : opt.value === 'es-AR' ? '🇦🇷' : '🇺🇸' }}
                          </q-avatar>
                        </q-item-section>
                        <q-item-section>
                          <q-item-label>{{ opt.nativeLabel }}</q-item-label>
                          <q-item-label caption>{{ opt.label }}</q-item-label>
                        </q-item-section>
                        <q-item-section side v-if="opt.rtl">
                          <q-badge color="info" label="RTL" />
                        </q-item-section>
                      </q-item>
                    </template>
                    <template v-slot:selected-item="{ opt }">
                      <span>{{ opt.nativeLabel }}</span>
                    </template>
                  </q-select>
                </q-item-section>
              </q-item>

              <div class="text-caption text-grey-6 q-mt-sm q-ml-md">
                {{ $t('settings.language.languagesSupported', { count: 10 }) }}
              </div>
            </q-card-section>
          </q-card>
        </div>

        <!-- Grid Config -->
        <div class="col-12">
          <SettingsGridConfig :user-settings="userSettings" @update-setting="Object.assign(userSettings, $event)" />
        </div>

        <!-- Notifications (inline - small) -->
        <div class="col-12 col-md-6">
          <q-card flat bordered class="settings-card full-height animate-entrance" style="animation-delay: 0.4s;">
            <q-card-section>
              <div class="text-h6 q-mb-md">
                <q-icon name="notifications" color="primary" class="q-mr-sm animate-bounce-subtle" />
                {{ $t('settings.notifications.title') }}
              </div>

              <q-item class="animate-hover">
                <q-item-section>
                  <q-item-label>{{ $t('settings.notifications.push') }}</q-item-label>
                  <q-item-label caption>{{ $t('settings.notifications.pushHint') }}</q-item-label>
                </q-item-section>
                <q-item-section side>
                  <q-toggle v-model="userSettings.notifications" class="animate-hover" />
                </q-item-section>
              </q-item>
            </q-card-section>
          </q-card>
        </div>

        <!-- Export/Import -->
        <div class="col-12 col-md-6">
          <SettingsExportImport />
        </div>

        <!-- Developer Info (inline - small) -->
        <div class="col-12 col-md-6">
          <q-card flat bordered class="settings-card full-height animate-entrance" style="animation-delay: 0.5s;">
            <q-card-section>
              <div class="text-h6 q-mb-md">
                <q-icon name="info" color="primary" class="q-mr-sm animate-bounce-subtle" />
                {{ $t('settings.about.title') }}
              </div>

              <q-item>
                <q-item-section>
                  <q-item-label>{{ $t('settings.about.version') }}</q-item-label>
                  <q-item-label caption>
                    <span class="version-badge">{{ packageJson.version }}</span>
                  </q-item-label>
                </q-item-section>
              </q-item>
            </q-card-section>
          </q-card>
        </div>

        <!-- Support -->
        <div class="col-12">
          <SettingsSupport />
        </div>
      </div>
    </div>

    <!-- Floating back button -->
    <q-page-sticky position="bottom-left" :offset="[18, 18]">
      <q-btn
        fab
        icon="arrow_back"
        color="primary"
        @click="goBack"
        :aria-label="t('common.back')"
        class="back-fab"
      >
        <q-tooltip anchor="top middle" self="bottom middle" :delay="500">
          {{ $t('common.back') }}
        </q-tooltip>
      </q-btn>
    </q-page-sticky>
  </q-page>
</template>

<style scoped>
/* ═══════════════════════════════════════════
   PREMIUM DESIGN SYSTEM - Settings Page
   Matching Landing Page Aesthetics
   ═══════════════════════════════════════════ */

/* Design Tokens */
.q-page {
  --golden: #FFD700;
  --golden-soft: rgba(255, 215, 0, 0.1);
  --primary-glow: rgba(255, 109, 0, 0.15);
  --success: #3FB950;
  --code-bg: rgba(110, 118, 129, 0.1);

  /* Light mode */
  --surface: #ffffff;
  --surface-elevated: #f8f9fa;
  --border: #e1e4e8;
  --border-subtle: #eaecef;
  --text-primary: #1a1a2e;
  --text-secondary: #57606a;
  --text-tertiary: #8b949e;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* Radius */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;

  /* Transitions */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 150ms;
  --duration-normal: 250ms;
}

/* Page Header */
.settings-header {
  margin-bottom: var(--space-xl);
}

.settings-header h4 {
  font-weight: 700;
  letter-spacing: -0.03em;
  font-size: 1.75rem;
  color: var(--text-primary);
}

.settings-header h4::after {
  content: '_';
  animation: blink 1s step-end infinite;
  -webkit-text-fill-color: var(--q-primary);
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

/* Cards */
.settings-card {
  transition: all var(--duration-normal) var(--ease-out);
  border-radius: var(--radius-lg) !important;
  border: 1px solid var(--border-subtle) !important;
  background: var(--surface) !important;
  will-change: transform, box-shadow;
  animation: fadeInUp 0.4s var(--ease-out) both;
}

.settings-card:hover {
  transform: translateY(-2px);
  border-color: var(--border) !important;
  box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.12);
}

.settings-card .text-h6 {
  font-weight: 600;
  font-size: 1rem;
  letter-spacing: -0.02em;
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.settings-card .text-h6 .q-icon {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--golden-soft);
  border: 1px solid rgba(255, 215, 0, 0.15);
  border-radius: var(--radius-md);
  font-size: 1rem;
  color: var(--golden) !important;
}

/* List Items */
.settings-card .q-item {
  border-radius: var(--radius-md);
  transition: background-color var(--duration-fast) var(--ease-out);
  padding: var(--space-sm) var(--space-md);
  min-height: 56px;
}

.settings-card .q-item:hover {
  background: var(--golden-soft);
}

.settings-card .q-item__label {
  font-weight: 500;
  font-size: 0.9375rem;
  letter-spacing: -0.01em;
}

.settings-card .q-item__label--caption {
  font-size: 0.8125rem;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-top: 2px;
}

/* User Profile */
.settings-card .q-avatar {
  transition: all var(--duration-normal) var(--ease-out);
}

.settings-card .q-avatar:hover {
  transform: scale(1.05);
}

/* Version Badge */
.version-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  background: var(--code-bg);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font-family: 'SF Mono', 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 0.8125rem;
  color: var(--golden);
  letter-spacing: 0.02em;
}

.version-badge::before {
  content: 'v';
  color: var(--text-tertiary);
}

/* Toggles & Controls */
.settings-card :deep(.q-toggle__inner) {
  transition: all var(--duration-fast) var(--ease-out);
}

.settings-card :deep(.q-toggle--dark .q-toggle__thumb) {
  color: var(--golden);
}

.settings-card :deep(.q-field--outlined .q-field__control) {
  border-radius: var(--radius-md);
  transition: all var(--duration-fast) var(--ease-out);
}

.settings-card :deep(.q-field--outlined:hover .q-field__control) {
  border-color: var(--golden);
}

.settings-card :deep(.q-field--focused .q-field__control) {
  border-color: var(--golden) !important;
  box-shadow: 0 0 0 2px var(--golden-soft);
}

/* Banner */
.settings-card :deep(.q-banner) {
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 215, 0, 0.2);
  background: var(--golden-soft) !important;
}

.settings-card :deep(.q-banner.bg-info) {
  color: var(--text-primary) !important;
}

/* Floating Back Button */
.back-fab {
  transition: all var(--duration-normal) var(--ease-out);
  animation: fab-entrance 0.5s var(--ease-out) 0.6s both;
  box-shadow: 0 4px 12px rgba(255, 109, 0, 0.3);
}

.back-fab:hover {
  transform: scale(1.1);
  box-shadow: 0 8px 20px rgba(255, 109, 0, 0.4);
}

.back-fab:active {
  transform: scale(0.95);
  transition-duration: 0.1s;
}

@keyframes fab-entrance {
  from { opacity: 0; transform: translateY(20px) scale(0.8); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

/* Auto-save notification */
:deep(.auto-save-notification) {
  font-size: 0.875rem !important;
  font-weight: 500;
  border-radius: var(--radius-md) !important;
  backdrop-filter: blur(12px);
  animation: slide-in-right 0.3s var(--ease-out);
}

@keyframes slide-in-right {
  from { transform: translateX(100%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}

/* Entrance Animations */
@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.settings-card:nth-child(1) { animation-delay: 0.05s; }
.settings-card:nth-child(2) { animation-delay: 0.1s; }
.settings-card:nth-child(3) { animation-delay: 0.15s; }
.settings-card:nth-child(4) { animation-delay: 0.2s; }
.settings-card:nth-child(5) { animation-delay: 0.25s; }
.settings-card:nth-child(6) { animation-delay: 0.3s; }

/* Responsive */
@media (max-width: 599px) {
  .settings-header h4 {
    font-size: 1.5rem;
  }

  .settings-card .text-h6 {
    font-size: 0.9375rem;
  }

  .settings-card .q-item {
    padding: var(--space-xs) var(--space-sm);
    min-height: 48px;
  }
}

/* Selection & Scrollbar */
::selection {
  background: var(--q-primary);
  color: white;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--text-tertiary);
}
</style>

<!-- Dark mode variables (needs body scope for child components) -->
<style>
.body--dark .q-page,
.lemonade-dark .q-page {
  --surface: #0D1117;
  --surface-elevated: #161B22;
  --border: #30363D;
  --border-subtle: #21262D;
  --text-primary: #F0F6FC;
  --text-secondary: #8B949E;
  --text-tertiary: #6E7681;
  --code-bg: rgba(110, 118, 129, 0.15);
}

.body--dark .settings-card,
.lemonade-dark .settings-card {
  background: var(--surface-elevated) !important;
  border-color: var(--border-subtle) !important;
}

.body--dark .settings-card:hover,
.lemonade-dark .settings-card:hover {
  border-color: var(--border) !important;
  box-shadow: 0 8px 24px -8px rgba(0, 0, 0, 0.4);
}

.body--dark .settings-card .q-item__label--caption,
.lemonade-dark .settings-card .q-item__label--caption {
  color: var(--text-secondary) !important;
}

.body--dark .settings-card .q-item:hover,
.lemonade-dark .settings-card .q-item:hover {
  background: rgba(255, 215, 0, 0.05);
}
</style>
