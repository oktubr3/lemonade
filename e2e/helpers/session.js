import { signInAsEmulatedUser } from './emulators.js';
import { mergeDocument } from './firestore.js';
import { PORTS, PROJECT_ID } from '../../playwright.config.js';

const FUNCTIONS = `http://127.0.0.1:${PORTS.functions}/${PROJECT_ID}/us-central1`;

// Entra como ese usuario y deja la app en el inicio.
//
// El orden importa. El boton de Google hace tres cosas: autentica, guarda la
// marca de inicio de sesion y navega al inicio. Este login solo hace la primera,
// asi que las otras dos van a mano -- y la marca va ANTES: MainLayout tambien
// envuelve /login, y si ve un usuario autenticado sin marca lo desloguea por
// seguridad. Con la sesion creada primero, quien ganaba esa carrera dependia de
// cuan frias estuvieran las functions.
export async function signIn(page, user, hash = '/') {
    await page.goto('/#/login');
    await page.evaluate(() => localStorage.setItem('lemonade_last_login', Date.now().toString()));
    await signInAsEmulatedUser(page, user);
    await page.goto('/#/');
    if (hash === '/') return;
    // La pantalla de login, cuando termina de registrar la sesion, navega sola al
    // inicio -- y eso puede pasar DESPUES de haber ido a otra ruta, que queda
    // pisada. La recarga descarta esa navegacion pendiente: se vuelve a montar la
    // app ya en la ruta pedida, con la sesion guardada.
    await page.goto(`/#${hash}`);
    await page.reload();
}

// Llama a una Cloud Function con la sesion que tiene esa pagina, como lo haria
// cualquiera con su propio token y sin pasar por la interfaz. Devuelve el status
// y el cuerpo, sin tirar: los tests de permisos esperan justamente un rechazo.
// El pedido sale desde Node y no desde la pagina: un 403 esperado hecho con el
// fetch del navegador deja un error en la consola, y eso rompe cualquier test.
export async function callFunction(page, name, body = {}) {
    const token = await page.evaluate(() => window.__e2eIdToken());
    const response = await fetch(`${FUNCTIONS}/${name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json().catch(() => null) };
}

// uid de la sesion de esa pagina.
export function currentUid(page) {
    return page.evaluate(async () => JSON.parse(atob((await window.__e2eIdToken()).split('.')[1])).user_id);
}

// Entra como admin, sembrando el rol en `users/{uid}.role` directo en el emulador.
// Al admin principal (ADMIN_EMAILS) las functions ya le dan el rol solas en su
// primer ingreso; para cualquier otro no hay pantalla que lo haga -- solo un
// admin principal puede nombrarlo. La recarga hace que la app vuelva a preguntar
// el rol, que ya habia pedido como usuario comun.
export async function signInAsAdmin(page, user, hash = '/') {
    await signIn(page, user);
    await mergeDocument(`users/${await currentUid(page)}`, { role: 'admin' });
    await page.goto(`/#${hash}`);
    await page.reload();
}
