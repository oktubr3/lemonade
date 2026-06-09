<script setup>
import { ref, computed } from 'vue';
import { useQuasar } from 'quasar';
import { useI18n } from 'vue-i18n';
import { useThemeStore } from 'stores/theme';

const { t } = useI18n();

const props = defineProps({
    mode: {
        type: String,
        default: 'unlock', // 'setup' or 'unlock'
        validator: (value) => ['setup', 'unlock'].includes(value)
    },
    onSubmit: {
        type: Function,
        default: null
    }
});

const emit = defineEmits(['submit', 'success']);

const $q = useQuasar();
const themeStore = useThemeStore();

// State
const password = ref('');
const confirmPassword = ref('');
const showPassword = ref(false);
const showConfirmPassword = ref(false);
const isLoading = ref(false);
const error = ref('');

// Computed
const isSetupMode = computed(() => props.mode === 'setup');

const passwordStrength = computed(() => {
    if (!password.value) return { level: 0, label: '', color: '' };

    let score = 0;
    if (password.value.length >= 8) score++;
    if (password.value.length >= 12) score++;
    if (/[a-z]/.test(password.value) && /[A-Z]/.test(password.value)) score++;
    if (/\d/.test(password.value)) score++;
    if (/[^a-zA-Z0-9]/.test(password.value)) score++;

    if (score <= 1) return { level: 1, label: t('envVault.master.strength.veryWeak'), color: 'negative' };
    if (score === 2) return { level: 2, label: t('envVault.master.strength.weak'), color: 'warning' };
    if (score === 3) return { level: 3, label: t('envVault.master.strength.medium'), color: 'info' };
    if (score === 4) return { level: 4, label: t('envVault.master.strength.strong'), color: 'positive' };
    return { level: 5, label: t('envVault.master.strength.veryStrong'), color: 'positive' };
});

const canSubmit = computed(() => {
    if (isSetupMode.value) {
        return password.value.length >= 8 &&
               password.value === confirmPassword.value &&
               !isLoading.value;
    }
    return password.value.length > 0 && !isLoading.value;
});

// Methods
async function handleSubmit() {
    error.value = '';

    if (isSetupMode.value && password.value !== confirmPassword.value) {
        error.value = t('envVault.master.errors.noMatch');
        return;
    }

    if (isSetupMode.value && password.value.length < 8) {
        error.value = t('envVault.master.errors.minLength');
        return;
    }

    isLoading.value = true;
    try {
        if (props.onSubmit) {
            await props.onSubmit(password.value);
        } else {
            emit('submit', password.value);
        }
        password.value = '';
        confirmPassword.value = '';
        emit('success');
    } catch (err) {
        error.value = err.message || t('envVault.master.errors.generic');
    } finally {
        isLoading.value = false;
    }
}
</script>

<template>
    <div class="master-password-container" :class="themeStore.themeClass">
        <div class="password-card">
            <!-- Icon -->
            <div class="card-icon">
                <q-icon :name="isSetupMode ? 'add_moderator' : 'lock'" size="64px" />
            </div>

            <!-- Title -->
            <h2 class="card-title">
                {{ isSetupMode ? $t('envVault.master.setupTitle') : $t('envVault.master.lockedTitle') }}
            </h2>

            <!-- Subtitle -->
            <p class="card-subtitle">
                {{ isSetupMode
                    ? $t('envVault.master.setupSubtitle')
                    : $t('envVault.master.lockedSubtitle')
                }}
            </p>

            <!-- Form -->
            <q-form @submit.prevent="handleSubmit" class="password-form">
                <!-- Password Input -->
                <q-input
                    v-model="password"
                    :type="showPassword ? 'text' : 'password'"
                    :label="isSetupMode ? $t('envVault.master.masterPassword') : $t('envVault.master.password')"
                    outlined
                    class="password-input"
                    :error="!!error"
                    :error-message="error"
                    @keyup.enter="canSubmit && handleSubmit()"
                >
                    <template v-slot:prepend>
                        <q-icon name="key" />
                    </template>
                    <template v-slot:append>
                        <q-icon
                            :name="showPassword ? 'visibility_off' : 'visibility'"
                            class="cursor-pointer"
                            @click="showPassword = !showPassword"
                        />
                    </template>
                </q-input>

                <!-- Password Strength (Setup mode only) -->
                <div v-if="isSetupMode && password" class="strength-indicator">
                    <div class="strength-bars">
                        <div
                            v-for="i in 5"
                            :key="i"
                            class="strength-bar"
                            :class="{ active: i <= passwordStrength.level }"
                            :style="{ backgroundColor: i <= passwordStrength.level ? `var(--q-${passwordStrength.color})` : '' }"
                        />
                    </div>
                    <span class="strength-label" :class="`text-${passwordStrength.color}`">
                        {{ passwordStrength.label }}
                    </span>
                </div>

                <!-- Confirm Password (Setup mode only) -->
                <q-input
                    v-if="isSetupMode"
                    v-model="confirmPassword"
                    :type="showConfirmPassword ? 'text' : 'password'"
                    :label="$t('envVault.master.confirmPassword')"
                    outlined
                    class="password-input"
                    :error="confirmPassword && password !== confirmPassword"
                    :error-message="$t('envVault.master.errors.noMatch')"
                >
                    <template v-slot:prepend>
                        <q-icon name="key" />
                    </template>
                    <template v-slot:append>
                        <q-icon
                            :name="showConfirmPassword ? 'visibility_off' : 'visibility'"
                            class="cursor-pointer"
                            @click="showConfirmPassword = !showConfirmPassword"
                        />
                    </template>
                </q-input>

                <!-- Submit Button -->
                <q-btn
                    :label="isSetupMode ? $t('envVault.master.createVault') : $t('envVault.master.unlock')"
                    type="submit"
                    color="primary"
                    :loading="isLoading"
                    :disable="!canSubmit"
                    class="submit-btn"
                    unelevated
                >
                    <template v-slot:loading>
                        <q-spinner-dots />
                    </template>
                </q-btn>
            </q-form>

            <!-- Info text -->
            <p v-if="isSetupMode" class="info-text">
                <q-icon name="info" size="16px" />
                {{ $t('envVault.master.infoText') }}
            </p>
        </div>
    </div>
</template>

<style lang="scss" scoped>
.master-password-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 60vh;
    padding: 16px;
}

.password-card {
    background: var(--bg-secondary, #fff);
    border-radius: 16px;
    padding: 40px;
    max-width: 400px;
    width: 100%;
    text-align: center;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    border: 1px solid var(--border-color, #e0e0e0);
}

.lemonade-dark .password-card {
    background: #161B22;
    border-color: #30363D;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.card-icon {
    margin-bottom: 24px;
    color: #F7DC6F;

    :deep(.q-icon) {
        filter: drop-shadow(0 4px 8px rgba(247, 220, 111, 0.3));
    }
}

.card-title {
    font-size: 1.5rem;
    font-weight: 600;
    margin: 0 0 8px 0;
    color: var(--text-primary, #333);
}

.lemonade-dark .card-title {
    color: #F0F6FC;
}

.card-subtitle {
    font-size: 0.9rem;
    color: var(--text-secondary, #666);
    margin: 0 0 32px 0;
}

.lemonade-dark .card-subtitle {
    color: #8B949E;
}

.password-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.password-input {
    :deep(.q-field__control) {
        border-radius: 12px;
    }
}

.strength-indicator {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-top: -8px;
}

.strength-bars {
    display: flex;
    gap: 4px;
    flex: 1;
}

.strength-bar {
    height: 4px;
    flex: 1;
    border-radius: 2px;
    background: var(--border-color, #e0e0e0);
    transition: background-color 0.3s ease;
}

.lemonade-dark .strength-bar {
    background: #30363D;
}

.strength-label {
    font-size: 0.75rem;
    font-weight: 500;
    min-width: 70px;
    text-align: right;
}

.submit-btn {
    margin-top: 8px;
    padding: 12px 24px;
    border-radius: 12px;
    font-weight: 600;
    background: linear-gradient(135deg, #F7DC6F 0%, #f1c40f 100%) !important;
    color: #000 !important;

    &:hover {
        box-shadow: 0 4px 16px rgba(247, 220, 111, 0.4);
    }

    &:disabled {
        opacity: 0.5;
    }
}

.info-text {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    margin-top: 24px;
    font-size: 0.8rem;
    color: var(--text-secondary, #666);
}

.lemonade-dark .info-text {
    color: #8B949E;
}

// Theme variables
.lemonade-dark {
    --text-primary: #F0F6FC;
    --text-secondary: #8B949E;
    --bg-secondary: #161B22;
    --border-color: #30363D;
}

.lemonade-light {
    --text-primary: #2C3E50;
    --text-secondary: #666;
    --bg-secondary: #FFFFFF;
    --border-color: #E0E0E0;
}
</style>
