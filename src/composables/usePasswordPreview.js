import { ref, watch, nextTick } from 'vue'
import QrScanner from 'qr-scanner'

export function usePasswordPreview ({ passwordEntriesStore, $q, t, canUseAIAnalysis, editingEntry, editEntryHasTotp }) {
  // Refs
  const showPreviewDialog = ref(false)
  const previewEntry = ref({ title: '', username: '', password: '', url: '', notes: '' })
  const isLoadingPreview = ref(false)
  const previewCustomFields = ref([])
  const showCustomFieldValue = ref({})
  const passwordHistory = ref([])
  const isLoadingHistory = ref(false)
  const showHistoryPassword = ref({})
  const previewHasTotp = ref(false)
  const totpCode = ref('')
  const totpTimeRemaining = ref(30)
  let totpInterval = null
  const totpSecretInput = ref('')
  const isSavingTotp = ref(false)
  const showTotpSetupDialog = ref(false)
  const showQrScanner = ref(false)
  const qrVideoElement = ref(null)
  let qrScannerInstance = null

  // Watch: reset state when preview dialog closes
  watch(showPreviewDialog, (newVal) => {
    if (!newVal) {
      passwordHistory.value = []
      showHistoryPassword.value = {}
      previewCustomFields.value = []
      showCustomFieldValue.value = {}
      if (totpInterval) clearInterval(totpInterval)
      totpCode.value = ''
      totpTimeRemaining.value = 30
      previewHasTotp.value = false
    }
  })

  // Functions
  const showPreview = async (entry) => {
    isLoadingPreview.value = true

    try {
      const decryptedData = await passwordEntriesStore.getDecryptedPassword(entry.id)
      const decryptedPassword = decryptedData.password || decryptedData
      // notes is stored encrypted server-side and returned in plaintext by the
      // decrypt endpoint. The listing payload (entry.notes) carries the ciphertext
      // envelope ({encrypted, iv, authTag}); reading it directly leaks the raw
      // object into the UI. Always prefer the decrypted value.
      previewEntry.value = {
        id: entry.id,
        title: entry.title || entry.name || '',
        username: entry.username,
        password: decryptedPassword,
        url: entry.url || '',
        notes: typeof decryptedData.notes === 'string' ? decryptedData.notes : ''
      }
      previewCustomFields.value = decryptedData.customFields || []
      showCustomFieldValue.value = {}
      previewHasTotp.value = !!decryptedData.hasTotp
      showPreviewDialog.value = true

      if (decryptedData.hasTotp) {
        loadTotpCode(entry.id)
      }

      const hasAnalysis = passwordEntriesStore.hasSecurityAnalysis(entry.id)
      if (!hasAnalysis && canUseAIAnalysis.value) {
        passwordEntriesStore.checkPasswordSecurity(entry.id, false).catch(error => {
          console.warn(`Warning: Background security check error for ${entry.title || entry.name}:`, error.message)
        })
      }
    } catch (error) {
      $q.notify({
        color: 'negative',
        position: 'top',
        message: t('passwords.messages.errorLoading'),
        icon: 'error'
      })
    } finally {
      isLoadingPreview.value = false
    }
  }

  const loadPasswordHistory = async () => {
    if (!previewEntry.value || !previewEntry.value.id) return
    isLoadingHistory.value = true
    showHistoryPassword.value = {}
    try {
      passwordHistory.value = await passwordEntriesStore.getPasswordHistory(previewEntry.value.id)
    } catch (error) {
      passwordHistory.value = []
    } finally {
      isLoadingHistory.value = false
    }
  }

  const formatHistoryDate = (dateStr) => {
    if (!dateStr) return ''
    const date = new Date(dateStr)
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const copyHistoryPassword = (password) => {
    navigator.clipboard.writeText(password).then(() => {
      $q.notify({ message: t('passwords.history.copied'), color: 'positive', position: 'top', timeout: 1500 })
    })
  }

  const loadTotpCode = async (entryId) => {
    try {
      const data = await passwordEntriesStore.getTotpCode(entryId)
      totpCode.value = data.code
      totpTimeRemaining.value = data.timeRemaining

      if (totpInterval) clearInterval(totpInterval)
      totpInterval = setInterval(async () => {
        totpTimeRemaining.value--
        if (totpTimeRemaining.value <= 0) {
          try {
            const newData = await passwordEntriesStore.getTotpCode(entryId)
            totpCode.value = newData.code
            totpTimeRemaining.value = newData.timeRemaining
          } catch (e) {
            clearInterval(totpInterval)
          }
        }
      }, 1000)
    } catch (error) {
      totpCode.value = ''
    }
  }

  const copyTotpCode = () => {
    if (totpCode.value) {
      navigator.clipboard.writeText(totpCode.value)
      $q.notify({ message: t('passwords.totp.copied'), color: 'positive', position: 'top', timeout: 1500 })
    }
  }

  const saveTotpSecret = async () => {
    if (!totpSecretInput.value || !editingEntry.value) return
    isSavingTotp.value = true
    try {
      await passwordEntriesStore.saveTotpSecret(editingEntry.value.id, totpSecretInput.value)
      editEntryHasTotp.value = true
      showTotpSetupDialog.value = false
      totpSecretInput.value = ''
      $q.notify({ message: t('passwords.totp.saved'), color: 'positive', position: 'top', timeout: 2000 })
    } catch (error) {
      $q.notify({ message: error.message || t('passwords.totp.invalid'), color: 'negative', position: 'top' })
    } finally {
      isSavingTotp.value = false
    }
  }

  const removeTotpFromEntry = async () => {
    if (!editingEntry.value) return
    try {
      await passwordEntriesStore.removeTotpSecret(editingEntry.value.id)
      editEntryHasTotp.value = false
      $q.notify({ message: t('passwords.totp.removed'), color: 'positive', position: 'top', timeout: 2000 })
    } catch (error) {
      $q.notify({ message: error.message, color: 'negative', position: 'top' })
    }
  }

  const startQrScanner = async () => {
    showQrScanner.value = true
    await nextTick()
    if (!qrVideoElement.value) return
    try {
      qrScannerInstance = new QrScanner(
        qrVideoElement.value,
        (result) => {
          handleQrResult(result.data)
        },
        {
          preferredCamera: 'environment',
          highlightScanRegion: true,
          highlightCodeOutline: true
        }
      )
      await qrScannerInstance.start()
    } catch (error) {
      stopQrScanner()
      $q.notify({ message: t('passwords.totp.cameraError'), color: 'negative', position: 'top' })
    }
  }

  const stopQrScanner = () => {
    if (qrScannerInstance) {
      qrScannerInstance.stop()
      qrScannerInstance.destroy()
      qrScannerInstance = null
    }
    showQrScanner.value = false
  }

  const handleQrResult = (data) => {
    try {
      if (data.startsWith('otpauth://totp/')) {
        const url = new URL(data)
        const secret = url.searchParams.get('secret')
        if (secret) {
          totpSecretInput.value = secret
          stopQrScanner()
          $q.notify({ message: t('passwords.totp.qrSuccess'), color: 'positive', position: 'top', timeout: 2000 })
          return
        }
      }
      if (/^[A-Z2-7]{16,}$/i.test(data)) {
        totpSecretInput.value = data.toUpperCase()
        stopQrScanner()
        $q.notify({ message: t('passwords.totp.qrSuccess'), color: 'positive', position: 'top', timeout: 2000 })
        return
      }
      $q.notify({ message: t('passwords.totp.qrInvalid'), color: 'warning', position: 'top', timeout: 2000 })
    } catch {
      $q.notify({ message: t('passwords.totp.qrInvalid'), color: 'warning', position: 'top', timeout: 2000 })
    }
  }

  // Cleanup function for onBeforeUnmount
  const cleanup = () => {
    if (totpInterval) clearInterval(totpInterval)
    if (qrScannerInstance) { qrScannerInstance.stop(); qrScannerInstance.destroy() }
  }

  return {
    // Refs
    showPreviewDialog,
    previewEntry,
    isLoadingPreview,
    previewCustomFields,
    showCustomFieldValue,
    passwordHistory,
    isLoadingHistory,
    showHistoryPassword,
    previewHasTotp,
    totpCode,
    totpTimeRemaining,
    totpSecretInput,
    isSavingTotp,
    showTotpSetupDialog,
    showQrScanner,
    qrVideoElement,
    // Functions
    showPreview,
    loadPasswordHistory,
    formatHistoryDate,
    copyHistoryPassword,
    loadTotpCode,
    copyTotpCode,
    saveTotpSecret,
    removeTotpFromEntry,
    startQrScanner,
    stopQrScanner,
    handleQrResult,
    cleanup
  }
}
