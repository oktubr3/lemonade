<script setup>
import { ref } from 'vue';
import { useQuasar } from 'quasar';
import { useI18n } from 'vue-i18n';
import { useThemeStore } from 'stores/theme';
import { scanFilesFromFolder, parseEnvContent, isAiContextFile } from 'src/services/envScannerService';

const props = defineProps({
    compact: {
        type: Boolean,
        default: false
    }
});

const emit = defineEmits(['scan-complete']);

const { t } = useI18n();
const $q = useQuasar();
const themeStore = useThemeStore();

// State
const isDragging = ref(false);
const isScanning = ref(false);
const scanProgress = ref({ phase: '', count: 0, found: 0 });
const showPasteDialog = ref(false);
const pasteContent = ref('');
const pasteProjectName = ref('');

// Refs
const fileInput = ref(null);
const folderInput = ref(null);

// Methods
function handleDragOver(event) {
    event.preventDefault();
    isDragging.value = true;
}

function handleDragLeave() {
    isDragging.value = false;
}

async function handleDrop(event) {
    event.preventDefault();
    isDragging.value = false;

    const items = event.dataTransfer.items;
    if (!items || items.length === 0) return;

    // Check how many root folders are being dragged
    const entries = [];
    for (const item of items) {
        if (item.kind === 'file') {
            const entry = item.webkitGetAsEntry?.();
            if (entry) entries.push(entry);
        }
    }

    // Detect if multiple folders were dragged (multiple projects at once)
    const folderEntries = entries.filter(e => e.isDirectory);
    if (folderEntries.length > 1) {
        $q.dialog({
            title: t('envVault.dropZone.multipleProjectsTitle'),
            message: t('envVault.dropZone.multipleProjectsMessage', { count: folderEntries.length }),
            cancel: {
                label: t('envVault.dropZone.cancel'),
                flat: true
            },
            ok: {
                label: t('envVault.dropZone.continueAnyway'),
                color: 'warning'
            },
            persistent: true
        }).onOk(async () => {
            await performScan(entries);
        });
        return;
    }

    // Count first-level subfolders to estimate size
    let hasLargeFolder = false;
    let folderNames = [];
    let hasMultipleProjects = false;

    for (const entry of entries) {
        if (entry.isDirectory) {
            folderNames.push(entry.name);
            const reader = entry.createReader();
            const children = await readAllEntries(reader);
            const subfolders = children.filter(c => c.isDirectory);
            const subfolderCount = subfolders.length;

            // If it has more than 20 subfolders, it's potentially large
            if (subfolderCount > 20) {
                hasLargeFolder = true;
            }

            // Detect if it's a container folder of multiple projects
            // (many subfolders with package.json, .git, etc. inside)
            if (subfolderCount > 3) {
                const projectIndicators = subfolders.filter(sf =>
                    !['node_modules', '.git', 'dist', 'build', 'src', 'lib', 'test', 'tests',
                      '__pycache__', '.venv', 'venv', 'vendor', 'public', 'assets', 'docs',
                      'scripts', 'config', 'utils', '.github', '.vscode', '.idea'].includes(sf.name.toLowerCase())
                );
                if (projectIndicators.length > 5) {
                    hasMultipleProjects = true;
                }
            }
        }
    }

    // Warn if it looks like a large container folder
    if ((hasLargeFolder || hasMultipleProjects) && entries.length === 1) {
        $q.dialog({
            title: t('envVault.dropZone.largeFolderTitle'),
            message: hasMultipleProjects
                ? t('envVault.dropZone.multipleProjectsInsideMessage', { folder: folderNames[0] })
                : t('envVault.dropZone.largeFolderMessage', { folder: folderNames[0] }),
            cancel: {
                label: t('envVault.dropZone.cancel'),
                flat: true
            },
            ok: {
                label: t('envVault.dropZone.continueAnyway'),
                color: 'warning'
            },
            persistent: true
        }).onOk(async () => {
            await performScan(entries);
        });
        return;
    }

    await performScan(entries);
}

async function performScan(entries) {
    isScanning.value = true;
    scanAborted = false;
    largeProjectWarningShown = false;
    scanProgress.value = { phase: t('envVault.scanner.exploringFolders'), count: 0, found: 0 };

    try {
        const allFiles = [];

        for (const entry of entries) {
            if (entry.isDirectory) {
                // Each dragged root folder is a separate project
                const files = await readEntry(entry, '', entry.name);
                allFiles.push(...files);
            } else if (entry.isFile && isEnvFile(entry.name)) {
                const file = await getFile(entry);
                file._relativePath = file.name;
                file._projectName = t('envVault.defaults.projectName');
                allFiles.push(file);
            }

            if (scanAborted) break;
        }

        // If aborted due to limit
        if (scanAborted) {
            $q.notify({
                type: 'warning',
                message: t('envVault.scanner.scanStopped'),
                caption: t('envVault.scanner.scanStoppedCaption', { count: scanProgress.value.count }),
                position: 'top',
                icon: 'warning',
                timeout: 6000
            });

            if (allFiles.length > 0) {
                scanProgress.value.phase = t('envVault.scanner.processingFoundFiles');
                await processFiles(allFiles);
            }
            return;
        }

        if (allFiles.length > 0) {
            scanProgress.value.phase = t('envVault.scanner.processingFiles');
            await processFiles(allFiles);
        } else {
            $q.notify({
                type: 'warning',
                message: t('envVault.scanner.noConfigFilesFound'),
                caption: t('envVault.scanner.foldersScanned', { count: scanProgress.value.count }),
                position: 'top',
                icon: 'search_off',
                timeout: 5000
            });
        }
    } catch (error) {
        console.error('Error processing:', error);
        $q.notify({
            type: 'negative',
            message: t('envVault.scanner.errorProcessing'),
            caption: t('envVault.scanner.errorProcessingHint'),
            position: 'top'
        });
    } finally {
        isScanning.value = false;
        scanProgress.value = { phase: '', count: 0, found: 0 };
        scanAborted = false;
        largeProjectWarningShown = false;
    }
}

// File patterns we care about
const ENV_EXACT_MATCHES = [
    '.env', '.npmrc', '.yarnrc', '.netrc',
    'credentials.json', 'secrets.json', 'config.json',
    'serviceaccount.json', 'service-account.json',
    'privkey.pem', 'private.key', 'id_rsa', 'id_ed25519'
];

const ENV_PARTIAL_MATCHES = [
    'firebase-adminsdk', 'serviceaccount', 'service-account',
    'privkey', 'privkeys', 'private-key', 'privatekey',
    'credentials', 'secrets', 'apikey', 'api-key', 'api_key'
];

// Extensions that may contain credentials (only if the name also matches)
const CREDENTIAL_EXTENSIONS = ['.json', '.pem', '.key', '.env', '.js'];

function isEnvFile(fileName) {
    const name = fileName.toLowerCase();

    // .env files always
    if (name.startsWith('.env')) return true;

    // Exact matches
    if (ENV_EXACT_MATCHES.includes(name)) return true;

    // Partial matches (name contains the pattern)
    if (ENV_PARTIAL_MATCHES.some(p => name.includes(p))) {
        // Check that it has a valid extension or no extension
        const hasValidExt = CREDENTIAL_EXTENSIONS.some(ext => name.endsWith(ext));
        const hasNoExt = !name.includes('.') || name.startsWith('.');
        if (hasValidExt || hasNoExt) {
            return true;
        }
    }

    return false;
}

// Limits for showing warnings (non-blocking)
const MAX_FOLDERS_BEFORE_WARNING = 1000;
let scanAborted = false;
let largeProjectWarningShown = false;

// Recursive function to read entries (folders and files)
// rootFolder is the folder the user originally dragged
async function readEntry(entry, path = '', rootFolder = '') {
    const files = [];

    // If the scan was aborted, return empty
    if (scanAborted) return files;

    if (entry.isFile) {
        const relativePath = path + entry.name;
        // FILTER HERE: config files OR AI context files
        if (isEnvFile(entry.name) || isAiContextFile(entry.name, relativePath).isAiContext) {
            const file = await getFile(entry);
            file._relativePath = relativePath;
            // Determine the project: ALWAYS the rootFolder (the folder the user dragged)
            // E.g.: If you drag "soprano" -> project = "soprano"
            // Files in frontend/ and backend/ are part of the same "soprano" project
            const projectName = rootFolder || t('envVault.defaults.projectName');

            file._projectName = projectName;
            file._rootFolder = rootFolder;
            files.push(file);

            // Update progress
            scanProgress.value.found++;
            scanProgress.value.phase = t('envVault.scanner.foundFiles', { count: scanProgress.value.found });
        }
    } else if (entry.isDirectory) {
        // Update progress
        scanProgress.value.count++;

        // Show warning for large projects (only once)
        if (scanProgress.value.count >= MAX_FOLDERS_BEFORE_WARNING && !largeProjectWarningShown) {
            largeProjectWarningShown = true;
            scanProgress.value.phase = t('envVault.scanner.largeProjectDetected', { count: scanProgress.value.count });
        }

        // Update UI every 20 folders
        if (scanProgress.value.count % 20 === 0) {
            scanProgress.value.phase = t('envVault.scanner.exploring', { count: scanProgress.value.count });
            // Give the UI time to update
            await new Promise(resolve => setTimeout(resolve, 0));
        }

        const reader = entry.createReader();
        const entries = await readAllEntries(reader);

        for (const childEntry of entries) {
            if (scanAborted) break;

            // Skip folders we don't care about to speed things up
            if (childEntry.isDirectory) {
                const dirName = childEntry.name.toLowerCase();
                // Skip node_modules, .git, etc.
                if (dirName === 'node_modules' || dirName === '.git' || dirName === 'dist' ||
                    dirName === 'build' || dirName === '.next' || dirName === 'vendor' ||
                    dirName === '__pycache__' || dirName === '.venv' || dirName === 'venv' ||
                    dirName === '.idea' || dirName === '.vscode' || dirName === 'coverage' ||
                    dirName === '.cache' || dirName === 'tmp' || dirName === 'temp' ||
                    dirName === 'logs' || dirName === '.npm' || dirName === '.yarn') {
                    continue;
                }
            }

            const newPath = path ? path + entry.name + '/' : entry.name + '/';
            const childFiles = await readEntry(childEntry, newPath, rootFolder);
            files.push(...childFiles);
        }
    }

    return files;
}

// Helper to get File from FileEntry
function getFile(fileEntry) {
    return new Promise((resolve, reject) => {
        fileEntry.file(resolve, reject);
    });
}

// Helper to read all entries from a directory
function readAllEntries(reader) {
    return new Promise((resolve, reject) => {
        const entries = [];

        function readBatch() {
            reader.readEntries((batch) => {
                if (batch.length === 0) {
                    resolve(entries);
                } else {
                    entries.push(...batch);
                    readBatch(); // Keep reading (they may come in batches)
                }
            }, (err) => {
                console.error('❌ readAllEntries error:', err);
                reject(err);
            });
        }

        readBatch();
    });
}

function handleFolderSelect(event) {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
        processFiles(files);
    }
    // Reset input
    if (folderInput.value) folderInput.value.value = '';
}

function handleFileSelect(event) {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) {
        processFiles(files);
    }
    // Reset input
    if (fileInput.value) fileInput.value.value = '';
}

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

function handlePasteSubmit() {
    if (!pasteContent.value.trim()) {
        $q.notify({
            type: 'warning',
            message: t('envVault.paste.emptyContent'),
            position: 'top'
        });
        return;
    }

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

    // Create a project from the pasted content
    const project = {
        name: pasteProjectName.value.trim() || t('envVault.defaults.projectName'),
        sourceFolder: pasteProjectName.value.trim() || t('envVault.defaults.projectName'),
        files: [{
            name: '.env',
            path: '.env',
            variables
        }],
        icon: '🔐',
        color: '#F7DC6F',
        variablesCount: variables.length
    };

    showPasteDialog.value = false;
    emit('scan-complete', [project]);
}

async function processFiles(files) {
    isScanning.value = true;

    try {
        const projects = await scanFilesFromFolder(files);

        if (projects.length === 0) {
            $q.notify({
                type: 'warning',
                message: t('envVault.scanner.noConfigFilesFound'),
                caption: t('envVault.scanner.searchedPatterns'),
                position: 'top',
                icon: 'info',
                timeout: 4000
            });
        } else {
            const totalVars = projects.reduce((acc, p) => acc + p.variablesCount, 0);
            $q.notify({
                type: 'positive',
                message: t('envVault.scanner.projectsFound', { count: projects.length }),
                caption: t('envVault.scanner.variablesDetected', { count: totalVars }),
                position: 'top',
                icon: 'check_circle',
                timeout: 3000
            });
            emit('scan-complete', projects);
        }
    } catch (error) {
        console.error('Error processing files:', error);
        $q.notify({
            type: 'negative',
            message: t('envVault.scanner.errorProcessingFiles'),
            position: 'top'
        });
    } finally {
        isScanning.value = false;
    }
}
</script>

<template>
    <!-- Compact mode (button only) -->
    <div v-if="compact" class="compact-drop-zone" :class="themeStore.themeClass">
        <q-btn-dropdown
            color="primary"
            icon="add"
            :label="t('envVault.dropZone.add')"
            :loading="isScanning"
            class="scan-btn"
            unelevated
            split
            @click="triggerFolderInput"
        >
            <q-list>
                <q-item clickable v-close-popup @click="triggerFolderInput">
                    <q-item-section avatar>
                        <q-icon name="folder_open" />
                    </q-item-section>
                    <q-item-section>
                        <q-item-label>{{ t('envVault.dropZone.selectFolder') }}</q-item-label>
                        <q-item-label caption>{{ t('envVault.dropZone.scansAllEnv') }}</q-item-label>
                    </q-item-section>
                </q-item>
                <q-item clickable v-close-popup @click="triggerFileInput">
                    <q-item-section avatar>
                        <q-icon name="upload_file" />
                    </q-item-section>
                    <q-item-section>
                        <q-item-label>{{ t('envVault.dropZone.selectFiles') }}</q-item-label>
                    </q-item-section>
                </q-item>
                <q-item clickable v-close-popup @click="openPasteDialog">
                    <q-item-section avatar>
                        <q-icon name="content_paste" />
                    </q-item-section>
                    <q-item-section>
                        <q-item-label>{{ t('envVault.dropZone.pasteContent') }}</q-item-label>
                    </q-item-section>
                </q-item>
            </q-list>
        </q-btn-dropdown>

        <!-- Hidden inputs -->
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
    </div>

    <!-- Full mode (drag & drop zone) -->
    <div
        v-else
        class="drop-zone"
        :class="[themeStore.themeClass, { dragging: isDragging, scanning: isScanning }]"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
    >
        <!-- Scanning State -->
        <div v-if="isScanning" class="scanning-state">
            <q-spinner-dots color="primary" size="48px" />
            <p class="scanning-text">{{ scanProgress.phase || t('envVault.dropZone.scanningDots') }}</p>
            <p v-if="scanProgress.found > 0" class="scanning-found">
                <q-icon name="check_circle" color="positive" size="16px" />
                {{ t('envVault.dropZone.foundConfigFiles', { count: scanProgress.found }) }}
            </p>
            <p class="scanning-hint">{{ t('envVault.dropZone.skippingHint') }}</p>
        </div>

        <!-- Normal State -->
        <div v-else class="drop-content">
            <div class="drop-icon">
                <q-icon name="folder_copy" size="64px" />
            </div>

            <h3 class="drop-title">
                {{ isDragging ? t('envVault.dropZone.dropFolderHere') : t('envVault.dropZone.dragYourProject') }}
            </h3>

            <p class="drop-subtitle">
                {{ t('envVault.dropZone.autoDetectHint') }}
            </p>

            <div class="action-buttons">
                <q-btn
                    color="primary"
                    icon="folder_open"
                    :label="t('envVault.dropZone.selectFolder')"
                    @click="triggerFolderInput"
                    class="primary-btn"
                    unelevated
                />
                <q-btn
                    outline
                    color="grey"
                    icon="content_paste"
                    :label="t('envVault.dropZone.pasteEnv')"
                    @click="openPasteDialog"
                    class="secondary-btn"
                />
            </div>

            <div class="supported-files">
                <span class="supported-label">{{ t('envVault.dropZone.weDetect') }}</span>
                <q-chip dense size="sm" color="grey-8" text-color="white">.env</q-chip>
                <q-chip dense size="sm" color="grey-8" text-color="white">.env.local</q-chip>
                <q-chip dense size="sm" color="grey-8" text-color="white">.env.production</q-chip>
                <q-chip dense size="sm" color="grey-8" text-color="white">.env.*</q-chip>
            </div>

            <p class="drop-hint">
                <q-icon name="lightbulb" size="14px" />
                {{ t('envVault.dropZone.multiFolderHint') }}
            </p>
        </div>

        <!-- Hidden inputs -->
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
    </div>

    <!-- Paste Dialog -->
    <q-dialog v-model="showPasteDialog" persistent>
        <q-card class="paste-dialog" :class="themeStore.themeClass">
            <q-card-section class="paste-header">
                <div class="header-title">
                    <q-icon name="content_paste" size="24px" class="header-icon" />
                    <span>{{ t('envVault.pasteDialog.title') }}</span>
                </div>
                <q-btn flat round dense icon="close" @click="showPasteDialog = false" />
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
                    @click="handlePasteSubmit"
                    class="import-btn"
                    :disable="!pasteContent.trim()"
                />
            </q-card-actions>
        </q-card>
    </q-dialog>
</template>

<style lang="scss" scoped>
.drop-zone {
    border: 2px dashed var(--border-color, #ccc);
    border-radius: 16px;
    padding: 48px 32px;
    text-align: center;
    transition: all 0.3s ease;
    background: var(--bg-secondary, #fafafa);
    max-width: 500px;
    width: 100%;

    &.dragging {
        border-color: #F7DC6F;
        background: rgba(247, 220, 111, 0.1);
        transform: scale(1.02);

        .drop-icon {
            transform: scale(1.1);
            color: #F7DC6F;
        }
    }

    &.scanning {
        pointer-events: none;
    }
}

.lemonade-dark .drop-zone {
    background: #161B22;
    border-color: #30363D;

    &.dragging {
        background: rgba(247, 220, 111, 0.05);
    }
}

.drop-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}

.drop-icon {
    color: var(--text-secondary, #999);
    transition: all 0.3s ease;
}

.lemonade-dark .drop-icon {
    color: #8B949E;
}

.drop-title {
    font-size: 1.25rem;
    font-weight: 600;
    margin: 0;
    color: var(--text-primary, #333);
}

.lemonade-dark .drop-title {
    color: #F0F6FC;
}

.drop-subtitle {
    font-size: 0.9rem;
    color: var(--text-secondary, #666);
    margin: 0;
}

.lemonade-dark .drop-subtitle {
    color: #8B949E;
}

.action-buttons {
    display: flex;
    gap: 12px;
    margin-top: 8px;
}

.primary-btn {
    border-radius: 12px;
    padding: 12px 24px;
    font-weight: 600;
    background: linear-gradient(135deg, #F7DC6F 0%, #f1c40f 100%) !important;
    color: #000 !important;

    &:hover {
        box-shadow: 0 4px 16px rgba(247, 220, 111, 0.4);
    }
}

.secondary-btn {
    border-radius: 12px;
    padding: 12px 24px;
}

.supported-files {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    align-items: center;
    gap: 6px;
    margin-top: 8px;
}

.supported-label {
    font-size: 0.75rem;
    color: var(--text-secondary, #999);
}

.drop-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: var(--text-secondary, #999);
    margin-top: 8px;
}

.lemonade-dark .drop-hint {
    color: #8B949E;
}

.scanning-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
}

.scanning-text {
    font-size: 1rem;
    color: var(--text-primary, #333);
    margin: 0;
}

.lemonade-dark .scanning-text {
    color: #F0F6FC;
}

.scanning-hint {
    font-size: 0.8rem;
    color: var(--text-secondary, #666);
    margin: 0;
}

.scanning-found {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.9rem;
    color: var(--q-positive);
    margin: 0;
    font-weight: 500;
}

// Compact mode
.compact-drop-zone {
    display: inline-block;
}

.scan-btn {
    border-radius: 12px;
    font-weight: 600;
    background: linear-gradient(135deg, #F7DC6F 0%, #f1c40f 100%) !important;
    color: #000 !important;

    &:hover {
        box-shadow: 0 4px 16px rgba(247, 220, 111, 0.4);
    }
}

// Paste Dialog
.paste-dialog {
    width: 100%;
    max-width: 500px;
    background: var(--bg-primary, #fff);
}

.lemonade-dark .paste-dialog {
    background: #161B22;
}

.paste-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
    border-bottom: 1px solid var(--border-color, #e0e0e0);
}

.lemonade-dark .paste-header {
    border-color: #30363D;
}

.header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 1.1rem;
    font-weight: 600;
    color: var(--text-primary, #333);
}

.lemonade-dark .header-title {
    color: #F0F6FC;
}

.header-icon {
    color: #F7DC6F;
}

.project-name-input {
    margin-bottom: 16px;
}

.paste-textarea {
    font-family: 'Fira Code', monospace;
    font-size: 0.85rem;
}

.paste-hint {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.75rem;
    color: var(--text-secondary, #999);
    margin-top: 12px;
}

.paste-actions {
    padding: 12px 20px;
    border-top: 1px solid var(--border-color, #e0e0e0);
}

.lemonade-dark .paste-actions {
    border-color: #30363D;
}

.import-btn {
    background: linear-gradient(135deg, #F7DC6F 0%, #f1c40f 100%) !important;
    color: #000 !important;
    font-weight: 600;
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
    --bg-secondary: #FAFAFA;
    --border-color: #E0E0E0;
}
</style>
