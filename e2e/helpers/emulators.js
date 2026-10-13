import { PROJECT_ID, PORTS } from '../../playwright.config.js';

const AUTH = `http://127.0.0.1:${PORTS.auth}`;
const FIRESTORE = `http://127.0.0.1:${PORTS.firestore}`;

// Deja los emuladores vacios. Sin esto una corrida hereda las cuentas y los
// documentos de la anterior, y el selector de cuentas del emulador cambia de
// forma segun haya o no una cuenta previa.
export async function resetEmulators() {
    // Guarda: solo proyectos `demo-*`. Si alguien cambia el id por uno real,
    // esto corta antes de borrar nada.
    if (!PROJECT_ID.startsWith('demo-')) {
        throw new Error(`resetEmulators solo corre contra un proyecto demo-*, no "${PROJECT_ID}"`);
    }
    const targets = [
        `${AUTH}/emulator/v1/projects/${PROJECT_ID}/accounts`,
        `${FIRESTORE}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    ];
    for (const url of targets) {
        const res = await fetchWhenUp(url, { method: 'DELETE' });
        if (!res.ok) throw new Error(`No se pudo resetear ${url}: HTTP ${res.status}`);
    }
}

// Los emuladores no quedan listos todos juntos, y el `url` de webServer en
// playwright.config.js espera a uno solo. Si ese no es el ultimo en levantar, el
// primer test arranca con otro todavia caido (ECONNREFUSED). Se reintenta la
// conexion, no la respuesta: un HTTP de error se devuelve tal cual.
async function fetchWhenUp(url, init, timeoutMs = 60_000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        try {
            return await fetch(url, init);
        } catch (error) {
            if (Date.now() > deadline) throw new Error(`El emulador no respondio en ${timeoutMs} ms: ${url}`, { cause: error });
            await new Promise((resolve) => setTimeout(resolve, 500));
        }
    }
}

// Crea la sesion de un usuario de Google de mentira llamando al gancho que la
// app expone solo con emuladores (ver src/boot/firebase.js). NO pasa por el
// boton ni por el popup de Google, a proposito: el popup entrega el resultado por
// un iframe que depende de un script de apis.google.com bajado en cada corrida.
// Si ese script llega tarde, el login se cuelga sin error. Se probo demorandolo
// 4 s: falla siempre. Un test que depende de la red de un tercero no es un test.
//
// Lo que esto NO cubre: el click en "Continuar con Google" y el popup en si,
// ni lo que la app haga en el handler de ese boton (por ejemplo redirigir al
// inicio): despues de llamar a esto el test navega por su cuenta. Lo que cuelga
// del estado de Auth (chequeo de acceso, carga de perfil) corre igual.
export async function signInAsEmulatedUser(page, { email, name }) {
    await page.waitForFunction(() => typeof window.__e2eSignIn === 'function');
    await page.evaluate((credentials) => window.__e2eSignIn(credentials).then(() => null), { email, name });
}
