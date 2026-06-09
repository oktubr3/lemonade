<script setup>
import { defineOptions } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({
    name: 'TotpSetupDialog'
})

defineProps({
    modelValue: {
        type: Boolean,
        default: false
    },
    showQrScanner: {
        type: Boolean,
        default: false
    },
    totpSecretInput: {
        type: String,
        default: ''
    },
    isSavingTotp: {
        type: Boolean,
        default: false
    }
})

const emit = defineEmits([
    'update:modelValue', 'start-scanner', 'stop-scanner',
    'save-secret', 'update:totpSecretInput'
])

const { t } = useI18n()
</script>

<template>
    <q-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)"
        @hide="emit('stop-scanner')">
        <q-card style="min-width: 350px; max-width: 450px;">
            <q-card-section>
                <div class="text-h6">{{ t('passwords.totp.setup') }}</div>
            </q-card-section>
            <q-card-section>
                <!-- QR Scanner -->
                <div v-if="showQrScanner" class="qr-scanner-container q-mb-md">
                    <video class="qr-video">
                        <!-- Video element managed by parent via ref -->
                    </video>
                    <q-btn round flat icon="close" color="white" class="qr-close-btn" @click="emit('stop-scanner')" />
                </div>
                <div v-else class="text-center q-mb-md">
                    <q-btn outline icon="qr_code_scanner" :label="t('passwords.totp.scanQr')"
                        color="primary" @click="emit('start-scanner')" class="full-width" />
                </div>
                <div class="text-center text-caption text-grey q-mb-sm">{{ t('passwords.totp.orManual') }}</div>
                <q-input :model-value="totpSecretInput"
                    @update:model-value="emit('update:totpSecretInput', $event)"
                    outlined
                    :label="t('passwords.totp.secret')"
                    :hint="t('passwords.totp.secretHint')" />
            </q-card-section>
            <q-card-actions align="right">
                <q-btn flat :label="t('common.cancel')" v-close-popup />
                <q-btn color="primary" :label="t('common.save')"
                    :loading="isSavingTotp" :disable="!totpSecretInput"
                    @click="emit('save-secret')" />
            </q-card-actions>
        </q-card>
    </q-dialog>
</template>

<style scoped>
.qr-scanner-container {
    position: relative;
    border-radius: 12px;
    overflow: hidden;
    background: #000;
    aspect-ratio: 1;
    max-height: 300px;
}

.qr-video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
}

.qr-close-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    background: rgba(0, 0, 0, 0.5);
    z-index: 1;
}
</style>
