<script setup>
import { defineOptions } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'

defineOptions({
    name: 'PasswordListView'
})

const props = defineProps({
    entries: {
        type: Array,
        required: true
    },
    securityMap: {
        type: Map,
        required: true
    },
    scrollHeight: {
        type: String,
        default: '60vh'
    },
    canUseAIAnalysis: {
        type: Boolean,
        default: false
    }
})

const emit = defineEmits([
    'preview', 'edit', 'delete', 'share', 'highlight',
    'copy-username', 'copy-password', 'copy-all', 'open-url',
    'security-details', 'dismiss-warning', 'reset-warning'
])

const $q = useQuasar()
const { t } = useI18n()

// Touch handling for mobile
let touchTimer = null
let currentTouchEntry = null

const onDotTouchStart = (entryId) => {
    currentTouchEntry = entryId
    touchTimer = setTimeout(() => {
        emit('reset-warning', entryId)
        touchTimer = null
    }, 500)
}

const onDotTouchEnd = () => {
    if (touchTimer) {
        clearTimeout(touchTimer)
        touchTimer = null
        if (currentTouchEntry) {
            emit('reset-warning', currentTouchEntry)
        }
    }
    currentTouchEntry = null
}
</script>

<template>
    <div class="q-pa-sm margin-negativo-custom">
        <q-virtual-scroll
            :items="entries"
            :virtual-scroll-item-size="88"
            :virtual-scroll-slice-size="30"
            :virtual-scroll-slice-ratio-before="1.5"
            :virtual-scroll-slice-ratio-after="2"
            v-slot="{ item: entry }"
            :style="{ maxHeight: scrollHeight }"
            class="virtual-scroll-gpu"
        >
        <div :key="entry.id" class="q-mb-md q-mt-md">
        <q-card @click="emit('preview', entry)"
            :class="securityMap.get(entry.id)?.cardClassString" class="password-card" flat bordered>
            <q-card-section>
                <div class="row items-center no-wrap">
                    <div class="col">
                        <div :class="$q.screen.lt.sm ? 'list-card-title-mobile' : 'text-h6'">
                            {{ entry.title || entry.name }}
                            <q-badge v-if="entry.totpSecret" color="blue" text-color="white" class="q-ml-xs" style="font-size: 10px;">
                                2FA
                            </q-badge>
                        </div>
                        <div :class="$q.screen.lt.sm ? 'list-card-subtitle-mobile' : 'text-subtitle2'">
                            {{ entry.username }}
                        </div>
                    </div>
                    <div class="col-auto row items-center q-gutter-xs">
                        <!-- Indicador AGRESIVO: Contrasena comprometida -->
                        <q-btn v-if="canUseAIAnalysis && securityMap.get(entry.id)?.isCompromised"
                            round flat size="md" icon="dangerous" color="negative"
                            class="list-compromised-btn pulsing-danger"
                            @click.stop.prevent="emit('security-details', entry.id)"
                            :aria-label="$t('passwords.security.compromisedTitle')">
                            <q-tooltip v-if="$q.screen.gt.xs" class="bg-red-8 text-white" max-width="400px">
                                <div class="text-weight-bold text-h6">{{ $t('passwords.security.compromisedTitle') }}</div>
                                <div class="q-mt-sm text-body2 text-weight-medium">
                                    {{ $t('passwords.security.criticalRisk') }}
                                </div>
                                <div class="q-mt-sm text-caption text-weight-bold"
                                    style="background: rgba(255,255,255,0.2); padding: 4px 8px; border-radius: 4px;">
                                    {{ $t('passwords.security.changePassword').toUpperCase() }}
                                </div>
                            </q-tooltip>
                        </q-btn>
                        <!-- Indicador SUAVE: Contrasena debil -->
                        <q-btn
                            v-else-if="canUseAIAnalysis && securityMap.get(entry.id)?.isWeak"
                            round flat size="md" icon="info" color="orange-6"
                            class="list-weak-btn gentle-warning" @click.stop.prevent="emit('security-details', entry.id)"
                            :aria-label="$t('passwords.security.weakDetected')">
                            <q-tooltip v-if="$q.screen.gt.xs" class="bg-orange-6 text-white"
                                max-width="350px">
                                <div class="row items-center justify-between">
                                    <div class="text-weight-medium">{{ $t('passwords.security.improvableTitle') }}</div>
                                    <q-btn round flat size="xs" icon="close" color="white"
                                        @click.stop="emit('dismiss-warning', entry.id, $event)"
                                        style="margin: -4px;">
                                        <q-tooltip class="bg-grey-8">{{ $t('passwords.security.dontRemind') }}</q-tooltip>
                                    </q-btn>
                                </div>
                                <div class="q-mt-xs text-caption" style="opacity: 0.9">
                                    {{ $t('passwords.security.recommendations') }}
                                </div>
                            </q-tooltip>
                        </q-btn>
                        <!-- Indicador de contrasena reutilizada -->
                        <q-btn
                            v-if="securityMap.get(entry.id)?.isReused"
                            round flat size="sm" icon="content_copy" color="orange-8"
                            class="list-reused-btn"
                            @click.stop>
                            <q-tooltip class="bg-orange-8 text-white" max-width="300px">
                                <div class="text-weight-bold">{{ t('passwords.reused.badge') }}</div>
                                <div class="q-mt-xs text-caption">
                                    {{ t('passwords.reused.description') }}
                                </div>
                            </q-tooltip>
                        </q-btn>
                        <!-- Puntito interactivo para avisos descartados -->
                        <q-btn
                            v-else-if="securityMap.get(entry.id)?.isDismissed"
                            round flat size="sm" class="dismissed-dot-btn"
                            @click.stop="emit('reset-warning', entry.id)"
                            @touchstart.passive="onDotTouchStart(entry.id, $event)"
                            @touchend.passive="onDotTouchEnd"
                            :aria-label="$t('passwords.security.dismissedWarning')">
                            <div class="dismissed-dot-large"></div>
                            <q-tooltip class="bg-orange-6 text-white" max-width="300px">
                                <div class="text-weight-medium">{{ $t('passwords.security.dismissedWarning') }}</div>
                                <div class="q-mt-xs text-caption">
                                    {{ $t('passwords.security.dismissedWarningHint') }}
                                </div>
                                <div class="q-mt-sm text-caption text-weight-medium">
                                    {{ $t('passwords.security.clickToReanalyze') }}
                                </div>
                            </q-tooltip>
                        </q-btn>
                        <!-- Indicador de contrasena antigua -->
                        <q-icon
                            v-if="securityMap.get(entry.id)?.showOldBadge"
                            name="schedule"
                            color="grey-6"
                            size="18px"
                            class="q-mr-sm cursor-pointer"
                            @click.stop>
                            <q-tooltip class="bg-grey-8 text-white" max-width="300px">
                                <div class="text-weight-bold">{{ securityMap.get(entry.id)?.passwordAge }}</div>
                                <div class="q-mt-xs text-caption">
                                    {{ $t('passwords.security.oldPasswordHint', { age: securityMap.get(entry.id)?.passwordAge }) }}
                                </div>
                                <div class="q-mt-sm text-caption">
                                    {{ $t('passwords.security.considerUpdating') }}
                                </div>
                            </q-tooltip>
                        </q-icon>
                        <!-- Estrella de favorito -->
                        <q-btn v-if="entry.highlighted" round flat size="md" icon="star" color="green-6"
                            class="list-star-btn" @click.stop="emit('highlight', entry)"
                            :aria-label="$t('passwords.security.removeFromFavorites')" />
                        <q-btn color="grey-7" round flat icon="more_vert" @click.stop="() => { }"
                            :aria-label="$t('passwords.security.entryOptions')">
                            <q-menu cover auto-close>
                                <q-list>
                                    <q-item clickable @click="emit('preview', entry)">
                                        <q-item-section avatar>
                                            <q-icon name="visibility" />
                                        </q-item-section>
                                        <q-item-section>{{ $t('passwords.menu.view') }}</q-item-section>
                                    </q-item>
                                    <q-item clickable @click="emit('edit', entry)">
                                        <q-item-section avatar>
                                            <q-icon name="edit" />
                                        </q-item-section>
                                        <q-item-section>{{ t('passwords.menu.edit') }}</q-item-section>
                                    </q-item>
                                    <q-separator />
                                    <q-item clickable @click="emit('copy-username', entry.username)">
                                        <q-item-section avatar>
                                            <q-icon name="person" />
                                        </q-item-section>
                                        <q-item-section>Copiar Usuario</q-item-section>
                                    </q-item>
                                    <q-item clickable @click="emit('copy-password', entry)">
                                        <q-item-section avatar>
                                            <q-icon name="vpn_key" />
                                        </q-item-section>
                                        <q-item-section>Copiar Password</q-item-section>
                                    </q-item>
                                    <q-item clickable @click="emit('copy-all', entry)">
                                        <q-item-section avatar>
                                            <q-icon name="copy_all" />
                                        </q-item-section>
                                        <q-item-section>Copiar Todo</q-item-section>
                                    </q-item>
                                    <q-item clickable @click="emit('share', entry)">
                                        <q-item-section avatar>
                                            <q-icon name="share" color="green-6" />
                                        </q-item-section>
                                        <q-item-section class="text-green-7">{{ t('passwords.menu.share') }}</q-item-section>
                                    </q-item>
                                    <q-separator />
                                    <q-item clickable @click="emit('highlight', entry)">
                                        <q-item-section avatar>
                                            <q-icon :name="entry.highlighted ? 'star_border' : 'star'" />
                                        </q-item-section>
                                        <q-item-section>{{ entry.highlighted ? t('passwords.menu.unhighlight') : t('passwords.menu.highlight') }}</q-item-section>
                                    </q-item>
                                    <q-item clickable @click="emit('delete', entry)">
                                        <q-item-section avatar>
                                            <q-icon name="delete" color="negative" />
                                        </q-item-section>
                                        <q-item-section class="text-negative">{{ t('passwords.menu.delete') }}</q-item-section>
                                    </q-item>
                                </q-list>
                            </q-menu>
                        </q-btn>
                    </div>
                </div>
            </q-card-section>
        </q-card>
        </div>
        </q-virtual-scroll>
    </div>
</template>

<style scoped>
@import './password-security.css';

.margin-negativo-custom {
    margin-top: -25px;
}

/* GPU-accelerated virtual scroll */
.virtual-scroll-gpu {
    will-change: transform;
}

.virtual-scroll-gpu :deep(.q-virtual-scroll__content > *) {
    contain: layout style;
}

/* Password Cards */
.password-card {
    position: relative;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 12px !important;
}

.password-card:hover {
    transform: translateY(-2px);
}

/* List card mobile typography */
.list-card-title-mobile {
    font-size: 1.1rem;
    font-weight: 500;
    line-height: 1.3;
}
.list-card-subtitle-mobile {
    font-size: 0.75rem;
    line-height: 1.3;
    opacity: 0.7;
}

/* List view star button */
.list-star-btn {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.list-star-btn:hover {
    transform: scale(1.1);
}

/* Security indicators for list view */
.list-warning-btn {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.list-warning-btn:hover {
    transform: scale(1.1);
}

.list-security-btn {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.list-security-btn:hover {
    transform: scale(1.1);
}
</style>

<style>
/* Dark theme star glow for list view */
.lemonade-dark .list-star-btn {
    filter: brightness(1.3) drop-shadow(0 0 3px #66BB6A);
}
</style>
