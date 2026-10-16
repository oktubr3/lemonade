<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'
import QrScanner from 'qr-scanner'
import { usePasswordEntriesStore } from '../../stores/passwordEntries'
import { decodeMigrationUri } from '../../utils/otpMigration'
import { suggestAll } from '../../utils/authenticatorMatch'

defineOptions({ name: 'AuthenticatorImportDialog' })

const model = defineModel({ type: Boolean, default: false })

const $q = useQuasar()
const { t } = useI18n()
const store = usePasswordEntriesStore()

const NEW_ENTRY = '__new__'
const SKIP = '__skip__'

// QRs read so far, keyed by batch: { [batchId]: { size, parts: { [index]: accounts[] } } }
const batches = ref({})
const rows = ref([]) // { account, target }
const step = ref('scan') // 'scan' | 'review'
const pasted = ref('')
const isImporting = ref(false)
const cameraOn = ref(false)
const video = ref(null)
const fileInput = ref(null)
let scanner = null
let lastCameraRead = ''

const qrsRead = computed(() => Object.values(batches.value).reduce((n, b) => n + Object.keys(b.parts).length, 0))
const qrsExpected = computed(() => Object.values(batches.value).reduce((n, b) => n + b.size, 0))
const allRead = computed(() => qrsRead.value > 0 && qrsRead.value === qrsExpected.value)

const entryOptions = computed(() => [
  { label: t('settings.authenticator.newEntry'), value: NEW_ENTRY },
  { label: t('settings.authenticator.skip'), value: SKIP },
  ...store.entries.map((entry) => ({
    label: entry.username ? `${entry.title} — ${entry.username}` : entry.title,
    value: entry.id
  }))
])

// Filtering the vault inside the select: there can be hundreds of entries.
const filteredOptions = ref([])
watch(entryOptions, (options) => { filteredOptions.value = options }, { immediate: true })
function filterOptions (text, update) {
  update(() => {
    const needle = text.toLowerCase()
    filteredOptions.value = needle
      ? entryOptions.value.filter((option) => option.label.toLowerCase().includes(needle))
      : entryOptions.value
  })
}

const toImport = computed(() => rows.value.filter((row) => row.account.supported && row.target !== SKIP))
const unsupportedCount = computed(() => rows.value.filter((row) => !row.account.supported).length)
const hasTotp = (id) => !!store.entries.find((entry) => entry.id === id)?.totpSecret

function reset () {
  stopCamera()
  batches.value = {}
  rows.value = []
  step.value = 'scan'
  pasted.value = ''
}

// The suggestions need the vault, which is not loaded if Settings was opened first.
watch(model, (open) => {
  if (!open) reset()
  else {
    store.fetchEntries().catch((error) => {
      $q.notify({ type: 'negative', message: error.message || t('settings.authenticator.importError'), position: 'top' })
    })
  }
}, { immediate: true })
onBeforeUnmount(stopCamera)

// Returns true if the text was a Google Authenticator export.
function addPayload (text, { quietRepeat = false } = {}) {
  let payload
  try {
    payload = decodeMigrationUri(text)
  } catch {
    $q.notify({ type: 'warning', message: t('settings.authenticator.notAnExport'), position: 'top' })
    return false
  }
  const batch = batches.value[payload.batchId] || { size: payload.batchSize, parts: {} }
  if (batch.parts[payload.batchIndex]) {
    if (!quietRepeat) $q.notify({ message: t('settings.authenticator.alreadyRead'), position: 'top', timeout: 1500 })
    return true
  }
  batch.parts[payload.batchIndex] = payload.accounts
  batches.value = { ...batches.value, [payload.batchId]: batch }
  $q.notify({
    type: 'positive',
    message: t('settings.authenticator.qrRead', { read: qrsRead.value, total: qrsExpected.value }),
    position: 'top',
    timeout: 1500
  })
  if (!quietRepeat && allRead.value) review()
  return true
}

function review () {
  stopCamera()
  const accounts = Object.values(batches.value)
    .flatMap((batch) => Object.keys(batch.parts).sort((a, b) => a - b).flatMap((index) => batch.parts[index]))
  const suggestions = suggestAll(accounts, store.entries)
  rows.value = accounts.map((account, i) => ({
    account,
    target: account.supported ? (suggestions[i] || NEW_ENTRY) : SKIP
  }))
  step.value = 'review'
}

function usePasted () {
  const lines = pasted.value.split(/\s+/).filter(Boolean)
  if (!lines.length) return
  for (const line of lines) {
    if (!addPayload(line)) return
  }
  pasted.value = ''
}

async function onFile (event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  for (const file of files) {
    try {
      const result = await QrScanner.scanImage(file, { returnDetailedScanResult: true })
      addPayload(result.data)
    } catch {
      $q.notify({ type: 'warning', message: t('settings.authenticator.noQrInImage'), position: 'top' })
    }
  }
}

async function startCamera () {
  cameraOn.value = true
  await nextTick()
  if (!video.value) return
  try {
    // The phone keeps showing the same QR until the user swipes to the next
    // one, and the scanner reads it several times a second: repeats are
    // ignored without a toast. The review step is deferred so the scanner is
    // not destroyed from inside its own callback.
    scanner = new QrScanner(video.value, (result) => {
      if (result.data === lastCameraRead) return
      lastCameraRead = result.data
      if (addPayload(result.data, { quietRepeat: true }) && allRead.value) setTimeout(review, 0)
    }, {
      returnDetailedScanResult: true,
      maxScansPerSecond: 5,
      // The default region is the central two thirds, downscaled to 400 px: an
      // export QR (up to ten accounts, very dense) that fills the frame comes out
      // cropped or blurred and never reads. Scan the whole frame at full size.
      calculateScanRegion: (videoEl) => {
        const scale = Math.min(1, 1280 / Math.max(videoEl.videoWidth, videoEl.videoHeight))
        return {
          x: 0,
          y: 0,
          width: videoEl.videoWidth,
          height: videoEl.videoHeight,
          downScaledWidth: Math.round(videoEl.videoWidth * scale),
          downScaledHeight: Math.round(videoEl.videoHeight * scale)
        }
      }
    })
    await scanner.start()
  } catch {
    stopCamera()
    $q.notify({ type: 'negative', message: t('passwords.totp.cameraError'), position: 'top' })
  }
}

function stopCamera () {
  if (scanner) {
    scanner.stop()
    scanner.destroy()
    scanner = null
  }
  cameraOn.value = false
  lastCameraRead = ''
}

const label = (account) => account.issuer || account.name || t('settings.authenticator.unnamed')

async function runImport () {
  isImporting.value = true
  try {
    const accounts = toImport.value.map(({ account, target }) => ({
      secret: account.secret,
      algorithm: account.algorithm,
      digits: account.digits,
      period: 30,
      ...(target === NEW_ENTRY
        ? { title: account.issuer || account.name || t('settings.authenticator.unnamed'), username: account.name }
        : { entryId: target })
    }))
    const result = await store.importTotpAccounts(accounts)
    $q.notify({
      type: 'positive',
      message: t('settings.authenticator.imported', { count: accounts.length, created: result.created.length }),
      position: 'top'
    })
    model.value = false
  } catch (error) {
    $q.notify({ type: 'negative', message: error.message || t('settings.authenticator.importError'), position: 'top' })
  } finally {
    isImporting.value = false
  }
}
</script>

<template>
  <q-dialog v-model="model" persistent>
    <q-card class="authenticator-dialog" data-testid="authenticator-import">
      <q-card-section class="row items-center q-pb-none">
        <q-icon name="qr_code_scanner" color="primary" size="sm" class="q-mr-sm" />
        <div class="text-h6">{{ t('settings.authenticator.importTitle') }}</div>
        <q-space />
        <q-btn flat round dense icon="close" :aria-label="t('common.close')" @click="model = false" />
      </q-card-section>

      <template v-if="step === 'scan'">
        <q-card-section class="text-body2">
          <ol class="q-pl-md q-my-none">
            <li>{{ t('settings.authenticator.importStep1') }}</li>
            <li>{{ t('settings.authenticator.importStep2') }}</li>
            <li>{{ t('settings.authenticator.importStep3') }}</li>
          </ol>
        </q-card-section>

        <q-card-section class="q-pt-none">
          <div v-if="qrsRead" class="text-positive q-mb-sm" data-testid="qr-progress">
            {{ t('settings.authenticator.qrRead', { read: qrsRead, total: qrsExpected }) }}
          </div>

          <div v-if="cameraOn" class="camera q-mb-sm">
            <video ref="video" class="full-width" />
          </div>

          <div class="row q-gutter-sm">
            <q-btn v-if="!cameraOn" outline color="primary" icon="photo_camera"
              :label="t('settings.authenticator.useCamera')" @click="startCamera" />
            <q-btn v-else outline color="grey-7" icon="videocam_off"
              :label="t('settings.authenticator.stopCamera')" @click="stopCamera" />
            <q-btn outline color="primary" icon="image"
              :label="t('settings.authenticator.uploadImage')" @click="fileInput.click()" />
            <input ref="fileInput" type="file" accept="image/*" multiple class="hidden"
              data-testid="qr-image-input" @change="onFile" />
          </div>

          <q-expansion-item dense class="q-mt-md" icon="link" :label="t('settings.authenticator.pasteLink')">
            <q-input v-model="pasted" type="textarea" autogrow outlined dense class="q-mt-sm"
              placeholder="otpauth-migration://offline?data=..." data-testid="paste-export" />
            <q-btn flat color="primary" class="q-mt-xs" :label="t('settings.authenticator.readLink')"
              :disable="!pasted.trim()" @click="usePasted" />
          </q-expansion-item>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn v-if="qrsRead && !allRead" flat color="primary"
            :label="t('settings.authenticator.continueWithRead')" @click="review" />
        </q-card-actions>
      </template>

      <template v-else>
        <q-card-section class="text-body2 q-pb-sm">
          {{ t('settings.authenticator.reviewHint', { count: rows.length }) }}
          <div v-if="unsupportedCount" class="text-warning q-mt-xs">
            {{ t('settings.authenticator.unsupported', { count: unsupportedCount }) }}
          </div>
        </q-card-section>

        <q-card-section class="q-pt-none rows">
          <div v-for="(row, i) in rows" :key="i" class="row items-center q-py-xs account-row" data-testid="import-row">
            <div class="col-12 col-sm-5 q-pr-sm">
              <div class="text-weight-medium ellipsis">{{ label(row.account) }}</div>
              <div class="text-caption text-grey-7 ellipsis">{{ row.account.name }}</div>
            </div>
            <div class="col-12 col-sm-7">
              <div v-if="!row.account.supported" class="text-caption text-grey-7">
                {{ t('settings.authenticator.cannotImport', { type: row.account.type.toUpperCase(), algorithm: row.account.algorithm }) }}
              </div>
              <template v-else>
                <q-select v-model="row.target" :options="filteredOptions" emit-value map-options
                  dense outlined options-dense use-input input-debounce="0" @filter="filterOptions"
                  :aria-label="t('settings.authenticator.targetFor', { name: label(row.account) })" />
                <div v-if="hasTotp(row.target)" class="text-caption text-warning">
                  {{ t('settings.authenticator.willReplace') }}
                </div>
              </template>
            </div>
          </div>
        </q-card-section>

        <q-card-actions align="right">
          <q-btn flat :label="t('common.cancel')" @click="model = false" />
          <q-btn unelevated color="primary" :loading="isImporting" :disable="!toImport.length"
            :label="t('settings.authenticator.importCount', { count: toImport.length })" @click="runImport" />
        </q-card-actions>
      </template>
    </q-card>
  </q-dialog>
</template>

<style scoped>
.authenticator-dialog {
  width: 640px;
  max-width: 95vw;
}

/* contain, not cover: the whole frame is scanned, so the whole frame is shown. */
.camera video {
  border-radius: 8px;
  max-height: 320px;
  object-fit: contain;
  background: #000;
}

.rows {
  max-height: 55vh;
  overflow-y: auto;
}

.account-row + .account-row {
  border-top: 1px solid var(--border-subtle, rgba(128, 128, 128, 0.2));
}
</style>
