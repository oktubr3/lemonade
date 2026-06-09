import { ref } from 'vue'

export function usePasswordTrash ({ passwordEntriesStore, $q, t }) {
  // Refs
  const showTrash = ref(false)
  const confirmDeleteDialog = ref(false)
  const confirmPermanentDeleteDialog = ref(false)
  const entryToDelete = ref(null)
  const entryToPermanentDelete = ref(null)
  const isDeleting = ref(false)
  const isRestoringEntry = ref({})
  const isPermanentDeleting = ref({})

  // Functions
  const confirmDelete = (entry) => {
    entryToDelete.value = entry
    confirmDeleteDialog.value = true
  }

  const deleteEntry = async () => {
    if (!entryToDelete.value) return

    isDeleting.value = true
    try {
      await passwordEntriesStore.deleteEntry(entryToDelete.value.id)
      entryToDelete.value = null
      confirmDeleteDialog.value = false
      $q.notify({
        color: 'positive',
        position: 'top',
        message: t('passwords.trash.movedToTrash'),
        icon: 'delete'
      })
    } catch (error) {
      $q.notify({
        color: 'negative',
        position: 'top',
        message: t('passwords.messages.errorDeleting'),
        icon: 'error'
      })
    } finally {
      isDeleting.value = false
    }
  }

  const toggleTrash = async () => {
    showTrash.value = !showTrash.value
    if (showTrash.value) {
      try {
        await passwordEntriesStore.fetchTrashEntries()
      } catch (error) {
        $q.notify({
          color: 'negative',
          position: 'top',
          message: t('passwords.messages.errorLoading'),
          icon: 'error'
        })
      }
    }
  }

  const restoreTrashEntry = async (entry) => {
    isRestoringEntry.value[entry.id] = true
    try {
      await passwordEntriesStore.restoreEntry(entry.id)
      $q.notify({
        color: 'positive',
        position: 'top',
        message: t('passwords.trash.restored'),
        icon: 'restore'
      })
    } catch (error) {
      $q.notify({
        color: 'negative',
        position: 'top',
        message: error.message || t('passwords.messages.errorLoading'),
        icon: 'error'
      })
    } finally {
      isRestoringEntry.value[entry.id] = false
    }
  }

  const confirmPermanentDelete = (entry) => {
    entryToPermanentDelete.value = entry
    confirmPermanentDeleteDialog.value = true
  }

  const permanentDeleteEntry = async () => {
    if (!entryToPermanentDelete.value) return
    const entryId = entryToPermanentDelete.value.id
    isPermanentDeleting.value[entryId] = true
    try {
      await passwordEntriesStore.permanentDeleteEntry(entryId)
      confirmPermanentDeleteDialog.value = false
      entryToPermanentDelete.value = null
      $q.notify({
        color: 'positive',
        position: 'top',
        message: t('passwords.trash.permanentlyDeleted'),
        icon: 'delete_forever'
      })
    } catch (error) {
      $q.notify({
        color: 'negative',
        position: 'top',
        message: error.message || t('passwords.messages.errorDeleting'),
        icon: 'error'
      })
    } finally {
      isPermanentDeleting.value[entryId] = false
    }
  }

  const formatDeletedDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr._seconds ? dateStr._seconds * 1000 : dateStr)
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  }

  return {
    // Refs
    showTrash,
    confirmDeleteDialog,
    confirmPermanentDeleteDialog,
    entryToDelete,
    entryToPermanentDelete,
    isDeleting,
    isRestoringEntry,
    isPermanentDeleting,
    // Functions
    confirmDelete,
    deleteEntry,
    toggleTrash,
    restoreTrashEntry,
    confirmPermanentDelete,
    permanentDeleteEntry,
    formatDeletedDate
  }
}
