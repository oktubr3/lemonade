import { readFileSync } from 'node:fs';

// El CSP de produccion vive en los headers de hosting de firebase.json, y el
// dev server de los e2e no lo manda. v2.3.0 salio con la lectura de QR rota por
// eso: qr-scanner decodifica en un Worker `blob:` y carga la imagen subida como
// `blob:`, el CSP los bloqueaba, y los tests pasaban sin CSP.
function productionCsp() {
    const hosting = JSON.parse(readFileSync('firebase.json', 'utf8')).hosting;
    const app = hosting.find((site) => site.target === 'app');
    for (const rule of app.headers) {
        const header = rule.headers.find((h) => h.key === 'Content-Security-Policy');
        if (header) return header.value;
    }
    throw new Error('firebase.json no tiene Content-Security-Policy para la app');
}

// Lo unico que se agrega son los emuladores (y el websocket del dev server):
// en produccion esas llamadas van a *.googleapis.com / *.cloudfunctions.net.
export function e2eCsp() {
    return productionCsp().replace(
        /connect-src ([^;]*)/,
        'connect-src $1 http://127.0.0.1:* http://localhost:* ws://localhost:*',
    );
}

// Al reescribir la respuesta, Chromium deja de saber que el documento viene de
// localhost y le bloquea los pedidos a los emuladores (Local Network Access).
// En produccion no aplica: la app y sus APIs son publicas.
export const CSP_LAUNCH_ARGS = ['--disable-features=LocalNetworkAccessChecks'];

// Aplica el CSP a los documentos de la app servidos por el dev server.
export async function useProductionCsp(page) {
    const csp = e2eCsp();
    await page.route('**/*', async (route) => {
        if (route.request().resourceType() !== 'document') return route.continue();
        const response = await route.fetch();
        await route.fulfill({ response, headers: { ...response.headers(), 'content-security-policy': csp } });
    });
}

// qr-scanner usa el BarcodeDetector nativo si existe, salvo en Chrome sobre Mac
// con chip Apple y macOS 13+, donde lo da por roto y decodifica en su Worker.
// Ese es el camino que fallaba en produccion: sin detector, los tests lo recorren.
export async function withoutBarcodeDetector(page) {
    await page.addInitScript(() => { delete window.BarcodeDetector; });
}
