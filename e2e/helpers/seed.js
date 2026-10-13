import { ADMIN_EMAIL } from '../../playwright.config.js';

// Entradas que siembran el vault en auth.setup.js y que los tests esperan ver.
//
// Hay DOS con "C++" a proposito. Buscar ese termino rompia la lista porque iba
// sin escapar a un RegExp, pero el scoring solo corre cuando hay dos o mas
// resultados que ordenar: con una sola entrada que matchee, el codigo roto no se
// ejecuta y el test pasa igual. Se comprobo reintroduciendo el bug.
export const ENTRIES = [
    { title: 'C++ Course', username: 'student@example.com' },
    { title: 'C++ Reference', username: 'docs@example.com' },
    { title: 'Gmail personal', username: 'e2e@example.com' },
];

// El dueno del vault sembrado. Su sesion es la que queda guardada para los tests.
export const OWNER = { email: 'e2e@example.com', name: 'E2E Tester' };
// Admin principal: su mail es el ADMIN_EMAILS que playwright.config.js le fija a
// las functions, y el emulador lo entrega verificado.
export const ADMIN = { email: ADMIN_EMAIL, name: 'Admin E2E' };
