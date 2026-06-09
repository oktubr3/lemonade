<template>
  <div
    class="lemonade-loader"
    :class="{
      'lemonade-loader--fullscreen': fullscreen,
      'lemonade-loader--transparent': transparent
    }"
  >
    <div class="lemonade-loader__card">
      <img
        src="~assets/lemonade.webp"
        alt="Lemonade"
        class="lemonade-loader__logo"
      />
      <div class="lemonade-loader__name">Lemonade</div>
      <div class="lemonade-loader__subtitle">{{ message || 'Password Manager' }}</div>
      <div class="lemonade-loader__bar-track">
        <div class="lemonade-loader__bar-fill"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  message: {
    type: String,
    default: ''
  },
  fullscreen: {
    type: Boolean,
    default: true
  },
  transparent: {
    type: Boolean,
    default: false
  }
})
</script>

<style>
.lemonade-loader {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
}

.lemonade-loader--fullscreen {
  position: fixed;
  inset: 0;
  z-index: 99999;
  background: #f0f1f3;
  padding: 0;
}

.lemonade-loader--transparent {
  background: transparent !important;
}

.lemonade-loader__card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 260px;
  height: 200px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
}

.lemonade-loader__logo {
  width: 40px;
  height: 40px;
  opacity: 0.85;
  filter: drop-shadow(0 2px 8px rgba(255, 215, 0, 0.15));
}

.lemonade-loader__name {
  margin-top: 16px;
  color: #1a1a2e;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.lemonade-loader__subtitle {
  margin-top: 4px;
  color: rgba(100, 100, 120, 0.7);
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 400;
}

.lemonade-loader__bar-track {
  margin-top: 32px;
  width: 120px;
  height: 2px;
  background: rgba(0, 0, 0, 0.06);
  border-radius: 1px;
  overflow: hidden;
}

.lemonade-loader__bar-fill {
  height: 100%;
  width: 40%;
  background: rgba(255, 215, 0, 0.6);
  border-radius: 1px;
  animation: lemonade-loader-slide 1.2s ease-in-out infinite;
}

/* Dark mode */
.body--dark .lemonade-loader__card,
.lemonade-dark .lemonade-loader__card {
  background: rgba(22, 27, 34, 0.95);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

.body--dark .lemonade-loader--fullscreen,
.lemonade-dark .lemonade-loader--fullscreen {
  background: #010409;
}

.body--dark .lemonade-loader__name,
.lemonade-dark .lemonade-loader__name {
  color: #FFFFFF;
}

.body--dark .lemonade-loader__subtitle,
.lemonade-dark .lemonade-loader__subtitle {
  color: rgba(139, 148, 158, 0.7);
}

.body--dark .lemonade-loader__bar-track,
.lemonade-dark .lemonade-loader__bar-track {
  background: rgba(255, 255, 255, 0.06);
}

.body--dark .lemonade-loader__bar-fill,
.lemonade-dark .lemonade-loader__bar-fill {
  background: rgba(255, 215, 0, 0.4);
}

@keyframes lemonade-loader-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}

@keyframes lemonade-loader-pulse {
  0%, 100% { opacity: 0.7; }
  50% { opacity: 1; }
}
</style>
