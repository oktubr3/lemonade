import { ref, computed, watch, nextTick } from 'vue'
import { useThemeStore } from 'stores/theme'

export function usePasswordForm ({ passwordEntriesStore, $q, t, router }) {
  const themeStore = useThemeStore()

  // Refs
  const form = ref({ title: '', username: '', password: '', url: '', notes: '', customFields: [] })
  const originalFormData = ref(null)
  const editingEntry = ref(null)
  const isPwd = ref(true)
  const isSaving = ref(false)
  const showDialog = ref(false)
  const editEntryHasTotp = ref(false)

  // Watcher: auto-capitalize title
  watch(() => form.value.title, (val) => {
    if (val && val[0] !== val[0].toUpperCase()) {
      form.value.title = val[0].toUpperCase() + val.slice(1)
    }
  })

  // Computed
  const dialogTitle = computed(() =>
    editingEntry.value ? t('passwords.dialog.editTitle') : t('passwords.dialog.newTitle')
  )

  const hasFormChanges = computed(() => {
    if (!editingEntry.value || !originalFormData.value) return true
    return JSON.stringify(form.value) !== JSON.stringify(originalFormData.value)
  })

  const dialogCardStyle = computed(() => {
    return themeStore.isDarkMode ? {
      background: '#161b22 !important',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.4) !important'
    } : {
      background: '#ffffff !important',
      boxShadow: '0 20px 60px rgba(0, 0, 0, 0.1) !important'
    }
  })

  // Const
  const customFieldTypeOptions = [
    { label: t('passwords.customFields.types.text'), value: 'text' },
    { label: t('passwords.customFields.types.password'), value: 'password' },
    { label: t('passwords.customFields.types.pin'), value: 'pin' }
  ]

  // Functions
  const resetForm = () => {
    form.value = { title: '', username: '', password: '', url: '', notes: '', customFields: [] }
    editingEntry.value = null
    isPwd.value = true
    editEntryHasTotp.value = false
  }

  const addCustomField = () => {
    if (form.value.customFields.length < 10) {
      form.value.customFields.push({ label: '', value: '', type: 'text' })
    }
  }

  const editEntry = async (entry) => {
    try {
      const decryptedData = await passwordEntriesStore.getDecryptedPassword(entry.id)
      const decryptedPassword = decryptedData.password || decryptedData
      const customFields = decryptedData.customFields || []
      // notes comes back from the decrypt endpoint as plaintext. entry.notes
      // from the listing is the encrypted envelope and must not be used here.
      const decryptedNotes = typeof decryptedData.notes === 'string' ? decryptedData.notes : ''
      const formData = {
        title: entry.title || entry.name,
        username: entry.username,
        password: decryptedPassword,
        url: entry.url,
        notes: decryptedNotes,
        customFields: customFields.map(f => ({ ...f }))
      }
      form.value = { ...formData, customFields: formData.customFields.map(f => ({ ...f })) }
      originalFormData.value = { ...formData, customFields: formData.customFields.map(f => ({ ...f })) }
      editEntryHasTotp.value = !!decryptedData.hasTotp
      editingEntry.value = entry
      showDialog.value = true
    } catch (error) {
      $q.notify({
        color: 'negative',
        position: 'top',
        message: t('passwords.messages.errorLoading'),
        icon: 'error'
      })
    }
  }

  const submitForm = async () => {
    if (!form.value.password) {
      return $q.notify({
        color: 'negative',
        position: 'top',
        message: t('passwords.messages.passwordEmpty'),
        icon: 'report_problem'
      })
    }

    isSaving.value = true
    try {
      const newEntry = { ...form.value }
      if (newEntry.customFields) {
        newEntry.customFields = newEntry.customFields.filter(f => f.label && f.value)
      }

      if (editingEntry.value) {
        await passwordEntriesStore.updateEntry(editingEntry.value.id, newEntry)
        editingEntry.value = null
        $q.notify({
          color: 'positive',
          position: 'top',
          message: t('passwords.messages.updated'),
          icon: 'check'
        })
      } else {
        await passwordEntriesStore.addEntry(newEntry)
        $q.notify({
          color: 'positive',
          position: 'top',
          message: t('passwords.messages.created'),
          icon: 'check'
        })
      }
      resetForm()
      showDialog.value = false
    } catch (error) {
      $q.notify({
        color: 'negative',
        position: 'top',
        message: t('passwords.messages.errorSaving'),
        icon: 'error'
      })
    } finally {
      isSaving.value = false
    }
  }

  const generatePassword = () => {
    isPwd.value = false
    const length = 16

    const lowercaseChars = 'abcdefghijklmnopqrstuvwxyz'
    const uppercaseChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    const numberChars = '0123456789'
    const symbolChars = '!@#$%^&*()_+-=?.'

    let password = ''

    const charSets = [lowercaseChars, uppercaseChars, numberChars, symbolChars]
    const randomValues = new Uint32Array(length)
    crypto.getRandomValues(randomValues)

    for (let i = 0; i < 4; i++) {
      const charset = charSets[i]
      password += charset.charAt(randomValues[i] % charset.length)
    }

    const allChars = lowercaseChars + uppercaseChars + numberChars + symbolChars
    for (let i = 4; i < length; i++) {
      password += allChars.charAt(randomValues[i] % allChars.length)
    }

    const passwordArray = password.split('')
    for (let i = passwordArray.length - 1; i > 0; i--) {
      const j = randomValues[i] % (i + 1);
      [passwordArray[i], passwordArray[j]] = [passwordArray[j], passwordArray[i]]
    }

    form.value.password = passwordArray.join('')
  }

  const focusFirstInput = () => {
    nextTick(() => {
      const firstInput = document.querySelector('.q-dialog input[type="text"]')
      if (firstInput) {
        firstInput.focus()
      }
    })
  }

  return {
    // Refs
    form,
    originalFormData,
    editingEntry,
    isPwd,
    isSaving,
    showDialog,
    editEntryHasTotp,
    // Computed
    dialogTitle,
    hasFormChanges,
    dialogCardStyle,
    // Const
    customFieldTypeOptions,
    // Functions
    resetForm,
    addCustomField,
    editEntry,
    submitForm,
    generatePassword,
    focusFirstInput
  }
}
