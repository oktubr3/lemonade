import { test as setup, expect } from './fixtures.js';
import { AUTH_FILE } from '../playwright.config.js';
import { resetEmulators } from './helpers/emulators.js';
import { ENTRIES, OWNER } from './helpers/seed.js';
import { signIn } from './helpers/session.js';

setup('login y vault inicial', async ({ page }) => {
    // Es el test mas largo y el que corre con todo frio: primer login, primera
    // invocacion de cada function, y un alta por cada entrada de la semilla.
    setup.setTimeout(180_000);
    await resetEmulators();

    await signIn(page, OWNER);
    await expect(page.getByText('No passwords yet')).toBeVisible();

    for (const entry of ENTRIES) {
        await page.getByRole('button', { name: 'Add Password' }).click();
        // Por rol y contenido: `.q-dialog` a secas tambien matchea otros
        // dialogos de Quasar que puedan estar abiertos (se vio en CI).
        const dialog = page.getByRole('dialog').filter({ has: page.getByLabel('Title *') });
        await dialog.getByLabel('Title *').fill(entry.title);
        await dialog.getByLabel('Username / Email').fill(entry.username);
        await dialog.getByLabel('Password *').fill('e2e-Password-123!');
        await dialog.getByRole('button', { name: /save/i }).click();
        await expect(dialog).toBeHidden();
        await expect(page.getByText(entry.title)).toBeVisible();
    }

    // indexedDB: la sesion de Firebase Auth vive ahi, no en cookies.
    await page.context().storageState({ path: AUTH_FILE, indexedDB: true });
});
