<script setup>
import { defineOptions } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({
    name: 'PasswordPreviewDialog'
})

const props = defineProps({
    modelValue: {
        type: Boolean,
        default: false
    },
    entry: {
        type: Object,
        default: () => ({})
    },
    customFields: {
        type: Array,
        default: () => []
    },
    showCustomFieldValue: {
        type: Object,
        default: () => ({})
    },
    hasTotp: {
        type: Boolean,
        default: false
    },
    totpCode: {
        type: String,
        default: ''
    },
    totpTimeRemaining: {
        type: Number,
        default: 0
    },
    passwordHistory: {
        type: Array,
        default: () => []
    },
    isLoadingHistory: {
        type: Boolean,
        default: false
    },
    showHistoryPassword: {
        type: Object,
        default: () => ({})
    },
    isLoadingPreview: {
        type: Boolean,
        default: false
    },
    isPwd: {
        type: Boolean,
        default: true
    }
})

const emit = defineEmits([
    'update:modelValue', 'edit', 'delete', 'share',
    'copy-username', 'copy-password', 'open-url', 'copy-url',
    'toggle-custom-field', 'copy-custom-field',
    'load-history', 'copy-history-password', 'toggle-history-password',
    'copy-totp', 'toggle-password'
])

const { t } = useI18n()

const getShortenedUrl = (url) => {
    const maxLength = 22
    if (url.length > maxLength) {
        return `${url.slice(0, maxLength)}...`
    }
    return url
}
</script>

<template>
    <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)">
        <q-card style="min-width: 320px; max-width: 450px;">
            <!-- Header compacto -->
            <q-card-section class="q-pb-none">
                <div class="row items-center no-wrap">
                    <q-icon name="bookmark" color="primary" size="sm" class="q-mr-sm" />
                    <div class="text-subtitle1 text-weight-medium ellipsis">{{ entry.title }}</div>
                    <q-space />
                    <q-btn icon="close" flat round dense size="sm" v-close-popup :aria-label="t('common.close')" />
                </div>
            </q-card-section>

            <q-separator class="q-mt-sm" />

            <q-card-section>
                <!-- Usuario -->
                <div v-if="entry.username" class="text-body1 row items-center">
                    <q-icon name="account_circle" size="1.8em" color="grey-7" />
                    <span class="q-ml-sm flex-grow-1">{{ entry.username }}</span>
                    <q-btn icon="content_copy" flat round color="primary" size="sm"
                        @click="emit('copy-username', entry.username)" title="Copiar Usuario"
                        :aria-label="$t('passwords.form.copyUsername')" />
                </div>

                <!-- Contrasena -->
                <div class="text-body1 q-mt-md row items-center">
                    <q-icon :name="isPwd ? 'visibility_off' : 'visibility'" class="cursor-pointer"
                        @click="emit('toggle-password')" size="1.8em" color="grey-7"
                        :aria-label="isPwd ? $t('passwords.form.showPassword') : $t('passwords.form.hidePassword')" />
                    <span v-if="isPwd" class="q-ml-sm flex-grow-1 text-grey-6">&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;</span>
                    <span v-else class="q-ml-sm flex-grow-1" style="font-family: monospace;">{{ entry.password }}</span>
                    <q-btn icon="content_copy" flat round color="primary" size="sm"
                        @click="emit('copy-password', entry.password)"
                        :aria-label="$t('passwords.form.copyPasswordBtn')" />
                </div>

                <!-- URL -->
                <div class="text-body1 q-mt-md row items-center" v-if="entry.url">
                    <q-icon name="link" size="1.8em" color="grey-7" />
                    <span class="q-ml-sm flex-grow-1 text-caption">{{ getShortenedUrl(entry.url) }}</span>
                    <q-btn icon="open_in_new" flat round color="primary" size="sm" @click="emit('open-url')"
                        :aria-label="$t('passwords.form.openUrlNewTab')" />
                    <q-btn icon="content_copy" flat round color="primary" size="sm"
                        @click="emit('copy-url', entry.url)" :aria-label="$t('passwords.copyUrl')" />
                </div>

                <!-- Notas -->
                <div class="q-mt-md" v-if="entry.notes">
                    <div class="row items-center q-mb-xs">
                        <q-icon name="description" size="1.8em" color="grey-7" />
                        <span class="q-ml-sm text-weight-medium text-grey-7">{{ $t('passwords.form.notes') }}</span>
                    </div>
                    <div class="q-ml-lg q-pa-sm rounded-borders text-body2 preview-notes-box" style="white-space: pre-wrap;">{{ entry.notes }}</div>
                </div>

                <!-- Custom Fields in preview -->
                <div v-if="customFields && customFields.length > 0" class="q-mt-md">
                    <div class="row items-center q-mb-sm">
                        <q-icon name="tune" size="1.8em" color="grey-7" />
                        <span class="q-ml-sm text-weight-medium text-grey-7">{{ t('passwords.customFields.title') }}</span>
                    </div>
                    <div v-for="field in customFields" :key="field.label" class="q-mb-sm q-ml-lg">
                        <div class="text-caption text-grey">{{ field.label }}</div>
                        <div class="row items-center">
                            <span v-if="field.type === 'text' || showCustomFieldValue[field.label]"
                                class="text-body2" style="font-family: monospace;">{{ field.value }}</span>
                            <span v-else class="text-body2 text-grey-6">&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;&#x2022;</span>
                            <q-btn v-if="field.type !== 'text'" flat dense round size="sm" class="q-ml-xs"
                                :icon="showCustomFieldValue[field.label] ? 'visibility_off' : 'visibility'"
                                @click="emit('toggle-custom-field', field.label)" />
                            <q-btn flat dense round size="sm" icon="content_copy" class="q-ml-xs"
                                @click="emit('copy-custom-field', field.value)" />
                        </div>
                    </div>
                </div>

                <!-- TOTP Code Display -->
                <div v-if="hasTotp" class="q-mt-md">
                    <div class="row items-center q-mb-sm">
                        <q-icon name="verified" size="1.8em" color="grey-7" />
                        <span class="q-ml-sm text-weight-medium text-grey-7">{{ t('passwords.totp.code') }}</span>
                    </div>
                    <div class="row items-center q-gutter-sm q-ml-lg">
                        <div class="text-h5 text-weight-bold" style="font-family: monospace; letter-spacing: 4px;">
                            {{ totpCode ? totpCode.substring(0, 3) + ' ' + totpCode.substring(3) : '--- ---' }}
                        </div>
                        <q-circular-progress
                            :value="(totpTimeRemaining / 30) * 100"
                            size="36px"
                            :thickness="0.3"
                            color="primary"
                            track-color="grey-3"
                        >
                            <span class="text-caption">{{ totpTimeRemaining }}s</span>
                        </q-circular-progress>
                        <q-btn flat dense round icon="content_copy"
                            @click="emit('copy-totp')" :disable="!totpCode" />
                    </div>
                </div>
            </q-card-section>

            <!-- Password History -->
            <q-expansion-item
                v-if="entry && entry.id"
                icon="history"
                :label="t('passwords.history.title')"
                header-class="text-weight-medium"
                dense
                @show="emit('load-history')"
            >
                <div class="q-pa-md">
                    <div v-if="isLoadingHistory" class="text-center q-pa-md">
                        <q-spinner-dots size="30px" />
                    </div>
                    <div v-else-if="passwordHistory.length === 0" class="text-center text-grey q-pa-sm">
                        {{ t('passwords.history.empty') }}
                    </div>
                    <div v-else>
                        <div v-for="item in passwordHistory" :key="item.id" class="history-item q-mb-sm">
                            <div class="row items-center justify-between">
                                <div class="col">
                                    <div class="text-caption text-grey">
                                        {{ t('passwords.history.changedAt', { date: item.formattedDate || '' }) }}
                                    </div>
                                    <div class="text-body2 text-weight-medium" style="font-family: monospace;">
                                        {{ showHistoryPassword[item.id] ? item.password : '••••••••' }}
                                    </div>
                                </div>
                                <div class="row q-gutter-xs">
                                    <q-btn flat dense round size="sm"
                                        :icon="showHistoryPassword[item.id] ? 'visibility_off' : 'visibility'"
                                        @click="emit('toggle-history-password', item.id)" />
                                    <q-btn flat dense round size="sm" icon="content_copy"
                                        @click="emit('copy-history-password', item.password)" />
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </q-expansion-item>
        </q-card>
    </q-dialog>
</template>

<style scoped>
/* Preview notes box */
.preview-notes-box {
    background: #f5f5f5 !important;
    color: #333 !important;
}
</style>

<style>
body.body--dark .preview-notes-box,
.lemonade-dark .preview-notes-box,
.body--dark .preview-notes-box {
    background: transparent !important;
    color: #e6edf3 !important;
    border: 1px solid #30363d;
}
</style>
