<script setup>
import { computed, defineOptions } from 'vue'
import { useQuasar } from 'quasar'

defineOptions({
  name: 'SettingsGridConfig'
})

const props = defineProps({
  userSettings: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['update-setting'])

const $q = useQuasar()

const mobileColumnOptions = [
  { label: '2 columnas', value: 2 },
  { label: '3 columnas', value: 3 }
]

const desktopColumnOptions = [
  { label: '3 columnas', value: 3 },
  { label: '4 columnas', value: 4 },
  { label: '5 columnas', value: 5 },
  { label: '6 columnas', value: 6 },
  { label: '7 columnas', value: 7 },
  { label: '8 columnas', value: 8 }
]

const currentColumns = computed(() => {
  const isMobile = $q.screen.lt.sm
  const mobileCols = typeof props.userSettings.mobileColumns === 'object'
    ? props.userSettings.mobileColumns.value
    : props.userSettings.mobileColumns
  const desktopCols = typeof props.userSettings.desktopColumns === 'object'
    ? props.userSettings.desktopColumns.value
    : props.userSettings.desktopColumns
  return isMobile ? mobileCols : desktopCols
})

const gridStyle = computed(() => ({
  display: 'grid',
  gridTemplateColumns: `repeat(${currentColumns.value}, 1fr)`,
  gap: $q.screen.lt.sm ? '8px' : '12px',
  padding: $q.screen.lt.sm ? '8px' : '12px',
  backgroundColor: '#f5f5f5',
  borderRadius: '8px',
  width: '100%',
  boxSizing: 'border-box'
}))

const mobileColumns = computed({
  get: () => props.userSettings.mobileColumns,
  set: (value) => emit('update-setting', { mobileColumns: value })
})

const desktopColumns = computed({
  get: () => props.userSettings.desktopColumns,
  set: (value) => emit('update-setting', { desktopColumns: value })
})
</script>

<template>
  <q-card flat bordered class="settings-card animate-entrance" style="animation-delay: 0.3s;">
    <q-card-section>
      <div class="text-h6 q-mb-md">
        <q-icon name="grid_view" color="primary" class="q-mr-sm animate-bounce-subtle" />
        {{ $t('settings.mosaicView.title') }}
      </div>

      <div class="row q-col-gutter-md">
        <div class="col-12 col-sm-6">
          <q-item class="animate-hover">
            <q-item-section>
              <q-item-label>{{ $t('settings.mosaicView.mobileColumns') }}</q-item-label>
              <q-item-label caption>
                {{ $t('settings.mosaicView.mobileColumnsHint') }}
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-select
                v-model="mobileColumns"
                :options="mobileColumnOptions"
                option-value="value"
                option-label="label"
                outlined
                dense
                style="min-width: 120px"
              />
            </q-item-section>
          </q-item>
        </div>

        <div class="col-12 col-sm-6">
          <q-item class="animate-hover">
            <q-item-section>
              <q-item-label>{{ $t('settings.mosaicView.desktopColumns') }}</q-item-label>
              <q-item-label caption>
                {{ $t('settings.mosaicView.desktopColumnsHint') }}
              </q-item-label>
            </q-item-section>
            <q-item-section side>
              <q-select
                v-model="desktopColumns"
                :options="desktopColumnOptions"
                option-value="value"
                option-label="label"
                outlined
                dense
                style="min-width: 120px"
              />
            </q-item-section>
          </q-item>
        </div>
      </div>

      <div class="q-mt-md">
        <q-banner class="bg-info text-white" inline-actions>
          <template v-slot:avatar>
            <q-icon name="info" />
          </template>
          {{ $t('settings.mosaicView.preview', { columns: currentColumns, device: $q.screen.lt.sm ? 'Mobile' : 'Desktop' }) }}
        </q-banner>

        <!-- Preview del grid -->
        <div class="q-mt-md">
          <div class="preview-container">
            <div :style="gridStyle">
              <div v-for="n in currentColumns" :key="n" class="preview-grid-item">
                <div class="preview-card">
                  <div class="preview-title">{{ $t('passwords.form.password') }} {{ n }}</div>
                  <div class="preview-username">user{{ n }}@mail.com</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </q-card-section>
  </q-card>
</template>

<style scoped>
.preview-container {
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;
  border-radius: 8px;
  border: 1px solid var(--border-subtle);
}

.preview-grid-item {
  width: 100%;
  min-width: 0;
}

.preview-card {
  aspect-ratio: 1 / 1;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 8px;
  text-align: center;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  transition: all 250ms cubic-bezier(0.16, 1, 0.3, 1);
  width: 100%;
  cursor: pointer;
}

.preview-card:hover {
  transform: translateY(-2px) scale(1.02);
  box-shadow: 0 4px 12px rgba(255, 215, 0, 0.15);
  border-color: var(--golden);
}

.preview-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 2px;
  letter-spacing: -0.01em;
}

.preview-username {
  font-size: 0.625rem;
  color: var(--text-tertiary);
  font-family: 'SF Mono', 'Fira Code', monospace;
}
</style>

<style>
.body--dark .preview-card,
.lemonade-dark .preview-card {
  background: var(--surface);
  border-color: var(--border);
}

.body--dark .preview-card:hover,
.lemonade-dark .preview-card:hover {
  border-color: var(--golden);
  box-shadow: 0 4px 12px rgba(255, 215, 0, 0.1);
}

.body--dark .preview-title,
.lemonade-dark .preview-title {
  color: var(--text-primary);
}

.body--dark .preview-username,
.lemonade-dark .preview-username {
  color: var(--text-tertiary);
}
</style>
