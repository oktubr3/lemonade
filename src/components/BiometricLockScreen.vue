<script setup>
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { usePasskeys } from '../composables/usePasskeys';

const props = defineProps({
  userId: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['unlocked', 'fallback']);

const { t } = useI18n();
const { authenticateWithPasskey, isLoading } = usePasskeys();

const errorMessage = ref('');
const hasAttempted = ref(false);

const attemptUnlock = async () => {
  errorMessage.value = '';
  hasAttempted.value = true;

  try {
    const result = await authenticateWithPasskey(props.userId);
    if (result.verified) {
      emit('unlocked');
    }
  } catch (err) {
    errorMessage.value = t('biometric.unlockError');
  }
};

const goToLogin = () => {
  emit('fallback');
};

onMounted(() => {
  attemptUnlock();
});
</script>

<template>
  <div class="biometric-lock-screen">
    <div class="lock-content">
      <div class="lock-logo">
        <img src="~assets/lemonade.webp" alt="Lemonade" class="lock-logo-img" />
      </div>

      <div
        class="fingerprint-area"
        :class="{ 'is-loading': isLoading, 'has-error': errorMessage }"
        @click="attemptUnlock"
      >
        <div class="fingerprint-ring"></div>
        <q-icon name="fingerprint" class="fingerprint-icon" />
      </div>

      <p class="lock-status">
        <template v-if="isLoading">{{ $t('biometric.verifying') }}</template>
        <template v-else-if="errorMessage">{{ errorMessage }}</template>
        <template v-else-if="hasAttempted">{{ $t('biometric.tapToRetry') }}</template>
        <template v-else>{{ $t('biometric.unlockTitle') }}</template>
      </p>

      <a
        class="lock-fallback"
        @click.prevent="goToLogin"
        href="#"
      >
        {{ $t('biometric.unlockFallback') }}
      </a>
    </div>
  </div>
</template>

<style scoped>
.biometric-lock-screen {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(10, 10, 15, 0.85);
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  animation: fadeIn 0.25s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.lock-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 48px 32px;
  max-width: 320px;
  width: 100%;
}

.lock-logo {
  margin-bottom: 40px;
}

.lock-logo-img {
  width: 56px;
  height: 56px;
  opacity: 0.9;
  filter: drop-shadow(0 2px 8px rgba(255, 215, 0, 0.2));
}

/* Fingerprint interactive area */
.fingerprint-area {
  position: relative;
  width: 88px;
  height: 88px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  margin-bottom: 24px;
  -webkit-tap-highlight-color: transparent;
}

.fingerprint-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid rgba(255, 215, 0, 0.25);
  transition: all 0.3s ease;
}

.fingerprint-area:active .fingerprint-ring {
  transform: scale(0.92);
}

.fingerprint-icon {
  font-size: 40px;
  color: rgba(255, 215, 0, 0.85);
  transition: all 0.3s ease;
}

/* Loading state */
.fingerprint-area.is-loading .fingerprint-ring {
  border-color: rgba(255, 215, 0, 0.4);
  animation: pulse-ring 1.5s ease-in-out infinite;
}

.fingerprint-area.is-loading .fingerprint-icon {
  animation: pulse-icon 1.5s ease-in-out infinite;
}

@keyframes pulse-ring {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(1.08); opacity: 0.6; }
}

@keyframes pulse-icon {
  0%, 100% { opacity: 0.85; }
  50% { opacity: 0.5; }
}

/* Error state */
.fingerprint-area.has-error .fingerprint-ring {
  border-color: rgba(255, 107, 107, 0.4);
}

.fingerprint-area.has-error .fingerprint-icon {
  color: rgba(255, 107, 107, 0.8);
}

/* Status text */
.lock-status {
  color: #8B949E;
  font-size: 0.875rem;
  font-weight: 400;
  margin: 0 0 32px 0;
  min-height: 1.25rem;
  letter-spacing: 0.01em;
}

.lock-fallback {
  color: rgba(139, 148, 158, 0.7);
  font-size: 0.8rem;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.2s ease;
}

.lock-fallback:hover {
  color: #F0F6FC;
}
</style>
