<script setup>
import { ref, defineAsyncComponent } from 'vue'

defineOptions({ name: 'SettingsAuthenticator' })

// Loaded on first open: they bring the QR scanner and generator.
const AuthenticatorImportDialog = defineAsyncComponent(() => import('./AuthenticatorImportDialog.vue'))
const AuthenticatorExportDialog = defineAsyncComponent(() => import('./AuthenticatorExportDialog.vue'))

const showImport = ref(false)
const showExport = ref(false)
// Mounted on first use and kept, so closing plays the dialog's own transition.
const importMounted = ref(false)
const exportMounted = ref(false)
const openImport = () => { importMounted.value = true; showImport.value = true }
const openExport = () => { exportMounted.value = true; showExport.value = true }
</script>

<template>
  <q-card flat bordered class="settings-card full-height animate-entrance" style="animation-delay: 0.5s;">
    <q-card-section>
      <div class="text-h6 q-mb-sm">
        <q-icon name="verified_user" color="primary" class="q-mr-sm" />
        {{ $t('settings.authenticator.title') }}
      </div>
      <div class="text-body2 text-grey-7 q-mb-md">{{ $t('settings.authenticator.description') }}</div>
      <div class="row q-gutter-sm">
        <q-btn outline color="primary" icon="qr_code_scanner" :label="$t('settings.authenticator.importButton')"
          @click="openImport" />
        <q-btn outline color="primary" icon="qr_code_2" :label="$t('settings.authenticator.exportButton')"
          @click="openExport" />
      </div>
    </q-card-section>

    <AuthenticatorImportDialog v-if="importMounted" v-model="showImport" />
    <AuthenticatorExportDialog v-if="exportMounted" v-model="showExport" />
  </q-card>
</template>
