import { test, expect } from './fixtures.js';
import { signInAsEmulatedUser } from './helpers/emulators.js';
import { ADMIN } from './helpers/seed.js';
import { callFunction, signIn, signInAsAdmin } from './helpers/session.js';

// Cada test entra con sus propios usuarios.
test.use({ storageState: { cookies: [], origins: [] } });

// Un cliente distinto por test: crear tickets tiene un limite de 5 por minuto
// por usuario (los pedidos rechazados tambien cuentan), y con uno compartido los
// tests se lo gastaban entre si.
const customer = (name) => ({ email: `${name}-e2e@example.com`, name: `${name} E2E` });
const NEIGHBOUR = customer('neighbour');

async function openSession(browser, user, enter = signIn, hash = '/') {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await enter(page, user, hash);
    return page;
}

const createTicket = async (page, subject, message = 'Necesito ayuda con esto.') => {
    const { status, body } = await callFunction(page, 'createTicketHttp', { subject, message });
    expect(status).toBe(200);
    return body.ticket.id;
};

test.describe('tickets de soporte', () => {
    test('el ticket le llega al admin y la respuesta al usuario, sin recargar', async ({ page, browser }) => {
        // El admin ya tiene el panel abierto en la pestana de tickets.
        const admin = await openSession(browser, ADMIN, signInAsAdmin, '/admin/users');
        await admin.getByRole('tab', { name: 'Tickets' }).click();

        // El usuario abre un ticket desde Configuracion.
        const author = customer('author');
        await signIn(page, author, '/settings');
        await page.getByRole('button', { name: 'New Ticket' }).click();
        const form = page.getByRole('dialog').filter({ has: page.getByLabel('Subject') });
        await form.getByLabel('Subject').fill('No puedo exportar mi vault');
        await form.getByLabel('Message').fill('Toco exportar y no pasa nada.');
        await form.getByRole('button', { name: 'Send' }).click();
        await expect(form).toBeHidden();

        // Al admin le aparece solo, marcado como pendiente de respuesta.
        const row = admin.getByTestId('admin-ticket-row').filter({ hasText: 'No puedo exportar mi vault' });
        await expect(row).toBeVisible();
        await expect(row).toContainText('Awaiting reply');
        await expect(row).toContainText(author.email);

        // El usuario deja la conversacion abierta.
        await page.getByText('No puedo exportar mi vault').first().click();
        const conversation = page.getByRole('dialog').filter({ hasText: 'No puedo exportar mi vault' });
        await expect(conversation.getByText('Toco exportar y no pasa nada.')).toBeVisible();

        // El admin contesta...
        await row.click();
        const chat = admin.getByTestId('admin-ticket-chat');
        await chat.getByPlaceholder('Write a message...').fill('Proba de nuevo desde Configuracion > Datos.');
        await chat.getByRole('button', { name: 'Send' }).click();
        await expect(chat.getByText('Proba de nuevo desde Configuracion > Datos.')).toBeVisible();

        // ...y al usuario le llega en la conversacion que tenia abierta.
        await expect(conversation.getByText('Proba de nuevo desde Configuracion > Datos.')).toBeVisible();

        // Contestado: deja de figurar como pendiente.
        await chat.getByRole('button', { name: 'Close', exact: true }).click();
        await expect(row).not.toContainText('Awaiting reply');

        await admin.context().close();
    });

    test('el admin cierra un ticket y lo puede reabrir', async ({ page, browser }) => {
        const owner = await openSession(browser, customer('reopener'));
        const ticketId = await createTicket(owner, 'Ticket para cerrar y reabrir');

        await signInAsAdmin(page, ADMIN, '/admin/users');
        await page.getByRole('tab', { name: 'Tickets' }).click();
        await page.getByTestId('admin-ticket-row').filter({ hasText: 'Ticket para cerrar y reabrir' }).click();
        const chat = page.getByTestId('admin-ticket-chat');

        await chat.getByRole('button', { name: 'Close ticket' }).click();
        await expect(chat.getByText('This ticket has been closed')).toBeVisible();
        // Cerrado, ya no se le puede escribir: ni el dueno.
        expect((await callFunction(owner, 'addTicketMessageHttp', { ticketId, content: 'Hola?' })).status).toBe(400);

        await chat.getByRole('button', { name: 'Reopen' }).click();
        await expect(chat.getByPlaceholder('Write a message...')).toBeVisible();
        expect((await callFunction(owner, 'addTicketMessageHttp', { ticketId, content: 'Sigue pasando.' })).status).toBe(200);
        await expect(chat.getByText('Sigue pasando.')).toBeVisible();

        await owner.context().close();
    });

    test('nadie escribe ni cierra el ticket de otro, y la API valida lo que recibe', async ({ page, browser }) => {
        await signIn(page, customer('private'));
        const ticketId = await createTicket(page, 'Ticket privado');

        const neighbour = await openSession(browser, NEIGHBOUR);
        expect((await callFunction(neighbour, 'addTicketMessageHttp', { ticketId, content: 'Me meto.' })).status).toBe(403);
        expect((await callFunction(neighbour, 'closeTicketHttp', { ticketId })).status).toBe(403);
        expect((await callFunction(neighbour, 'reopenTicketHttp', { ticketId })).status).toBe(403);
        expect((await callFunction(neighbour, 'adminGetTicketsHttp')).status).toBe(403);

        // Un asunto que no es texto pasaba todos los controles y se guardaba tal cual.
        expect((await callFunction(page, 'createTicketHttp', { subject: { $ne: '' }, message: 'x' })).status).toBe(400);
        expect((await callFunction(page, 'createTicketHttp', { subject: ['a'], message: 'x' })).status).toBe(400);
        expect((await callFunction(page, 'createTicketHttp', { subject: '   ', message: 'x' })).status).toBe(400);
        expect((await callFunction(page, 'addTicketMessageHttp', { ticketId, content: 'x'.repeat(2001) })).status).toBe(400);
        expect((await callFunction(page, 'addTicketMessageHttp', { ticketId, content: { text: 'x' } })).status).toBe(400);
        expect((await callFunction(page, 'addTicketMessageHttp', { ticketId: 'no/such', content: 'x' })).status).toBe(400);

        await neighbour.context().close();
    });

    test('al cambiar de cuenta en la misma pestana no quedan los tickets del anterior', async ({ page }) => {
        await signIn(page, customer('first'), '/settings');
        await createTicket(page, 'Ticket del primer usuario');
        await expect(page.getByText('Ticket del primer usuario')).toBeVisible();

        // Otra persona inicia sesion sin que la pagina se recargue.
        await signInAsEmulatedUser(page, customer('second'));

        // El estado vacio confirma que su lista YA cargo; recien ahi vale afirmar
        // que lo del anterior no esta.
        await expect(page.getByText('No tickets yet')).toBeVisible();
        await expect(page.getByText('Ticket del primer usuario')).toHaveCount(0);
    });
});
