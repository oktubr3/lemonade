<script setup>
import { ref, computed, defineOptions } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { useEmergencyAccess } from '../../composables/useEmergencyAccess'

defineOptions({
  name: 'SettingsEmergencyAccess'
})

const $q = useQuasar()
const { t } = useI18n()

const {
  myContacts,
  myGrantors,
  isLoading: emergencyLoading,
  isLoadingGrantors,
  fetchMyContacts,
  fetchMyGrantors,
  addContact,
  revokeContact,
  requestAccess,
  approveRequest,
  denyRequest,
  getEmergencyPasswords,
  pendingRequestsCount
} = useEmergencyAccess()

const showAddContactDialog = ref(false)
const newContactEmail = ref('')
const newContactWaitDays = ref(3)
const addingContact = ref(false)
const showViewPasswordsDialog = ref(false)
const emergencyPasswords = ref([])
const loadingPasswords = ref(false)
const viewingGrantorEmail = ref('')

const waitPeriodOptions = computed(() => [
  { label: t('emergency.days', { n: 1 }, 1), value: 1 },
  { label: t('emergency.days', { n: 3 }, 3), value: 3 },
  { label: t('emergency.days', { n: 7 }, 7), value: 7 },
  { label: t('emergency.days', { n: 14 }, 14), value: 14 },
  { label: t('emergency.days', { n: 30 }, 30), value: 30 }
])

const copyText = (text) => {
  navigator.clipboard.writeText(text).then(() => {
    $q.notify({ message: t('common.copied'), color: 'positive', timeout: 1000, icon: 'check' })
  })
}

const handleAddContact = async () => {
  const email = newContactEmail.value.trim()
  if (!email) return

  addingContact.value = true
  try {
    await addContact(email, newContactWaitDays.value)
    showAddContactDialog.value = false
    newContactEmail.value = ''
    newContactWaitDays.value = 3
    $q.notify({
      color: 'positive',
      message: t('emergency.messages.contactAdded'),
      icon: 'check_circle'
    })
  } catch (err) {
    $q.notify({
      color: 'negative',
      message: err.message || t('common.error'),
      icon: 'error'
    })
  } finally {
    addingContact.value = false
  }
}

const handleRevokeContact = (contact) => {
  $q.dialog({
    title: t('emergency.actions.revoke'),
    message: `${contact.trusteeEmail}`,
    cancel: true,
    persistent: true
  }).onOk(async () => {
    try {
      await revokeContact(contact.id)
      $q.notify({
        color: 'positive',
        message: t('emergency.messages.contactRevoked'),
        icon: 'check_circle'
      })
    } catch (err) {
      $q.notify({
        color: 'negative',
        message: err.message || t('common.error'),
        icon: 'error'
      })
    }
  })
}

const handleApproveRequest = (contact) => {
  $q.dialog({
    title: t('emergency.actions.approve'),
    message: `${contact.trusteeEmail}`,
    cancel: true,
    persistent: true
  }).onOk(async () => {
    try {
      await approveRequest(contact.id)
      $q.notify({
        color: 'positive',
        message: t('emergency.messages.accessApproved'),
        icon: 'check_circle'
      })
    } catch (err) {
      $q.notify({
        color: 'negative',
        message: err.message || t('common.error'),
        icon: 'error'
      })
    }
  })
}

const handleDenyRequest = (contact) => {
  $q.dialog({
    title: t('emergency.actions.deny'),
    message: `${contact.trusteeEmail}`,
    cancel: true,
    persistent: true
  }).onOk(async () => {
    try {
      await denyRequest(contact.id)
      $q.notify({
        color: 'positive',
        message: t('emergency.messages.accessDenied'),
        icon: 'check_circle'
      })
    } catch (err) {
      $q.notify({
        color: 'negative',
        message: err.message || t('common.error'),
        icon: 'error'
      })
    }
  })
}

const handleRequestAccess = (grantor) => {
  $q.dialog({
    title: t('emergency.actions.request'),
    message: `${grantor.grantorEmail}`,
    cancel: true,
    persistent: true
  }).onOk(async () => {
    try {
      await requestAccess(grantor.id)
      $q.notify({
        color: 'positive',
        message: t('emergency.messages.accessRequested'),
        icon: 'check_circle'
      })
    } catch (err) {
      $q.notify({
        color: 'negative',
        message: err.message || t('common.error'),
        icon: 'error'
      })
    }
  })
}

const handleViewPasswords = async (grantor) => {
  loadingPasswords.value = true
  viewingGrantorEmail.value = grantor.grantorEmail
  try {
    emergencyPasswords.value = await getEmergencyPasswords(grantor.id)
    showViewPasswordsDialog.value = true
  } catch (err) {
    $q.notify({
      color: 'negative',
      message: err.message || t('common.error'),
      icon: 'error'
    })
  } finally {
    loadingPasswords.value = false
  }
}

const formatWaitDays = (days) => {
  return t('emergency.days', { n: days }, days)
}

const getRemainingDays = (item) => {
  if (!item.requestedAt || !item.waitPeriodDays) return 0
  let requestedDate
  if (item.requestedAt._seconds) {
    requestedDate = new Date(item.requestedAt._seconds * 1000)
  } else if (item.requestedAt.seconds) {
    requestedDate = new Date(item.requestedAt.seconds * 1000)
  } else {
    requestedDate = new Date(item.requestedAt)
  }
  const endDate = new Date(requestedDate.getTime() + item.waitPeriodDays * 86400000)
  const remaining = Math.ceil((endDate - Date.now()) / 86400000)
  return Math.max(0, remaining)
}

const getStatusColor = (status) => {
  const colors = {
    invited: 'grey',
    active: 'blue',
    requesting: 'orange',
    approved: 'green',
    denied: 'red',
    revoked: 'grey'
  }
  return colors[status] || 'grey'
}

// Load data on mount
fetchMyContacts().catch(() => {})
fetchMyGrantors().catch(() => {})
</script>

<template>
  <q-card flat bordered class="settings-card animate-entrance" style="animation-delay: 0.18s;">
    <q-card-section>
      <div class="text-h6 q-mb-md" style="position: relative;">
        <q-icon name="emergency" color="primary" class="q-mr-sm animate-bounce-subtle" />
        {{ $t('emergency.title') }}
        <q-badge v-if="pendingRequestsCount > 0" color="red" floating>{{ pendingRequestsCount }}</q-badge>
      </div>

      <!-- Section A: My Trusted Contacts (Grantor view) -->
        <div class="text-subtitle1 text-weight-medium q-mb-xs">
          {{ $t('emergency.grantor.title') }}
        </div>
        <div class="text-caption text-grey q-mb-md">
          {{ $t('emergency.description') }}
        </div>

        <!-- Loading state -->
        <div v-if="emergencyLoading" class="text-center q-pa-md">
          <q-spinner-dots color="primary" size="32px" />
        </div>

        <!-- Empty state -->
        <div v-else-if="myContacts.length === 0" class="text-center q-pa-lg">
          <q-icon name="group_add" size="48px" color="grey-5" />
          <div class="text-body2 text-grey q-mt-sm">{{ $t('emergency.grantor.empty') }}</div>
          <div class="text-caption text-grey-5">{{ $t('emergency.grantor.emptyHint') }}</div>
        </div>

        <!-- Contacts list -->
        <div v-else class="q-mb-md">
          <div
            v-for="contact in myContacts"
            :key="contact.id"
            class="emergency-contact-item"
            :class="{ 'emergency-status-requesting': contact.status === 'requesting' }"
          >
            <div class="emergency-contact-info">
              <div class="emergency-contact-email">
                <q-icon
                  :name="contact.status === 'requesting' ? 'warning' : 'person'"
                  :color="contact.status === 'requesting' ? 'orange' : 'grey'"
                  size="xs"
                  class="q-mr-xs"
                />
                {{ contact.trusteeEmail }}
              </div>
              <div class="emergency-contact-meta">
                <q-badge :color="getStatusColor(contact.status)" dense class="q-mr-sm">
                  {{ $t('emergency.status.' + contact.status) }}
                </q-badge>
                <span class="text-caption text-grey">
                  {{ formatWaitDays(contact.waitPeriodDays) }}
                </span>
              </div>
            </div>
            <div class="emergency-contact-actions">
              <template v-if="contact.status === 'requesting'">
                <q-btn
                  flat dense round
                  icon="check_circle"
                  color="positive"
                  size="sm"
                  @click="handleApproveRequest(contact)"
                >
                  <q-tooltip>{{ $t('emergency.actions.approve') }}</q-tooltip>
                </q-btn>
                <q-btn
                  flat dense round
                  icon="cancel"
                  color="negative"
                  size="sm"
                  @click="handleDenyRequest(contact)"
                >
                  <q-tooltip>{{ $t('emergency.actions.deny') }}</q-tooltip>
                </q-btn>
              </template>
              <q-btn
                flat dense round
                icon="delete_outline"
                color="grey"
                size="sm"
                @click="handleRevokeContact(contact)"
              >
                <q-tooltip>{{ $t('emergency.actions.revoke') }}</q-tooltip>
              </q-btn>
            </div>
          </div>
        </div>

        <!-- Add Contact Button -->
        <q-btn
          outline
          color="primary"
          icon="person_add"
          :label="$t('emergency.addContact')"
          class="q-mb-md"
          @click="showAddContactDialog = true"
        />

        <q-separator class="q-my-lg" />

        <!-- Section B: I Am a Contact For (Trustee view) -->
        <div class="text-subtitle1 text-weight-medium q-mb-xs">
          {{ $t('emergency.trustee.title') }}
        </div>

        <!-- Loading state -->
        <div v-if="isLoadingGrantors" class="text-center q-pa-md">
          <q-spinner-dots color="primary" size="32px" />
        </div>

        <!-- Empty state -->
        <div v-else-if="myGrantors.length === 0" class="text-center q-pa-lg">
          <q-icon name="shield" size="48px" color="grey-5" />
          <div class="text-body2 text-grey q-mt-sm">{{ $t('emergency.trustee.empty') }}</div>
        </div>

        <!-- Grantors list -->
        <div v-else>
          <div
            v-for="grantor in myGrantors"
            :key="grantor.id"
            class="emergency-contact-item"
          >
            <div class="emergency-contact-info">
              <div class="emergency-contact-email">
                <q-icon name="person" color="grey" size="xs" class="q-mr-xs" />
                {{ grantor.grantorEmail }}
              </div>
              <div class="emergency-contact-meta">
                <q-badge :color="getStatusColor(grantor.status)" dense>
                  {{ $t('emergency.status.' + grantor.status) }}
                </q-badge>
                <span v-if="grantor.status === 'requesting'" class="text-caption text-orange q-ml-sm">
                  {{ getRemainingDays(grantor) }} {{ $t('emergency.days', { n: getRemainingDays(grantor) }, getRemainingDays(grantor)) }}
                </span>
              </div>
            </div>
            <div class="emergency-contact-actions">
              <q-btn
                v-if="grantor.status === 'active'"
                flat dense
                color="primary"
                icon="lock_open"
                :label="$t('emergency.actions.request')"
                size="sm"
                @click="handleRequestAccess(grantor)"
              />
              <q-btn
                v-if="grantor.status === 'approved'"
                flat dense
                color="positive"
                icon="visibility"
                :label="$t('emergency.trustee.viewPasswords')"
                size="sm"
                :loading="loadingPasswords"
                @click="handleViewPasswords(grantor)"
              />
            </div>
          </div>
        </div>
    </q-card-section>
  </q-card>

  <!-- Add Contact Dialog -->
  <q-dialog v-model="showAddContactDialog">
    <q-card style="min-width: 350px;" class="emergency-dialog-card">
      <q-card-section>
        <div class="text-h6">{{ $t('emergency.addContact') }}</div>
      </q-card-section>

      <q-card-section class="q-pt-none">
        <q-input
          v-model="newContactEmail"
          :label="$t('emergency.email')"
          type="email"
          outlined
          dense
          autofocus
          class="q-mb-md"
        />
        <q-select
          v-model="newContactWaitDays"
          :options="waitPeriodOptions"
          :label="$t('emergency.waitPeriod')"
          emit-value
          map-options
          outlined
          dense
        />
        <div class="text-caption text-grey q-mt-xs">
          {{ $t('emergency.waitPeriodHelp') }}
        </div>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat :label="$t('common.cancel')" color="grey" v-close-popup />
        <q-btn
          flat
          :label="$t('emergency.addContact')"
          color="primary"
          :loading="addingContact"
          :disable="!newContactEmail.trim()"
          @click="handleAddContact"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>

  <!-- View Passwords Dialog -->
  <q-dialog v-model="showViewPasswordsDialog" maximized>
    <q-card class="emergency-dialog-card">
      <q-bar class="bg-primary text-white">
        <q-icon name="emergency" />
        <div class="text-body1 q-ml-sm">{{ viewingGrantorEmail }}</div>
        <q-space />
        <q-btn dense flat icon="close" v-close-popup />
      </q-bar>

      <q-card-section class="q-pa-md" style="max-height: calc(100vh - 50px); overflow-y: auto;">
        <div v-if="emergencyPasswords.length === 0" class="text-center q-pa-xl">
          <q-icon name="lock" size="64px" color="grey-5" />
          <div class="text-body1 text-grey q-mt-md">{{ $t('passwords.noPasswords') }}</div>
        </div>

        <q-list v-else separator>
          <q-item v-for="(pwd, index) in emergencyPasswords" :key="index" class="emergency-password-item">
            <q-item-section>
              <q-item-label class="text-weight-medium">{{ pwd.title }}</q-item-label>
              <q-item-label caption v-if="pwd.username">
                <q-icon name="person" size="xs" class="q-mr-xs" />
                {{ pwd.username }}
              </q-item-label>
              <q-item-label caption v-if="pwd.password">
                <q-icon name="key" size="xs" class="q-mr-xs" />
                <span class="emergency-password-value">{{ pwd.password }}</span>
              </q-item-label>
              <q-item-label caption v-if="pwd.url">
                <q-icon name="link" size="xs" class="q-mr-xs" />
                {{ pwd.url }}
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-btn
                flat dense round
                icon="content_copy"
                color="grey"
                size="sm"
                @click="copyText(pwd.password)"
              >
                <q-tooltip>{{ $t('passwords.copyPassword') }}</q-tooltip>
              </q-btn>
            </q-item-section>
          </q-item>
        </q-list>
      </q-card-section>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.emergency-contact-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--surface-elevated);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  margin-bottom: 8px;
  transition: background-color 0.2s, border-color 0.2s;
}

.emergency-contact-info {
  flex: 1;
  min-width: 0;
}

.emergency-contact-email {
  display: flex;
  align-items: center;
  font-weight: 500;
  font-size: 0.875rem;
}

.emergency-contact-meta {
  display: flex;
  align-items: center;
  margin-top: 4px;
}

.emergency-contact-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.emergency-status-requesting {
  background: rgba(255, 152, 0, 0.08);
  border-color: rgba(255, 152, 0, 0.3);
}

.emergency-password-item {
  border-bottom: 1px solid var(--border-subtle);
}

.emergency-password-value {
  font-family: 'Courier New', Courier, monospace;
  font-size: 0.85rem;
  letter-spacing: 0.5px;
}
</style>

<style>
.body--dark .emergency-contact-item,
.lemonade-dark .emergency-contact-item {
  background: var(--surface);
  border-color: var(--border);
}

.body--dark .emergency-status-requesting,
.lemonade-dark .emergency-status-requesting {
  background: rgba(255, 152, 0, 0.12);
  border-color: rgba(255, 152, 0, 0.4);
}

/* Emergency dialog dark mode */
.body--dark .emergency-dialog-card,
.lemonade-dark .emergency-dialog-card {
  background: #161b22 !important;
  color: #f0f6fc;
}

.body--dark .emergency-dialog-card .q-field__control,
.lemonade-dark .emergency-dialog-card .q-field__control {
  background: #21262d;
}

.body--dark .emergency-dialog-card .q-field--outlined .q-field__control:before,
.lemonade-dark .emergency-dialog-card .q-field--outlined .q-field__control:before {
  border-color: #30363d;
}

.body--dark .emergency-dialog-card .q-field__label,
.lemonade-dark .emergency-dialog-card .q-field__label {
  color: #8b949e;
}

.body--dark .emergency-dialog-card .q-field__native,
.body--dark .emergency-dialog-card .q-field__input,
.lemonade-dark .emergency-dialog-card .q-field__native,
.lemonade-dark .emergency-dialog-card .q-field__input {
  color: #f0f6fc;
}

.body--dark .emergency-dialog-card .q-bar,
.lemonade-dark .emergency-dialog-card .q-bar {
  background: #1a3a2a;
}
</style>
