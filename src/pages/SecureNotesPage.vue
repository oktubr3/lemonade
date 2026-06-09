<script setup>
import { defineOptions } from 'vue'

defineOptions({
    name: 'SecureNotesPage'
})

import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useQuasar } from 'quasar';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { useSecureNotesStore } from 'stores/secureNotes';
import { useThemeStore } from 'stores/theme';
import { useAdmin } from 'src/composables/useAdmin';
import LemonadeLoader from 'src/components/LemonadeLoader.vue';
import { matchesSearch, sortByRelevance } from 'src/utils/searchUtils';

const props = defineProps({ showSearch: Boolean });

const $q = useQuasar();
const router = useRouter();
const { t } = useI18n();
const notesStore = useSecureNotesStore();
const themeStore = useThemeStore();
const { roleLoaded } = useAdmin();

// State
const isLoading = ref(true);
const searchText = ref('');
const searchInput = ref(null);
const sortMode = ref(localStorage.getItem('secureNotesSortMode') || 'date-desc');
const showTrash = ref(false);

// Dialog state
const showCreateDialog = ref(false);
const showEditDialog = ref(false);
const showViewDialog = ref(false);
const isViewLoading = ref(false);
const isSaving = ref(false);

// Form state
const formTitle = ref('');
const formContent = ref('');
const editingNoteId = ref(null);

watch(formTitle, (val) => {
    if (val && val[0] !== val[0].toUpperCase()) {
        formTitle.value = val[0].toUpperCase() + val.slice(1);
    }
});

// View state
const viewNote = ref({ title: '', content: '', createdAt: null, updatedAt: null });

// Trash state
const isRestoringNote = ref({});
const isPermanentDeleting = ref({});
const confirmPermanentDeleteDialog = ref(false);
const noteToPermanentDelete = ref(null);

// Computed
const filteredAndSortedNotes = computed(() => {
    let result = [...notesStore.notes];

    if (searchText.value) {
        result = result.filter(n => matchesSearch(searchText.value, [n.title]));
        result = sortByRelevance(result, searchText.value, 'title');
    }

    if (sortMode.value === 'alpha-asc') {
        result.sort((a, b) => a.title.localeCompare(b.title));
    } else {
        result.sort((a, b) => {
            const dateA = a.updatedAt?._seconds
                ? a.updatedAt._seconds
                : a.updatedAt?.seconds
                    ? a.updatedAt.seconds
                    : new Date(a.updatedAt || 0).getTime() / 1000;
            const dateB = b.updatedAt?._seconds
                ? b.updatedAt._seconds
                : b.updatedAt?.seconds
                    ? b.updatedAt.seconds
                    : new Date(b.updatedAt || 0).getTime() / 1000;
            return dateB - dateA;
        });
    }

    return result;
});

// Sort toggle
function toggleSortMode() {
    sortMode.value = sortMode.value === 'date-desc' ? 'alpha-asc' : 'date-desc';
    localStorage.setItem('secureNotesSortMode', sortMode.value);
}

// Watch for header search toggle
watch(
    () => props.showSearch,
    (newVal) => {
        if (newVal) {
            nextTick(() => { searchInput.value?.focus(); });
        }
        if (!newVal) {
            searchText.value = '';
        }
    }
);

// Trash toggle
async function toggleTrash() {
    showTrash.value = !showTrash.value;
    if (showTrash.value) {
        await notesStore.fetchTrashNotes();
    }
}

// Format date from Firestore timestamp
function formatDate(timestamp) {
    if (!timestamp) return '';
    let date;
    if (timestamp._seconds) {
        date = new Date(timestamp._seconds * 1000);
    } else if (timestamp.seconds) {
        date = new Date(timestamp.seconds * 1000);
    } else {
        date = new Date(timestamp);
    }
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatDeletedDate(timestamp) {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Create note
function openCreateDialog() {
    formTitle.value = '';
    formContent.value = '';
    showCreateDialog.value = true;
}

async function saveNewNote() {
    if (!formTitle.value.trim() || !formContent.value.trim()) return;
    isSaving.value = true;
    try {
        await notesStore.addNote(formTitle.value.trim(), formContent.value.trim());
        showCreateDialog.value = false;
        $q.notify({ type: 'positive', message: t('secureNotes.created'), icon: 'check_circle' });
    } catch (error) {
        $q.notify({ type: 'negative', message: error.message, icon: 'error' });
    } finally {
        isSaving.value = false;
    }
}

// View note (fetch decrypted content)
async function openViewDialog(note) {
    viewNote.value = { title: note.title, content: '', createdAt: note.createdAt, updatedAt: note.updatedAt };
    showViewDialog.value = true;
    isViewLoading.value = true;
    try {
        const fullNote = await notesStore.getNote(note.id);
        viewNote.value = fullNote;
    } catch (error) {
        $q.notify({ type: 'negative', message: error.message, icon: 'error' });
        showViewDialog.value = false;
    } finally {
        isViewLoading.value = false;
    }
}

// Edit note
function openEditDialog(note) {
    editingNoteId.value = note.id;
    formTitle.value = viewNote.value.title || note.title;
    formContent.value = viewNote.value.content || '';
    showViewDialog.value = false;
    showEditDialog.value = true;
}

async function openEditDialogFromList(note) {
    editingNoteId.value = note.id;
    formTitle.value = note.title;
    formContent.value = '';
    showEditDialog.value = true;
    // Fetch decrypted content for editing
    try {
        const fullNote = await notesStore.getNote(note.id);
        formContent.value = fullNote.content || '';
    } catch (error) {
        $q.notify({ type: 'negative', message: error.message, icon: 'error' });
        showEditDialog.value = false;
    }
}

async function saveEditedNote() {
    if (!formTitle.value.trim() || !formContent.value.trim()) return;
    isSaving.value = true;
    try {
        await notesStore.updateNote(editingNoteId.value, {
            title: formTitle.value.trim(),
            content: formContent.value.trim()
        });
        showEditDialog.value = false;
        $q.notify({ type: 'positive', message: t('secureNotes.updated'), icon: 'check_circle' });
    } catch (error) {
        $q.notify({ type: 'negative', message: error.message, icon: 'error' });
    } finally {
        isSaving.value = false;
    }
}

// Delete note (soft delete)
function confirmDeleteNote(note) {
    $q.dialog({
        title: t('common.confirm'),
        message: t('secureNotes.deleteConfirm'),
        cancel: { flat: true, label: t('common.cancel') },
        ok: { color: 'negative', label: t('common.delete') },
        persistent: true,
        class: themeStore.isDarkMode ? 'lemonade-dark-dialog' : ''
    }).onOk(async () => {
        try {
            await notesStore.deleteNote(note.id);
            showViewDialog.value = false;
            $q.notify({ type: 'warning', message: t('secureNotes.deleted'), icon: 'delete' });
        } catch (error) {
            $q.notify({ type: 'negative', message: error.message, icon: 'error' });
        }
    });
}

// Trash: restore
async function restoreTrashNote(note) {
    isRestoringNote.value[note.id] = true;
    try {
        await notesStore.restoreNote(note.id);
        $q.notify({ type: 'positive', message: t('secureNotes.restored'), icon: 'restore' });
    } catch (error) {
        $q.notify({ type: 'negative', message: error.message, icon: 'error' });
    } finally {
        isRestoringNote.value[note.id] = false;
    }
}

// Trash: permanent delete
function confirmPermanentDelete(note) {
    noteToPermanentDelete.value = note;
    confirmPermanentDeleteDialog.value = true;
}

async function executePermanentDelete() {
    if (!noteToPermanentDelete.value) return;
    const noteId = noteToPermanentDelete.value.id;
    isPermanentDeleting.value[noteId] = true;
    try {
        await notesStore.permanentDeleteNote(noteId);
        confirmPermanentDeleteDialog.value = false;
        noteToPermanentDelete.value = null;
        $q.notify({ type: 'positive', message: t('secureNotes.permanentlyDeleted'), icon: 'delete_forever' });
    } catch (error) {
        $q.notify({ type: 'negative', message: error.message, icon: 'error' });
    } finally {
        isPermanentDeleting.value[noteId] = false;
    }
}

// Lifecycle
onMounted(async () => {
    try {
        await notesStore.fetchNotes();
    } catch (error) {
        console.error('Error loading notes:', error);
    } finally {
        isLoading.value = false;
    }
});
</script>

<template>
    <q-page class="secure-notes-page" :class="themeStore.themeClass">
        <!-- Loading -->
        <LemonadeLoader v-if="isLoading || !roleLoaded" :message="t('secureNotes.title')" />

        <!-- Main Content -->
        <div v-else class="notes-content">
            <!-- Toolbar row -->
            <div class="row items-center q-mb-sm q-px-sm" v-if="!isLoading && (filteredAndSortedNotes.length > 0 || showTrash || notesStore.trashNotes.length > 0)">
                <div class="row q-gutter-xs">
                    <q-btn v-if="!showTrash" size="10px" color="grey-7"
                        :label="sortMode === 'alpha-asc' ? t('envVault.sortRecent') : t('envVault.sortAZ')"
                        flat dense no-caps @click="toggleSortMode" />
                    <q-btn size="10px" :color="showTrash ? 'orange-7' : 'grey-7'" icon="delete_outline"
                        @click="toggleTrash" flat dense :aria-label="t('passwords.trash.title')">
                        <q-badge v-if="notesStore.trashCount > 0" color="orange" floating :label="notesStore.trashCount" />
                    </q-btn>
                </div>
            </div>

            <!-- Search bar -->
            <q-input v-model="searchText" dense :placeholder="t('secureNotes.search')"
                v-if="props.showSearch && !showTrash" class="q-px-sm q-mb-sm" ref="searchInput"
                clearable @clear="searchText = ''">
                <template v-slot:prepend>
                    <q-icon name="search" />
                </template>
            </q-input>

            <!-- ============================================ -->
            <!-- TRASH VIEW -->
            <!-- ============================================ -->
            <div v-if="showTrash">
                <div class="q-pa-sm q-mb-sm">
                    <div class="row items-center q-mb-md">
                        <q-icon name="delete_outline" size="sm" color="orange-7" class="q-mr-sm" />
                        <span class="text-h6 text-weight-medium">{{ t('passwords.trash.title') }}</span>
                        <q-btn flat round dense icon="close" size="sm" class="q-ml-auto" @click="showTrash = false" />
                    </div>

                    <q-banner class="trash-banner q-mb-md" rounded>
                        <template v-slot:avatar>
                            <q-icon name="info" color="orange" />
                        </template>
                        {{ t('passwords.trash.banner') }}
                    </q-banner>
                </div>

                <!-- Trash loading -->
                <div v-if="notesStore.isLoadingTrash" class="text-center q-pa-xl">
                    <q-spinner-dots color="orange-7" size="40px" />
                </div>

                <!-- Trash empty -->
                <div v-else-if="notesStore.trashNotes.length === 0" class="text-center q-my-xl">
                    <q-icon name="delete_outline" size="4rem" color="grey-5" class="q-mb-md" />
                    <div class="text-h6 text-grey-7 q-mb-sm">{{ t('passwords.trash.empty') }}</div>
                    <div class="text-body2 text-grey-6">{{ t('passwords.trash.emptyHint') }}</div>
                </div>

                <!-- Trash entries -->
                <div v-else class="q-pa-sm q-gutter-sm">
                    <q-card v-for="note in notesStore.trashNotes" :key="note.id" class="trash-entry-card" flat bordered>
                        <q-card-section class="q-pa-sm">
                            <div class="row items-center no-wrap">
                                <div class="col" style="min-width: 0;">
                                    <div class="text-body1 text-weight-medium ellipsis">{{ note.title }}</div>
                                    <div v-if="note.deletedAt" class="text-caption text-grey-7">
                                        {{ formatDeletedDate(note.deletedAt) }}
                                    </div>
                                </div>
                                <div class="row no-wrap q-gutter-xs q-ml-sm">
                                    <q-btn round flat dense size="sm" icon="restore" color="positive"
                                        :loading="isRestoringNote[note.id]"
                                        @click="restoreTrashNote(note)">
                                        <q-tooltip>{{ t('passwords.trash.restore') }}</q-tooltip>
                                    </q-btn>
                                    <q-btn round flat dense size="sm" icon="delete_forever" color="negative"
                                        @click="confirmPermanentDelete(note)">
                                        <q-tooltip>{{ t('passwords.trash.deleteForever') }}</q-tooltip>
                                    </q-btn>
                                </div>
                            </div>
                        </q-card-section>
                    </q-card>
                </div>
            </div>

            <!-- ============================================ -->
            <!-- NORMAL VIEW -->
            <!-- ============================================ -->
            <div v-if="!showTrash">
                <!-- Empty state -->
                <div v-if="!isLoading && filteredAndSortedNotes.length === 0" class="text-center q-my-xl">
                    <q-icon name="note_add" size="5rem" color="grey-4" class="q-mb-md" />
                    <div class="text-h6 text-grey-7 q-mb-sm">{{ t('secureNotes.empty') }}</div>
                    <div class="text-body2 text-grey-6">{{ t('secureNotes.emptyHint') }}</div>
                </div>

                <!-- Notes list -->
                <div v-else class="q-pa-sm q-gutter-sm">
                    <q-card v-for="note in filteredAndSortedNotes" :key="note.id"
                        class="note-card cursor-pointer" flat bordered
                        @click="openViewDialog(note)">
                        <q-card-section class="q-pa-md">
                            <div class="row items-center no-wrap">
                                <q-icon name="note" size="sm" color="amber-8" class="q-mr-md note-icon" />
                                <div class="col" style="min-width: 0;">
                                    <div class="text-body1 text-weight-medium ellipsis note-title">{{ note.title }}</div>
                                    <div class="text-caption text-grey-6">{{ formatDate(note.updatedAt || note.createdAt) }}</div>
                                </div>
                                <div class="row no-wrap q-gutter-xs q-ml-sm">
                                    <q-btn round flat dense size="sm" icon="edit" color="grey-7"
                                        @click.stop="openEditDialogFromList(note)">
                                        <q-tooltip>{{ t('common.edit') }}</q-tooltip>
                                    </q-btn>
                                    <q-btn round flat dense size="sm" icon="delete_outline" color="grey-7"
                                        @click.stop="confirmDeleteNote(note)">
                                        <q-tooltip>{{ t('common.delete') }}</q-tooltip>
                                    </q-btn>
                                </div>
                            </div>
                        </q-card-section>
                    </q-card>
                </div>
            </div>

            <!-- FAB: Create note -->
            <q-page-sticky v-if="!showTrash" position="bottom-right" :offset="[17, 17]" class="high-z-index">
                <q-btn fab icon="add" color="amber-8" text-color="dark" @click="openCreateDialog"
                    :aria-label="t('secureNotes.create')">
                    <q-tooltip :delay="500">{{ t('secureNotes.create') }}</q-tooltip>
                </q-btn>
            </q-page-sticky>
        </div>

        <!-- ============================================ -->
        <!-- VIEW NOTE DIALOG -->
        <!-- ============================================ -->
        <q-dialog v-model="showViewDialog" maximized transition-show="slide-up" transition-hide="slide-down">
            <q-card class="view-note-dialog">
                <q-toolbar class="view-note-toolbar">
                    <q-btn flat round dense icon="arrow_back" @click="showViewDialog = false" />
                    <q-toolbar-title class="text-weight-medium ellipsis">{{ t('secureNotes.view') }}</q-toolbar-title>
                    <q-btn flat round dense icon="edit" @click="openEditDialog(viewNote)">
                        <q-tooltip>{{ t('common.edit') }}</q-tooltip>
                    </q-btn>
                    <q-btn flat round dense icon="delete_outline" color="negative" @click="confirmDeleteNote(viewNote)">
                        <q-tooltip>{{ t('common.delete') }}</q-tooltip>
                    </q-btn>
                </q-toolbar>

                <q-card-section class="q-pa-md">
                    <div v-if="isViewLoading" class="text-center q-pa-xl">
                        <q-spinner-dots color="amber-8" size="40px" />
                    </div>
                    <div v-else>
                        <h5 class="q-mt-none q-mb-sm view-note-title">{{ viewNote.title }}</h5>
                        <div class="text-caption text-grey-6 q-mb-md">
                            {{ formatDate(viewNote.updatedAt || viewNote.createdAt) }}
                        </div>
                        <div class="view-note-content">{{ viewNote.content }}</div>
                    </div>
                </q-card-section>
            </q-card>
        </q-dialog>

        <!-- ============================================ -->
        <!-- CREATE NOTE DIALOG -->
        <!-- ============================================ -->
        <q-dialog v-model="showCreateDialog" persistent maximized transition-show="slide-up" transition-hide="slide-down">
            <q-card class="create-note-dialog">
                <q-toolbar class="create-note-toolbar">
                    <q-btn flat round dense icon="close" @click="showCreateDialog = false" />
                    <q-toolbar-title class="text-weight-medium">{{ t('secureNotes.create') }}</q-toolbar-title>
                    <q-btn flat dense no-caps :label="t('common.save')" color="primary"
                        :loading="isSaving"
                        :disable="!formTitle.trim() || !formContent.trim()"
                        @click="saveNewNote" />
                </q-toolbar>

                <q-card-section class="q-pa-md">
                    <q-input v-model="formTitle" :label="t('secureNotes.noteTitle')" dense outlined
                        class="q-mb-md" maxlength="200" counter />
                    <q-input v-model="formContent" :label="t('secureNotes.noteContent')" type="textarea"
                        outlined :placeholder="t('secureNotes.placeholder')"
                        autogrow :input-style="{ minHeight: '200px' }" maxlength="50000" counter />
                </q-card-section>
            </q-card>
        </q-dialog>

        <!-- ============================================ -->
        <!-- EDIT NOTE DIALOG -->
        <!-- ============================================ -->
        <q-dialog v-model="showEditDialog" persistent maximized transition-show="slide-up" transition-hide="slide-down">
            <q-card class="edit-note-dialog">
                <q-toolbar class="edit-note-toolbar">
                    <q-btn flat round dense icon="close" @click="showEditDialog = false" />
                    <q-toolbar-title class="text-weight-medium">{{ t('secureNotes.edit') }}</q-toolbar-title>
                    <q-btn flat dense no-caps :label="t('common.save')" color="primary"
                        :loading="isSaving"
                        :disable="!formTitle.trim() || !formContent.trim()"
                        @click="saveEditedNote" />
                </q-toolbar>

                <q-card-section class="q-pa-md">
                    <q-input v-model="formTitle" :label="t('secureNotes.noteTitle')" dense outlined
                        class="q-mb-md" maxlength="200" counter />
                    <q-input v-model="formContent" :label="t('secureNotes.noteContent')" type="textarea"
                        outlined :placeholder="t('secureNotes.placeholder')"
                        autogrow :input-style="{ minHeight: '200px' }" maxlength="50000" counter />
                </q-card-section>
            </q-card>
        </q-dialog>

        <!-- ============================================ -->
        <!-- PERMANENT DELETE CONFIRM DIALOG -->
        <!-- ============================================ -->
        <q-dialog v-model="confirmPermanentDeleteDialog" persistent>
            <q-card style="min-width: 320px">
                <q-card-section>
                    <div class="text-h6">{{ t('common.confirm') }}</div>
                </q-card-section>
                <q-card-section>
                    {{ t('passwords.trash.confirmPermanent') }}
                </q-card-section>
                <q-card-actions align="right">
                    <q-btn flat :label="t('common.cancel')" @click="confirmPermanentDeleteDialog = false" />
                    <q-btn flat color="negative" :label="t('passwords.trash.deleteForever')"
                        :loading="noteToPermanentDelete && isPermanentDeleting[noteToPermanentDelete.id]"
                        @click="executePermanentDelete" />
                </q-card-actions>
            </q-card>
        </q-dialog>
    </q-page>
</template>

<style lang="scss" scoped>
.secure-notes-page {
    padding: 8px 0;
    min-height: calc(100vh - 100px);
}

.notes-content {
    max-width: 800px;
    margin: 0 auto;
}

// Premium Paywall (same pattern as EnvVault)
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

// Note cards
.note-card {
    border-radius: 12px;
    transition: all 0.2s ease;
    background: #ffffff;
    border-color: rgba(0, 0, 0, 0.08);

    &:hover {
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
        transform: translateY(-1px);
    }
}

.note-icon {
    opacity: 0.7;
}

.note-title {
    font-size: 0.95rem;
}

// Trash
.trash-entry-card {
    border-radius: 10px;
    background: rgba(255, 152, 0, 0.04);
    border-color: rgba(255, 152, 0, 0.15);
}

.trash-banner {
    background: rgba(255, 152, 0, 0.08);
    border: 1px solid rgba(255, 152, 0, 0.2);
    color: #b45309;
}

// View note dialog
.view-note-toolbar,
.create-note-toolbar,
.edit-note-toolbar {
    background: linear-gradient(135deg, #F7DC6F 0%, #F8C471 100%);
    color: #2C3E50;
}

.view-note-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: #212121;
}

.view-note-content {
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.7;
    font-size: 0.95rem;
    color: #333;
}

// FAB z-index
.high-z-index {
    z-index: 100;
}
</style>

<!-- Unscoped styles for dark mode (dialogs, global overrides) -->
<style lang="scss">
// Dark mode: note cards
.lemonade-dark .note-card,
.body--dark .note-card {
    background: #161b22;
    border-color: #30363d;

    &:hover {
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
    }
}

.lemonade-dark .note-title,
.body--dark .note-title {
    color: #f0f6fc;
}

// Dark mode: paywall
.lemonade-dark .paywall-content,
.body--dark .paywall-content {
    background: #161b22;
    border-color: #30363d;
}

.lemonade-dark .paywall-title,
.body--dark .paywall-title {
    color: #f0f6fc;
}

.lemonade-dark .paywall-description,
.body--dark .paywall-description {
    color: #8b949e;
}

.lemonade-dark .paywall-feature,
.body--dark .paywall-feature {
    color: #f0f6fc;
}

// Dark mode: trash
.lemonade-dark .trash-entry-card,
.body--dark .trash-entry-card {
    background: rgba(255, 152, 0, 0.06);
    border-color: rgba(255, 152, 0, 0.2);
}

.lemonade-dark .trash-banner,
.body--dark .trash-banner {
    background: rgba(255, 152, 0, 0.1);
    border-color: rgba(255, 152, 0, 0.25);
    color: #fbbf24;
}

// Dark mode: dialog toolbars
.lemonade-dark .view-note-toolbar,
.body--dark .view-note-toolbar,
.lemonade-dark .create-note-toolbar,
.body--dark .create-note-toolbar,
.lemonade-dark .edit-note-toolbar,
.body--dark .edit-note-toolbar {
    background: linear-gradient(135deg, #21262D 0%, #161B22 100%);
    color: #F0F6FC;
    border-bottom: 1px solid #30363d;
}

// Dark mode: dialog cards
.lemonade-dark .view-note-dialog,
.body--dark .view-note-dialog,
.lemonade-dark .create-note-dialog,
.body--dark .create-note-dialog,
.lemonade-dark .edit-note-dialog,
.body--dark .edit-note-dialog {
    background: #0d1117;
    color: #f0f6fc;
}

// Dark mode: view note content
.lemonade-dark .view-note-title,
.body--dark .view-note-title {
    color: #f0f6fc;
}

.lemonade-dark .view-note-content,
.body--dark .view-note-content {
    color: #c9d1d9;
}
</style>
