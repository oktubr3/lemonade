import { defineStore } from 'pinia'
import { Dark, LocalStorage } from 'quasar'

export const useThemeStore = defineStore('theme', {
  state: () => ({
    isDarkMode: LocalStorage.getItem('lemonade-dark-mode') || false
  }),

  getters: {
    currentTheme: (state) => state.isDarkMode ? 'dark' : 'light',
    themeClass: (state) => state.isDarkMode ? 'lemonade-dark' : 'lemonade-light'
  },

  actions: {
    toggleDarkMode(event) {
      // Check if View Transitions API is supported
      if (document.startViewTransition && event?.currentTarget) {
        this.performViewTransition(event)
      } else {
        this.performFallbackTransition()
      }
    },

    performViewTransition(event) {
      const rect = event.currentTarget.getBoundingClientRect()
      const x = rect.left + rect.width / 2
      const y = rect.top + rect.height / 2
      
      // Calculate radius to cover the entire viewport
      const maxRadius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y)
      )

      document.startViewTransition(() => {
        this.isDarkMode = !this.isDarkMode
        Dark.set(this.isDarkMode)
        LocalStorage.set('lemonade-dark-mode', this.isDarkMode)
        
        // Update body classes immediately for the transition
        document.body.classList.toggle('lemonade-dark', this.isDarkMode)
        document.body.classList.toggle('lemonade-light', !this.isDarkMode)
      })

      // Add custom styles for the circular reveal animation
      const style = document.createElement('style')
      style.textContent = `
        ::view-transition-new(root) {
          mask: circle(0 at ${x}px ${y}px);
          animation: theme-reveal 0.6s ease-in-out;
        }
        
        @keyframes theme-reveal {
          to {
            mask: circle(${maxRadius}px at ${x}px ${y}px);
          }
        }
      `
      document.head.appendChild(style)
      
      // Clean up styles after animation
      setTimeout(() => {
        document.head.removeChild(style)
      }, 600)
    },

    performFallbackTransition() {
      // Add transition class to prevent flash
      document.documentElement.style.setProperty('--theme-transition-active', '1')
      
      // Smooth transition effect for older browsers
      document.body.style.transition = 'background-color 0.4s cubic-bezier(0.4, 0, 0.2, 1), color 0.4s cubic-bezier(0.4, 0, 0.2, 1)'
      
      // Apply changes
      this.isDarkMode = !this.isDarkMode
      Dark.set(this.isDarkMode)
      LocalStorage.set('lemonade-dark-mode', this.isDarkMode)
      
      // Update body classes
      document.body.classList.toggle('lemonade-dark', this.isDarkMode)
      document.body.classList.toggle('lemonade-light', !this.isDarkMode)
      
      // Clean up after animation
      setTimeout(() => {
        document.body.style.transition = ''
        document.documentElement.style.removeProperty('--theme-transition-active')
      }, 400)
    },

    initializeTheme() {
      const savedTheme = LocalStorage.getItem('lemonade-dark-mode')
      if (savedTheme !== null) {
        this.isDarkMode = savedTheme
      } else {
        // Respect system preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
        this.isDarkMode = prefersDark
      }
      
      Dark.set(this.isDarkMode)
      LocalStorage.set('lemonade-dark-mode', this.isDarkMode)
    }
  }
})