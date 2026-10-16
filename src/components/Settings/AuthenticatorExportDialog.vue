<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useQuasar, copyToClipboard } from 'quasar'
import { useI18n } from 'vue-i18n'
import QRCode from 'qrcode'
import { usePasswordEntriesStore } from '../../stores/passwordEntries'
import { encodeMigrationUris } from '../../utils/otpMigration'

defineOptions({ name: 'AuthenticatorExportDialog' })

const model = defineModel({ type: Boolean, default: false })

const $q = useQuasar()
const { t } = useI18n()
const store = usePasswordEntriesStore()

const withTotp = computed(() => store.entries.filter((entry) => entry.totpSecret))
const selected = ref([])
const step = ref('select') // 'select' | 'qr'
const isLoading = ref(false)
// The URIs hold the secrets in clear: they live only while this dialog is open.
const uris = ref([])
const current = ref(0)
const skipped = ref([])
const canvas = ref(null)

// Settings can be opened straight from a reload, before the vault list loads.
const isLoadingEntries = ref(false)
async function loadEntries () {
  isLoadingEntries.value = true
  try {
    await store.fetchEntries()
  } catch (error) {
    $q.notify({ type: 'negative', message: error.message || t('settings.authenticator.exportError'), position: 'top' })
  } finally {
    isLoadingEntries.value = false
  }
  selected.value = withTotp.value.map((entry) => entry.id)
}

watch(model, (open) => {
  if (open) {
    loadEntries()
  } else {
    uris.value = []
    skipped.value = []
    current.value = 0
    step.value = 'select'
  }
}, { immediate: true })

const allSelected = computed({
  get: () => selected.value.length === withTotp.value.length && withTotp.value.length > 0,
  set: (value) => { selected.value = value ? withTotp.value.map((entry) => entry.id) : [] }
})

async function draw () {
  await nextTick()
  if (!canvas.value || !uris.value[current.value]) return
  await QRCode.toCanvas(canvas.value, uris.value[current.value], {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 280,
    color: { dark: '#000000', light: '#ffffff' }
  })
}

watch(current, draw)

async function generate () {
  isLoading.value = true
  try {
    const accounts = await store.exportTotpAccounts(selected.value)
    // Google Authenticator's transfer format has no field for the period: it
    // always assumes 30 seconds, so other periods would give wrong codes there.
    skipped.value = accounts.filter((account) => account.period !== 30).map((account) => account.title)
    const exportable = accounts
      .filter((account) => account.period === 30)
      .map((account) => ({
        secret: account.secret,
        issuer: account.title,
        name: account.username || account.title,
        algorithm: account.algorithm,
        digits: account.digits
      }))
    if (!exportable.length) {
      $q.notify({ type: 'warning', message: t('settings.authenticator.nothingToExport'), position: 'top' })
      return
    }
    uris.value = encodeMigrationUris(exportable)
    current.value = 0
    step.value = 'qr'
    await draw()
  } catch (error) {
    $q.notify({ type: 'negative', message: error.message || t('settings.authenticator.exportError'), position: 'top' })
  } finally {
    isLoading.value = false
  }
}

async function copyLink () {
  await copyToClipboard(uris.value[current.value])
  $q.notify({ type: 'positive', message: t('settings.authenticator.linkCopied'), position: 'top', timeout: 1500 })
}
</script>

<template>
  <q-dialog v-model="model">
    <q-card class="authenticator-dialog" data-testid="authenticator-export">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="qr_code_2" color="primary" size="sm" class="q-mr-sm" />
        <div class="text-h6">{{ t('settings.authenticator.exportTitle') }}</div>
        <q-space />
        <q-btn flat round dense icon="close" :aria-label="t('common.close')" @click="model = false" />
      </q-card-section>

      <template v-if="step === 'select'">
        <q-card-section v-if="isLoadingEntries" class="flex flex-center">
          <q-spinner color="primary" size="2em" />
        </q-card-section>
        <q-card-section v-else-if="!withTotp.length" class="text-body2">
          {{ t('settings.authenticator.noTotpEntries') }}
        </q-card-section>
        <template v-else>
          <q-card-section class="text-body2 q-pb-none">
            {{ t('settings.authenticator.exportHint') }}
          </q-card-section>
          <q-card-section class="q-pt-sm rows">
            <q-checkbox v-model="allSelected" :label="t('settings.authenticator.selectAll', { count: withTotp.length })" />
            <q-separator class="q-my-xs" />
            <div v-for="entry in withTotp" :key="entry.id">
              <q-checkbox v-model="selected" :val="entry.id"
                :label="entry.username ? `${entry.title} — ${entry.username}` : entry.title" />
            </div>
          </q-card-section>
          <q-card-actions align="right">
            <q-btn flat :label="t('common.cancel')" @click="model = false" />
            <q-btn unelevated color="primary" icon="qr_code_2" :loading="isLoading" :disable="!selected.length"
              :label="t('settings.authenticator.generateQr')" @click="generate" />
          </q-card-actions>
        </template>
      </template>

      <template v-else>
        <q-card-section class="text-body2 q-pb-none">
          <q-banner dense rounded class="bg-warning text-dark q-mb-sm">
            <template #avatar><q-icon name="warning" /></template>
            {{ t('settings.authenticator.qrWarning') }}
          </q-banner>
          <div>{{ t('settings.authenticator.exportSteps') }}</div>
          <div v-if="skipped.length" class="text-caption text-warning q-mt-xs">
            {{ t('settings.authenticator.periodSkipped', { names: skipped.join(', ') }) }}
          </div>
        </q-card-section>

        <q-card-section class="column items-center">
          <canvas ref="canvas" class="qr" data-testid="export-qr" />
          <div class="text-caption q-mt-sm" data-testid="export-qr-counter">
            {{ t('settings.authenticator.qrCounter', { current: current + 1, total: uris.length }) }}
          </div>
          <div class="row q-gutter-sm q-mt-sm">
            <q-btn flat dense icon="chevron_left" :disable="current === 0"
              :aria-label="t('settings.authenticator.previousQr')" @click="current--" />
            <q-btn flat dense icon="chevron_right" :disable="current === uris.length - 1"
              :aria-label="t('settings.authenticator.nextQr')" @click="current++" />
          </div>
          <q-btn flat dense size="sm" color="grey-7" icon="link" class="q-mt-sm"
            :label="t('settings.authenticator.copyLink')" data-testid="copy-export-link" @click="copyLink" />
        </q-card-section>

        <q-card-actions align="right">
          <q-btn unelevated color="primary" :label="t('settings.authenticator.done')" @click="model = false" />
        </q-card-actions>
      </template>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.authenticator-dialog {
  width: 520px;
  max-width: 95vw;
}

.rows {
  max-height: 50vh;
  overflow-y: auto;
}

/* White quiet zone so the phone camera reads it in dark mode too. */
.qr {
  background: #fff;
  border-radius: 8px;
  max-width: 100%;
}
</style>
