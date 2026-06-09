// Firebase Functions URL configuration
// Automatically detects if running locally and uses emulators

const isLocalhost = typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

const EMULATOR_URL = 'http://127.0.0.1:5001/passmanager-d2b6d/us-central1';
const PRODUCTION_URL = 'https://us-central1-passmanager-d2b6d.cloudfunctions.net';

export const FUNCTIONS_URL = isLocalhost ? EMULATOR_URL : PRODUCTION_URL;

export default FUNCTIONS_URL;
