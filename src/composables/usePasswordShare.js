import { ref } from 'vue'

export function usePasswordShare ({ passwordEntriesStore, $q, t }) {
  // Refs
  const showShareDialog = ref(false)
  const entryToShare = ref(null)
  const selectedUser = ref(null)
  const userSearchText = ref('')
  const isSharing = ref(false)
  const searchResultsMode = ref('recent')
  const searchDebounceTimer = ref(null)
  const isBlocking = ref({})
  const isAccepting = ref({})
  const isRejecting = ref({})

  // Functions
  const onUserSearchInput = (val) => {
    if (searchDebounceTimer.value) clearTimeout(searchDebounceTimer.value)
    const query = (val || '').trim()
    if (query.length >= 3) {
      searchDebounceTimer.value = setTimeout(async () => {
        try {
          const result = await passwordEntriesStore.fetchSystemUsers(query)
          searchResultsMode.value = result.mode
        } catch (error) {
          $q.notify({ color: 'negative', position: 'top', message: t('sharing.errorLoadingUsers'), icon: 'error' })
        }
      }, 300)
    } else if (query.length === 0) {
      loadRecentContacts()
    }
  }

  const loadRecentContacts = async () => {
    try {
      const result = await passwordEntriesStore.fetchSystemUsers()
      searchResultsMode.value = result.mode
    } catch (error) {
      console.warn('Could not load recent contacts:', error)
    }
  }

  const openShareDialog = async (entry) => {
    entryToShare.value = entry
    userSearchText.value = ''
    selectedUser.value = null
    showShareDialog.value = true
    searchResultsMode.value = 'recent'

    await loadRecentContacts()
  }

  const shareWithUser = (user) => {
    if (!entryToShare.value || !user) return

    $q.dialog({
      title: t('common.confirm'),
      message: t('sharing.shareConfirm', { title: entryToShare.value.title || entryToShare.value.name, user: user.displayName || user.email }),
      cancel: { flat: true, label: t('common.cancel') },
      ok: { color: 'green', label: t('sharing.send') },
      persistent: true
    }).onOk(async () => {
      isSharing.value = true
      try {
        await passwordEntriesStore.sharePassword(entryToShare.value.id, user.uid)

        $q.notify({
          color: 'positive',
          position: 'top',
          message: t('sharing.shared', { user: user.displayName || user.email }),
          icon: 'share'
        })

        showShareDialog.value = false
        entryToShare.value = null
      } catch (error) {
        $q.notify({
          color: 'negative',
          position: 'top',
          message: error.message || t('sharing.errorSharing'),
          icon: 'error'
        })
      } finally {
        isSharing.value = false
      }
    })
  }

  const acceptPendingShare = async (share) => {
    isAccepting.value[share.id] = true
    try {
      await passwordEntriesStore.acceptSharedPassword(share.id)

      $q.notify({
        color: 'positive',
        position: 'top',
        message: t('sharing.accepted', { title: share.passwordData.title }),
        icon: 'check_circle'
      })
    } catch (error) {
      $q.notify({
        color: 'negative',
        position: 'top',
        message: error.message || t('sharing.errorAccepting'),
        icon: 'error'
      })
    } finally {
      isAccepting.value[share.id] = false
    }
  }

  const rejectPendingShare = async (share) => {
    isRejecting.value[share.id] = true
    try {
      await passwordEntriesStore.rejectSharedPassword(share.id)

      $q.notify({
        color: 'warning',
        position: 'top',
        message: t('sharing.rejected'),
        icon: 'block'
      })
    } catch (error) {
      $q.notify({
        color: 'negative',
        position: 'top',
        message: error.message || t('sharing.errorRejecting'),
        icon: 'error'
      })
    } finally {
      isRejecting.value[share.id] = false
    }
  }

  const blockPendingShareUser = (share) => {
    $q.dialog({
      title: t('sharing.blockUser'),
      message: t('sharing.blockConfirm', { user: share.fromUserName }),
      cancel: { flat: true, label: t('common.cancel') },
      ok: { color: 'red', label: t('sharing.blockUser') },
      persistent: true
    }).onOk(async () => {
      isBlocking.value[share.id] = true
      try {
        await passwordEntriesStore.blockUser(share.fromUserId, share.id)
        $q.notify({
          color: 'warning',
          position: 'top',
          message: t('sharing.userBlocked'),
          icon: 'block'
        })
      } catch (error) {
        $q.notify({
          color: 'negative',
          position: 'top',
          message: error.message || t('sharing.errorBlocking'),
          icon: 'error'
        })
      } finally {
        isBlocking.value[share.id] = false
      }
    })
  }

  return {
    // Refs
    showShareDialog,
    entryToShare,
    selectedUser,
    userSearchText,
    isSharing,
    searchResultsMode,
    searchDebounceTimer,
    isBlocking,
    isAccepting,
    isRejecting,
    // Functions
    onUserSearchInput,
    loadRecentContacts,
    openShareDialog,
    shareWithUser,
    acceptPendingShare,
    rejectPendingShare,
    blockPendingShareUser
  }
}
