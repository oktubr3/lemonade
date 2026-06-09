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
    projects: {
        type: Array,
        default: () => []
    }
});

const emit = defineEmits(['confirm', 'cancel']);

const themeStore = useThemeStore();

// State
const selectedProjects = ref([]);
const selectedFiles = ref({}); // { projectSourceFolder: [fileName1, fileName2, ...] }
const expandedProject = ref(null);
const editedProjects = ref({}); // { sourceFolder: { name, icon } }
const editingProject = ref(null);
const isImporting = ref(false);

// Initialize selected projects when dialog opens
const dialogModel = computed({
    get: () => props.show,
    set: (val) => {
        if (!val) emit('cancel');
    }
});

// State for AI context files
const selectedAiContextFiles = ref({}); // { projectSourceFolder: [fileName1, fileName2, ...] }

// Watch for new projects and auto-select all
watch(() => props.projects, (newProjects) => {
    isImporting.value = false; // Reset loading state
    selectedProjects.value = newProjects.map(p => p.sourceFolder);
    // Initialize edited projects and selected files with original values
    editedProjects.value = {};
    selectedFiles.value = {};
    selectedAiContextFiles.value = {};
    newProjects.forEach(p => {
        editedProjects.value[p.sourceFolder] = {
            name: p.name,
            icon: p.icon
        };
        // Select all files by default
        selectedFiles.value[p.sourceFolder] = p.files.map(f => f.name);
        // Select all AI context files by default
        if (p.aiContextFiles && p.aiContextFiles.length > 0) {
            selectedAiContextFiles.value[p.sourceFolder] = p.aiContextFiles.map(f => f.name);
        }
    });
}, { immediate: true });

// Computed
const selectedCount = computed(() => selectedProjects.value.length);
const totalVariables = computed(() => {
    let total = 0;
    props.projects
        .filter(p => selectedProjects.value.includes(p.sourceFolder))
        .forEach(p => {
            const selectedFileNames = selectedFiles.value[p.sourceFolder] || [];
            p.files.forEach(f => {
                if (selectedFileNames.includes(f.name)) {
                    total += f.variables.length;
                }
            });
        });
    return total;
});
const totalSelectedFiles = computed(() => {
    let total = 0;
    props.projects
        .filter(p => selectedProjects.value.includes(p.sourceFolder))
        .forEach(p => {
            total += (selectedFiles.value[p.sourceFolder] || []).length;
        });
    return total;
});

const totalAiContextFiles = computed(() => {
    let total = 0;
    props.projects
        .filter(p => selectedProjects.value.includes(p.sourceFolder))
        .forEach(p => {
            total += (selectedAiContextFiles.value[p.sourceFolder] || []).length;
        });
    return total;
});

// Available icons for selection
const availableIcons = ['🔐', '🔥', '☁️', '🔵', '💳', '🗄️', '🔌', '📦', '🚀', '⚡', '🌐', '💾', '🔒', '🛡️', '📱', '💻'];

// Methods
function toggleProject(sourceFolder) {
    const index = selectedProjects.value.indexOf(sourceFolder);
    if (index === -1) {
        selectedProjects.value.push(sourceFolder);
    } else {
        selectedProjects.value.splice(index, 1);
    }
}

function isSelected(sourceFolder) {
    return selectedProjects.value.includes(sourceFolder);
}

function toggleExpand(sourceFolder) {
    if (expandedProject.value === sourceFolder) {
        expandedProject.value = null;
    } else {
        expandedProject.value = sourceFolder;
    }
}

function selectAll() {
    selectedProjects.value = props.projects.map(p => p.sourceFolder);
}

function selectNone() {
    selectedProjects.value = [];
}

function startEditing(sourceFolder) {
    editingProject.value = sourceFolder;
}

function stopEditing() {
    editingProject.value = null;
}

function updateProjectName(sourceFolder, newName) {
    if (editedProjects.value[sourceFolder]) {
        editedProjects.value[sourceFolder].name = newName;
    }
}

function updateProjectIcon(sourceFolder, newIcon) {
    if (editedProjects.value[sourceFolder]) {
        editedProjects.value[sourceFolder].icon = newIcon;
    }
}

function getProjectName(project) {
    return editedProjects.value[project.sourceFolder]?.name || project.name;
}

function getProjectIcon(project) {
    return editedProjects.value[project.sourceFolder]?.icon || project.icon;
}

function isFileSelected(projectSourceFolder, fileName) {
    return (selectedFiles.value[projectSourceFolder] || []).includes(fileName);
}

function toggleFile(projectSourceFolder, fileName) {
    if (!selectedFiles.value[projectSourceFolder]) {
        selectedFiles.value[projectSourceFolder] = [];
    }
    const index = selectedFiles.value[projectSourceFolder].indexOf(fileName);
    if (index === -1) {
        selectedFiles.value[projectSourceFolder].push(fileName);
    } else {
        selectedFiles.value[projectSourceFolder].splice(index, 1);
    }
}

function getSelectedFilesCount(project) {
    return (selectedFiles.value[project.sourceFolder] || []).length;
}

function isAiContextFileSelected(projectSourceFolder, fileName) {
    return (selectedAiContextFiles.value[projectSourceFolder] || []).includes(fileName);
}

function toggleAiContextFile(projectSourceFolder, fileName) {
    if (!selectedAiContextFiles.value[projectSourceFolder]) {
        selectedAiContextFiles.value[projectSourceFolder] = [];
    }
    const index = selectedAiContextFiles.value[projectSourceFolder].indexOf(fileName);
    if (index === -1) {
        selectedAiContextFiles.value[projectSourceFolder].push(fileName);
    } else {
        selectedAiContextFiles.value[projectSourceFolder].splice(index, 1);
    }
}

function getSelectedAiContextFilesCount(project) {
    return (selectedAiContextFiles.value[project.sourceFolder] || []).length;
}

function hasAiContextFiles(project) {
    return project.aiContextFiles && project.aiContextFiles.length > 0;
}

function handleConfirm() {
    if (isImporting.value) return; // Prevent double clicks
    isImporting.value = true;

    const selected = props.projects
        .filter(p => selectedProjects.value.includes(p.sourceFolder))
        .map(p => {
            const selectedFileNames = selectedFiles.value[p.sourceFolder] || [];
            const filteredFiles = p.files.filter(f => selectedFileNames.includes(f.name));
            const newVariablesCount = filteredFiles.reduce((acc, f) => acc + f.variables.length, 0);

            // Filtrar archivos de contexto IA seleccionados
            const selectedAiNames = selectedAiContextFiles.value[p.sourceFolder] || [];
            const filteredAiContextFiles = (p.aiContextFiles || []).filter(f => selectedAiNames.includes(f.name));

            return {
                ...p,
                name: editedProjects.value[p.sourceFolder]?.name || p.name,
                icon: editedProjects.value[p.sourceFolder]?.icon || p.icon,
                files: filteredFiles,
                variablesCount: newVariablesCount,
                aiContextFiles: filteredAiContextFiles,
                aiContextFilesCount: filteredAiContextFiles.length,
                hasAiContext: filteredAiContextFiles.length > 0
            };
        })
        .filter(p => p.files.length > 0 || p.aiContextFiles.length > 0); // Include if has env OR ai context files
    emit('confirm', selected);
}
</script>

<template>
    <q-dialog v-model="dialogModel" persistent maximized transition-show="slide-up" transition-hide="slide-down">
        <q-card class="import-preview-card" :class="themeStore.themeClass">
            <!-- Header -->
            <q-card-section class="dialog-header">
                <div class="header-content">
                    <div class="header-title">
                        <q-icon name="fact_check" size="28px" class="header-icon" />
                        <div>
                            <h2>{{ t('envVault.importPreview.title') }}</h2>
                            <p>{{ t('envVault.importPreview.subtitle') }}</p>
                        </div>
                    </div>
                    <q-btn flat round icon="close" @click="emit('cancel')" />
                </div>
            </q-card-section>

            <q-separator />

            <!-- Actions bar -->
            <q-card-section class="actions-bar">
                <div class="selection-info">
                    <q-badge color="primary" :label="t('envVault.importPreview.projectsCount', { count: selectedCount })" />
                    <q-badge color="grey-7" :label="t('envVault.importPreview.filesCount', { count: totalSelectedFiles })" />
                    <q-badge v-if="totalAiContextFiles > 0" color="purple" :label="t('envVault.importPreview.aiContextCount', { count: totalAiContextFiles })" />
                    <span class="variables-count">{{ t('envVault.importPreview.variablesCount', { count: totalVariables }) }}</span>
                </div>
                <div class="selection-actions">
                    <q-btn flat dense :label="t('envVault.importPreview.selectAll')" @click="selectAll" size="sm" />
                    <q-btn flat dense :label="t('envVault.importPreview.selectNone')" @click="selectNone" size="sm" />
                </div>
            </q-card-section>

            <!-- Projects list -->
            <q-card-section class="projects-list">
                <q-list>
                    <template v-for="project in projects" :key="project.sourceFolder">
                        <q-item class="project-item" :class="{ selected: isSelected(project.sourceFolder) }">
                            <q-item-section side>
                                <q-checkbox
                                    :model-value="isSelected(project.sourceFolder)"
                                    @update:model-value="toggleProject(project.sourceFolder)"
                                    color="primary"
                                />
                            </q-item-section>

                            <!-- Icon with edit popup -->
                            <q-item-section avatar class="icon-section">
                                <q-btn flat round dense class="icon-btn">
                                    <span class="project-icon">{{ getProjectIcon(project) }}</span>
                                    <q-popup-proxy>
                                        <q-card class="icon-picker" :class="themeStore.themeClass">
                                            <q-card-section class="icon-grid">
                                                <q-btn
                                                    v-for="icon in availableIcons"
                                                    :key="icon"
                                                    flat
                                                    dense
                                                    class="icon-option"
                                                    @click="updateProjectIcon(project.sourceFolder, icon)"
                                                >
                                                    {{ icon }}
                                                </q-btn>
                                            </q-card-section>
                                        </q-card>
                                    </q-popup-proxy>
                                </q-btn>
                            </q-item-section>

                            <!-- Name - Editable -->
                            <q-item-section>
                                <div v-if="editingProject === project.sourceFolder" class="edit-name">
                                    <q-input
                                        :model-value="getProjectName(project)"
                                        @update:model-value="updateProjectName(project.sourceFolder, $event)"
                                        dense
                                        outlined
                                        autofocus
                                        class="name-input"
                                        @keyup.enter="stopEditing"
                                        @blur="stopEditing"
                                    />
                                </div>
                                <div v-else class="project-name-row" @click="startEditing(project.sourceFolder)">
                                    <q-item-label class="project-name">
                                        {{ getProjectName(project) }}
                                        <q-icon name="edit" size="14px" class="edit-icon" />
                                    </q-item-label>
                                    <q-item-label caption class="project-files">
                                        {{ t('envVault.importPreview.fileRatio', { selected: getSelectedFilesCount(project), total: project.files.length }) }}
                                    </q-item-label>
                                </div>
                            </q-item-section>

                            <q-item-section side class="project-stats">
                                <div class="stats-badges">
                                    <q-badge
                                        :color="isSelected(project.sourceFolder) ? 'primary' : 'grey'"
                                        :label="`${project.variablesCount} vars`"
                                    />
                                    <q-badge
                                        v-if="hasAiContextFiles(project)"
                                        color="purple"
                                        :label="`${getSelectedAiContextFilesCount(project)} AI`"
                                    />
                                </div>
                            </q-item-section>

                            <q-item-section side>
                                <q-btn
                                    flat
                                    round
                                    dense
                                    :icon="expandedProject === project.sourceFolder ? 'expand_less' : 'expand_more'"
                                    @click.stop="toggleExpand(project.sourceFolder)"
                                />
                            </q-item-section>
                        </q-item>

                        <!-- Expanded details -->
                        <q-slide-transition>
                            <div v-if="expandedProject === project.sourceFolder" class="project-details">
                                <div v-for="file in project.files" :key="file.name" class="env-file" :class="{ 'file-disabled': !isFileSelected(project.sourceFolder, file.name) }">
                                    <div class="file-header">
                                        <q-checkbox
                                            :model-value="isFileSelected(project.sourceFolder, file.name)"
                                            @update:model-value="toggleFile(project.sourceFolder, file.name)"
                                            size="sm"
                                            color="primary"
                                        />
                                        <q-icon name="description" size="16px" />
                                        <span class="file-name">{{ file.name }}</span>
                                        <span v-if="file.path && file.path !== file.name" class="file-path">{{ file.path }}</span>
                                        <q-badge :label="`${file.variables.length} vars`" color="grey-7" />
                                    </div>
                                    <div v-if="isFileSelected(project.sourceFolder, file.name)" class="variables-list">
                                        <div
                                            v-for="variable in file.variables.slice(0, 5)"
                                            :key="variable.name"
                                            class="variable-item"
                                        >
                                            <code class="var-name">{{ variable.name }}</code>
                                            <span class="var-value">••••••••</span>
                                        </div>
                                        <div v-if="file.variables.length > 5" class="more-vars">
                                            +{{ t('envVault.importPreview.moreVars', { count: file.variables.length - 5 }) }}
                                        </div>
                                    </div>
                                </div>

                                <!-- AI Context Files Section -->
                                <div v-if="hasAiContextFiles(project)" class="ai-context-section">
                                    <div class="ai-context-header">
                                        <q-icon name="smart_toy" size="18px" color="purple" />
                                        <span>AI Context Files</span>
                                        <q-badge color="purple" :label="`${getSelectedAiContextFilesCount(project)}/${project.aiContextFiles.length}`" />
                                    </div>
                                    <div
                                        v-for="aiFile in project.aiContextFiles"
                                        :key="aiFile.name"
                                        class="ai-context-file"
                                        :class="{ 'file-disabled': !isAiContextFileSelected(project.sourceFolder, aiFile.name) }"
                                    >
                                        <div class="file-header">
                                            <q-checkbox
                                                :model-value="isAiContextFileSelected(project.sourceFolder, aiFile.name)"
                                                @update:model-value="toggleAiContextFile(project.sourceFolder, aiFile.name)"
                                                size="sm"
                                                color="purple"
                                            />
                                            <span class="ai-tool-icon">{{ aiFile.icon }}</span>
                                            <span class="file-name">{{ aiFile.name }}</span>
                                            <q-badge color="purple-4" text-color="white" :label="aiFile.label" />
                                        </div>
                                        <div v-if="isAiContextFileSelected(project.sourceFolder, aiFile.name) && aiFile.preview" class="ai-preview">
                                            <code>{{ aiFile.preview }}{{ aiFile.content && aiFile.content.length > 150 ? '...' : '' }}</code>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </q-slide-transition>

                        <q-separator />
                    </template>
                </q-list>

                <!-- Empty state -->
                <div v-if="projects.length === 0" class="empty-state">
                    <q-icon name="folder_off" size="48px" />
                    <p>{{ t('envVault.importPreview.noConfigFiles') }}</p>
                </div>
            </q-card-section>

            <!-- Footer -->
            <q-card-actions class="dialog-footer">
                <q-btn flat :label="t('common.cancel')" @click="emit('cancel')" />
                <q-space />
                <q-btn
                    unelevated
                    :label="t('envVault.importPreview.importProjects', { count: selectedCount })"
                    :disable="selectedCount === 0 || isImporting"
                    :loading="isImporting"
                    @click="handleConfirm"
                    class="import-btn"
                />
            </q-card-actions>
        </q-card>
    </q-dialog>
</template>

<style lang="scss" scoped>
.import-preview-card {
    display: flex;
    flex-direction: column;
    background: var(--bg-primary, #fff);
}

.lemonade-dark .import-preview-card {
    background: #0D1117;
}

.dialog-header {
    padding: 16px 20px;
}

.header-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
}

.header-title {
    display: flex;
    gap: 12px;
    align-items: flex-start;

    h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--text-primary, #333);
    }

    p {
        margin: 4px 0 0;
        font-size: 0.85rem;
        color: var(--text-secondary, #666);
    }
}

.lemonade-dark .header-title {
    h2 {
        color: #F0F6FC;
    }
    p {
        color: #8B949E;
    }
}

.header-icon {
    color: #F7DC6F;
}

.actions-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
    background: var(--bg-secondary, #f5f5f5);
}

.lemonade-dark .actions-bar {
    background: #161B22;
}

.selection-info {
    display: flex;
    align-items: center;
    gap: 12px;
}

.variables-count {
    font-size: 0.85rem;
    color: var(--text-secondary, #666);
}

.selection-actions {
    display: flex;
    gap: 8px;
}

.projects-list {
    flex: 1;
    overflow-y: auto;
    padding: 0;
}

.project-item {
    transition: background 0.2s ease;
    min-height: 64px;

    &.selected {
        background: rgba(247, 220, 111, 0.1);
    }

    &:hover {
        background: rgba(247, 220, 111, 0.05);
    }
}

.icon-section {
    min-width: 48px;
}

.icon-btn {
    font-size: 1.5rem;
    padding: 4px;
}

.project-icon {
    font-size: 1.5rem;
}

.icon-picker {
    background: var(--bg-primary, #fff);
}

.lemonade-dark .icon-picker {
    background: #21262D;
}

.icon-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 4px;
    padding: 8px;
}

.icon-option {
    font-size: 1.25rem;
    min-width: 40px;
    min-height: 40px;
}

.project-name-row {
    cursor: pointer;
}

.project-name {
    font-weight: 600;
    color: var(--text-primary, #333);
    display: flex;
    align-items: center;
    gap: 6px;
}

.edit-icon {
    opacity: 0;
    transition: opacity 0.2s;
    color: var(--text-secondary, #999);
}

.project-name-row:hover .edit-icon {
    opacity: 1;
}

.lemonade-dark .project-name {
    color: #F0F6FC;
}

.project-files {
    font-size: 0.75rem;
    color: var(--text-secondary, #999);
}

.edit-name {
    width: 100%;
}

.name-input {
    max-width: 250px;
}

.project-details {
    padding: 0 16px 16px 72px;
    background: var(--bg-secondary, #f9f9f9);
}

.lemonade-dark .project-details {
    background: #161B22;
}

.env-file {
    margin-bottom: 12px;
    padding: 8px;
    border-radius: 8px;
    transition: all 0.2s ease;

    &:last-child {
        margin-bottom: 0;
    }

    &:hover {
        background: rgba(247, 220, 111, 0.05);
    }

    &.file-disabled {
        opacity: 0.5;

        .file-header {
            text-decoration: line-through;
        }
    }
}

.file-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;
    font-size: 0.85rem;
    color: var(--text-primary, #333);
}

.lemonade-dark .file-header {
    color: #F0F6FC;
}

.file-name {
    font-weight: 500;
}

.file-path {
    font-size: 0.75rem;
    color: var(--text-secondary, #999);
    margin-left: 4px;

    &::before {
        content: '(';
    }
    &::after {
        content: ')';
    }
}

.variables-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 24px;
}

.variable-item {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 0.8rem;
}

.var-name {
    font-family: 'Fira Code', monospace;
    color: #F7DC6F;
    background: rgba(247, 220, 111, 0.1);
    padding: 2px 6px;
    border-radius: 4px;
}

.var-value {
    color: var(--text-secondary, #999);
}

.more-vars {
    font-size: 0.75rem;
    color: var(--text-secondary, #999);
    font-style: italic;
}

.empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px;
    color: var(--text-secondary, #999);
    gap: 12px;
}

.dialog-footer {
    padding: 16px 20px;
    border-top: 1px solid var(--border-color, #e0e0e0);
}

.lemonade-dark .dialog-footer {
    border-color: #30363D;
}

.import-btn {
    background: linear-gradient(135deg, #F7DC6F 0%, #f1c40f 100%) !important;
    color: #000 !important;
    font-weight: 600;
    padding: 8px 24px;
    border-radius: 8px;

    &:disabled {
        opacity: 0.5;
    }
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

// AI Context Section Styles
.ai-context-section {
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px dashed rgba(156, 39, 176, 0.3);
}

.ai-context-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    font-weight: 500;
    color: #9c27b0;
    font-size: 0.9rem;
}

.ai-context-file {
    margin-bottom: 8px;
    padding: 8px;
    border-radius: 8px;
    background: rgba(156, 39, 176, 0.05);
    transition: all 0.2s ease;

    &:last-child {
        margin-bottom: 0;
    }

    &:hover {
        background: rgba(156, 39, 176, 0.1);
    }

    &.file-disabled {
        opacity: 0.5;
    }
}

.ai-tool-icon {
    font-size: 1.1rem;
}

.ai-preview {
    margin-top: 8px;
    padding: 8px 12px;
    padding-left: 32px;
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
    overflow: hidden;

    code {
        font-family: 'Fira Code', monospace;
        font-size: 0.75rem;
        color: var(--text-secondary, #666);
        white-space: pre-wrap;
        word-break: break-word;
    }
}

.lemonade-dark .ai-preview {
    background: rgba(255, 255, 255, 0.05);

    code {
        color: #8B949E;
    }
}

.stats-badges {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 4px;
}
</style>
