import { test as base, expect } from '@playwright/test';

// Todo test falla si la pagina tira una excepcion o escribe un console.error.
// La lista vacia de octubre de 2026 convivio con una consola "limpia" solo
// porque un catch vacio se tragaba el error; ahora que se loguea, que un error
// en consola rompa el test es lo que lo vuelve visible.
const IGNORED = [
    /Failed to load resource.*favicon/i,
];

export const test = base.extend({
    page: async ({ page }, use) => {
        const errors = [];
        page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
        page.on('console', (message) => {
            if (message.type() !== 'error') return;
            const text = message.text();
            if (!IGNORED.some((pattern) => pattern.test(text))) errors.push(`console.error: ${text}`);
        });
        await use(page);
        expect(errors, 'la pagina no debe tirar errores').toEqual([]);
    },
});

export { expect };
