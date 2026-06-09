<script setup>
import { defineOptions, onMounted, onUnmounted } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import { useEntitlements } from '../../composables/useEntitlements'

defineOptions({
  name: 'SettingsAccount'
})

// vue-i18n v11 enforces MUST_BE_CALL_SETUP_TOP — useI18n() can only run at
// the top of <script setup>. Calling it inside onMounted (or any async
// continuation) throws SyntaxError code 26. Same goes for useQuasar.
const $q = useQuasar()
const { t } = useI18n()

const {
  subscriptionInfo,
  loadingPortal,
  hasLifetimeHosted,
  isFounder,
  formattedRenewalDate,
  roleLabel,
  roleColor,
  loadUserRole,
  subscribeToUserDoc,
  manageSubscription
} = useEntitlements()

let unsubscribeUserDoc = null

// Hash-aware query parser. Vue Router uses hash routing, so a URL like
// app.lemonadepass.app/#/settings?subscription=success keeps the query
// after the # — window.location.search is empty in that case.
const readQueryParam = (key) => {
  const fromSearch = new URLSearchParams(window.location.search).get(key)
  if (fromSearch) return fromSearch
  const hash = window.location.hash || ''
  const queryStart = hash.indexOf('?')
  if (queryStart === -1) return null
  return new URLSearchParams(hash.slice(queryStart + 1)).get(key)
}

onMounted(async () => {
  await loadUserRole()
  // Real-time subscription so the role updates the moment the Polar webhook
  // upgrades the user (no more 2-second timeout race condition).
  unsubscribeUserDoc = subscribeToUserDoc()

  // Check for checkout success redirect (legacy + new one-time SKU).
  if (readQueryParam('subscription') === 'success') {
    $q.notify({
      type: 'positive',
      message: t('settings.subscription.welcomePremium'),
      icon: 'celebration',
      timeout: 5000
    })
    // Strip the query param from the URL without triggering navigation.
    const cleanHash = (window.location.hash || '').split('?')[0]
    window.history.replaceState({}, '', window.location.pathname + cleanHash)
  }
})

onUnmounted(() => {
  if (unsubscribeUserDoc) {
    unsubscribeUserDoc()
    unsubscribeUserDoc = null
  }
})

defineExpose({
  hasLifetimeHosted,
  isFounder,
  loadUserRole
})
</script>

<template>
  <q-card flat bordered class="settings-card account-card animate-entrance" style="animation-delay: 0.05s;">
    <q-card-section>
      <div class="text-h6 q-mb-md">
        <q-icon name="workspace_premium" color="primary" class="q-mr-sm animate-bounce-subtle" />
        {{ $t('settings.subscription.title') }}
      </div>

      <div class="row items-center justify-between">
        <div class="col">
          <div class="row items-center q-gutter-sm">
            <q-badge :color="roleColor" :label="roleLabel" class="text-weight-bold" style="font-size: 0.9rem; padding: 6px 12px;" />
            <span v-if="isFounder" class="founder-badge">
              <q-icon name="stars" size="xs" /> Beta Tester
            </span>
          </div>
          <div class="text-caption text-grey q-mt-sm">
            <template v-if="isFounder">
              {{ $t('settings.subscription.founderThanks') }}
            </template>
            <template v-else>
              {{ $t('settings.subscription.fullAccess') }}
            </template>
          </div>
        </div>

        <div class="col-auto" v-if="!isFounder && subscriptionInfo">
          <q-btn
            outline
            color="primary"
            :label="$t('settings.subscription.manageButton')"
            icon="settings"
            :loading="loadingPortal"
            @click="manageSubscription"
            class="manage-btn"
          />
        </div>
      </div>

      <!-- Features list (all unlocked under OSS model) -->
      <div class="q-mt-md account-features">
        <div class="text-subtitle2 q-mb-sm">{{ $t('settings.subscription.features.title') }}</div>
        <div class="row q-col-gutter-sm">
          <div class="col-12 col-sm-6">
            <div class="feature-item">
              <q-icon name="check_circle" color="positive" size="xs" />
              <span>{{ $t('settings.subscription.features.envVault') }}</span>
            </div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="feature-item">
              <q-icon name="check_circle" color="positive" size="xs" />
              <span>{{ $t('settings.subscription.features.unlimited') }}</span>
            </div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="feature-item">
              <q-icon name="check_circle" color="positive" size="xs" />
              <span>{{ $t('settings.subscription.features.aiSecurity') }}</span>
            </div>
          </div>
          <div class="col-12 col-sm-6">
            <div class="feature-item">
              <q-icon name="check_circle" color="positive" size="xs" />
              <span>{{ $t('settings.subscription.features.prioritySupport') }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Subscription info for legacy paid users -->
      <div v-if="subscriptionInfo && !isFounder" class="q-mt-md subscription-details">
        <q-separator class="q-mb-md" />
        <div class="text-caption text-grey">
          <div v-if="formattedRenewalDate && subscriptionInfo.status === 'canceled'">
            {{ $t('settings.subscription.premiumUntil') }}: {{ formattedRenewalDate }}
          </div>
          <div v-else-if="formattedRenewalDate">
            {{ $t('settings.subscription.nextRenewal') }}: {{ formattedRenewalDate }}
          </div>
          <div v-if="subscriptionInfo.status">
            {{ $t('settings.subscription.status') }}: {{ subscriptionInfo.status === 'canceled' ? $t('settings.subscription.statusCanceled') : subscriptionInfo.status }}
          </div>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<style scoped>
.account-card {
  background: linear-gradient(135deg, var(--golden-soft) 0%, transparent 50%) !important;
  border: 1px solid rgba(255, 215, 0, 0.2) !important;
}

.account-card:hover {
  border-color: rgba(255, 215, 0, 0.4) !important;
}

.founder-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  background: linear-gradient(135deg, #FF6B00, #FFD700);
  color: white;
  font-size: 0.7rem;
  font-weight: 600;
  border-radius: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.manage-btn {
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 8px;
  transition: all 250ms cubic-bezier(0.16, 1, 0.3, 1);
}

.manage-btn:hover {
  transform: translateY(-1px);
  background: rgba(255, 215, 0, 0.1);
}

.account-features {
  padding: 16px;
  background: var(--surface-elevated);
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
}

.feature-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 0.875rem;
  color: var(--text-primary);
}

.subscription-details {
  font-family: 'SF Mono', 'Fira Code', monospace;
}
</style>

<style>
/* Dark mode adjustments */
.body--dark .account-card,
.lemonade-dark .account-card {
  background: linear-gradient(135deg, rgba(255, 215, 0, 0.05) 0%, transparent 50%) !important;
}

.body--dark .account-features,
.lemonade-dark .account-features {
  background: var(--surface);
}
</style>
