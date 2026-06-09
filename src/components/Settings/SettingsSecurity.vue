<script setup>
import { computed, ref, defineOptions } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'

defineOptions({
  name: 'SettingsSecurity'
})

const props = defineProps({
  userSettings: {
    type: Object,
    required: true
  },
  isWebAuthnSupported: {
    type: Boolean,
    default: false
  },
  hasPlatformAuth: {
    type: Boolean,
    default: false
  },
  userPasskeys: {
    type: Array,
    default: () => []
  },
  passkeysLoading: {
    type: Boolean,
    default: false
  },
  sessionTimeoutOptions: {
    type: Array,
    required: true
  }
})

const emit = defineEmits(['register-passkey', 'remove-passkey', 'update-setting'])

const $q = useQuasar()
const { t } = useI18n()

const registeringPasskey = ref(false)

const sessionTimeoutDays = computed({
  get: () => props.userSettings.sessionTimeoutDays,
  set: (value) => emit('update-setting', { sessionTimeoutDays: value })
})

const lockOnExit = computed({
  get: () => props.userSettings.lockOnExit,
  set: (value) => emit('update-setting', { lockOnExit: value })
})

const handleRegisterPasskey = async () => {
  registeringPasskey.value = true
  emit('register-passkey', {
    done: () => { registeringPasskey.value = false }
  })
}

const handleRemovePasskey = (passkey) => {
  $q.dialog({
    title: t('settings.security.biometricRemove'),
    message: t('settings.security.biometricRemoveConfirm'),
    cancel: true,
    persistent: true
  }).onOk(() => {
    emit('remove-passkey', passkey)
  })
}

const formatPasskeyDate = (timestamp) => {
  if (!timestamp) return ''
  let date
  if (timestamp._seconds) {
    date = new Date(timestamp._seconds * 1000)
  } else if (timestamp.seconds) {
    date = new Date(timestamp.seconds * 1000)
  } else {
    date = new Date(timestamp)
  }
  return date.toLocaleDateString()
}
</script>

<template>
  <q-card flat bordered class="settings-card full-height animate-entrance" style="animation-delay: 0.17s;">
    <q-card-section>
      <div class="text-h6 q-mb-md">
        <q-icon name="security" color="primary" class="q-mr-sm animate-bounce-subtle" />
        {{ $t('settings.security.title') }}
      </div>

      <!-- Biometric Authentication -->
      <q-item class="animate-hover">
        <q-item-section>
          <q-item-label>{{ $t('settings.security.biometric') }}</q-item-label>
          <q-item-label caption>
            {{ $t('settings.security.biometricHint') }}
          </q-item-label>
        </q-item-section>
      </q-item>

      <!-- Not supported -->
      <q-banner
        v-if="!isWebAuthnSupported || !hasPlatformAuth"
        class="bg-grey-3 q-mx-md q-mb-md"
        rounded
        dense
      >
        <template v-slot:avatar>
          <q-icon name="info" color="grey" />
        </template>
        {{ $t('settings.security.biometricNotSupported') }}
      </q-banner>

      <!-- Supported: Register or manage passkeys -->
      <template v-else>
        <!-- No passkeys yet -->
        <q-item v-if="userPasskeys.length === 0" class="q-mb-sm">
          <q-item-section>
            <q-btn
              outline
              color="primary"
              icon="fingerprint"
              :label="$t('settings.security.biometricRegister')"
              :loading="registeringPasskey"
              @click="handleRegisterPasskey"
              no-caps
            />
          </q-item-section>
        </q-item>

        <!-- Existing passkeys list -->
        <div v-else class="q-mx-md q-mb-md">
          <div v-for="pk in userPasskeys" :key="pk.id" class="passkey-item">
            <div class="passkey-info">
              <div class="passkey-device">
                <q-icon name="fingerprint" color="positive" size="xs" class="q-mr-xs" />
                {{ pk.deviceName }}
              </div>
              <div class="passkey-date text-caption text-grey">
                {{ $t('settings.security.biometricRegisteredOn') }}: {{ formatPasskeyDate(pk.createdAt) }}
              </div>
            </div>
            <q-btn
              flat
              dense
              round
              icon="delete_outline"
              color="negative"
              size="sm"
              @click="handleRemovePasskey(pk)"
              :loading="passkeysLoading"
            >
              <q-tooltip>{{ $t('settings.security.biometricRemove') }}</q-tooltip>
            </q-btn>
          </div>
          <q-btn
            outline
            color="primary"
            icon="add"
            :label="$t('settings.security.biometricRegister')"
            :loading="registeringPasskey"
            @click="handleRegisterPasskey"
            no-caps
            dense
            class="q-mt-sm"
          />
        </div>
      </template>

      <q-separator class="q-my-sm" />

      <!-- Session Duration -->
      <q-item class="animate-hover">
        <q-item-section>
          <q-item-label>{{ $t('settings.security.sessionDuration') }}</q-item-label>
          <q-item-label caption>
            {{ $t('settings.security.sessionDurationHint') }}
          </q-item-label>
        </q-item-section>
      </q-item>

      <q-item>
        <q-item-section>
          <q-select
            v-model="sessionTimeoutDays"
            :options="sessionTimeoutOptions"
            emit-value
            map-options
            outlined
            dense
            style="max-width: 300px"
          >
            <template v-slot:prepend>
              <q-icon name="schedule" />
            </template>
          </q-select>
        </q-item-section>
      </q-item>

      <q-banner
        v-if="userSettings.sessionTimeoutDays === 0"
        class="bg-warning text-dark q-mt-md"
        rounded
        dense
      >
        <template v-slot:avatar>
          <q-icon name="warning" />
        </template>
        {{ $t('settings.security.neverExpireWarning') }}
      </q-banner>

      <!-- Lock on Exit -->
      <template v-if="userPasskeys.length > 0">
        <q-separator class="q-my-sm" />

        <q-item tag="label" class="animate-hover">
          <q-item-section>
            <q-item-label>{{ $t('settings.security.lockOnExit') }}</q-item-label>
            <q-item-label caption>
              {{ $t('settings.security.lockOnExitHint') }}
            </q-item-label>
          </q-item-section>
          <q-item-section side>
            <q-toggle
              v-model="lockOnExit"
              color="primary"
            />
          </q-item-section>
        </q-item>
      </template>

      <!-- Encryption Model Disclosure -->
      <q-separator class="q-my-sm" />
      <q-item>
        <q-item-section>
          <q-item-label class="text-weight-medium">
            <q-icon name="lock" size="xs" class="q-mr-xs" />
            {{ $t('settings.security.encryptionModel') }}
          </q-item-label>
          <q-item-label caption class="q-mt-xs">{{ $t('settings.security.encryptionModelVault') }}</q-item-label>
          <q-item-label caption class="q-mt-xs">{{ $t('settings.security.encryptionModelEnvVault') }}</q-item-label>
        </q-item-section>
      </q-item>
    </q-card-section>
  </q-card>
</template>

<style scoped>
.passkey-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  margin-bottom: 6px;
}

.passkey-info {
  flex: 1;
  min-width: 0;
}

.passkey-device {
  display: flex;
  align-items: center;
  font-weight: 500;
  font-size: 0.875rem;
}

.passkey-date {
  font-size: 0.75rem;
  margin-top: 2px;
}
</style>

<style>
.body--dark .passkey-item,
.lemonade-dark .passkey-item {
  background: var(--surface);
  border-color: var(--border);
}
</style>
