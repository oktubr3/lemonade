import enUS from './en-US/index.json'

export const defaultMessages = { 'en-US': enUS }

export const localeLoaders = {
  'es-AR': () => import('./es-AR/index.json'),
  'zh-CN': () => import('./zh-CN/index.json'),
  'hi-IN': () => import('./hi-IN/index.json'),
  'ar-SA': () => import('./ar-SA/index.json'),
  'pt-BR': () => import('./pt-BR/index.json'),
  'bn-BD': () => import('./bn-BD/index.json'),
  'ru-RU': () => import('./ru-RU/index.json'),
  'ja-JP': () => import('./ja-JP/index.json'),
  'fr-FR': () => import('./fr-FR/index.json'),
}
