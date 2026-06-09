<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useQuasar } from 'quasar';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { signOut } from 'firebase/auth';
import { auth } from 'boot/firebase';
import { useEnvVaultStore } from 'stores/envVault';
import { useThemeStore } from 'stores/theme';
import { useAdmin } from 'src/composables/useAdmin';
import EnvMasterPassword from 'components/EnvVault/EnvMasterPassword.vue';
import EnvDropZone from 'components/EnvVault/EnvDropZone.vue';
import EnvProjectCard from 'components/EnvVault/EnvProjectCard.vue';
import EnvProjectDetail from 'components/EnvVault/EnvProjectDetail.vue';
import EnvImportPreview from 'components/EnvVault/EnvImportPreview.vue';
import EnvConflictDialog from 'components/EnvVault/EnvConflictDialog.vue';
import LemonadeLoader from 'components/LemonadeLoader.vue';
import { matchesSearch, sortByRelevance } from 'src/utils/searchUtils';

const props = defineProps({ showSearch: Boolean });

const { t } = useI18n();
const $q = useQuasar();
const router = useRouter();
const envVaultStore = useEnvVaultStore();
const themeStore = useThemeStore();
const { roleLoaded } = useAdmin();

// State
const isLoading = ref(true);
const vaultState = ref('loading'); // 'loading', 'setup', 'locked', 'unlocked'
const searchText = ref('');
const searchInput = ref(null);
const sortMode = ref(localStorage.getItem('envVaultSortMode') || 'date-desc'); // 'date-desc' (newest first) or 'alpha-asc' (A-Z)
const selectedProject = ref(null);
const showProjectDetail = ref(false);
const scannedProjects = ref([]);
const showImportPreview = ref(false);
const isDraggingOver = ref(false);
const showConflictDialog = ref(false);
const projectConflicts = ref([]);
const pendingNonConflictProjects = ref([]);
const showPasteDialog = ref(false);
const pasteContent = ref('');
const pasteProjectName = ref('');

// Settings dialog
const showSettingsDialog = ref(false);
const showChangePasswordDialog = ref(false);
const currentPassword = ref('');
const newPassword = ref('');
const confirmNewPassword = ref('');
const showCurrentPassword = ref(false);
const showNewPassword = ref(false);
const showConfirmPassword = ref(false);
const isChangingPassword = ref(false);
const changePasswordError = ref('');

// Refs for inputs
const folderInput = ref(null);
const fileInput = ref(null);

// Import scanner service functions
import { scanFilesFromFolder, parseEnvContent, isAiContextFile } from 'src/services/envScannerService';

// Auto-lock interval
let autoLockInterval = null;

// Computed
const filteredProjects = computed(() => {
    let projects = [...envVaultStore.projects];

    // Filter by search
    if (searchText.value) {
        projects = projects.filter(p => matchesSearch(searchText.value, [p.name]));
        projects = sortByRelevance(projects, searchText.value, 'name');
    }

    // Sort
    if (sortMode.value === 'alpha-asc') {
        projects.sort((a, b) => a.name.localeCompare(b.name));
    } else {
        // date-desc: newest first
        projects.sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
            return dateB - dateA;
        });
    }

    return projects;
});

// Translate AUTO_LOCK_OPTIONS labels via i18n
const autoLockOptions = computed(() =>
    envVaultStore.AUTO_LOCK_OPTIONS.map(opt => ({
        label: t(opt.labelKey),
        value: opt.value
    }))
);

// Sort mode toggle
function toggleSortMode() {
    sortMode.value = sortMode.value === 'date-desc' ? 'alpha-asc' : 'date-desc';
    localStorage.setItem('envVaultSortMode', sortMode.value);
}

// Watch for header search toggle
watch(
    () => props.showSearch,
    (newVal) => {
        if (newVal && vaultState.value === 'unlocked') {
            nextTick(() => {
                searchInput.value?.focus();
            });
        }
        if (!newVal) {
            searchText.value = '';
        }
    }
);

// Lifecycle
onMounted(async () => {
    await initializeVault();
    startAutoLockCheck();
});

onUnmounted(() => {
    if (autoLockInterval) {
        clearInterval(autoLockInterval);
    }
});

// Methods
async function initializeVault() {
    isLoading.value = true;
    try {
        const isSetup = await envVaultStore.checkVaultSetup();
        if (!isSetup) {
            vaultState.value = 'setup';
        } else if (!envVaultStore.isUnlocked) {
            vaultState.value = 'locked';
        } else {
            vaultState.value = 'unlocked';
            await envVaultStore.fetchProjects();
        }
    } catch (error) {
        console.error('Error initializing vault:', error);
        $q.notify({
            type: 'negative',
            message: t('envVault.notifications.errorInitVault'),
            position: 'top'
        });
    } finally {
        isLoading.value = false;
    }
}

function startAutoLockCheck() {
    autoLockInterval = setInterval(() => {
        if (envVaultStore.checkAutoLock()) {
            vaultState.value = 'locked';
            $q.notify({
                type: 'info',
                message: t('envVault.notifications.lockedDueToInactivity'),
                position: 'top',
                icon: 'lock'
            });
        }
    }, 60000); // Check every minute
}

async function handleMasterPasswordSetup(password) {
    await envVaultStore.setupMasterPassword(password);
    vaultState.value = 'unlocked';
    $q.notify({
        type: 'positive',
        message: t('envVault.notifications.vaultConfigured'),
        position: 'top',
        icon: 'check_circle'
    });
}

async function handleUnlock(password) {
    await envVaultStore.unlockVault(password);
    vaultState.value = 'unlocked';
}

function handleLock() {
    envVaultStore.lockVault();
    vaultState.value = 'locked';
    $q.notify({
        type: 'info',
        message: t('envVault.notifications.vaultLocked'),
        position: 'top',
        icon: 'lock'
    });
}

function handleLogout() {
    $q.dialog({
        title: t('common.logout'),
        message: t('passwords.logoutConfirm'),
        cancel: true,
        persistent: true
    }).onOk(async () => {
        try {
            await signOut(auth);
            await router.push('/login');
        } catch (error) {
            console.error('Error signing out:', error);
            $q.notify({
                type: 'negative',
                message: t('passwords.messages.logoutError'),
                position: 'top'
            });
        }
    });
}

function handleScanComplete(projects) {
    scannedProjects.value = projects;
    showImportPreview.value = true;
}

async function handleImportConfirm(selectedProjects) {
    try {
        // Check for conflicts (duplicate projects)
        const conflicts = [];
        const nonConflictProjects = [];

        for (const project of selectedProjects) {
            const existingProject = envVaultStore.findExistingProject(project.name);
            if (existingProject) {
                conflicts.push({
                    incoming: project,
                    existing: existingProject
                });
            } else {
                nonConflictProjects.push(project);
            }
        }

        // If there are conflicts, show the dialog
        if (conflicts.length > 0) {
            projectConflicts.value = conflicts;
            pendingNonConflictProjects.value = nonConflictProjects;
            showImportPreview.value = false;
            showConflictDialog.value = true;
            return;
        }

        // No conflicts - import directly
        await envVaultStore.importScannedProjects(selectedProjects);
        showImportPreview.value = false;
        scannedProjects.value = [];
        $q.notify({
            type: 'positive',
            message: `${selectedProjects.length} proyecto(s) importado(s)`,
            position: 'top',
            icon: 'check_circle'
        });
    } catch (error) {
        console.error('Error importing projects:', error);
        $q.notify({
            type: 'negative',
            message: 'Error al importar proyectos',
            position: 'top'
        });
    }
}

function handleImportCancel() {
    showImportPreview.value = false;
    scannedProjects.value = [];
}

async function handleConflictResolve(resolutions) {
    showConflictDialog.value = false;

    let importedCount = 0;
    let mergedCount = 0;
    let replacedCount = 0;
    let skippedCount = 0;
    let renamedCount = 0;

    try {
        // First, import non-conflict projects
        if (pendingNonConflictProjects.value.length > 0) {
            await envVaultStore.importScannedProjects(pendingNonConflictProjects.value);
            importedCount = pendingNonConflictProjects.value.length;
        }

        // Then handle conflicts according to user's resolutions
        for (const resolution of resolutions) {
            switch (resolution.resolution) {
                case 'skip':
                    skippedCount++;
                    break;

                case 'replace':
                    await envVaultStore.replaceProject(resolution.existing.id, resolution.incoming);
                    replacedCount++;
                    break;

                case 'merge':
                    await envVaultStore.mergeProject(resolution.existing.id, resolution.incoming);
                    mergedCount++;
                    break;

                case 'rename': {
                    // Add suffix to name to make it unique
                    const renamedProject = {
                        ...resolution.incoming,
                        name: `${resolution.incoming.name} (${new Date().toLocaleDateString()})`
                    };
                    await envVaultStore.importScannedProjects([renamedProject]);
                    renamedCount++;
                    break;
                }
            }
        }

        // Build notification message
        const messages = [];
        if (importedCount > 0) messages.push(`${importedCount} importado(s)`);
        if (mergedCount > 0) messages.push(`${mergedCount} actualizado(s)`);
        if (replacedCount > 0) messages.push(`${replacedCount} reemplazado(s)`);
        if (renamedCount > 0) messages.push(`${renamedCount} renombrado(s)`);
        if (skippedCount > 0) messages.push(`${skippedCount} omitido(s)`);

        $q.notify({
            type: 'positive',
            message: `Proyectos: ${messages.join(', ')}`,
            position: 'top',
            icon: 'check_circle'
        });

    } catch (error) {
        console.error('Error resolving conflicts:', error);
        $q.notify({
            type: 'negative',
            message: 'Error al resolver conflictos',
            position: 'top'
        });
    } finally {
        // Clean up
        projectConflicts.value = [];
        pendingNonConflictProjects.value = [];
        scannedProjects.value = [];
    }
}

function handleConflictCancel() {
    showConflictDialog.value = false;
    projectConflicts.value = [];
    pendingNonConflictProjects.value = [];
    scannedProjects.value = [];
}

function openProjectDetail(project) {
    selectedProject.value = project;
    showProjectDetail.value = true;
    envVaultStore.updateActivity();
}

function closeProjectDetail() {
    selectedProject.value = null;
    showProjectDetail.value = false;
}

function refreshSelectedProject() {
    // Refresh the selected project from the store to reflect changes (e.g.: icon)
    if (selectedProject.value) {
        const updatedProject = envVaultStore.projects.find(p => p.id === selectedProject.value.id);
        if (updatedProject) {
            selectedProject.value = updatedProject;
        }
    }
}

async function handleDeleteProject(projectId) {
    $q.dialog({
        title: t('envVault.project.deleteProject'),
        message: t('envVault.notifications.deleteProjectConfirm'),
        cancel: true,
        persistent: true,
        color: 'negative'
    }).onOk(async () => {
        try {
            await envVaultStore.deleteProject(projectId);
            closeProjectDetail();
            $q.notify({
                type: 'positive',
                message: t('envVault.messages.deleted'),
                position: 'top'
            });
        } catch (error) {
            console.error('Error deleting project:', error);
            $q.notify({
                type: 'negative',
                message: t('envVault.messages.errorDelete'),
                position: 'top'
            });
        }
    });
}

// Handle drop on the projects area
async function handlePageDrop(event) {
    isDraggingOver.value = false;

    const items = event.dataTransfer.items;
    if (!items || items.length === 0) return;

    // Get entries from drop
    const entries = [];
    for (const item of items) {
        if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry?.();
            if (entry) entries.push(entry);
        }
    }

    if (entries.length === 0) return;

    // Process entries using the same logic as EnvDropZone
    const allFiles = [];

    for (const entry of entries) {
        if (entry.isDirectory) {
            const files = await readEntryRecursive(entry, '', entry.name);
            allFiles.push(...files);
        }
    }

    if (allFiles.length > 0) {
        const projects = await scanFilesFromFolder(allFiles);
        if (projects.length > 0) {
            handleScanComplete(projects);
        } else {
            $q.notify({
                type: 'warning',
                message: t('envVault.scanner.noConfigFilesFound'),
                position: 'top',
                icon: 'search_off'
            });
        }
    }
}

// Recursive function to read directory entries
async function readEntryRecursive(entry, path = '', rootFolder = '') {
    const files = [];

    if (entry.isFile) {
        const relativePath = path + entry.name;
        if (isEnvFile(entry.name, relativePath)) {
            const file = await getFileFromEntry(entry);
            file._relativePath = relativePath;
            file._projectName = rootFolder || t('envVault.defaults.projectName');
            file._rootFolder = rootFolder;
            files.push(file);
        }
    } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const entries = await readAllEntries(reader);

        for (const childEntry of entries) {
            // Skip common folders (but NOT .claude, .cursor, .github which hold AI context files)
            if (childEntry.isDirectory) {
                const dirName = childEntry.name.toLowerCase();
                if (['node_modules', '.git', 'dist', 'build', '.next', 'vendor',
                     '__pycache__', '.venv', 'venv', '.idea', '.vscode', 'coverage',
                     '.cache', 'tmp', 'temp', 'logs', '.npm', '.yarn'].includes(dirName)) {
                    continue;
                }
            }

            const newPath = path ? path + entry.name + '/' : entry.name + '/';
            const childFiles = await readEntryRecursive(childEntry, newPath, rootFolder);
            files.push(...childFiles);
        }
    }

    return files;
}

function getFileFromEntry(fileEntry) {
    return new Promise((resolve, reject) => {
        fileEntry.file(resolve, reject);
    });
}

function readAllEntries(reader) {
    return new Promise((resolve, reject) => {
        const entries = [];
        function readBatch() {
            reader.readEntries((batch) => {
                if (batch.length === 0) {
                    resolve(entries);
                } else {
                    entries.push(...batch);
                    readBatch();
                }
            }, reject);
        }
        readBatch();
    });
}

function isEnvFile(fileName, relativePath = '') {
    const name = fileName.toLowerCase();

    // Check if it's an AI context file
    const aiCheck = isAiContextFile(fileName, relativePath);
    if (aiCheck.isAiContext) return true;

    if (name.startsWith('.env')) return true;

    const exactMatches = ['.npmrc', '.yarnrc', '.netrc', 'credentials.json', 'secrets.json',
                          'config.json', 'serviceaccount.json', 'service-account.json',
                          'privkey.pem', 'private.key', 'id_rsa', 'id_ed25519'];
    if (exactMatches.includes(name)) return true;

    const partialMatches = ['firebase-adminsdk', 'serviceaccount', 'service-account',
                            'privkey', 'privkeys', 'private-key', 'privatekey', 'credentials',
                            'secrets', 'apikey', 'api-key', 'api_key'];
    const validExtensions = ['.json', '.pem', '.key', '.env', '.js'];

    if (partialMatches.some(p => name.includes(p))) {
        return validExtensions.some(ext => name.endsWith(ext)) ||
               !name.includes('.') || name.startsWith('.');
    }

    return false;
}

// FAB functions
function triggerFolderInput() {
    folderInput.value?.click();
}

function triggerFileInput() {
    fileInput.value?.click();
}

function openPasteDialog() {
    pasteContent.value = '';
    pasteProjectName.value = '';
    showPasteDialog.value = true;
}

async function handleFolderSelect(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    // Add metadata to files
    files.forEach(file => {
        file._relativePath = file.webkitRelativePath || file.name;
    });

    const projects = await scanFilesFromFolder(files);
    if (projects.length > 0) {
        handleScanComplete(projects);
    } else {
        $q.notify({
            type: 'warning',
            message: t('envVault.scanner.noConfigFilesFound'),
            position: 'top',
            icon: 'search_off'
        });
    }

    // Reset input
    event.target.value = '';
}

async function handleFileSelect(event) {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;

    const projects = await scanFilesFromFolder(files);
    if (projects.length > 0) {
        handleScanComplete(projects);
    } else {
        $q.notify({
            type: 'warning',
            message: t('envVault.scanner.noValidConfigFiles'),
            position: 'top',
            icon: 'search_off'
        });
    }

    // Reset input
    event.target.value = '';
}

async function handlePasteSubmit() {
    if (!pasteContent.value.trim()) return;

    const variables = parseEnvContent(pasteContent.value);

    if (variables.length === 0) {
        $q.notify({
            type: 'warning',
            message: t('envVault.paste.noValidVariables'),
            caption: t('envVault.paste.formatHint'),
            position: 'top'
        });
        return;
    }

    const projectName = pasteProjectName.value.trim() || t('envVault.defaults.projectName');
    const project = {
        name: projectName,
        sourceFolder: `pasted-${Date.now()}`,
        icon: '📋',
        files: [{
            name: '.env',
            path: '.env',
            variables: variables
        }],
        variablesCount: variables.length
    };

    showPasteDialog.value = false;
    handleScanComplete([project]);
}

// Settings functions
function openSettings() {
    showSettingsDialog.value = true;
}

function handleAutoLockChange(minutes) {
    envVaultStore.setAutoLockMinutes(minutes);
    $q.notify({
        type: 'positive',
        message: minutes === 0
            ? t('envVault.notifications.autoLockDisabled')
            : t('envVault.notifications.autoLockConfigured', { minutes }),
        position: 'top',
        icon: 'timer'
    });
}

function openChangePassword() {
    currentPassword.value = '';
    newPassword.value = '';
    confirmNewPassword.value = '';
    changePasswordError.value = '';
    showChangePasswordDialog.value = true;
}

async function handleChangePassword() {
    changePasswordError.value = '';

    if (newPassword.value.length < 8) {
        changePasswordError.value = t('envVault.changePassword.errorMinLength');
        return;
    }

    if (newPassword.value !== confirmNewPassword.value) {
        changePasswordError.value = t('envVault.changePassword.errorMismatch');
        return;
    }

    isChangingPassword.value = true;
    try {
        await envVaultStore.changeMasterPassword(currentPassword.value, newPassword.value);
        showChangePasswordDialog.value = false;
        $q.notify({
            type: 'positive',
            message: t('envVault.changePassword.success'),
            position: 'top',
            icon: 'check_circle'
        });
    } catch (error) {
        changePasswordError.value = error.message || t('envVault.changePassword.errorGeneric');
    } finally {
        isChangingPassword.value = false;
    }
}
</script>

<template>
    <q-page class="env-vault-page" :class="themeStore.themeClass">
        <!-- Loading State -->
        <LemonadeLoader v-if="isLoading || !roleLoaded" :message="$t('envVault.loading')" />

        <!-- Setup State - Primera vez -->
        <EnvMasterPassword
            v-else-if="vaultState === 'setup'"
            mode="setup"
            :on-submit="handleMasterPasswordSetup"
        />

        <!-- Locked State -->
        <EnvMasterPassword
            v-else-if="vaultState === 'locked'"
            mode="unlock"
            :on-submit="handleUnlock"
        />

        <!-- Unlocked State -->
        <div v-else-if="vaultState === 'unlocked'" class="vault-content">
            <!-- Header -->
            <div class="vault-header">
                <div class="header-left">
                    <q-icon name="lock_open" size="24px" class="vault-icon" />
                    <span class="vault-title">{{ $t('envVault.title') }}</span>
                    <q-badge color="primary" :label="$t('envVault.projectsCount', { count: envVaultStore.projectsCount })" />
                    <q-btn
                        flat
                        round
                        dense
                        icon="lock"
                        @click="handleLock"
                        class="lock-btn lock-btn-mobile"
                        :aria-label="$t('envVault.lockVault')"
                    >
                        <q-tooltip>{{ $t('envVault.lockVault') }}</q-tooltip>
                    </q-btn>
                </div>
                <div class="header-right">
                    <q-input
                        v-if="props.showSearch"
                        ref="searchInput"
                        v-model="searchText"
                        dense
                        outlined
                        :placeholder="$t('common.search') + '...'"
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
                                role="button"
                                :aria-label="$t('common.clear')"
                            />
                        </template>
                    </q-input>
                    <q-btn
                        flat
                        round
                        icon="lock"
                        @click="handleLock"
                        class="lock-btn lock-btn-desktop"
                        :aria-label="$t('envVault.lockVault')"
                    >
                        <q-tooltip>{{ $t('envVault.lockVault') }}</q-tooltip>
                    </q-btn>
                </div>
            </div>

            <!-- Empty State or Drop Zone -->
            <div v-if="envVaultStore.projects.length === 0" class="empty-state">
                <EnvDropZone @scan-complete="handleScanComplete" />
            </div>

            <!-- Projects Grid -->
            <div v-else class="projects-container">
                <!-- Projects Grid with integrated drop zone -->
                <div
                    class="projects-drop-area"
                    :class="{ 'dragging': isDraggingOver }"
                    @dragover.prevent="isDraggingOver = true"
                    @dragleave="isDraggingOver = false"
                    @drop.prevent="handlePageDrop"
                >
                    <!-- Projects Grid -->
                    <div class="projects-grid">
                        <EnvProjectCard
                            v-for="project in filteredProjects"
                            :key="project.id"
                            :project="project"
                            @click="openProjectDetail(project)"
                            @delete="handleDeleteProject(project.id)"
                        />
                    </div>

                    <!-- Drop overlay -->
                    <div v-if="isDraggingOver" class="drop-overlay">
                        <q-icon name="add_circle" size="64px" />
                        <p>{{ t('envVault.page.dropToAddProjects') }}</p>
                    </div>
                </div>

                <!-- No results -->
                <div v-if="filteredProjects.length === 0 && searchText" class="no-results">
                    <q-icon name="search_off" size="48px" />
                    <p>{{ t('envVault.page.noProjectsFound') }}</p>
                </div>
            </div>
        </div>

        <!-- Sticky buttons bottom-left (settings + logout) -->
        <q-page-sticky v-if="vaultState === 'unlocked'" position="bottom-left" :offset="[10, 17]" class="high-z-index">
            <div class="row q-gutter-xs">
                <q-btn round icon="settings" color="grey-7" size="sm" @click="openSettings"
                    :aria-label="t('envVault.page.settingsAriaLabel')" />
                <q-btn round icon="logout" color="green-7" size="sm" @click="handleLogout"
                    :aria-label="t('envVault.page.logoutAriaLabel')" />
            </div>
        </q-page-sticky>

        <!-- Sticky sort button -->
        <q-page-sticky position="bottom" :offset="[10, 17]" class="sort-sticky">
            <div class="row q-gutter-xs" v-if="!isLoading && filteredProjects.length > 0">
                <q-btn
                    size="10px"
                    color="grey-7"
                    :label="sortMode === 'date-desc' ? $t('envVault.sortAZ') : $t('envVault.sortRecent')"
                    @click="toggleSortMode"
                />
            </div>
        </q-page-sticky>

        <!-- Project Detail Dialog -->
        <EnvProjectDetail
            v-if="selectedProject"
            :project="selectedProject"
            :show="showProjectDetail"
            @close="closeProjectDetail"
            @delete="handleDeleteProject"
            @updated="refreshSelectedProject"
        />

        <!-- Import Preview Dialog -->
        <EnvImportPreview
            :show="showImportPreview"
            :projects="scannedProjects"
            @confirm="handleImportConfirm"
            @cancel="handleImportCancel"
        />

        <!-- Conflict Resolution Dialog -->
        <EnvConflictDialog
            :show="showConflictDialog"
            :conflicts="projectConflicts"
            @resolve="handleConflictResolve"
            @cancel="handleConflictCancel"
        />

        <!-- FAB para agregar proyectos -->
        <q-page-sticky v-if="vaultState === 'unlocked' && envVaultStore.projects.length > 0" position="bottom-right" :offset="[18, 18]">
            <q-fab
                icon="add"
                direction="up"
                color="primary"
                class="add-fab"
                vertical-actions-align="right"
            >
                <q-fab-action
                    color="primary"
                    icon="folder_open"
                    :label="t('envVault.page.fab.folder')"
                    label-position="left"
                    external-label
                    @click="triggerFolderInput"
                />
                <q-fab-action
                    color="grey-7"
                    icon="upload_file"
                    :label="t('envVault.page.fab.files')"
                    label-position="left"
                    external-label
                    @click="triggerFileInput"
                />
                <q-fab-action
                    color="grey-7"
                    icon="content_paste"
                    :label="t('envVault.page.fab.pasteEnv')"
                    label-position="left"
                    external-label
                    @click="openPasteDialog"
                />
            </q-fab>
        </q-page-sticky>

        <!-- Hidden inputs para FAB -->
        <input
            ref="folderInput"
            type="file"
            webkitdirectory
            hidden
            @change="handleFolderSelect"
        />
        <input
            ref="fileInput"
            type="file"
            multiple
            hidden
            @change="handleFileSelect"
        />

        <!-- Paste Dialog -->
        <q-dialog v-model="showPasteDialog" persistent>
            <q-card class="paste-dialog" :class="themeStore.themeClass">
                <q-card-section class="paste-header">
                    <div class="header-title">
                        <q-icon name="content_paste" size="24px" class="header-icon" />
                        <span>{{ t('envVault.pasteDialog.title') }}</span>
                    </div>
                    <q-btn flat round dense icon="close" @click="showPasteDialog = false" :aria-label="$t('common.close')" />
                </q-card-section>

                <q-card-section>
                    <q-input
                        v-model="pasteProjectName"
                        :label="t('envVault.pasteDialog.projectNameLabel')"
                        outlined
                        dense
                        class="project-name-input"
                        :placeholder="t('envVault.pasteDialog.projectNamePlaceholder')"
                    />

                    <q-input
                        v-model="pasteContent"
                        type="textarea"
                        :label="t('envVault.pasteDialog.contentLabel')"
                        outlined
                        class="paste-textarea"
                        placeholder="DATABASE_URL=postgres://...
API_KEY=sk-...
SECRET_TOKEN=abc123"
                        :rows="10"
                        autofocus
                    />

                    <p class="paste-hint">
                        <q-icon name="info" size="14px" />
                        {{ t('envVault.pasteDialog.formatHint') }}
                    </p>
                </q-card-section>

                <q-card-actions align="right" class="paste-actions">
                    <q-btn flat :label="t('common.cancel')" @click="showPasteDialog = false" />
                    <q-btn
                        unelevated
                        :label="t('envVault.pasteDialog.import')"
                        color="primary"
                        @click="handlePasteSubmit"
                        :disable="!pasteContent.trim()"
                    />
                </q-card-actions>
            </q-card>
        </q-dialog>

        <!-- Settings Dialog -->
        <q-dialog v-model="showSettingsDialog">
            <q-card class="settings-dialog" :class="themeStore.themeClass">
                <q-card-section class="settings-header">
                    <div class="header-title">
                        <q-icon name="settings" size="24px" class="header-icon" />
                        <span>{{ t('envVault.settingsDialog.title') }}</span>
                    </div>
                    <q-btn flat round dense icon="close" @click="showSettingsDialog = false" :aria-label="$t('common.close')" />
                </q-card-section>

                <q-card-section class="settings-content">
                    <!-- Auto-lock setting -->
                    <div class="setting-item">
                        <div class="setting-label">
                            <q-icon name="timer" size="20px" />
                            <div class="setting-text">
                                <span class="setting-title">{{ t('envVault.settingsDialog.autoLockTitle') }}</span>
                                <span class="setting-desc">{{ t('envVault.settingsDialog.autoLockDesc') }}</span>
                            </div>
                        </div>
                        <q-select
                            v-model="envVaultStore.autoLockMinutes"
                            :options="autoLockOptions"
                            option-value="value"
                            option-label="label"
                            emit-value
                            map-options
                            dense
                            outlined
                            class="auto-lock-select"
                            @update:model-value="handleAutoLockChange"
                        />
                    </div>

                    <q-separator class="setting-separator" />

                    <!-- Change password -->
                    <div class="setting-item clickable" @click="openChangePassword">
                        <div class="setting-label">
                            <q-icon name="key" size="20px" />
                            <div class="setting-text">
                                <span class="setting-title">{{ t('envVault.settingsDialog.changeMasterTitle') }}</span>
                                <span class="setting-desc">{{ t('envVault.settingsDialog.changeMasterDesc') }}</span>
                            </div>
                        </div>
                        <q-icon name="chevron_right" size="24px" class="chevron-icon" />
                    </div>
                </q-card-section>

                <q-card-section class="settings-info">
                    <q-icon name="info" size="16px" />
                    <span>{{ t('envVault.settingsDialog.sessionInfo') }}</span>
                </q-card-section>
            </q-card>
        </q-dialog>

        <!-- Change Password Dialog -->
        <q-dialog v-model="showChangePasswordDialog" persistent>
            <q-card class="change-password-dialog" :class="themeStore.themeClass">
                <q-card-section class="dialog-header">
                    <div class="header-title">
                        <q-icon name="key" size="24px" class="header-icon" />
                        <span>{{ t('envVault.changePasswordDialog.title') }}</span>
                    </div>
                    <q-btn flat round dense icon="close" @click="showChangePasswordDialog = false" :disable="isChangingPassword" :aria-label="$t('common.close')" />
                </q-card-section>

                <q-card-section>
                    <q-banner v-if="changePasswordError" class="error-banner q-mb-md" dense>
                        <template v-slot:avatar>
                            <q-icon name="error" color="negative" />
                        </template>
                        {{ changePasswordError }}
                    </q-banner>

                    <q-input
                        v-model="currentPassword"
                        :type="showCurrentPassword ? 'text' : 'password'"
                        :label="t('envVault.changePasswordDialog.currentPassword')"
                        outlined
                        class="password-field"
                    >
                        <template v-slot:prepend>
                            <q-icon name="lock" />
                        </template>
                        <template v-slot:append>
                            <q-icon
                                :name="showCurrentPassword ? 'visibility_off' : 'visibility'"
                                class="cursor-pointer"
                                @click="showCurrentPassword = !showCurrentPassword"
                            />
                        </template>
                    </q-input>

                    <q-input
                        v-model="newPassword"
                        :type="showNewPassword ? 'text' : 'password'"
                        :label="t('envVault.changePasswordDialog.newPassword')"
                        outlined
                        class="password-field"
                        :hint="t('envVault.changePasswordDialog.minLengthHint')"
                    >
                        <template v-slot:prepend>
                            <q-icon name="vpn_key" />
                        </template>
                        <template v-slot:append>
                            <q-icon
                                :name="showNewPassword ? 'visibility_off' : 'visibility'"
                                class="cursor-pointer"
                                @click="showNewPassword = !showNewPassword"
                            />
                        </template>
                    </q-input>

                    <q-input
                        v-model="confirmNewPassword"
                        :type="showConfirmPassword ? 'text' : 'password'"
                        :label="t('envVault.changePasswordDialog.confirmNewPassword')"
                        outlined
                        class="password-field"
                        :error="confirmNewPassword && newPassword !== confirmNewPassword"
                        :error-message="t('envVault.changePasswordDialog.passwordsDontMatch')"
                    >
                        <template v-slot:prepend>
                            <q-icon name="vpn_key" />
                        </template>
                        <template v-slot:append>
                            <q-icon
                                :name="showConfirmPassword ? 'visibility_off' : 'visibility'"
                                class="cursor-pointer"
                                @click="showConfirmPassword = !showConfirmPassword"
                            />
                        </template>
                    </q-input>
                </q-card-section>

                <q-card-actions align="right" class="dialog-actions">
                    <q-btn flat :label="t('common.cancel')" @click="showChangePasswordDialog = false" :disable="isChangingPassword" />
                    <q-btn
                        unelevated
                        :label="t('envVault.changePasswordDialog.submitButton')"
                        color="primary"
                        @click="handleChangePassword"
                        :loading="isChangingPassword"
                        :disable="!currentPassword || !newPassword || !confirmNewPassword || newPassword !== confirmNewPassword"
                    />
                </q-card-actions>
            </q-card>
        </q-dialog>
    </q-page>
</template>

<style lang="scss" scoped>
.env-vault-page {
    padding: 16px;
    min-height: calc(100vh - 100px);
}

// Premium Paywall
.premium-paywall {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: calc(100vh - 150px);
    padding: 24px;
}

.paywall-content {
    text-align: center;
    max-width: 480px;
    padding: 48px 32px;
    background: var(--bg-elevated, #fff);
    border-radius: 16px;
    border: 1px solid var(--border-color, #e0e0e0);
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.08);
}

.paywall-icon {
    font-size: 4rem;
    margin-bottom: 16px;
}

.paywall-title {
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 12px;
    color: var(--text-primary, #212121);
}

.paywall-description {
    color: var(--text-secondary, #666);
    margin-bottom: 24px;
    line-height: 1.6;

    code {
        background: var(--bg-hover, #f5f5f5);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: 'SF Mono', Monaco, monospace;
        font-size: 0.9em;
    }
}

.paywall-features {
    text-align: left;
    margin-bottom: 32px;
}

.paywall-feature {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 0;
    color: var(--text-primary, #212121);
    font-size: 0.95rem;
}

.paywall-btn {
    width: 100%;
    padding: 12px 24px;
    font-weight: 600;
    margin-bottom: 16px;
}

.paywall-note {
    font-size: 0.85rem;
    color: var(--text-secondary, #999);

    a {
        color: var(--primary, #F7DC6F);
        text-decoration: none;

        &:hover {
            text-decoration: underline;
        }
    }
}

// Dark mode paywall
.lemonade-dark .paywall-content {
    background: #161b22;
    border-color: #30363d;
}

.lemonade-dark .paywall-description code {
    background: #21262d;
}

.vault-content {
    max-width: 1400px;
    margin: 0 auto;
}

.vault-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
    gap: 12px;

    @media (max-width: 599px) {
        flex-direction: column;
        align-items: stretch;
    }
}

.header-left {
    display: flex;
    align-items: center;
    gap: 8px;

    @media (max-width: 599px) {
        justify-content: space-between;
    }
}

.vault-icon {
    color: #F7DC6F;

    @media (max-width: 599px) {
        display: none;
    }
}

.vault-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: var(--text-primary, #333);

    @media (max-width: 599px) {
        font-size: 1.2rem;
    }
}

.lemonade-dark .vault-title {
    color: #F0F6FC;
}

.header-right {
    display: flex;
    align-items: center;
    gap: 8px;

    @media (max-width: 599px) {
        width: 100%;
    }
}

.search-input {
    width: 200px;

    @media (max-width: 599px) {
        flex: 1;
        width: auto;
    }
}

.lock-btn {
    color: var(--text-secondary, #666);

    &:hover {
        color: #e74c3c;
        background: rgba(231, 76, 60, 0.1);
    }
}

.lock-btn-mobile {
    display: none;

    @media (max-width: 599px) {
        display: flex;
    }
}

.lock-btn-desktop {
    @media (max-width: 599px) {
        display: none;
    }
}

.empty-state {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 50vh;
}

.projects-container {
    display: flex;
    flex-direction: column;
    gap: 24px;
}

.projects-drop-area {
    position: relative;
    min-height: 300px;
    border-radius: 16px;
    transition: all 0.3s ease;

    &.dragging {
        background: rgba(247, 220, 111, 0.05);
        border: 2px dashed #F7DC6F;
    }
}

.projects-grid {
    display: flex;
    flex-direction: column;
    gap: 0;
}

.drop-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    background: rgba(247, 220, 111, 0.15);
    border-radius: 16px;
    z-index: 10;
    pointer-events: none;

    .q-icon {
        color: #F7DC6F;
        margin-bottom: 8px;
    }

    p {
        font-size: 1.1rem;
        font-weight: 600;
        color: #F7DC6F;
        margin: 0;
    }
}

.no-results {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px;
    color: var(--text-secondary, #666);
    gap: 12px;
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
    --bg-primary: #FAFAFA;
    --bg-secondary: #FFFFFF;
    --border-color: #E0E0E0;
}

// FAB styles
.add-fab {
    :deep(.q-fab__icon-holder) {
        background: linear-gradient(135deg, #F7DC6F 0%, #f1c40f 100%);
    }

    :deep(.q-btn--fab) {
        background: linear-gradient(135deg, #F7DC6F 0%, #f1c40f 100%) !important;
        color: #000 !important;
    }
}

.lemonade-dark .add-fab {
    :deep(.q-fab__icon-holder) {
        background: linear-gradient(135deg, #F7DC6F 0%, #f1c40f 100%);
    }
}

// Paste Dialog styles
.paste-dialog {
    width: 100%;
    max-width: 500px;
    background: var(--bg-primary, #fff);
    border-radius: 16px;
}

.lemonade-dark .paste-dialog {
    background: #161B22;
}

.paste-header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .header-title {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-primary, #333);
    }

    .header-icon {
        color: #F7DC6F;
    }
}

.lemonade-dark .paste-header .header-title {
    color: #F0F6FC;
}

.project-name-input {
    margin-bottom: 16px;
}

.paste-textarea {
    margin-bottom: 8px;

    :deep(textarea) {
        font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        font-size: 0.85rem;
    }
}

.paste-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--text-secondary, #666);
    margin: 0;
}

.lemonade-dark .paste-hint {
    color: #8B949E;
}

.paste-actions {
    padding: 12px 16px;
}

// Sort sticky button
.sort-sticky {
    z-index: 100;
}

// High z-index for sticky buttons
.high-z-index {
    z-index: 100;
}

// Settings button
.settings-btn {
    color: var(--text-secondary, #666);

    &:hover {
        color: #F7DC6F;
        background: rgba(247, 220, 111, 0.1);
    }
}

.lemonade-dark .settings-btn {
    color: #8B949E;

    &:hover {
        color: #F7DC6F;
        background: rgba(247, 220, 111, 0.15);
    }
}

// Settings Dialog styles
.settings-dialog {
    width: 100%;
    max-width: 420px;
    background: var(--bg-primary, #fff);
    border-radius: 16px;
}

.lemonade-dark .settings-dialog {
    background: #161B22;
}

.settings-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 8px;

    .header-title {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-primary, #333);
    }

    .header-icon {
        color: #F7DC6F;
    }
}

.lemonade-dark .settings-header .header-title {
    color: #F0F6FC;
}

.settings-content {
    padding-top: 0;
}

.setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 0;
    gap: 16px;

    &.clickable {
        cursor: pointer;
        border-radius: 8px;
        margin: 0 -8px;
        padding: 12px 8px;
        transition: background 0.2s ease;

        &:hover {
            background: rgba(247, 220, 111, 0.1);
        }
    }
}

.setting-label {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;

    .q-icon {
        color: #F7DC6F;
    }
}

.setting-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.setting-title {
    font-weight: 500;
    color: var(--text-primary, #333);
}

.lemonade-dark .setting-title {
    color: #F0F6FC;
}

.setting-desc {
    font-size: 0.8rem;
    color: var(--text-secondary, #666);
}

.lemonade-dark .setting-desc {
    color: #8B949E;
}

.auto-lock-select {
    min-width: 140px;
}

.setting-separator {
    margin: 8px 0;
}

.chevron-icon {
    color: var(--text-secondary, #666);
}

.lemonade-dark .chevron-icon {
    color: #8B949E;
}

.settings-info {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 8px;
    font-size: 0.8rem;
    color: var(--text-secondary, #666);
    border-top: 1px solid var(--border-color, #e0e0e0);

    .q-icon {
        color: #F7DC6F;
    }
}

.lemonade-dark .settings-info {
    color: #8B949E;
    border-top-color: #30363D;
}

// Change Password Dialog styles
.change-password-dialog {
    width: 100%;
    max-width: 420px;
    background: var(--bg-primary, #fff);
    border-radius: 16px;
}

.lemonade-dark .change-password-dialog {
    background: #161B22;
}

.dialog-header {
    display: flex;
    justify-content: space-between;
    align-items: center;

    .header-title {
        display: flex;
        align-items: center;
        gap: 12px;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--text-primary, #333);
    }

    .header-icon {
        color: #F7DC6F;
    }
}

.lemonade-dark .dialog-header .header-title {
    color: #F0F6FC;
}

.error-banner {
    background: rgba(231, 76, 60, 0.1);
    border-radius: 8px;
}

.password-field {
    margin-bottom: 16px;

    :deep(.q-field__control) {
        border-radius: 12px;
    }
}

.dialog-actions {
    padding: 12px 16px;
}
</style>
