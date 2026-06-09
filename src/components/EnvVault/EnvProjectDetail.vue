<script setup>
import { ref, computed, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useQuasar, copyToClipboard } from 'quasar';
import { useThemeStore } from 'stores/theme';
import { useEnvVaultStore } from 'stores/envVault';
import { parseEnvContent } from 'src/services/envScannerService';
import { matchesSearch } from 'src/utils/searchUtils';

const props = defineProps({
    project: {
        type: Object,
        required: true
    },
    show: {
        type: Boolean,
        default: false
    }
});

const emit = defineEmits(['close', 'delete', 'updated']);

const { t, locale } = useI18n();
const $q = useQuasar();
const themeStore = useThemeStore();
const envVaultStore = useEnvVaultStore();

// State
const variables = ref([]);
const isLoading = ref(false);
const expandedFiles = ref([]);
const visibleValues = ref({}); // { variableId: true }
const searchText = ref('');
const showIconPicker = ref(false);
const localIcon = ref('');
const isIconAnimating = ref(false);

// AI Context Files state
const aiContextFiles = ref([]);
const isLoadingAiContext = ref(false);
const expandedAiContext = ref(false);
const visibleAiContent = ref({}); // { fileId: decryptedContent }

// Available icons (100 options)
const availableIcons = [
    // Security & Tech
    '🔐', '🔒', '🔑', '🛡️', '🔥', '☁️', '⚡', '💾',
    '🗄️', '📦', '🚀', '🌐', '💳', '📧', '📱', '💻',
    '🤖', '🎯', '⚙️', '🔧', '🖥️', '⌨️', '🖱️', '💿',
    // Nerd & Dev
    '👾', '🎮', '🕹️', '👨‍💻', '👩‍💻', '🧑‍💻', '💡', '🧪',
    '🔬', '🧬', '🧠', '📡', '🛰️', '🔭', '🌌', '⚛️',
    '🦾', '🦿', '📟', '📠', '🔌', '🪫', '🔋', '💎',
    // Fruits
    '🍋', '🍊', '🍎', '🍏', '🍐', '🍑', '🍒', '🍓',
    '🫐', '🥝', '🍇', '🍉', '🍌', '🥭', '🍍', '🥥',
    '🍈', '🫒', '🥑', '🍅',
    // Nature & Animals
    '🌱', '🌿', '🍀', '🌸', '🌺', '🌻', '🌴', '🌲',
    '🦊', '🐱', '🐶', '🦁', '🐼', '🦄', '🐉', '🦋',
    '🐝', '🦎', '🐙', '🦑',
    // Space & Magic
    '✨', '⭐', '🌟', '💫', '🌙', '☀️', '🪐', '🌈',
    '🔮', '🎪', '🎭', '🎨',
    // Objects & Tools
    '📚', '📖', '✏️', '🖊️', '📝', '📋', '🗂️', '📁',
    '🏆', '🎖️', '🏅', '🎁', '🎈', '🎉', '🧩', '♟️',
    // Food & Drinks
    '☕', '🧋', '🍵', '🍺', '🍕', '🍔', '🌮', '🍜'
];

// Add file dialog state
const showAddFileDialog = ref(false);
const addFileMode = ref('paste'); // 'paste' or 'upload'
const newFileName = ref('.env');
const pasteContent = ref('');
const fileInputRef = ref(null);
const isAddingFile = ref(false);

// Dialog model
const dialogModel = computed({
    get: () => props.show,
    set: (val) => {
        if (!val) emit('close');
    }
});

// Watch for project changes to load variables
watch(() => props.show, async (newVal) => {
    if (newVal && props.project) {
        localIcon.value = props.project.icon;
        await loadVariables();
        await loadAiContextFiles();
    } else {
        variables.value = [];
        visibleValues.value = {};
        aiContextFiles.value = [];
        visibleAiContent.value = {};
    }
}, { immediate: true });

// Sync local icon when project prop changes
watch(() => props.project?.icon, (newIcon) => {
    if (newIcon && !isIconAnimating.value) {
        localIcon.value = newIcon;
    }
});

// Computed
const groupedVariables = computed(() => {
    const groups = {};
    for (const variable of variables.value) {
        // Usar filePath como key para agrupar, fallback a fileName
        const groupKey = variable.filePath || variable.fileName;
        if (!groups[groupKey]) {
            groups[groupKey] = {
                fileName: variable.fileName,
                filePath: variable.filePath || variable.fileName,
                variables: []
            };
        }
        groups[groupKey].variables.push(variable);
    }
    return groups;
});

const filteredGroups = computed(() => {
    if (!searchText.value) return groupedVariables.value;

    const filtered = {};

    for (const [groupKey, group] of Object.entries(groupedVariables.value)) {
        const matchingVars = group.variables.filter(v =>
            matchesSearch(searchText.value, [v.variableName, group.fileName])
        );
        if (matchingVars.length > 0) {
            filtered[groupKey] = {
                ...group,
                variables: matchingVars
            };
        }
    }

    return filtered;
});

// Methods
async function loadVariables() {
    isLoading.value = true;
    try {
        variables.value = await envVaultStore.fetchProjectVariables(props.project.id);
        // Auto-expand first file
        const files = Object.keys(groupedVariables.value);
        if (files.length > 0) {
            expandedFiles.value = [files[0]];
        }
    } catch (error) {
        console.error('Error loading variables:', error);
        $q.notify({
            type: 'negative',
            message: t('envVault.projectDetail.notify.errorLoadVars'),
            position: 'top'
        });
    } finally {
        isLoading.value = false;
    }
}

// AI Context Files functions
async function loadAiContextFiles() {
    if (!props.project?.hasAiContext) return;

    isLoadingAiContext.value = true;
    try {
        aiContextFiles.value = await envVaultStore.fetchProjectAiContextFiles(props.project.id);
    } catch (error) {
        console.error('Error loading AI context files:', error);
    } finally {
        isLoadingAiContext.value = false;
    }
}

async function toggleAiContentVisibility(file) {
    if (visibleAiContent.value[file.id]) {
        visibleAiContent.value[file.id] = null;
        return;
    }

    try {
        const decrypted = await envVaultStore.getDecryptedContextContent(file.id);
        visibleAiContent.value[file.id] = decrypted;
    } catch (error) {
        console.error('Error decrypting AI content:', error);
        $q.notify({
            type: 'negative',
            message: t('envVault.projectDetail.notify.errorDecryptContent'),
            position: 'top'
        });
    }
}

async function copyAiContent(file) {
    try {
        let content = visibleAiContent.value[file.id];
        if (!content) {
            content = await envVaultStore.getDecryptedContextContent(file.id);
        }

        await copyToClipboard(content);
        $q.notify({
            type: 'positive',
            message: t('envVault.projectDetail.notify.contentCopied'),
            position: 'top',
            timeout: 1500
        });
    } catch (error) {
        console.error('Error copying AI content:', error);
        $q.notify({
            type: 'negative',
            message: t('common.copyError'),
            position: 'top'
        });
    }
}

async function downloadAiContent(file) {
    try {
        let content = visibleAiContent.value[file.id];
        if (!content) {
            content = await envVaultStore.getDecryptedContextContent(file.id);
        }

        downloadFile(content, file.fileName, 'text/plain');
        $q.notify({
            type: 'positive',
            message: t('envVault.projectDetail.notify.fileDownloaded'),
            position: 'top',
            timeout: 1500
        });
    } catch (error) {
        console.error('Error downloading AI content:', error);
        $q.notify({
            type: 'negative',
            message: t('envVault.projectDetail.aiContext.downloadError'),
            position: 'top'
        });
    }
}

async function deleteAiContextFile(file) {
    $q.dialog({
        title: t('envVault.projectDetail.aiContext.deleteFileTitle'),
        message: t('envVault.projectDetail.aiContext.deleteFileConfirm', { name: file.fileName }),
        cancel: true,
        persistent: true
    }).onOk(async () => {
        try {
            await envVaultStore.deleteAiContextFile(file.id, props.project.id);
            aiContextFiles.value = aiContextFiles.value.filter(f => f.id !== file.id);
            $q.notify({
                type: 'positive',
                message: t('envVault.projectDetail.aiContext.fileDeleted'),
                position: 'top'
            });
            emit('updated');
        } catch (error) {
            console.error('Error deleting AI context file:', error);
            $q.notify({
                type: 'negative',
                message: t('envVault.projectDetail.aiContext.deleteError'),
                position: 'top'
            });
        }
    });
}

function toggleFile(fileName) {
    const index = expandedFiles.value.indexOf(fileName);
    if (index === -1) {
        expandedFiles.value.push(fileName);
    } else {
        expandedFiles.value.splice(index, 1);
    }
}

function isFileExpanded(fileName) {
    return expandedFiles.value.includes(fileName);
}

async function toggleValueVisibility(variable) {
    if (visibleValues.value[variable.id]) {
        visibleValues.value[variable.id] = null;
        return;
    }

    try {
        const decrypted = await envVaultStore.getDecryptedValue(variable.id);
        visibleValues.value[variable.id] = decrypted;

        // Auto-hide after 10 seconds
        setTimeout(() => {
            visibleValues.value[variable.id] = null;
        }, 10000);
    } catch (error) {
        console.error('Error decrypting value:', error);
        $q.notify({
            type: 'negative',
            message: t('envVault.projectDetail.notify.errorDecryptValue'),
            position: 'top'
        });
    }
}

async function copyValue(variable) {
    try {
        let value = visibleValues.value[variable.id];
        if (!value) {
            value = await envVaultStore.getDecryptedValue(variable.id);
        }

        await copyToClipboard(value);
        $q.notify({
            type: 'positive',
            message: t('common.copied'),
            position: 'top',
            timeout: 1500
        });
    } catch (error) {
        console.error('Error copying value:', error);
        $q.notify({
            type: 'negative',
            message: t('common.copyError'),
            position: 'top'
        });
    }
}

async function exportAsEnv() {
    try {
        const exportData = await envVaultStore.exportProjectAsEnv(props.project.id);

        // Generate content for each file
        for (const [fileName, vars] of Object.entries(exportData.files)) {
            const content = vars.map(v => `${v.name}=${v.value}`).join('\n');
            downloadFile(content, fileName, 'text/plain');
        }

        $q.notify({
            type: 'positive',
            message: t('envVault.projectDetail.notify.filesExported'),
            position: 'top'
        });
    } catch (error) {
        console.error('Error exporting:', error);
        $q.notify({
            type: 'negative',
            message: t('envVault.messages.errorExport'),
            position: 'top'
        });
    }
}

function downloadFile(content, fileName, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function getCategoryIcon(category) {
    const icons = {
        database: 'storage',
        api: 'api',
        auth: 'security',
        cloud: 'cloud',
        email: 'email',
        config: 'settings'
    };
    return icons[category] || 'code';
}

function getCategoryColor(category) {
    const colors = {
        database: 'purple',
        api: 'blue',
        auth: 'red',
        cloud: 'cyan',
        email: 'orange',
        config: 'grey'
    };
    return colors[category] || 'grey';
}

function formatDate(date) {
    if (!date) return '';
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString(locale.value, {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    });
}

// Add file functions
function openAddFileDialog() {
    showAddFileDialog.value = true;
    addFileMode.value = 'paste';
    newFileName.value = '.env';
    pasteContent.value = '';
}

function closeAddFileDialog() {
    showAddFileDialog.value = false;
    pasteContent.value = '';
    newFileName.value = '.env';
}

function triggerFileUpload() {
    fileInputRef.value?.click();
}

async function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
        const content = await readFileAsText(file);
        newFileName.value = file.name;
        pasteContent.value = content;
        addFileMode.value = 'paste'; // Switch to paste mode to show content
    } catch (error) {
        console.error('Error reading file:', error);
        $q.notify({
            type: 'negative',
            message: t('envVault.projectDetail.notify.errorReadFile'),
            position: 'top'
        });
    }

    // Reset input
    if (fileInputRef.value) {
        fileInputRef.value.value = '';
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

async function addFileToProject() {
    if (!pasteContent.value.trim() || !newFileName.value.trim()) {
        $q.notify({
            type: 'warning',
            message: t('envVault.projectDetail.notify.missingFileFields'),
            position: 'top'
        });
        return;
    }

    isAddingFile.value = true;
    try {
        // Parse the content
        const parsedVariables = parseEnvContent(pasteContent.value);

        if (parsedVariables.length === 0) {
            $q.notify({
                type: 'warning',
                message: t('envVault.projectDetail.notify.noVarsInContent'),
                position: 'top'
            });
            isAddingFile.value = false;
            return;
        }

        // Add variables to project
        const result = await envVaultStore.addVariablesToProject(
            props.project.id,
            newFileName.value.trim(),
            parsedVariables
        );

        $q.notify({
            type: 'positive',
            message: t('envVault.projectDetail.notify.varsAddedUpdated', { added: result.added, updated: result.updated }),
            position: 'top'
        });

        closeAddFileDialog();

        // Reload variables
        await loadVariables();

        // Emit event to update parent
        emit('updated');
    } catch (error) {
        console.error('Error adding file:', error);
        $q.notify({
            type: 'negative',
            message: error.message || t('envVault.projectDetail.notify.errorAddFile'),
            position: 'top'
        });
    } finally {
        isAddingFile.value = false;
    }
}

// Computed for preview
const parsedPreview = computed(() => {
    if (!pasteContent.value.trim()) return [];
    return parseEnvContent(pasteContent.value);
});

// Icon change function - Optimistic update with animation
async function changeIcon(newIcon) {
    if (newIcon === localIcon.value) return;

    const previousIcon = localIcon.value;

    // Optimistic update: change UI immediately with animation
    isIconAnimating.value = true;
    localIcon.value = newIcon;

    // Wait for animation to complete
    setTimeout(() => {
        isIconAnimating.value = false;
    }, 300);

    // Save in background
    try {
        await envVaultStore.updateProjectIcon(props.project.id, newIcon);
        emit('updated');
    } catch (error) {
        // Revert on error
        console.error('Error updating icon:', error);
        localIcon.value = previousIcon;
        $q.notify({
            type: 'negative',
            message: t('envVault.projectDetail.notify.errorUpdateIcon'),
            position: 'top'
        });
    }
}
</script>

<template>
    <q-dialog v-model="dialogModel" maximized transition-show="slide-left" transition-hide="slide-right">
        <q-card class="project-detail-card" :class="themeStore.themeClass">
            <!-- Header -->
            <q-card-section class="detail-header">
                <div class="header-left">
                    <q-btn flat round icon="arrow_back" @click="emit('close')" class="back-btn" />
                    <div class="project-icon-wrapper">
                        <span class="project-icon" :class="{ 'icon-bounce': isIconAnimating }">{{ localIcon }}</span>
                        <q-icon name="edit" size="12px" class="edit-icon-overlay" />
                        <q-tooltip>{{ t('envVault.projectDetail.changeIcon') }}</q-tooltip>

                        <!-- Icon picker popup - inside the wrapper for proper anchoring -->
                        <q-menu anchor="bottom middle" self="top middle">
                            <div class="icon-picker" :class="themeStore.themeClass">
                                <div class="icon-picker-title">{{ t('envVault.projectDetail.selectIcon') }}</div>
                                <div class="icon-grid">
                                    <button
                                        v-for="icon in availableIcons"
                                        :key="icon"
                                        class="icon-option"
                                        :class="{ active: icon === localIcon }"
                                        @click="changeIcon(icon)"
                                    >
                                        {{ icon }}
                                    </button>
                                </div>
                            </div>
                        </q-menu>
                    </div>
                    <div class="project-info">
                        <h2>{{ project.name }}</h2>
                        <p>{{ project.sourceFolder }}</p>
                    </div>
                </div>
                <div class="header-actions">
                    <q-btn flat icon="add" :label="t('envVault.projectDetail.add')" @click="openAddFileDialog" class="add-btn">
                        <q-tooltip>{{ t('envVault.projectDetail.addFile') }}</q-tooltip>
                    </q-btn>
                    <q-btn flat icon="download" :label="t('envVault.projectDetail.export')" @click="exportAsEnv" class="export-btn" />
                    <q-btn flat round icon="delete" color="negative" @click="emit('delete', project.id)">
                        <q-tooltip>{{ t('envVault.projectDetail.deleteProject') }}</q-tooltip>
                    </q-btn>
                </div>
            </q-card-section>

            <q-separator />

            <!-- Search bar -->
            <q-card-section class="search-section">
                <q-input
                    v-model="searchText"
                    dense
                    outlined
                    :placeholder="t('envVault.projectDetail.searchVariable')"
                    class="search-input"
                >
                    <template v-slot:prepend>
                        <q-icon name="search" />
                    </template>
                    <template v-slot:append>
                        <q-icon
                            v-if="searchText"
                            name="close"
                            class="cursor-pointer"
                            @click="searchText = ''"
                        />
                    </template>
                </q-input>
            </q-card-section>

            <!-- Loading -->
            <div v-if="isLoading" class="loading-state">
                <q-spinner-dots color="primary" size="40px" />
            </div>

            <!-- Variables list -->
            <q-card-section v-else class="variables-section">
                <q-list>
                    <template v-for="(group, groupKey) in filteredGroups" :key="groupKey">
                        <!-- File header -->
                        <q-item
                            clickable
                            class="file-header"
                            @click="toggleFile(groupKey)"
                        >
                            <q-item-section avatar>
                                <q-icon name="description" />
                            </q-item-section>
                            <q-item-section>
                                <q-item-label>{{ group.fileName }}</q-item-label>
                                <q-item-label v-if="group.filePath && group.filePath !== group.fileName" caption class="file-path-caption">
                                    📁 {{ group.filePath }}
                                </q-item-label>
                                <q-item-label caption>{{ group.variables.length }} {{ t('envVault.projectDetail.variables') }}</q-item-label>
                            </q-item-section>
                            <q-item-section side>
                                <q-icon :name="isFileExpanded(groupKey) ? 'expand_less' : 'expand_more'" />
                            </q-item-section>
                        </q-item>

                        <!-- Variables -->
                        <q-slide-transition>
                            <div v-if="isFileExpanded(groupKey)" class="variables-list">
                                <div
                                    v-for="variable in group.variables"
                                    :key="variable.id"
                                    class="variable-row"
                                >
                                    <div class="variable-info">
                                        <q-icon
                                            :name="getCategoryIcon(variable.category)"
                                            :color="getCategoryColor(variable.category)"
                                            size="18px"
                                        />
                                        <code class="variable-name">{{ variable.variableName }}</code>
                                        <q-badge
                                            v-if="variable.isSecret"
                                            color="red"
                                            :label="t('envVault.projectDetail.secret')"
                                            dense
                                        />
                                    </div>

                                    <div class="variable-value">
                                        <span v-if="visibleValues[variable.id]" class="value-text">
                                            {{ visibleValues[variable.id] }}
                                        </span>
                                        <span v-else class="value-hidden">••••••••••••</span>
                                    </div>

                                    <div class="variable-actions">
                                        <q-btn
                                            flat
                                            round
                                            dense
                                            :icon="visibleValues[variable.id] ? 'visibility_off' : 'visibility'"
                                            @click="toggleValueVisibility(variable)"
                                            size="sm"
                                        >
                                            <q-tooltip>{{ visibleValues[variable.id] ? t('envVault.projectDetail.hide') : t('envVault.projectDetail.show') }}</q-tooltip>
                                        </q-btn>
                                        <q-btn
                                            flat
                                            round
                                            dense
                                            icon="content_copy"
                                            @click="copyValue(variable)"
                                            size="sm"
                                        >
                                            <q-tooltip>{{ t('envVault.projectDetail.copy') }}</q-tooltip>
                                        </q-btn>
                                    </div>
                                </div>
                            </div>
                        </q-slide-transition>

                        <q-separator />
                    </template>
                </q-list>

                <!-- Empty state -->
                <div v-if="Object.keys(filteredGroups).length === 0" class="empty-state">
                    <q-icon name="search_off" size="48px" />
                    <p>{{ t('envVault.projectDetail.noVariablesFound') }}</p>
                </div>
            </q-card-section>

            <!-- AI Context Files Section -->
            <q-card-section v-if="aiContextFiles.length > 0 || isLoadingAiContext" class="ai-context-section">
                <q-item
                    clickable
                    class="ai-context-header"
                    @click="expandedAiContext = !expandedAiContext"
                >
                    <q-item-section avatar>
                        <q-icon name="smart_toy" color="purple" />
                    </q-item-section>
                    <q-item-section>
                        <q-item-label class="ai-header-title">{{ t('envVault.projectDetail.aiContextFiles') }}</q-item-label>
                        <q-item-label caption>{{ t('envVault.projectDetail.aiContextFilesDesc') }}</q-item-label>
                    </q-item-section>
                    <q-item-section side>
                        <div class="ai-header-badges">
                            <q-badge color="purple" :label="t('envVault.projectDetail.fileCount', { count: aiContextFiles.length })" />
                            <q-icon :name="expandedAiContext ? 'expand_less' : 'expand_more'" />
                        </div>
                    </q-item-section>
                </q-item>

                <!-- Loading -->
                <div v-if="isLoadingAiContext" class="ai-loading">
                    <q-spinner-dots color="purple" size="24px" />
                </div>

                <!-- AI Context Files List -->
                <q-slide-transition>
                    <div v-if="expandedAiContext && !isLoadingAiContext" class="ai-files-list">
                        <div
                            v-for="file in aiContextFiles"
                            :key="file.id"
                            class="ai-file-card"
                        >
                            <div class="ai-file-header">
                                <span class="ai-tool-icon">{{ file.icon }}</span>
                                <div class="ai-file-info">
                                    <span class="ai-file-name">{{ file.fileName }}</span>
                                    <span class="ai-file-path">{{ file.filePath }}</span>
                                </div>
                                <q-badge color="purple-4" text-color="white" :label="file.label" />
                            </div>

                            <!-- Preview / Content -->
                            <div class="ai-file-content">
                                <div v-if="visibleAiContent[file.id]" class="ai-content-full">
                                    <pre>{{ visibleAiContent[file.id] }}</pre>
                                </div>
                                <div v-else class="ai-content-preview">
                                    <code>{{ file.contentPreview }}{{ file.fileSize > 150 ? '...' : '' }}</code>
                                </div>
                            </div>

                            <!-- Actions -->
                            <div class="ai-file-actions">
                                <q-btn
                                    flat
                                    dense
                                    size="sm"
                                    :icon="visibleAiContent[file.id] ? 'visibility_off' : 'visibility'"
                                    :label="visibleAiContent[file.id] ? t('envVault.projectDetail.hide') : t('envVault.projectDetail.viewAll')"
                                    @click="toggleAiContentVisibility(file)"
                                />
                                <q-btn
                                    flat
                                    dense
                                    size="sm"
                                    icon="content_copy"
                                    :label="t('envVault.projectDetail.copy')"
                                    @click="copyAiContent(file)"
                                />
                                <q-btn
                                    flat
                                    dense
                                    size="sm"
                                    icon="download"
                                    :label="t('envVault.projectDetail.download')"
                                    @click="downloadAiContent(file)"
                                />
                                <q-space />
                                <q-btn
                                    flat
                                    dense
                                    size="sm"
                                    icon="delete"
                                    color="negative"
                                    @click="deleteAiContextFile(file)"
                                >
                                    <q-tooltip>{{ t('envVault.projectDetail.delete') }}</q-tooltip>
                                </q-btn>
                            </div>
                        </div>
                    </div>
                </q-slide-transition>
            </q-card-section>

            <!-- Footer info -->
            <q-card-section class="detail-footer">
                <div class="footer-info">
                    <span>
                        <q-icon name="schedule" size="14px" />
                        {{ t('envVault.projectDetail.scanned') }}: {{ formatDate(project.createdAt) }}
                    </span>
                    <span>
                        <q-icon name="vpn_key" size="14px" />
                        {{ project.variablesCount }} {{ t('envVault.projectDetail.variables') }}
                    </span>
                    <span>
                        <q-icon name="description" size="14px" />
                        {{ project.envFilesCount }} {{ t('envVault.projectDetail.files') }}
                    </span>
                </div>
            </q-card-section>
        </q-card>

        <!-- Add File Dialog -->
        <q-dialog v-model="showAddFileDialog" persistent>
            <q-card class="add-file-dialog" :class="themeStore.themeClass">
                <q-card-section class="dialog-header">
                    <div class="dialog-title">
                        <q-icon name="note_add" size="24px" />
                        <span>{{ t('envVault.projectDetail.addFileTitle') }}</span>
                    </div>
                    <q-btn flat round dense icon="close" @click="closeAddFileDialog" />
                </q-card-section>

                <q-separator />

                <q-card-section class="dialog-content">
                    <!-- File name input -->
                    <q-input
                        v-model="newFileName"
                        :label="t('envVault.projectDetail.fileName')"
                        outlined
                        dense
                        placeholder=".env, .env.local, privkeys.js, etc."
                        class="file-name-input"
                    >
                        <template v-slot:prepend>
                            <q-icon name="description" />
                        </template>
                    </q-input>

                    <!-- Mode selector -->
                    <div class="mode-selector">
                        <q-btn
                            :flat="addFileMode !== 'paste'"
                            :unelevated="addFileMode === 'paste'"
                            :color="addFileMode === 'paste' ? 'primary' : 'grey'"
                            :label="t('envVault.projectDetail.pasteContent')"
                            icon="content_paste"
                            @click="addFileMode = 'paste'"
                            class="mode-btn"
                        />
                        <q-btn
                            :flat="addFileMode !== 'upload'"
                            :unelevated="addFileMode === 'upload'"
                            :color="addFileMode === 'upload' ? 'primary' : 'grey'"
                            :label="t('envVault.projectDetail.uploadFile')"
                            icon="upload_file"
                            @click="addFileMode = 'upload'"
                            class="mode-btn"
                        />
                    </div>

                    <!-- Paste content area -->
                    <div v-if="addFileMode === 'paste'" class="paste-area">
                        <q-input
                            v-model="pasteContent"
                            type="textarea"
                            outlined
                            :label="t('envVault.projectDetail.fileContent')"
                            placeholder="KEY=value&#10;ANOTHER_KEY=another_value&#10;..."
                            rows="8"
                            class="content-textarea"
                        />
                    </div>

                    <!-- Upload area -->
                    <div v-else class="upload-area">
                        <input
                            ref="fileInputRef"
                            type="file"
                            accept=".env,.env.*,.js,.json,.pem,.key"
                            style="display: none"
                            @change="handleFileUpload"
                        />
                        <div class="upload-drop-zone" @click="triggerFileUpload">
                            <q-icon name="cloud_upload" size="48px" />
                            <p>{{ t('envVault.projectDetail.clickToSelect') }}</p>
                            <span class="upload-hint">.env, .js, .json, .pem, .key</span>
                        </div>

                        <!-- Show pasted content if file was uploaded -->
                        <q-input
                            v-if="pasteContent"
                            v-model="pasteContent"
                            type="textarea"
                            outlined
                            :label="t('envVault.projectDetail.fileContent')"
                            rows="6"
                            class="content-textarea q-mt-md"
                        />
                    </div>

                    <!-- Preview -->
                    <div v-if="parsedPreview.length > 0" class="preview-section">
                        <div class="preview-header">
                            <q-icon name="preview" />
                            <span>{{ t('envVault.projectDetail.preview') }}: {{ parsedPreview.length }} {{ t('envVault.projectDetail.variables') }}</span>
                        </div>
                        <div class="preview-list">
                            <div v-for="(v, i) in parsedPreview.slice(0, 5)" :key="i" class="preview-item">
                                <code>{{ v.name }}</code>
                                <span class="preview-value">= ••••••</span>
                            </div>
                            <div v-if="parsedPreview.length > 5" class="preview-more">
                                {{ t('envVault.projectDetail.andMore', { count: parsedPreview.length - 5 }) }}
                            </div>
                        </div>
                    </div>
                </q-card-section>

                <q-separator />

                <q-card-actions align="right" class="dialog-actions">
                    <q-btn flat :label="t('envVault.projectDetail.cancel')" @click="closeAddFileDialog" />
                    <q-btn
                        unelevated
                        :label="t('envVault.projectDetail.add')"
                        color="primary"
                        :loading="isAddingFile"
                        :disable="!pasteContent.trim() || !newFileName.trim()"
                        @click="addFileToProject"
                    />
                </q-card-actions>
            </q-card>
        </q-dialog>
    </q-dialog>
</template>

<style lang="scss" scoped>
.project-detail-card {
    display: flex;
    flex-direction: column;
    background: var(--bg-primary, #fff);
}

.lemonade-dark .project-detail-card {
    background: #0D1117;
}

.detail-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 16px;
    flex-wrap: wrap;
    gap: 12px;
}

.header-left {
    display: flex;
    align-items: center;
    gap: 12px;
}

.back-btn {
    color: var(--text-secondary, #666);
}

.project-icon-wrapper {
    position: relative;
    cursor: pointer;
    padding: 4px;
    border-radius: 8px;
    transition: all 0.2s ease;

    &:hover {
        background: rgba(247, 220, 111, 0.15);

        .edit-icon-overlay {
            opacity: 1;
        }
    }
}

.project-icon {
    font-size: 2rem;
    display: inline-block;

    &.icon-bounce {
        animation: iconBounce 0.3s ease-out;
    }
}

@keyframes iconBounce {
    0% {
        transform: scale(1);
    }
    50% {
        transform: scale(1.3);
    }
    100% {
        transform: scale(1);
    }
}

.edit-icon-overlay {
    position: absolute;
    bottom: 0;
    right: 0;
    background: var(--bg-primary, #fff);
    border-radius: 50%;
    padding: 2px;
    opacity: 0;
    transition: opacity 0.2s ease;
    color: var(--text-secondary, #666);
}

.lemonade-dark .edit-icon-overlay {
    background: #21262D;
    color: #8B949E;
}

// Icon picker styles
.icon-picker {
    padding: 12px;
    background: var(--bg-primary, #fff);
    width: 320px;
    max-height: 400px;
    overflow-y: auto;
}

.lemonade-dark .icon-picker {
    background: #21262D;
}

.icon-picker-title {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--text-secondary, #666);
    margin-bottom: 10px;
    text-align: center;
    position: sticky;
    top: -12px;
    background: var(--bg-primary, #fff);
    padding: 8px 0;
    margin-top: -12px;
    z-index: 1;
}

.lemonade-dark .icon-picker-title {
    color: #8B949E;
    background: #21262D;
}

.icon-grid {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 4px;
}

.icon-option {
    width: 34px;
    height: 34px;
    border: none;
    background: var(--bg-secondary, #f5f5f5);
    border-radius: 6px;
    font-size: 1.1rem;
    cursor: pointer;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;

    &:hover {
        background: rgba(247, 220, 111, 0.25);
        transform: scale(1.15);
    }

    &.active {
        background: rgba(247, 220, 111, 0.35);
        box-shadow: 0 0 0 2px #F7DC6F;
    }
}

.lemonade-dark .icon-option {
    background: #30363D;

    &:hover {
        background: rgba(247, 220, 111, 0.2);
    }

    &.active {
        background: rgba(247, 220, 111, 0.25);
    }
}

.project-info {
    h2 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 600;
        color: var(--text-primary, #333);
    }

    p {
        margin: 2px 0 0;
        font-size: 0.8rem;
        color: var(--text-secondary, #666);
    }
}

.lemonade-dark .project-info {
    h2 {
        color: #F0F6FC;
    }
    p {
        color: #8B949E;
    }
}

.header-actions {
    display: flex;
    gap: 8px;
}

.add-btn {
    color: #82E0AA;
}

.export-btn {
    color: #F7DC6F;
}

.search-section {
    padding: 12px 16px;
}

.search-input {
    max-width: 400px;
}

.loading-state {
    display: flex;
    justify-content: center;
    padding: 48px;
}

.variables-section {
    flex: 1;
    overflow-y: auto;
    padding: 0;
}

.file-header {
    background: var(--bg-secondary, #f5f5f5);

    &:hover {
        background: var(--bg-secondary, #eee);
    }
}

.lemonade-dark .file-header {
    background: #161B22;

    &:hover {
        background: #21262D;
    }
}

.file-path-caption {
    font-family: 'Fira Code', monospace;
    font-size: 0.75rem;
    color: var(--text-secondary, #888);
    opacity: 0.8;
}

.variables-list {
    padding: 8px 16px 8px 56px;
}

.variable-row {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 4px;
    background: var(--bg-secondary, #fafafa);

    &:hover {
        background: rgba(247, 220, 111, 0.1);
    }
}

.lemonade-dark .variable-row {
    background: #21262D;

    &:hover {
        background: rgba(247, 220, 111, 0.05);
    }
}

.variable-info {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 200px;
}

.variable-name {
    font-family: 'Fira Code', monospace;
    font-size: 0.85rem;
    color: #F7DC6F;
}

.variable-value {
    flex: 1;
    font-family: 'Fira Code', monospace;
    font-size: 0.85rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.value-text {
    color: var(--text-primary, #333);
}

.lemonade-dark .value-text {
    color: #F0F6FC;
}

.value-hidden {
    color: var(--text-secondary, #999);
}

.variable-actions {
    display: flex;
    gap: 4px;
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

.detail-footer {
    border-top: 1px solid var(--border-color, #e0e0e0);
    padding: 12px 16px;
}

.lemonade-dark .detail-footer {
    border-color: #30363D;
}

.footer-info {
    display: flex;
    gap: 24px;
    flex-wrap: wrap;

    span {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8rem;
        color: var(--text-secondary, #666);
    }
}

.lemonade-dark .footer-info span {
    color: #8B949E;
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

// Add File Dialog styles
.add-file-dialog {
    width: 100%;
    max-width: 500px;
    background: var(--bg-primary, #fff);
}

.lemonade-dark .add-file-dialog {
    background: #161B22;
}

.dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px;
}

.dialog-title {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary, #333);
}

.lemonade-dark .dialog-title {
    color: #F0F6FC;
}

.dialog-content {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.file-name-input {
    :deep(.q-field__control) {
        border-radius: 8px;
    }
}

.mode-selector {
    display: flex;
    gap: 8px;
}

.mode-btn {
    flex: 1;
    border-radius: 8px;
}

.paste-area,
.upload-area {
    min-height: 150px;
}

.content-textarea {
    :deep(.q-field__control) {
        border-radius: 8px;
    }

    :deep(textarea) {
        font-family: 'Fira Code', monospace;
        font-size: 0.85rem;
    }
}

.upload-drop-zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    border: 2px dashed var(--border-color, #e0e0e0);
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.3s ease;
    color: var(--text-secondary, #666);

    &:hover {
        border-color: #F7DC6F;
        background: rgba(247, 220, 111, 0.05);
    }

    p {
        margin: 12px 0 4px;
        font-weight: 500;
    }
}

.lemonade-dark .upload-drop-zone {
    border-color: #30363D;

    &:hover {
        border-color: #F7DC6F;
        background: rgba(247, 220, 111, 0.05);
    }
}

.upload-hint {
    font-size: 0.75rem;
    color: var(--text-secondary, #999);
}

.preview-section {
    background: var(--bg-secondary, #f5f5f5);
    border-radius: 8px;
    padding: 12px;
}

.lemonade-dark .preview-section {
    background: #21262D;
}

.preview-header {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--text-primary, #333);
    margin-bottom: 8px;
}

.lemonade-dark .preview-header {
    color: #F0F6FC;
}

.preview-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.preview-item {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 0.8rem;

    code {
        color: #F7DC6F;
        font-family: 'Fira Code', monospace;
    }
}

.preview-value {
    color: var(--text-secondary, #999);
}

.preview-more {
    font-size: 0.75rem;
    color: var(--text-secondary, #999);
    font-style: italic;
    margin-top: 4px;
}

.dialog-actions {
    padding: 12px 16px;
}

// AI Context Section Styles
.ai-context-section {
    padding: 0;
    border-top: 1px dashed rgba(156, 39, 176, 0.3);
}

.ai-context-header {
    background: rgba(156, 39, 176, 0.05);
    transition: background 0.2s ease;

    &:hover {
        background: rgba(156, 39, 176, 0.1);
    }
}

.ai-header-title {
    font-weight: 600;
    color: #9c27b0;
}

.ai-header-badges {
    display: flex;
    align-items: center;
    gap: 8px;
}

.ai-loading {
    display: flex;
    justify-content: center;
    padding: 24px;
}

.ai-files-list {
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.ai-file-card {
    background: rgba(156, 39, 176, 0.05);
    border-radius: 12px;
    padding: 12px;
    border: 1px solid rgba(156, 39, 176, 0.15);
    transition: all 0.2s ease;

    &:hover {
        border-color: rgba(156, 39, 176, 0.3);
        background: rgba(156, 39, 176, 0.08);
    }
}

.ai-file-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 8px;
}

.ai-tool-icon {
    font-size: 1.5rem;
}

.ai-file-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.ai-file-name {
    font-weight: 600;
    color: var(--text-primary, #333);
    font-size: 0.9rem;
}

.lemonade-dark .ai-file-name {
    color: #F0F6FC;
}

.ai-file-path {
    font-size: 0.75rem;
    color: var(--text-secondary, #666);
    font-family: 'Fira Code', monospace;
}

.ai-file-content {
    margin: 12px 0;
    padding: 12px;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 8px;
    overflow: hidden;
}

.lemonade-dark .ai-file-content {
    background: rgba(255, 255, 255, 0.05);
}

.ai-content-preview {
    code {
        font-family: 'Fira Code', monospace;
        font-size: 0.8rem;
        color: var(--text-secondary, #666);
        white-space: pre-wrap;
        word-break: break-word;
    }
}

.ai-content-full {
    max-height: 400px;
    overflow-y: auto;

    pre {
        font-family: 'Fira Code', monospace;
        font-size: 0.8rem;
        color: var(--text-primary, #333);
        white-space: pre-wrap;
        word-break: break-word;
        margin: 0;
    }
}

.lemonade-dark .ai-content-full pre {
    color: #F0F6FC;
}

.ai-file-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;

    .q-btn {
        color: #9c27b0;
    }
}
</style>
