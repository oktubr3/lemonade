// Firebase Functions URL configuration
// Automatically detects if running locally and uses emulators

const isLocalhost = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

// Id y puerto salen del env para que los tests e2e corran con un proyecto
// `demo-*` y un puerto propio; sin las variables queda lo de siempre.
const EMULATOR_PROJECT = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'passmanager-d2b6d';
const EMULATOR_PORT = Number(import.meta.env.VITE_EMULATOR_FUNCTIONS_PORT) || 5001;
const EMULATOR_URL = `http://127.0.0.1:${EMULATOR_PORT}/${EMULATOR_PROJECT}/us-central1`;
const PRODUCTION_URL = 'https://us-central1-passmanager-d2b6d.cloudfunctions.net';

export const FUNCTIONS_URL = isLocalhost ? EMULATOR_URL : PRODUCTION_URL;

export default FUNCTIONS_URL;
