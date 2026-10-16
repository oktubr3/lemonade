import QRCode from 'qrcode';
import { test, expect } from './fixtures.js';
import { callFunction, signIn } from './helpers/session.js';
import { decodeMigrationUri, encodeMigrationUris } from '../src/utils/otpMigration.js';

import totp from '../functions/totp.js';

// El mismo generador que usan las functions, verificado contra el RFC 6238.
const { generateTOTP } = totp;

// Cada test entra con su propio usuario: vault vacio y limites de frecuencia propios.
test.use({ storageState: { cookies: [], origins: [] } });

const GITHUB = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const BINANCE = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

async function createEntry(page, title, username) {
    const { status, body } = await callFunction(page, 'createPasswordEntryHttp', { title, username, password: 'secret-pass' });
    expect(status).toBe(200);
    return body.entryId;
}

// Un codigo valido ahora: el de esta ventana de 30 s o el de la anterior/siguiente
// (la pantalla y el test no leen el reloj en el mismo instante).
function validCodes(secret, params = {}) {
    const period = (params.period || 30) * 1000;
    return [-1, 0, 1].map((step) => generateTOTP(secret, params, Date.now() + step * period));
}

const shownCode = async (dialog) => (await dialog.getByTestId('totp-code').innerText()).replace(/\s/g, '');

test.describe('2FA: diálogo de vista', () => {
    test('muestra el código y lo renueva al vencer los 30 segundos', async ({ page }) => {
        test.setTimeout(120_000);
        await signIn(page, { email: 'totp-view@example.com', name: 'TOTP View' });
        const entryId = await createEntry(page, 'GitHub', 'me@example.com');
        expect((await callFunction(page, 'saveTotpSecretHttp', { entryId, totpSecret: GITHUB })).status).toBe(200);

        await page.reload();
        await page.getByText('me@example.com').click();
        const dialog = page.getByRole('dialog');
        await expect(dialog.getByTestId('totp-code')).toHaveText(/^\d{3} \d{3}$/);
        const first = await shownCode(dialog);
        expect(validCodes(GITHUB)).toContain(first);

        // Espera a que cambie: como mucho una ventana entera.
        await expect.poll(() => shownCode(dialog), { timeout: 40_000, intervals: [1000] }).not.toBe(first);
        expect(validCodes(GITHUB)).toContain(await shownCode(dialog));
    });
});

test.describe('2FA: importar desde Google Authenticator', () => {
    test('pegando dos QR: asocia la cuenta que coincide y crea las demás', async ({ page }) => {
        test.setTimeout(120_000);
        await signIn(page, { email: 'totp-import@example.com', name: 'TOTP Import' });
        const githubId = await createEntry(page, 'GitHub', 'me@example.com');

        // 11 cuentas = dos QR, como los arma Google Authenticator (10 por codigo).
        const accounts = [
            { secret: GITHUB, issuer: 'GitHub', name: 'me@example.com', algorithm: 'SHA1', digits: 6 },
            { secret: BINANCE, issuer: 'Binance', name: 'trader@example.com', algorithm: 'SHA256', digits: 8 },
            ...Array.from({ length: 9 }, (_, i) => ({
                secret: GITHUB.slice(0, 26) + 'ABCDEFGHIJ'[i] + 'QRSTUV', issuer: `Servicio ${i + 1}`, name: `u${i}@example.com`, algorithm: 'SHA1', digits: 6,
            })),
        ];
        const uris = encodeMigrationUris(accounts, { batchId: 77 });
        expect(uris).toHaveLength(2);

        await page.goto('/#/settings');
        await page.reload();
        await page.getByRole('button', { name: 'Import from Google Authenticator' }).click();
        const dialog = page.getByTestId('authenticator-import');
        await dialog.getByText('Paste the export link').click();
        await dialog.getByTestId('paste-export').fill(uris[0]);
        await dialog.getByRole('button', { name: 'Read link' }).click();
        await expect(dialog.getByTestId('qr-progress')).toHaveText('QR 1 of 2 read');
        await dialog.getByTestId('paste-export').fill(uris[1]);
        await dialog.getByRole('button', { name: 'Read link' }).click();

        const rows = dialog.getByTestId('import-row');
        await expect(rows).toHaveCount(11);
        // La de GitHub va sola a la entrada existente; las demas, a entradas nuevas.
        await expect(rows.nth(0)).toContainText('GitHub — me@example.com');
        await expect(rows.nth(1)).toContainText('Create new entry');

        await dialog.getByRole('button', { name: 'Import 11' }).click();
        await expect(page.getByText('11 accounts imported (10 new entries)')).toBeVisible();

        // El servidor genera lo mismo que el generador de referencia, con 8 digitos y SHA256 donde corresponde.
        const github = await callFunction(page, 'getTotpCodeHttp', { entryId: githubId });
        expect(validCodes(GITHUB)).toContain(github.body.code);

        await page.goto('/#/');
        await page.reload();
        await page.getByText('trader@example.com').click();
        const view = page.getByRole('dialog');
        await expect(view.getByTestId('totp-code')).toHaveText(/^\d{4} \d{4}$/);
        expect(validCodes(BINANCE, { algorithm: 'SHA256', digits: 8 })).toContain(await shownCode(view));
        await expect(view).toContainText('trader@example.com');
    });

    test('subiendo la imagen del QR', async ({ page }) => {
        await signIn(page, { email: 'totp-image@example.com', name: 'TOTP Image' });
        const [uri] = encodeMigrationUris([{ secret: GITHUB, issuer: 'Dropbox', name: 'box@example.com', algorithm: 'SHA1', digits: 6 }]);
        const png = await QRCode.toBuffer(uri, { margin: 4, width: 400 });

        await page.goto('/#/settings');
        await page.reload();
        await page.getByRole('button', { name: 'Import from Google Authenticator' }).click();
        const dialog = page.getByTestId('authenticator-import');
        await dialog.getByTestId('qr-image-input').setInputFiles({ name: 'export.png', mimeType: 'image/png', buffer: png });

        // Un solo QR: pasa directo a revisar.
        await expect(dialog.getByTestId('import-row')).toHaveCount(1);
        await expect(dialog.getByTestId('import-row')).toContainText('Dropbox');
        await dialog.getByRole('button', { name: 'Import 1' }).click();
        await expect(page.getByText('1 accounts imported (1 new entries)')).toBeVisible();
    });

    test('lo que no es una exportación se rechaza sin romper nada', async ({ page }) => {
        await signIn(page, { email: 'totp-garbage@example.com', name: 'TOTP Garbage' });
        await page.goto('/#/settings');
        await page.reload();
        await page.getByRole('button', { name: 'Import from Google Authenticator' }).click();
        const dialog = page.getByTestId('authenticator-import');
        await dialog.getByText('Paste the export link').click();
        await dialog.getByTestId('paste-export').fill('otpauth-migration://offline?data=no-es-base64%%');
        await dialog.getByRole('button', { name: 'Read link' }).click();
        await expect(page.getByText('That is not a Google Authenticator export')).toBeVisible();
        await expect(dialog.getByTestId('import-row')).toHaveCount(0);
    });
});

test.describe('2FA: exportar a Google Authenticator', () => {
    test('el QR generado lleva los secretos y se puede volver a leer', async ({ page, context }) => {
        test.setTimeout(120_000);
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await signIn(page, { email: 'totp-export@example.com', name: 'TOTP Export' });
        const githubId = await createEntry(page, 'GitHub', 'me@example.com');
        const binanceId = await createEntry(page, 'Binance', 'trader@example.com');
        await createEntry(page, 'Sin 2FA', 'nobody@example.com');
        expect((await callFunction(page, 'saveTotpSecretHttp', { entryId: githubId, totpSecret: GITHUB })).status).toBe(200);
        expect((await callFunction(page, 'saveTotpSecretHttp', { entryId: binanceId, totpSecret: BINANCE, algorithm: 'SHA256', digits: 8 })).status).toBe(200);

        await page.goto('/#/settings');
        await page.reload();
        await page.getByRole('button', { name: 'Export to Google Authenticator' }).click();
        const dialog = page.getByTestId('authenticator-export');
        // Solo las dos con 2FA, ya marcadas.
        await expect(dialog.getByText('All (2)')).toBeVisible();
        await expect(dialog.getByText('Sin 2FA')).toHaveCount(0);
        await dialog.getByRole('button', { name: 'Generate QR' }).click();
        await expect(dialog.getByTestId('export-qr-counter')).toHaveText('QR 1 of 1');

        // El enlace del QR, decodificado: los secretos y parametros exactos.
        await dialog.getByTestId('copy-export-link').click();
        const uri = await page.evaluate(() => navigator.clipboard.readText());
        const { accounts } = decodeMigrationUri(uri);
        expect(accounts.map(({ issuer, name, secret, algorithm, digits }) => ({ issuer, name, secret, algorithm, digits }))).toEqual(
            expect.arrayContaining([
                { issuer: 'GitHub', name: 'me@example.com', secret: GITHUB, algorithm: 'SHA1', digits: 6 },
                { issuer: 'Binance', name: 'trader@example.com', secret: BINANCE, algorithm: 'SHA256', digits: 8 },
            ]),
        );
        expect(accounts).toHaveLength(2);

        // Y el dibujo del QR se puede leer: captura del canvas, subida al importador de la app.
        const png = await dialog.getByTestId('export-qr').screenshot();
        await dialog.getByRole('button', { name: 'Done' }).click();
        await page.getByRole('button', { name: 'Import from Google Authenticator' }).click();
        const importer = page.getByTestId('authenticator-import');
        await importer.getByTestId('qr-image-input').setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: png });
        await expect(importer.getByTestId('import-row')).toHaveCount(2);
        await expect(importer).toContainText('Binance');
        await expect(importer).toContainText('This entry already has 2FA: it will be replaced');
    });

    test('la API de exportación no entrega secretos de otro usuario', async ({ page, browser }) => {
        await signIn(page, { email: 'totp-owner@example.com', name: 'Owner' });
        const entryId = await createEntry(page, 'Privado', 'owner@example.com');
        expect((await callFunction(page, 'saveTotpSecretHttp', { entryId, totpSecret: GITHUB })).status).toBe(200);

        const other = await (await browser.newContext({ storageState: { cookies: [], origins: [] } })).newPage();
        await signIn(other, { email: 'totp-intruder@example.com', name: 'Intruder' });
        const response = await callFunction(other, 'exportTotpAccountsHttp', { entryIds: [entryId] });
        expect(response.status).toBe(403);
        expect(JSON.stringify(response.body)).not.toContain(GITHUB);
        const imported = await callFunction(other, 'importTotpAccountsHttp', { accounts: [{ entryId, secret: BINANCE }] });
        expect(imported.status).toBe(403);
        await other.close();
    });
});
