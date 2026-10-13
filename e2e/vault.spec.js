import { test, expect } from './fixtures.js';
import { ENTRIES } from './helpers/seed.js';

// Navega y espera a que terminen las llamadas que la pagina dispara al montar.
// Recargar antes aborta esos fetch en vuelo, y cada uno loguea un "Failed to
// fetch" que no es un bug de la app sino del apuro del test.
const MOUNT_CALLS = ['registerUserHttp', 'getPendingSharedPasswordsHttp', 'getEmergencyContactsHttp'];
async function mounted(page, navigate) {
    const settled = Promise.all(MOUNT_CALLS.map((fn) => page.waitForResponse((response) => response.url().includes(fn))));
    await navigate();
    await settled;
}

test.describe('vault', () => {
    test('la lista carga las entradas al entrar con una sesion guardada', async ({ page }) => {
        await page.goto('/');
        for (const entry of ENTRIES) {
            await expect(page.getByText(entry.title)).toBeVisible();
        }
        await expect(page.getByText('No passwords yet')).toBeHidden();
    });

    // Guarda de regresion, NO una reproduccion del bug de la lista vacia de
    // octubre de 2026. Se comprobo: el codigo original (argumento muerto + catch
    // vacio) pasa este test, porque contra un emulador local sin latencia la
    // carrera no se da. Lo que si agarra, tambien comprobado, es que la carga se
    // rompa de verdad: ahi falla el setup con el console.error de IndexPage.
    test('recargar varias veces nunca deja la lista vacia', async ({ page }) => {
        await mounted(page, () => page.goto('/'));
        for (let i = 0; i < 5; i++) {
            await mounted(page, () => page.reload());
            await expect(page.getByText(ENTRIES[0].title), `recarga ${i + 1}`).toBeVisible();
        }
    });

    test('buscar un termino con metacaracteres de regex no rompe la lista', async ({ page }) => {
        await page.goto('/');
        await expect(page.getByText('C++ Course')).toBeVisible();
        await page.getByRole('button', { name: 'Search' }).click();
        await page.getByRole('textbox').first().fill('c++');
        // Primero que el filtro se aplico (si no, lo de abajo pasaria sin buscar).
        await expect(page.getByText('Gmail personal')).toBeHidden();
        await expect(page.getByText('C++ Course')).toBeVisible();
        await expect(page.getByText('C++ Reference')).toBeVisible();
    });
});
