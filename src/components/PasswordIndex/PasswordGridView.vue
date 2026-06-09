<script setup>
import { defineOptions } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'

defineOptions({
    name: 'PasswordGridView'
})

const props = defineProps({
    gridRows: {
        type: Array,
        required: true
    },
    gridRowHeight: {
        type: Number,
        default: 160
    },
    gridContainerStyle: {
        type: Object,
        required: true
    },
    scrollHeight: {
        type: String,
        default: '58vh'
    },
    securityMap: {
        type: Map,
        required: true
    },
    canUseAIAnalysis: {
        type: Boolean,
        default: false
    },
    currentGridColumns: {
        type: Number,
        default: 3
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
    <div :class="[$q.screen.lt.sm ? 'q-px-xs' : 'q-px-sm', 'grid-view-container']">
        <q-virtual-scroll
            :items="gridRows"
            :virtual-scroll-item-size="gridRowHeight"
            :virtual-scroll-slice-size="15"
            :virtual-scroll-slice-ratio-before="1"
            :virtual-scroll-slice-ratio-after="2"
            v-slot="{ item: row, index }"
            :style="{ maxHeight: scrollHeight }"
            class="virtual-scroll-gpu"
        >
        <div :key="index" :style="gridContainerStyle" class="main-grid-container q-mb-sm"
            :class="{ 'grid-3-columns': currentGridColumns === 3 }">
            <div v-for="entry in row" :key="entry.id" class="main-grid-item">
                <div class="password-card-square" :class="securityMap.get(entry.id)?.cardClassString"
                    @click="emit('preview', entry)">
                    <div class="square-content">
                        <div class="square-title">
                            {{ entry.title || entry.name }}
                            <q-badge v-if="entry.totpSecret" color="blue" text-color="white" style="font-size: 9px;">
                                2FA
                            </q-badge>
                        </div>
                        <div class="square-username">
                            {{ entry.username }}
                        </div>
                    </div>

                    <!-- Indicador AGRESIVO: Contrasena comprometida (grid view) -->
                    <q-btn v-if="canUseAIAnalysis && securityMap.get(entry.id)?.isCompromised" round
                        flat size="8px" icon="dangerous" color="negative"
                        class="square-compromised-btn pulsing-danger-small"
                        @click.stop.prevent="emit('security-details', entry.id)" :aria-label="$t('passwords.security.compromisedTitle')">
                        <q-tooltip class="bg-red-8 text-white" max-width="350px">
                            <div class="text-weight-bold">{{ $t('passwords.security.compromised') }}</div>
                            <div class="q-mt-xs text-caption text-weight-bold">
                                {{ $t('passwords.security.changePassword').toUpperCase() }}
                            </div>
                        </q-tooltip>
                    </q-btn>
                    <!-- Indicador SUAVE: Contrasena debil (grid view) -->
                    <q-btn
                        v-else-if="canUseAIAnalysis && securityMap.get(entry.id)?.isWeak"
                        round flat size="8px" icon="info" color="orange-6"
                        class="square-weak-btn gentle-warning-small"
                        @click.stop.prevent="emit('security-details', entry.id)" :aria-label="$t('passwords.security.weakDetected')">
                        <q-tooltip v-if="$q.screen.gt.xs" class="bg-orange-6 text-white" max-width="300px">
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
                    <!-- Indicador de contrasena reutilizada (grid view) -->
                    <q-badge v-if="securityMap.get(entry.id)?.isReused"
                        color="orange-8" text-color="white" class="reused-badge-grid"
                        @click.stop>
                        {{ t('passwords.reused.badge') }}
                        <q-tooltip class="bg-orange-8 text-white" max-width="280px">
                            <div class="text-weight-bold">{{ t('passwords.reused.badge') }}</div>
                            <div class="q-mt-xs text-caption">
                                {{ t('passwords.reused.description') }}
                            </div>
                        </q-tooltip>
                    </q-badge>
                    <!-- Puntito interactivo para avisos descartados (vista grid) -->
                    <q-btn
                        v-else-if="securityMap.get(entry.id)?.isDismissed"
                        round flat size="8px" class="dismissed-dot-btn-small"
                        @click.stop="emit('reset-warning', entry.id)"
                        @touchstart.passive="onDotTouchStart(entry.id, $event)"
                        @touchend.passive="onDotTouchEnd"
                        :aria-label="$t('passwords.security.dismissedWarning')">
                        <div class="dismissed-dot-small"></div>
                        <q-tooltip class="bg-orange-6 text-white" max-width="280px">
                            <div class="text-weight-medium">{{ $t('passwords.security.dismissedWarning') }}</div>
                            <div class="q-mt-xs text-caption">
                                {{ $t('passwords.security.dismissedWarningHint') }}
                            </div>
                            <div class="q-mt-xs text-caption text-weight-medium">
                                {{ $t('passwords.security.clickToReanalyze') }}
                            </div>
                        </q-tooltip>
                    </q-btn>
                    <!-- Estrella destacada en esquina superior izquierda -->
                    <q-btn v-else-if="entry.highlighted" round flat size="8px" icon="star" color="green-6"
                        class="square-star-btn" @click.stop="emit('highlight', entry)"
                        :aria-label="$t('passwords.security.removeFromFavorites')" />
                    <!-- Indicador de contrasena antigua - grid view -->
                    <div
                        v-if="securityMap.get(entry.id)?.showOldBadge"
                        class="age-badge"
                        @click.stop>
                        <q-icon name="schedule" size="12px" />
                        <span class="age-badge-text">{{ securityMap.get(entry.id)?.passwordAge }}</span>
                        <q-tooltip class="bg-grey-8 text-white" max-width="280px">
                            <div class="text-weight-bold">{{ $t('passwords.security.oldPassword') }}</div>
                            <div class="q-mt-xs text-caption">
                                {{ $t('passwords.security.oldPasswordHint', { age: securityMap.get(entry.id)?.passwordAge }) }}
                            </div>
                            <div class="q-mt-sm text-caption">
                                {{ $t('passwords.security.considerUpdating') }}
                            </div>
                        </q-tooltip>
                    </div>
                    <q-btn round flat size="8px" icon="more_vert" class="square-menu-btn"
                        @click.stop="() => { }" :aria-label="$t('passwords.security.entryOptions')">
                        <q-menu cover auto-close>
                            <q-list style="min-width: 140px">
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
        </div>
        </q-virtual-scroll>
    </div>
</template>

<style scoped>
@import './password-security.css';

/* GPU-accelerated virtual scroll */
.virtual-scroll-gpu {
    will-change: transform;
}

.virtual-scroll-gpu :deep(.q-virtual-scroll__content > *) {
    contain: layout style;
}

/* Grid Items using CSS Grid */
.grid-view-container {
    margin-top: -6px;
}

.main-grid-container {
    width: 100%;
}

.main-grid-item {
    width: 100%;
}

/* Square Grid Cards */
.password-card-square {
    position: relative;
    cursor: pointer;
    aspect-ratio: 1 / 1;
    background: var(--bg-elevated);
    border: 1px solid var(--border-color);
    border-radius: 16px;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 12px;
    overflow: hidden;
    width: 100%;
    height: 100%;
}

.password-card-square:hover {
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
}

.square-content {
    text-align: center;
    width: 100%;
    position: relative;
    padding: 12px 8px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
}

.square-title {
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary);
    line-height: 1.3;
    margin-bottom: 8px;
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.square-username {
    font-size: 0.95rem;
    color: var(--text-secondary);
    word-break: break-word;
    display: -webkit-box;
    -webkit-line-clamp: 1;
    -webkit-box-orient: vertical;
    overflow: hidden;
}

.square-star-btn {
    position: absolute;
    top: 4px;
    left: 4px;
    min-height: 24px !important;
    min-width: 24px !important;
    width: 24px !important;
    height: 24px !important;
    z-index: 10;
    filter: brightness(1.3) drop-shadow(0 0 4px #4CAF50) drop-shadow(0 0 8px #C8E6C9);
}

.square-menu-btn {
    position: absolute;
    top: 4px;
    right: 4px;
    min-height: 24px !important;
    min-width: 24px !important;
    width: 24px !important;
    height: 24px !important;
    opacity: 0;
    transition: opacity 0.2s ease;
}

.password-card-square:hover .square-menu-btn {
    opacity: 1;
}

/* Security warning buttons for grid view */
.square-warning-btn {
    position: absolute;
    top: 4px;
    left: 4px;
    min-height: 24px !important;
    min-width: 24px !important;
    width: 24px !important;
    height: 24px !important;
    z-index: 10;
    filter: brightness(1.3) drop-shadow(0 0 4px #ff5722) drop-shadow(0 0 8px #ff5722);
}

.square-security-btn {
    position: absolute;
    top: 4px;
    left: 4px;
    min-height: 24px !important;
    min-width: 24px !important;
    width: 24px !important;
    height: 24px !important;
    z-index: 10;
    filter: brightness(1.3) drop-shadow(0 0 4px #ff9800) drop-shadow(0 0 8px #ff9800);
}

/* Reused password badge - grid view */
.reused-badge-grid {
    position: absolute !important;
    bottom: 4px !important;
    left: 4px !important;
    font-size: 9px !important;
    padding: 2px 6px !important;
    z-index: 10;
}

/* Age badge in bottom of card */
.age-badge {
    position: absolute !important;
    bottom: 0 !important;
    left: 0 !important;
    right: 0 !important;
    z-index: 5 !important;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 3px 6px;
    background: rgba(120, 120, 120, 0.85);
    color: white;
    font-size: 10px;
    font-weight: 500;
    border-radius: 0 0 8px 8px;
    backdrop-filter: blur(4px);
    transition: background 0.2s ease;
}

.age-badge:hover {
    background: rgba(100, 100, 100, 0.95);
}

.age-badge-text {
    white-space: nowrap;
}

/* Mobile adjustments */
@media (max-width: 599px) {
    .grid-container {
        gap: 6px !important;
        padding: 6px !important;
    }

    .password-card-square {
        padding: 8px;
        border-radius: 12px;
    }

    .square-title {
        font-size: 1rem;
        margin-bottom: 4px;
    }

    .square-username {
        font-size: 0.9rem;
    }

    /* Tipografia mas pequena para modo 3 columnas en mobile */
    .grid-3-columns .square-title {
        font-size: 0.9rem;
    }

    .grid-3-columns .square-username {
        font-size: 0.8rem;
    }

    .square-menu-btn {
        opacity: 1;
        /* Always visible on mobile */
        top: 2px;
        right: 2px;
    }

    .square-star-btn {
        top: 2px;
        left: 2px;
    }

    .age-dot-btn-small {
        top: 2px;
        left: 2px;
    }
}
</style>

<style>
/* Dark theme star glow */
.lemonade-dark .square-star-btn {
    filter: brightness(1.3) drop-shadow(0 0 4px #66BB6A) drop-shadow(0 0 8px #C8E6C9);
}

/* Dark theme security glow for grid view */
.lemonade-dark .square-warning-btn {
    filter: brightness(1.3) drop-shadow(0 0 4px #ff5722) drop-shadow(0 0 8px #ff1744);
}

.lemonade-dark .square-security-btn {
    filter: brightness(1.3) drop-shadow(0 0 4px #ff9800) drop-shadow(0 0 8px #ffab00);
}

/* Dark theme */
.lemonade-dark .age-badge {
    background: rgba(80, 80, 80, 0.9);
}

.lemonade-dark .age-badge:hover {
    background: rgba(60, 60, 60, 0.95);
}
</style>
