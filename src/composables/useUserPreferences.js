import { ref, computed } from 'vue'
import { auth, db } from 'boot/firebase'
import { doc, getDoc } from 'firebase/firestore'

// Global user preferences state
const userPreferences = ref({
  enableAISecurityAnalysis: false,    // Disabled by default
  enablePasswordAgeCheck: false,      // Disabled by default  
  mobileColumns: 3,
  desktopColumns: 6,
  theme: 'auto',
  notifications: true,
  biometricAuth: false
})

const isLoaded = ref(false)

export function useUserPreferences() {
  
  // Load user preferences from Firestore
  const loadPreferences = async () => {
    if (!auth.currentUser || isLoaded.value) return
    
    try {
      const settingsDoc = await getDoc(doc(db, 'user_settings', auth.currentUser.uid))
      if (settingsDoc.exists()) {
        const data = settingsDoc.data()
        
        // Merge with defaults, ensuring privacy options are false by default
        userPreferences.value = {
          enableAISecurityAnalysis: data.enableAISecurityAnalysis || false,
          enablePasswordAgeCheck: data.enablePasswordAgeCheck || false,
          mobileColumns: data.mobileColumns || 3,
          desktopColumns: data.desktopColumns || 6,
          theme: data.theme || 'auto',
          notifications: data.notifications !== undefined ? data.notifications : true,
          biometricAuth: data.biometricAuth || false
        }
      }
      
      isLoaded.value = true
      
      // Also try to load from localStorage as fallback
      const localSettings = localStorage.getItem('userSettings')
      if (localSettings) {
        const parsed = JSON.parse(localSettings)
        userPreferences.value = {
          ...userPreferences.value,
          ...parsed,
          // Always respect the Firestore values for privacy options
          enableAISecurityAnalysis: userPreferences.value.enableAISecurityAnalysis,
          enablePasswordAgeCheck: userPreferences.value.enablePasswordAgeCheck
        }
      }
      
    } catch (error) {
      console.error('Error loading user preferences:', error)
      isLoaded.value = true // Mark as loaded even on error to prevent infinite retries
    }
  }

  // Listen to settings changes from other tabs/components
  const listenToSettingsChanges = () => {
    window.addEventListener('userSettingsChanged', (event) => {
      if (event.detail) {
        userPreferences.value = { ...userPreferences.value, ...event.detail }
      }
    })
  }

  // Computed properties for easy access
  const canUseAIAnalysis = computed(() => {
    return userPreferences.value.enableAISecurityAnalysis === true
  })

  const canCheckPasswordAge = computed(() => {
    return userPreferences.value.enablePasswordAgeCheck === true
  })

  const shouldShowSecurityButtons = computed(() => {
    return userPreferences.value.enableAISecurityAnalysis === true
  })

  return {
    userPreferences: computed(() => userPreferences.value),
    isLoaded: computed(() => isLoaded.value),
    loadPreferences,
    listenToSettingsChanges,
    canUseAIAnalysis,
    canCheckPasswordAge,
    shouldShowSecurityButtons
  }
}