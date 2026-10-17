import { test, expect } from './fixtures.js';
import { signIn } from './helpers/session.js';
import { CSP_LAUNCH_ARGS, useProductionCsp, withoutBarcodeDetector } from './helpers/productionCsp.js';
import { qrVideo } from './helpers/fakeCamera.js';
import { encodeMigrationUris } from '../src/utils/otpMigration.js';

// Un export de 12 cuentas = dos QR, filmados como si fueran la pantalla del telefono.
const ACCOUNTS = Array.from({ length: 12 }, (_, i) => ({
    secret: `JBSWY3DPEHPK3PXP${'ABCDEFGHIJKL'[i]}QRSTUVW`, issuer: `Camara ${i + 1}`, name: `cam${i}@example.com`, algorithm: 'SHA1', digits: 6,
}));
const VIDEO = qrVideo('google-authenticator-export', encodeMigrationUris(ACCOUNTS, { batchId: 5 }));

test.use({
    storageState: { cookies: [], origins: [] },
    permissions: ['camera'],
    launchOptions: {
        args: [...CSP_LAUNCH_ARGS, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${VIDEO}`],
    },
});

test('2FA: la cámara lee los dos QR seguidos, sin avisos repetidos', async ({ page }) => {
    test.setTimeout(120_000);
    await useProductionCsp(page);
    await withoutBarcodeDetector(page);
    await signIn(page, { email: 'totp-camera@example.com', name: 'TOTP Camera' }, '/settings');
    await page.getByRole('button', { name: 'Import from Google Authenticator' }).click();
    const dialog = page.getByTestId('authenticator-import');
    // Anota cada aviso que aparece. Un toHaveCount(0) sobre los avisos no sirve:
    // reintenta hasta que se cumple, y los avisos se van solos a los 1,5 s.
    await page.evaluate(() => {
        window.__toasts = [];
        new MutationObserver((records) => {
            for (const record of records) {
                for (const node of record.addedNodes) {
                    if (node.nodeType === 1 && node.matches?.('.q-notification')) window.__toasts.push(node.innerText);
                }
            }
        }).observe(document.body, { childList: true, subtree: true });
    });
    await dialog.getByRole('button', { name: 'Use camera' }).click();

    // Cada QR queda varios segundos frente a la camara: tiene que leerse una vez.
    await expect(dialog.getByTestId('import-row')).toHaveCount(12, { timeout: 30_000 });
    const toasts = await page.evaluate(() => window.__toasts);
    expect(toasts.filter((text) => text.includes('QR 1 of 2 read'))).toHaveLength(1);
    expect(toasts.filter((text) => text.includes('already read'))).toEqual([]);
    await expect(dialog.getByRole('button', { name: 'Import 12' })).toBeEnabled();
});
