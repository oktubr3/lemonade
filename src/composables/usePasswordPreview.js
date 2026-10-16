import { ref, watch, nextTick } from 'vue'
import QrScanner from 'qr-scanner'
import { decodeMigrationUri, parseOtpauthUri } from '../utils/otpMigration'

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
  const totpPeriod = ref(30)
  // Parameters read from the last scanned QR (8 digits, SHA256...), sent with the secret.
  let scannedTotpParams = {}
  let scannedTotpSecret = ''
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
      totpPeriod.value = 30
      previewHasTotp.value = false
    }
  })

  // Functions
  const showPreview = async (entry) => {
    isLoadingPreview.value = true

    try {
      const decryptedData = await passwordEntriesStore.getDecryptedPassword(entry.id)
      const decryptedPassword = decryptedData.password ?? decryptedData
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

  // The server says how many seconds the code has left; the countdown runs
  // locally and asks again when it reaches zero. A failed refresh retries in a
  // few seconds instead of leaving a stale code on screen.
  const loadTotpCode = async (entryId) => {
    if (totpInterval) clearInterval(totpInterval)
    const refresh = async () => {
      try {
        const data = await passwordEntriesStore.getTotpCode(entryId)
        if (!showPreviewDialog.value || previewEntry.value.id !== entryId) return
        totpCode.value = data.code
        totpPeriod.value = data.period || 30
        totpTimeRemaining.value = data.timeRemaining
      } catch (error) {
        totpCode.value = ''
        totpTimeRemaining.value = 5
      }
    }
    await refresh()
    totpInterval = setInterval(() => {
      totpTimeRemaining.value--
      if (totpTimeRemaining.value <= 0) refresh()
    }, 1000)
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
      // The parameters belong to the scanned secret; a secret typed by hand uses the defaults.
      const params = totpSecretInput.value === scannedTotpSecret ? scannedTotpParams : {}
      await passwordEntriesStore.saveTotpSecret(editingEntry.value.id, totpSecretInput.value, params)
      scannedTotpParams = {}
      scannedTotpSecret = ''
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

  const acceptScannedSecret = (secret, params = {}) => {
    totpSecretInput.value = secret
    scannedTotpSecret = secret
    scannedTotpParams = params
    stopQrScanner()
    $q.notify({ message: t('passwords.totp.qrSuccess'), color: 'positive', position: 'top', timeout: 2000 })
  }

  const handleQrResult = (data) => {
    try {
      if (/^otpauth:\/\//i.test(data)) {
        const account = parseOtpauthUri(data)
        if (account.supported) {
          acceptScannedSecret(account.secret, { algorithm: account.algorithm, digits: account.digits, period: account.period })
          return
        }
      }
      // A Google Authenticator export with a single account works here too.
      if (/^otpauth-migration:/i.test(data)) {
        const supported = decodeMigrationUri(data).accounts.filter((account) => account.supported)
        if (supported.length === 1) {
          const [account] = supported
          acceptScannedSecret(account.secret, { algorithm: account.algorithm, digits: account.digits, period: 30 })
          return
        }
      }
      if (/^[A-Z2-7]{8,128}$/i.test(data)) {
        acceptScannedSecret(data.toUpperCase())
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
    totpPeriod,
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
