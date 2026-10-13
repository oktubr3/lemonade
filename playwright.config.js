import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { defineConfig, devices } from '@playwright/test';

// Tests e2e contra los emuladores de Firebase. Nada de esto puede tocar
// produccion, y no por cuidado sino por construccion:
//   1. El proyecto es `demo-*`: Firebase nunca lo conecta a la nube, aunque
//      haya credenciales en la maquina o falte levantar un emulador.
//   2. La app solo habla con emuladores si VITE_USE_EMULATORS=true Y es un
//      build de desarrollo (ver src/boot/firebase.js).
//   3. Los secretos de abajo son de prueba; los reales viven en Secret Manager.
export const PROJECT_ID = 'demo-lemonade';
export const AUTH_FILE = 'e2e/.auth/user.json';

// Puertos propios, NO los de Firebase por defecto (9099/8080/5001). Con los
// default, los e2e chocan con los emuladores de cualquier otro proyecto que este
// corriendo en la maquina -- paso: estaban tomados por otro repo y la suite no
// arrancaba. Cada proyecto que use este esquema elige su propio bloque.
export const PORTS = { app: 9100, auth: 9199, firestore: 8180, functions: 5101 };
export const APP_URL = `http://localhost:${PORTS.app}`;

// El config de emuladores se deriva de firebase.json en cada corrida en vez de
// mantener una copia a mano: asi hereda functions y reglas tal cual estan, y
// firebase.json no cambia (el `firebase emulators:start` de siempre sigue igual).
const E2E_FIREBASE_CONFIG = '.firebase.e2e.json';
writeFileSync(E2E_FIREBASE_CONFIG, JSON.stringify({
    ...JSON.parse(readFileSync('firebase.json', 'utf8')),
    emulators: {
        auth: { port: PORTS.auth },
        firestore: { port: PORTS.firestore, websocketPort: 9160 },
        functions: { port: PORTS.functions },
        hub: { port: 4410 },
        logging: { port: 4510 },
        ui: { enabled: false },
        singleProjectMode: true,
    },
}, null, 2));

// Variables de las functions que los tests necesitan con un valor fijo. No alcanza
// con pasarlas por `webServer.env`: el emulador carga `functions/.env`, que en la
// maquina de desarrollo existe (con el admin real) y le GANA al entorno del
// proceso. En CI ese archivo no esta y los mismos tests veian otro admin.
// `.env.<proyecto>` tiene prioridad sobre `.env` y solo se lee para este proyecto
// demo, asi que no afecta a un deploy. Esta ignorado por git (`functions/.gitignore`).
export const ADMIN_EMAIL = 'admin@example.com';
writeFileSync(`functions/.env.${PROJECT_ID}`, `ADMIN_EMAILS=${ADMIN_EMAIL}\n`);

// firebase-tools 15 necesita JDK 21 para el emulador de Firestore. En esta Mac
// el default es 17 y el 21 esta en Homebrew; en CI lo pone actions/setup-java.
const BREW_JDK = '/opt/homebrew/opt/openjdk@21';
// La salida de los servidores (warnings de Node, avisos de deprecacion del
// router) tapa el resultado de los tests. Se muestra solo si se pide:
//   E2E_DEBUG=1 pnpm run test:e2e
const serverOutput = process.env.E2E_DEBUG ? 'pipe' : 'ignore';

const javaEnv = existsSync(BREW_JDK)
    ? { JAVA_HOME: BREW_JDK, PATH: `${BREW_JDK}/bin:${process.env.PATH}` }
    : {};

export default defineConfig({
    testDir: './e2e',
    // Un solo worker: todos los tests comparten el estado del emulador.
    workers: 1,
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    // Sin reintentos, tampoco en CI: la primera corrida ahi dio verde con dos
    // tests que habian fallado y pasaron al segundo intento. Un reintento
    // convierte un test inestable en un verde, que es peor que un rojo.
    retries: 0,
    // 20s en vez de los 5s por defecto. No es holgura: el dev server compila
    // cada modulo la primera vez que se pide, y en el emulador cada function
    // tiene su propio arranque en frio. En CI la primera interaccion tarda.
    expect: { timeout: 20_000 },
    // Tope por test. El default de 30s alcanzaba en local y no siempre en CI:
    // dos PRs fallaron con "Test timeout of 30000ms exceeded" en pleno login,
    // con el mismo codigo que en main pasaba.
    timeout: 60_000,
    reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: APP_URL,
        // Tope por accion. Sin esto un selector equivocado no falla: espera hasta
        // agotar el timeout del test.
        actionTimeout: 15_000,
        // Idioma fijo: los tests buscan textos, y el default del navegador cambia
        // entre la maquina de desarrollo y CI.
        locale: 'en-US',
        // Sin service worker: un SW serviria el bundle cacheado y el test estaria
        // mirando codigo viejo (el incidente que documenta CLAUDE.md).
        serviceWorkers: 'block',
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        { name: 'setup', testMatch: /.*\.setup\.js/ },
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'], storageState: AUTH_FILE },
            dependencies: ['setup'],
        },
    ],
    webServer: [
        {
            command: `${process.env.FIREBASE_BIN || 'firebase'} emulators:start --config ${E2E_FIREBASE_CONFIG} --only auth,firestore,functions --project ${PROJECT_ID}`,
            url: `http://127.0.0.1:${PORTS.functions}/${PROJECT_ID}/us-central1/healthCheck`,
            reuseExistingServer: !process.env.CI,
            timeout: 180_000,
            // SIGINT y tiempo para cerrar: con el SIGKILL por defecto el CLI muere
            // sin apagar a sus hijos, y el emulador de Firestore (un proceso Java)
            // queda huerfano ocupando el 8080. La corrida siguiente no arranca.
            gracefulShutdown: { signal: 'SIGINT', timeout: 15_000 },
            stdout: serverOutput,
            stderr: serverOutput,
            env: {
                ...javaEnv,
                ENCRYPTION_KEY: '0'.repeat(64),
                POLAR_ACCESS_TOKEN: 'e2e-test',
                POLAR_PRODUCT_ID: 'e2e-test',
                POLAR_WEBHOOK_SECRET: 'polar_whs_e2e-test',
                ADMIN_EMAILS: ADMIN_EMAIL,
            },
        },
        {
            command: `npx quasar dev --port ${PORTS.app}`,
            url: APP_URL,
            reuseExistingServer: !process.env.CI,
            timeout: 120_000,
            stdout: serverOutput,
            stderr: serverOutput,
            env: {
                E2E: '1',
                VITE_USE_EMULATORS: 'true',
                VITE_EMULATOR_AUTH_PORT: String(PORTS.auth),
                VITE_EMULATOR_FIRESTORE_PORT: String(PORTS.firestore),
                VITE_EMULATOR_FUNCTIONS_PORT: String(PORTS.functions),
                VITE_FIREBASE_PROJECT_ID: PROJECT_ID,
                VITE_FIREBASE_API_KEY: 'demo-key',
                VITE_FIREBASE_AUTH_DOMAIN: `${PROJECT_ID}.firebaseapp.com`,
                VITE_FIREBASE_STORAGE_BUCKET: `${PROJECT_ID}.appspot.com`,
                VITE_FIREBASE_MESSAGING_SENDER_ID: '0',
                VITE_FIREBASE_APP_ID: 'demo-app',
            },
        },
    ],
});
