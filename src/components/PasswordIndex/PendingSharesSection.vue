<script setup>
import { defineOptions } from 'vue'
import { useI18n } from 'vue-i18n'

defineOptions({
    name: 'PendingSharesSection'
})

defineProps({
    shares: {
        type: Array,
        required: true
    },
    isAccepting: {
        type: Object,
        default: () => ({})
    },
    isRejecting: {
        type: Object,
        default: () => ({})
    },
    isBlocking: {
        type: Object,
        default: () => ({})
    }
})

const emit = defineEmits(['accept', 'reject', 'block'])

const { t } = useI18n()
</script>

<template>
    <div class="q-pa-sm">
        <div class="text-subtitle2 text-weight-medium q-mb-sm row items-center text-orange-7">
            <q-icon name="inbox" color="orange-7" class="q-mr-sm" size="xs" />
            {{ t('sharing.pendingSharesCount', { count: shares.length }) }}
        </div>

        <div class="pending-shares-container">
            <q-card
                v-for="share in shares"
                :key="share.id"
                class="pending-share-card"
                flat
                bordered
            >
                <q-card-section class="q-pa-sm">
                    <div class="row items-center no-wrap">
                        <q-avatar size="28px" class="q-mr-sm">
                            <img v-if="share.fromUserPhoto" :src="share.fromUserPhoto" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
                            <q-icon v-else name="person" color="grey-6" />
                        </q-avatar>
                        <div class="col" style="min-width: 0;">
                            <div class="text-body2 text-weight-medium ellipsis">{{ share.passwordData.title }}</div>
                            <div class="text-caption text-grey-6">
                                {{ t('sharing.sharedBy', { user: share.fromUserName }) }}
                            </div>
                        </div>
                        <div class="row no-wrap q-gutter-md q-ml-sm">
                            <q-btn
                                unelevated
                                round
                                dense
                                size="sm"
                                color="grey-7"
                                icon="block"
                                :loading="isBlocking[share.id]"
                                @click="emit('block', share)"
                            >
                                <q-tooltip>{{ t('sharing.blockUser') }}</q-tooltip>
                            </q-btn>
                            <q-btn
                                unelevated
                                round
                                dense
                                size="sm"
                                color="red"
                                icon="close"
                                :loading="isRejecting[share.id]"
                                @click="emit('reject', share)"
                            >
                                <q-tooltip>{{ t('sharing.reject') }}</q-tooltip>
                            </q-btn>
                            <q-btn
                                unelevated
                                round
                                dense
                                size="sm"
                                color="positive"
                                icon="check"
                                :loading="isAccepting[share.id]"
                                @click="emit('accept', share)"
                            >
                                <q-tooltip>{{ t('sharing.accept') }}</q-tooltip>
                            </q-btn>
                        </div>
                    </div>
                </q-card-section>
            </q-card>
        </div>

        <q-separator class="q-my-md" />
    </div>
</template>

<style scoped>
/* Container para pending shares - stack en mobile, row en desktop */
.pending-shares-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

@media (min-width: 600px) {
    .pending-shares-container {
        flex-direction: row;
        flex-wrap: wrap;
        gap: 16px;
    }
}

/* Estilos para cards de passwords compartidos pendientes */
.pending-share-card {
    width: 100%;
    background: linear-gradient(135deg, rgba(255, 152, 0, 0.08) 0%, rgba(255, 193, 7, 0.08) 100%);
    border-color: rgba(255, 152, 0, 0.3) !important;
    transition: all 0.2s ease;
}

@media (min-width: 600px) {
    .pending-share-card {
        width: auto;
        min-width: 280px;
        max-width: 350px;
    }
}

.pending-share-card:hover {
    box-shadow: 0 2px 8px rgba(255, 152, 0, 0.15);
}
</style>

<style>
.lemonade-dark .pending-share-card {
    background: linear-gradient(135deg, rgba(255, 152, 0, 0.12) 0%, rgba(255, 193, 7, 0.08) 100%);
    border-color: rgba(255, 152, 0, 0.4) !important;
}
</style>
