import { test, expect } from './fixtures.js';
import { ADMIN, ENTRIES, OWNER } from './helpers/seed.js';
import { callFunction, currentUid, signIn, signInAsAdmin } from './helpers/session.js';

// Cada test entra con su propio usuario.
test.use({ storageState: { cookies: [], origins: [] } });

const MEMBER = { email: 'member-e2e@example.com', name: 'Member E2E' };
const SECOND_ADMIN = { email: 'second-admin-e2e@example.com', name: 'Second Admin E2E' };

// Por el mail exacto: `e2e@example.com` tambien es parte de `member-e2e@example.com`.
const userRow = (page, email) => page.getByTestId('admin-user-row').filter({ has: page.getByText(email, { exact: true }) });

// Abre una segunda sesion, en su propio contexto, y devuelve su pagina.
async function openSession(browser, user, enter = signIn) {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await enter(page, user);
    return page;
}

test.describe('panel de administracion: quien entra', () => {
    test('un usuario comun no entra al panel ni a su API', async ({ page }) => {
        await signIn(page, MEMBER);
        await expect(page.getByText('No passwords yet')).toBeVisible();

        await page.goto('/#/admin/users');
        await expect(page.getByText('No passwords yet')).toBeVisible();
        await expect(page.getByText('User Administration')).toHaveCount(0);

        // La pantalla es solo la mitad: la API tiene que negarse por su cuenta.
        expect((await callFunction(page, 'adminGetUsersHttp')).status).toBe(403);
        expect((await callFunction(page, 'adminGetStatsHttp')).status).toBe(403);
        const uid = await currentUid(page);
        expect((await callFunction(page, 'adminUpdateUserHttp', { targetUserId: uid, updates: { role: 'admin' } })).status).toBe(403);
    });
});

test.describe('panel de administracion: usuarios', () => {
    test('lista a los usuarios con la cantidad de contrasenas de cada uno', async ({ page }) => {
        await signInAsAdmin(page, ADMIN, '/admin/users');
        await expect(page.getByText('User Administration')).toBeVisible();

        // El dueno del vault sembrado tiene exactamente las entradas de la semilla.
        await expect(userRow(page, OWNER.email)).toContainText(`${ENTRIES.length} pwd`);
        await expect(userRow(page, ADMIN.email)).toContainText('0 pwd');
        // El ultimo ingreso sale de Firebase Auth: nadie que acaba de entrar figura como "never".
        await expect(userRow(page, OWNER.email)).not.toContainText('never');
        await expect(page.getByTestId('stat-passwords')).toHaveText(String(ENTRIES.length));
    });

    test('las notas se guardan y cambiar el rol no las borra', async ({ page }) => {
        await signInAsAdmin(page, ADMIN, '/admin/users');
        await userRow(page, OWNER.email).click();
        const dialog = page.getByTestId('admin-edit-dialog');
        await dialog.getByLabel('Admin notes').fill('Paga por transferencia');
        await dialog.getByRole('button', { name: 'Save' }).click();
        await expect(dialog).toBeHidden();

        // Segundo guardado, que no toca las notas: antes las dejaba vacias.
        await userRow(page, OWNER.email).click();
        await expect(dialog.getByLabel('Admin notes')).toHaveValue('Paga por transferencia');
        await dialog.getByLabel('Role').click();
        await page.getByRole('option', { name: 'Founder' }).click();
        await dialog.getByRole('button', { name: 'Save' }).click();
        await expect(dialog).toBeHidden();
        await expect(userRow(page, OWNER.email)).toContainText('Founder');

        // Y lo que quedo guardado en el servidor, no solo en la pantalla.
        await page.reload();
        // Los dos guardados quedaron en el registro de auditoria. Ese numero solo
        // llega con las estadisticas, que ahora viajan junto con la lista.
        await expect(page.getByTestId('stat-activity')).not.toHaveText('0');
        await userRow(page, OWNER.email).click();
        await expect(dialog.getByLabel('Admin notes')).toHaveValue('Paga por transferencia');
        await expect(dialog.getByLabel('Role')).toHaveValue('Founder');
    });

    test('un admin no puede quitarse su propio acceso', async ({ page, browser }) => {
        await signInAsAdmin(page, ADMIN, '/admin/users');
        await userRow(page, ADMIN.email).click();
        const dialog = page.getByTestId('admin-edit-dialog');
        await expect(dialog.getByText('This is your own account')).toBeVisible();
        await expect(dialog.getByLabel('Role')).toBeDisabled();

        // Sin la pantalla de por medio, la API responde lo mismo. Se prueba con un
        // admin que NO es principal: al principal ya lo protege otra regla mas
        // vieja, y con el no se veria si esta deja de funcionar (se probo).
        const second = await openSession(browser, SECOND_ADMIN, signInAsAdmin);
        const uid = await currentUid(second);
        for (const updates of [{ role: 'user' }, { isDisabled: true }, { accountLocked: true }]) {
            expect((await callFunction(second, 'adminUpdateUserHttp', { targetUserId: uid, updates })).status).toBe(403);
        }
        // Lo que no le quita acceso si lo puede cambiar.
        expect((await callFunction(second, 'adminUpdateUserHttp', { targetUserId: uid, updates: { notes: 'yo' } })).status).toBe(200);
        await second.context().close();
    });

    test('solo un admin principal nombra o destituye admins', async ({ page, browser }) => {
        // Un admin que NO esta en ADMIN_EMAILS: por la app solo lo crea un admin
        // principal, asi que se siembra el rol directo en el emulador.
        const second = await openSession(browser, SECOND_ADMIN, signInAsAdmin);

        const member = await openSession(browser, MEMBER);
        const memberUid = await currentUid(member);

        const grant = { targetUserId: memberUid, updates: { role: 'admin' } };
        expect((await callFunction(second, 'adminUpdateUserHttp', grant)).status).toBe(403);
        // Lo demas si lo puede hacer: es admin.
        expect((await callFunction(second, 'adminUpdateUserHttp', { targetUserId: memberUid, updates: { role: 'premium' } })).status).toBe(200);

        await signInAsAdmin(page, ADMIN);
        expect((await callFunction(page, 'adminUpdateUserHttp', grant)).status).toBe(200);
        // Y el secundario tampoco puede sacarle el rol a quien ya lo tiene.
        expect((await callFunction(second, 'adminUpdateUserHttp', { targetUserId: memberUid, updates: { role: 'user' } })).status).toBe(403);

        await second.context().close();
        await member.context().close();
    });

    test('la API rechaza lo que no entiende en vez de ignorarlo', async ({ page }) => {
        await signInAsAdmin(page, ADMIN);
        const uid = await currentUid(page);
        const update = (updates) => callFunction(page, 'adminUpdateUserHttp', { targetUserId: uid, updates });

        expect((await update({ role: 'superadmin' })).status).toBe(400);
        expect((await update({ notes: { $gt: '' } })).status).toBe(400);
        expect((await update({ notes: 'x'.repeat(2001) })).status).toBe(400);
        expect((await update({ isDisabled: 'yes' })).status).toBe(400);
        expect((await callFunction(page, 'adminUpdateUserHttp', { targetUserId: 'no/such', updates: { notes: 'x' } })).status).toBe(400);
    });
});
