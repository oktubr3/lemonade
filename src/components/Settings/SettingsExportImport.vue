<script setup>
import { defineOptions } from 'vue'
import { useExportImport } from '../../composables/useExportImport'

defineOptions({
  name: 'SettingsExportImport'
})

const {
  isExporting,
  isImporting,
  importFileInput,
  exportToCSV,
  exportToJSON,
  triggerImport,
  handleImportFile
} = useExportImport()
</script>

<template>
  <q-card flat bordered class="settings-card full-height animate-entrance" style="animation-delay: 0.45s;">
    <q-card-section>
      <div class="text-h6 q-mb-md">
        <q-icon name="import_export" color="primary" class="q-mr-sm animate-bounce-subtle" />
        {{ $t('settings.exportImport.title') }}
      </div>

      <div class="q-gutter-sm">
        <div class="text-subtitle2 q-mb-sm">{{ $t('settings.exportImport.export') }}</div>
        <div class="row q-gutter-sm">
          <q-btn
            outline
            color="primary"
            icon="download"
            label="CSV"
            :loading="isExporting"
            @click="exportToCSV"
          >
            <q-tooltip>{{ $t('settings.exportImport.exportCsvHint') }}</q-tooltip>
          </q-btn>
          <q-btn
            outline
            color="primary"
            icon="download"
            label="JSON"
            :loading="isExporting"
            @click="exportToJSON"
          >
            <q-tooltip>{{ $t('settings.exportImport.exportJsonHint') }}</q-tooltip>
          </q-btn>
        </div>

        <q-separator class="q-my-md" />

        <div class="text-subtitle2 q-mb-sm">{{ $t('settings.exportImport.import') }}</div>
        <q-btn
          outline
          color="secondary"
          icon="upload"
          :label="$t('settings.exportImport.importButton')"
          :loading="isImporting"
          @click="triggerImport"
        >
          <q-tooltip>{{ $t('settings.exportImport.importHint') }}</q-tooltip>
        </q-btn>
        <input
          ref="importFileInput"
          type="file"
          accept=".csv,.json"
          style="display: none"
          @change="handleImportFile"
        />

        <div class="text-caption text-grey-6 q-mt-sm">
          {{ $t('settings.exportImport.supportedFormats') }}
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>
