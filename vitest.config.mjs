import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// Unit tests only. The Firestore rules suite needs the emulator and stays on
// its own script (`test:rules`), because it cannot run without Java + the
// emulator and would otherwise make `npm test` fail for the wrong reason.
export default defineConfig({
    resolve: {
        alias: {
            src: fileURLToPath(new URL('./src', import.meta.url)),
        },
    },
    test: {
        include: ['test/unit/**/*.test.js'],
        environment: 'node',
    },
})
