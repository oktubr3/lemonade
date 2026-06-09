<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useThemeStore } from 'stores/theme';

const { t } = useI18n();

const props = defineProps({
    show: {
        type: Boolean,
        default: false
    },
    conflicts: {
        type: Array,
        default: () => []
        // Array of { incoming: project, existing: project }
    }
});

const emit = defineEmits(['resolve', 'cancel']);

const themeStore = useThemeStore();

// State - resolution per project
const resolutions = ref({});

// Initialize resolutions when conflicts change
watch(() => props.conflicts, (newConflicts) => {
    resolutions.value = {};
    newConflicts.forEach(conflict => {
        resolutions.value[conflict.incoming.sourceFolder] = 'skip'; // Default: skip
    });
}, { immediate: true });

const dialogModel = computed({
    get: () => props.show,
    set: (val) => {
        if (!val) emit('cancel');
    }
});

// Resolution options
const resolutionOptions = computed(() => [
    {
        value: 'skip',
        label: t('envVault.conflictDialog.skip'),
        description: t('envVault.conflictDialog.skipDesc'),
        icon: 'block',
        color: 'grey'
    },
    {
        value: 'replace',
        label: t('envVault.conflictDialog.replace'),
        description: t('envVault.conflictDialog.replaceDesc'),
        icon: 'swap_horiz',
        color: 'warning'
    },
    {
        value: 'merge',
        label: t('envVault.conflictDialog.merge'),
        description: t('envVault.conflictDialog.mergeDesc'),
        icon: 'merge_type',
        color: 'primary'
    },
    {
        value: 'rename',
        label: t('envVault.conflictDialog.rename'),
        description: t('envVault.conflictDialog.renameDesc'),
        icon: 'drive_file_rename_outline',
        color: 'positive'
    }
]);

// Computed
const conflictsCount = computed(() => props.conflicts.length);
const resolvedCount = computed(() => {
    return Object.values(resolutions.value).filter(r => r !== null).length;
});

// Methods
function setResolution(sourceFolder, resolution) {
    resolutions.value[sourceFolder] = resolution;
}

function getResolution(sourceFolder) {
    return resolutions.value[sourceFolder] || 'skip';
}

function applyToAll(resolution) {
    props.conflicts.forEach(conflict => {
        resolutions.value[conflict.incoming.sourceFolder] = resolution;
    });
}

function handleConfirm() {
    const result = props.conflicts.map(conflict => ({
        incoming: conflict.incoming,
        existing: conflict.existing,
        resolution: resolutions.value[conflict.incoming.sourceFolder] || 'skip'
    }));
    emit('resolve', result);
}

function getComparisonStats(incoming, existing) {
    const incomingVars = incoming.files.reduce((acc, f) => acc + f.variables.length, 0);
    const existingVars = existing.variablesCount || 0;

    return {
        incomingVars,
        existingVars,
        incomingFiles: incoming.files.length,
        existingFiles: existing.envFilesCount || 0
    };
}
</script>

<template>
    <q-dialog v-model="dialogModel" persistent>
        <q-card class="conflict-dialog" :class="themeStore.themeClass">
            <!-- Header -->
            <q-card-section class="dialog-header">
                <div class="header-icon">
                    <q-icon name="warning" size="32px" color="warning" />
                </div>
                <div class="header-text">
                    <h3>{{ t('envVault.conflictDialog.title') }}</h3>
                    <p>{{ t('envVault.conflictDialog.subtitle', { count: conflictsCount }) }}</p>
                </div>
                <q-btn flat round icon="close" v-close-popup class="close-btn" />
            </q-card-section>

            <q-separator />

            <!-- Quick actions -->
            <q-card-section class="quick-actions">
                <span class="quick-label">{{ t('envVault.conflictDialog.applyToAll') }}</span>
                <q-btn
                    v-for="option in resolutionOptions"
                    :key="option.value"
                    :label="option.label"
                    :color="option.color"
                    size="sm"
                    outline
                    dense
                    @click="applyToAll(option.value)"
                />
            </q-card-section>

            <q-separator />

            <!-- Conflicts list -->
            <q-card-section class="conflicts-list">
                <div
                    v-for="conflict in conflicts"
                    :key="conflict.incoming.sourceFolder"
                    class="conflict-item"
                >
                    <!-- Project info -->
                    <div class="project-comparison">
                        <!-- Incoming -->
                        <div class="project-info incoming">
                            <span class="project-icon">{{ conflict.incoming.icon }}</span>
                            <div class="project-details">
                                <span class="project-name">{{ conflict.incoming.name }}</span>
                                <span class="project-meta">
                                    {{ t('envVault.conflictDialog.filesCount', { count: conflict.incoming.files.length }) }},
                                    {{ t('envVault.conflictDialog.varsCount', { count: getComparisonStats(conflict.incoming, conflict.existing).incomingVars }) }}
                                </span>
                                <q-badge color="primary" :label="t('envVault.conflictDialog.badgeNew')" size="xs" />
                            </div>
                        </div>

                        <q-icon name="compare_arrows" size="24px" class="compare-icon" />

                        <!-- Existing -->
                        <div class="project-info existing">
                            <span class="project-icon">{{ conflict.existing.icon }}</span>
                            <div class="project-details">
                                <span class="project-name">{{ conflict.existing.name }}</span>
                                <span class="project-meta">
                                    {{ t('envVault.conflictDialog.filesCount', { count: conflict.existing.envFilesCount || 0 }) }},
                                    {{ t('envVault.conflictDialog.varsCount', { count: conflict.existing.variablesCount || 0 }) }}
                                </span>
                                <q-badge color="grey" :label="t('envVault.conflictDialog.badgeExisting')" size="xs" />
                            </div>
                        </div>
                    </div>

                    <!-- Resolution options -->
                    <div class="resolution-options">
                        <q-btn-toggle
                            v-model="resolutions[conflict.incoming.sourceFolder]"
                            spread
                            no-caps
                            toggle-color="primary"
                            :options="resolutionOptions.map(o => ({
                                value: o.value,
                                label: o.label,
                                icon: o.icon
                            }))"
                            class="resolution-toggle"
                        />
                        <p class="resolution-description">
                            {{ resolutionOptions.find(o => o.value === getResolution(conflict.incoming.sourceFolder))?.description }}
                        </p>
                    </div>
                </div>
            </q-card-section>

            <q-separator />

            <!-- Actions -->
            <q-card-actions align="right" class="dialog-actions">
                <q-btn
                    flat
                    :label="t('common.cancel')"
                    @click="emit('cancel')"
                />
                <q-btn
                    unelevated
                    :label="t('envVault.conflictDialog.apply')"
                    color="primary"
                    @click="handleConfirm"
                />
            </q-card-actions>
        </q-card>
    </q-dialog>
</template>

<style lang="scss" scoped>
.conflict-dialog {
    width: 600px;
    max-width: 95vw;
    max-height: 90vh;
    border-radius: 16px;
}

.dialog-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 20px;
}

.header-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: rgba(255, 193, 7, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
}

.header-text {
    flex: 1;

    h3 {
        margin: 0;
        font-size: 1.2rem;
        font-weight: 600;
        color: var(--text-primary, #333);
    }

    p {
        margin: 4px 0 0 0;
        font-size: 0.85rem;
        color: var(--text-secondary, #666);
    }
}

.lemonade-dark .header-text h3 {
    color: #F0F6FC;
}

.lemonade-dark .header-text p {
    color: #8B949E;
}

.close-btn {
    color: var(--text-secondary, #666);
}

.quick-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 12px 20px;
    background: var(--bg-secondary, #f5f5f5);
}

.lemonade-dark .quick-actions {
    background: #161B22;
}

.quick-label {
    font-size: 0.85rem;
    color: var(--text-secondary, #666);
    margin-right: 8px;
}

.lemonade-dark .quick-label {
    color: #8B949E;
}

.conflicts-list {
    max-height: 400px;
    overflow-y: auto;
    padding: 16px 20px;
}

.conflict-item {
    background: var(--bg-secondary, #f5f5f5);
    border-radius: 12px;
    padding: 16px;
    margin-bottom: 16px;

    &:last-child {
        margin-bottom: 0;
    }
}

.lemonade-dark .conflict-item {
    background: #161B22;
}

.project-comparison {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
}

.project-info {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px;
    border-radius: 8px;
    background: var(--bg-primary, #fff);
}

.lemonade-dark .project-info {
    background: #0D1117;
}

.project-icon {
    font-size: 1.5rem;
}

.project-details {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.project-name {
    font-weight: 600;
    color: var(--text-primary, #333);
    font-size: 0.95rem;
}

.lemonade-dark .project-name {
    color: #F0F6FC;
}

.project-meta {
    font-size: 0.75rem;
    color: var(--text-secondary, #666);
}

.lemonade-dark .project-meta {
    color: #8B949E;
}

.compare-icon {
    color: var(--text-secondary, #999);
    flex-shrink: 0;
}

.resolution-options {
    text-align: center;
}

.resolution-toggle {
    width: 100%;

    :deep(.q-btn) {
        flex: 1;
        font-size: 0.8rem;
    }
}

.resolution-description {
    margin: 8px 0 0 0;
    font-size: 0.8rem;
    color: var(--text-secondary, #666);
    font-style: italic;
}

.lemonade-dark .resolution-description {
    color: #8B949E;
}

.dialog-actions {
    padding: 16px 20px;
}

// Theme variables
.lemonade-dark {
    --text-primary: #F0F6FC;
    --text-secondary: #8B949E;
    --bg-primary: #0D1117;
    --bg-secondary: #161B22;
    --border-color: #30363D;
}

.lemonade-light {
    --text-primary: #2C3E50;
    --text-secondary: #666;
    --bg-primary: #FFFFFF;
    --bg-secondary: #F5F5F5;
    --border-color: #E0E0E0;
}

@media (max-width: 599px) {
    .project-comparison {
        flex-direction: column;
    }

    .compare-icon {
        transform: rotate(90deg);
    }
}
</style>
