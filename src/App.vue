<template>
    <router-view />
</template>

<script setup>
import { defineComponent } from "vue";
defineComponent({
    name: "App",
});

// Console banner. Moved here from an inline <script> in index.html so the CSP
// can drop 'unsafe-inline' from script-src. The version comes from package.json
// via build.rawDefine instead of a hardcoded string, which had drifted 11 releases.
console.log(
    `%c🍋 Lemonade Password Manager %cv${__APP_VERSION__}`,
    "color: #FFE135; font-size: 16px; font-weight: bold;",
    "color: #888; font-size: 12px;"
);
console.log("%cYour secrets are safe with us.", "color: #0f0; font-family: monospace;");
</script>
