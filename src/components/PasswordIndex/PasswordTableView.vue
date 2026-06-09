<script setup>
import { defineOptions } from 'vue'
import { useQuasar } from 'quasar'
import { useI18n } from 'vue-i18n'

defineOptions({
    name: 'PasswordTableView'
})

defineProps({
    entries: {
        type: Array,
        required: true
    },
    columns: {
        type: Array,
        required: true
    },
    securityMap: {
        type: Map,
        required: true
    },
    scrollHeight: {
        type: String,
        default: '55vh'
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
</script>

<template>
    <div class="q-px-sm q-pb-sm table-view-container">
        <q-table
            flat
            bordered
            :dense="$q.screen.lt.md"
            :rows="entries"
            :columns="columns"
            row-key="id"
            :rows-per-page-options="[0]"
            hide-pagination
            virtual-scroll
            :virtual-scroll-item-size="48"
            :virtual-scroll-sticky-size-start="48"
            :virtual-scroll-slice-size="40"
            :virtual-scroll-slice-ratio-before="1.5"
            :virtual-scroll-slice-ratio-after="2"
            class="password-table"
            :table-header-class="'password-table-header'"
            :style="{ maxHeight: scrollHeight }"
        >
            <!-- Clases dinamicas por fila segun seguridad -->
            <template v-slot:body="props">
                <q-tr :key="props.row.id" :props="props" :class="securityMap.get(props.row.id)?.tableRowClassString">
                    <!-- Columna de seguridad (solo desktop) -->
                    <q-td v-if="!$q.screen.lt.sm" key="security" :props="props" class="security-cell" @click.stop>
                        <q-btn
                            v-if="canUseAIAnalysis && securityMap.get(props.row.id)?.isCompromised"
                            round flat size="xs" icon="warning" color="negative"
                            class="table-security-btn pulsing-danger-small"
                            @click.stop.prevent="emit('security-details', props.row.id)">
                            <q-tooltip class="bg-red-8">{{ $t('passwords.filters.compromised') }}</q-tooltip>
                        </q-btn>
                        <q-btn
                            v-else-if="canUseAIAnalysis && securityMap.get(props.row.id)?.isWeak"
                            round flat size="xs" icon="info" color="orange-6"
                            class="table-security-btn gentle-warning-small"
                            @click.stop.prevent="emit('security-details', props.row.id)">
                            <q-tooltip class="bg-orange-6">{{ $t('passwords.security.improvable') }}</q-tooltip>
                        </q-btn>
                        <div
                            v-else-if="securityMap.get(props.row.id)?.isDismissed"
                            class="table-dismissed-dot"
                            @click.stop="emit('reset-warning', props.row.id)">
                            <q-tooltip class="bg-orange-6">{{ $t('passwords.security.dismissedWarning') }} - {{ $t('passwords.security.clickToReanalyze') }}</q-tooltip>
                        </div>
                        <q-icon
                            v-else-if="securityMap.get(props.row.id)?.isReused"
                            name="content_copy"
                            color="orange-8"
                            size="16px">
                            <q-tooltip class="bg-orange-8">{{ $t('passwords.reused.badge') }}</q-tooltip>
                        </q-icon>
                        <div
                            v-else-if="securityMap.get(props.row.id)?.showOldBadge"
                            class="table-age-dot">
                            <q-tooltip class="bg-grey-8">{{ $t('passwords.security.oldPassword') }}: {{ securityMap.get(props.row.id)?.passwordAge }}</q-tooltip>
                        </div>
                    </q-td>
                    <q-td key="title" :props="props" class="cursor-pointer title-cell" @click="emit('preview', props.row)">
                        <div class="row no-wrap items-center">
                            <span class="ellipsis-text">{{ props.row.title || props.row.name }}</span>
                            <q-badge v-if="props.row.totpSecret" color="blue" text-color="white" class="q-ml-xs" style="font-size: 10px;">
                                2FA
                            </q-badge>
                        </div>
                        <div class="mobile-username text-grey-7">{{ props.row.username }}</div>
                    </q-td>
                    <q-td v-if="!$q.screen.lt.sm" key="username" :props="props" class="username-cell">
                        <span class="ellipsis-text text-grey-7">{{ props.row.username }}</span>
                    </q-td>
                    <q-td key="highlighted" :props="props" class="star-cell">
                        <q-btn
                            v-if="props.row.highlighted"
                            round flat size="xs" icon="star" color="green-6"
                            @click.stop="emit('highlight', props.row)">
                            <q-tooltip>{{ $t('passwords.menu.unhighlight') }}</q-tooltip>
                        </q-btn>
                    </q-td>
                    <q-td key="actions" :props="props" class="actions-cell">
                        <div class="row no-wrap items-center justify-end">
                            <!-- Grupo de acciones principales -->
                            <q-btn-group flat class="action-btn-group">
                                <!-- Boton de seguridad comprometida (solo mobile) -->
                                <q-btn
                                    v-if="$q.screen.lt.sm && canUseAIAnalysis && securityMap.get(props.row.id)?.isCompromised"
                                    flat
                                    dense
                                    size="sm"
                                    icon="warning"
                                    color="negative"
                                    class="action-btn pulsing-danger-small"
                                    @click.stop="emit('security-details', props.row.id)">
                                    <q-tooltip :delay="400" class="bg-red-8">{{ $t('passwords.filters.compromised') }}</q-tooltip>
                                </q-btn>
                                <!-- Boton de seguridad debil (solo mobile) -->
                                <q-btn
                                    v-else-if="$q.screen.lt.sm && canUseAIAnalysis && securityMap.get(props.row.id)?.isWeak"
                                    flat
                                    dense
                                    size="sm"
                                    icon="warning"
                                    color="orange-6"
                                    class="action-btn"
                                    @click.stop="emit('security-details', props.row.id)">
                                    <q-tooltip :delay="400" class="bg-orange-6">{{ $t('passwords.security.improvable') }}</q-tooltip>
                                </q-btn>
                                <!-- Boton de reutilizada (solo mobile) -->
                                <q-btn
                                    v-if="$q.screen.lt.sm && securityMap.get(props.row.id)?.isReused"
                                    flat
                                    dense
                                    size="sm"
                                    icon="content_copy"
                                    color="orange-8"
                                    class="action-btn"
                                    @click.stop>
                                    <q-tooltip :delay="400" class="bg-orange-8">{{ $t('passwords.reused.badge') }}</q-tooltip>
                                </q-btn>
                                <q-btn
                                    v-if="props.row.url"
                                    flat
                                    dense
                                    size="sm"
                                    icon="open_in_new"
                                    class="action-btn action-btn-primary"
                                    @click.stop="emit('open-url', props.row)">
                                    <q-tooltip :delay="400">{{ $t('passwords.openUrl') }}</q-tooltip>
                                </q-btn>
                                <q-btn
                                    flat
                                    dense
                                    size="sm"
                                    icon="person"
                                    class="action-btn"
                                    @click.stop="emit('copy-username', props.row.username)">
                                    <q-tooltip :delay="400">{{ $t('passwords.copyUsername') }}</q-tooltip>
                                </q-btn>
                                <q-btn
                                    flat
                                    dense
                                    size="sm"
                                    icon="vpn_key"
                                    class="action-btn"
                                    @click.stop="emit('copy-password', props.row)">
                                    <q-tooltip :delay="400">{{ $t('passwords.copyPassword') }}</q-tooltip>
                                </q-btn>
                            </q-btn-group>
                            <q-btn round flat size="xs" icon="more_vert" color="grey-7"
                                @click.stop="() => {}">
                                <q-menu cover auto-close>
                                    <q-list dense style="min-width: 140px">
                                        <q-item clickable @click="emit('preview', props.row)">
                                            <q-item-section avatar><q-icon name="visibility" /></q-item-section>
                                            <q-item-section>{{ $t('passwords.menu.view') }}</q-item-section>
                                        </q-item>
                                        <q-item clickable @click="emit('edit', props.row)">
                                            <q-item-section avatar><q-icon name="edit" /></q-item-section>
                                            <q-item-section>{{ t('passwords.menu.edit') }}</q-item-section>
                                        </q-item>
                                        <q-separator />
                                        <q-item clickable @click="emit('copy-all', props.row)">
                                            <q-item-section avatar><q-icon name="copy_all" /></q-item-section>
                                            <q-item-section>{{ t('passwords.menu.copyAll') }}</q-item-section>
                                        </q-item>
                                        <q-item clickable @click="emit('share', props.row)">
                                            <q-item-section avatar><q-icon name="share" color="green-6" /></q-item-section>
                                            <q-item-section class="text-green-7">{{ t('passwords.menu.share') }}</q-item-section>
                                        </q-item>
                                        <q-separator />
                                        <q-item clickable @click="emit('highlight', props.row)">
                                            <q-item-section avatar>
                                                <q-icon :name="props.row.highlighted ? 'star_border' : 'star'" />
                                            </q-item-section>
                                            <q-item-section>{{ props.row.highlighted ? t('passwords.menu.unhighlight') : t('passwords.menu.highlight') }}</q-item-section>
                                        </q-item>
                                        <q-item clickable @click="emit('delete', props.row)">
                                            <q-item-section avatar><q-icon name="delete" color="negative" /></q-item-section>
                                            <q-item-section class="text-negative">{{ t('passwords.menu.delete') }}</q-item-section>
                                        </q-item>
                                    </q-list>
                                </q-menu>
                            </q-btn>
                        </div>
                    </q-td>
                </q-tr>
            </template>
        </q-table>
    </div>
</template>

<style scoped>
@import './password-security.css';

.table-view-container {
    margin-top: 2px;
}

.password-table {
    border-radius: 12px !important;
    background: var(--bg-surface, #ffffff) !important;
}

.password-table .q-table__middle {
    overflow: auto;
}

.password-table .q-table__top {
    padding: 8px 16px;
    background: var(--bg-elevated, #f5f5f5);
}

.password-table thead tr {
    background: var(--bg-elevated, #f5f5f5) !important;
}

.password-table thead tr th {
    font-weight: 600;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-secondary, #666);
    border-bottom: 2px solid var(--border-color, #e0e0e0);
    position: sticky;
    z-index: 1;
}

.password-table thead tr:first-child th {
    top: 0;
    background-color: var(--bg-elevated, #f5f5f5);
}

.password-table tbody tr {
    transition: all 0.2s ease;
}

.password-table tbody tr:hover {
    background: var(--bg-elevated, #f5f5f5) !important;
}

/* Celdas de la tabla */
.password-table .title-cell {
    font-weight: 600;
    color: var(--text-primary, #212121);
}

.password-table .username-cell {
    font-size: 0.9rem;
}

.password-table .security-cell {
    padding: 4px 2px !important;
    text-align: center;
    width: 32px !important;
}

.password-table .star-cell {
    padding: 4px !important;
    text-align: center;
}

.password-table .actions-cell {
    padding: 4px 8px !important;
}

/* Grupo de botones de accion en tabla */
.action-btn-group {
    background: rgba(0, 0, 0, 0.03);
    border-radius: 8px !important;
    padding: 2px;
    margin-right: 4px;
}

.action-btn-group .action-btn {
    min-width: 32px !important;
    min-height: 28px !important;
    padding: 0 6px !important;
    border-radius: 6px !important;
    color: var(--q-grey-7);
    transition: all 0.15s ease;
}

.action-btn-group .action-btn .q-icon {
    font-size: 18px !important;
}

.action-btn-group .action-btn:hover {
    background: rgba(0, 0, 0, 0.08) !important;
    color: var(--q-grey-9);
}

.action-btn-group .action-btn-primary {
    color: var(--q-primary);
}

.action-btn-group .action-btn-primary:hover {
    background: rgba(25, 118, 210, 0.12) !important;
}

/* Ellipsis para textos largos */
.ellipsis-text {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
}

/* Clases de fila para seguridad */
.password-table-row {
    transition: all 0.2s ease;
}

/* Usuario debajo del titulo - oculto por defecto en desktop */
.mobile-username {
    display: none;
}

/* RESPONSIVE MOBILE */
@media (max-width: 599px) {
    .password-table {
        border-radius: 8px !important;
        table-layout: fixed !important;
        width: 100% !important;
    }

    /* Mostrar usuario debajo del titulo en mobile */
    .mobile-username {
        display: block;
        font-size: 0.8rem;
        margin-top: 2px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .password-table thead th {
        font-size: 0.75rem;
        padding: 8px 4px !important;
    }

    .password-table tbody td {
        padding: 6px 4px !important;
        font-size: 0.9rem;
    }

    /* Limitar ancho de columna titulo en mobile */
    .password-table .title-cell {
        max-width: 0;
        overflow: hidden;
        padding-left: 12px !important;
    }

    .password-table .title-cell .ellipsis-text {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* Botones mas pequenos en mobile */
    .password-table .actions-cell .q-btn {
        min-width: 24px !important;
        min-height: 24px !important;
        padding: 2px !important;
    }

    /* Grupo de botones mas compacto en mobile */
    .action-btn-group {
        padding: 1px;
        margin-right: 2px;
    }

    .action-btn-group .action-btn {
        min-width: 28px !important;
        min-height: 24px !important;
        padding: 0 4px !important;
    }

    .action-btn-group .action-btn .q-icon {
        font-size: 16px !important;
    }
}
</style>

<style>
/* TABLA - DARK MODE */
.lemonade-dark .password-table,
.body--dark .password-table {
    background: #161b22 !important;
    border-color: #30363d !important;
}

.lemonade-dark .password-table thead tr,
.body--dark .password-table thead tr {
    background: #21262d !important;
}

.lemonade-dark .password-table thead th,
.body--dark .password-table thead th {
    color: #8b949e !important;
    border-color: #30363d;
}

.lemonade-dark .password-table thead tr:first-child th,
.body--dark .password-table thead tr:first-child th {
    background-color: #21262d;
}

.lemonade-dark .password-table tbody tr:hover,
.body--dark .password-table tbody tr:hover {
    background: #21262d !important;
}

.lemonade-dark .password-table .title-cell,
.body--dark .password-table .title-cell {
    color: #e6edf3;
}

.lemonade-dark .mobile-username,
.body--dark .mobile-username {
    color: #8b949e;
}

.lemonade-dark .action-btn-group,
.body--dark .action-btn-group {
    background: rgba(255, 255, 255, 0.05);
}

.lemonade-dark .action-btn-group .action-btn,
.body--dark .action-btn-group .action-btn {
    color: var(--q-grey-5);
}

.lemonade-dark .action-btn-group .action-btn:hover,
.body--dark .action-btn-group .action-btn:hover {
    background: rgba(255, 255, 255, 0.1) !important;
    color: var(--q-grey-3);
}

.lemonade-dark .action-btn-group .action-btn-primary:hover,
.body--dark .action-btn-group .action-btn-primary:hover {
    background: rgba(25, 118, 210, 0.2) !important;
}
</style>
