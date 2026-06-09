import { boot } from 'quasar/wrappers'
import { createI18n } from 'vue-i18n'
import { defaultMessages, localeLoaders } from 'src/i18n'

// Supported languages with their display names
export const supportedLanguages = [
  { value: 'en-US', label: 'English', nativeLabel: 'English', flag: 'us' },
  { value: 'es-AR', label: 'Spanish', nativeLabel: 'Español', flag: 'ar' },
  { value: 'zh-CN', label: 'Chinese (Simplified)', nativeLabel: '简体中文', flag: 'cn' },
  { value: 'hi-IN', label: 'Hindi', nativeLabel: 'हिन्दी', flag: 'in' },
  { value: 'ar-SA', label: 'Arabic', nativeLabel: 'العربية', flag: 'sa', rtl: true },
  { value: 'pt-BR', label: 'Portuguese', nativeLabel: 'Português', flag: 'br' },
  { value: 'bn-BD', label: 'Bengali', nativeLabel: 'বাংলা', flag: 'bd' },
  { value: 'ru-RU', label: 'Russian', nativeLabel: 'Русский', flag: 'ru' },
  { value: 'ja-JP', label: 'Japanese', nativeLabel: '日本語', flag: 'jp' },
  { value: 'fr-FR', label: 'French', nativeLabel: 'Français', flag: 'fr' }
]

// Storage key for language preference
const LANGUAGE_STORAGE_KEY = 'lemonade-language'

// Get saved language from localStorage
export function getSavedLanguage() {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY)
  } catch {
    return null
  }
}

// Save language to localStorage
export function saveLanguage(locale) {
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, locale)
  } catch {
    // Ignore localStorage errors
  }
}

// Detect browser language and map to supported language
function detectBrowserLanguage() {
  const browserLang = navigator.language || navigator.userLanguage || 'en-US'

  // Try exact match first
  const exactMatch = supportedLanguages.find(l => l.value === browserLang)
  if (exactMatch) return exactMatch.value

  // Try matching just the language code (e.g., 'es' from 'es-MX')
  const langCode = browserLang.split('-')[0]
  const partialMatch = supportedLanguages.find(l => l.value.startsWith(langCode + '-'))
  if (partialMatch) return partialMatch.value

  // Default to English
  return 'en-US'
}

// Get initial locale
function getInitialLocale() {
  // Priority: 1. Saved preference, 2. Browser language, 3. Default (en-US)
  const saved = getSavedLanguage()
  if (saved && supportedLanguages.some(l => l.value === saved)) {
    return saved
  }
  return detectBrowserLanguage()
}

// Check if language is RTL
export function isRtlLanguage(locale) {
  const lang = supportedLanguages.find(l => l.value === locale)
  return lang?.rtl || false
}

// Apply RTL direction to document
export function applyRtlDirection(locale) {
  const isRtl = isRtlLanguage(locale)
  document.documentElement.dir = isRtl ? 'rtl' : 'ltr'
  document.documentElement.lang = locale.split('-')[0]
}

// Load locale messages on demand
async function loadLocaleMessages(locale) {
  if (!i18nInstance) return
  // en-US is always loaded (bundled with app)
  if (locale === 'en-US') return
  // Skip if already loaded
  if (i18nInstance.global.availableLocales.includes(locale)) return
  // Load dynamically
  const loader = localeLoaders[locale]
  if (!loader) return
  const module = await loader()
  i18nInstance.global.setLocaleMessage(locale, module.default)
}

// Create i18n instance
let i18nInstance = null

export default boot(async ({ app }) => {
  const initialLocale = getInitialLocale()

  // Start with en-US messages (always bundled)
  const messages = { ...defaultMessages }

  // If initial locale is not en-US, load it before creating i18n
  if (initialLocale !== 'en-US' && localeLoaders[initialLocale]) {
    try {
      const module = await localeLoaders[initialLocale]()
      messages[initialLocale] = module.default
    } catch {
      // Fall back to en-US if locale fails to load
    }
  }

  i18nInstance = createI18n({
    locale: initialLocale,
    fallbackLocale: 'en-US',
    globalInjection: true,
    legacy: false, // Use Composition API mode
    messages,
    missingWarn: false,
    fallbackWarn: false
  })

  // Apply RTL direction if needed
  applyRtlDirection(initialLocale)

  // Save initial language if not already saved
  if (!getSavedLanguage()) {
    saveLanguage(initialLocale)
  }

  // Set i18n instance on app
  app.use(i18nInstance)
})

// Export getter for i18n instance (use after boot)
export function getI18n() {
  return i18nInstance
}

// Helper to change language (async - loads locale on demand)
export async function setLanguage(locale) {
  if (!i18nInstance) return

  // Validate locale
  if (!supportedLanguages.some(l => l.value === locale)) {
    console.warn(`Unsupported locale: ${locale}`)
    return
  }

  // Load locale messages if needed
  await loadLocaleMessages(locale)

  // Update i18n locale (Composition API mode uses .value)
  i18nInstance.global.locale.value = locale

  // Save preference
  saveLanguage(locale)

  // Apply RTL direction
  applyRtlDirection(locale)
}
