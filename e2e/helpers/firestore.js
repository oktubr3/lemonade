import { PORTS, PROJECT_ID } from '../../playwright.config.js';

const DOCS = `http://127.0.0.1:${PORTS.firestore}/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

// Valor JS -> valor tipado de la API REST de Firestore.
function encode(value) {
    if (value === null) return { nullValue: null };
    if (typeof value === 'boolean') return { booleanValue: value };
    if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
    if (typeof value === 'string') return { stringValue: value };
    if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
    return { mapValue: { fields: encodeFields(value) } };
}
const encodeFields = (data) => Object.fromEntries(Object.entries(data).map(([key, value]) => [key, encode(value)]));

// Fusiona campos en un documento, directo en el emulador y con el token de owner
// (saltea las reglas). Para lo que ninguna pantalla puede crear: por ejemplo un
// segundo admin, que en la app solo lo nombra un admin principal.
export async function mergeDocument(path, data) {
    if (!PROJECT_ID.startsWith('demo-')) throw new Error('mergeDocument solo corre contra un proyecto demo-*');
    const mask = Object.keys(data).map((field) => `updateMask.fieldPaths=${encodeURIComponent(field)}`).join('&');
    const res = await fetch(`${DOCS}/${path}?${mask}`, {
        method: 'PATCH',
        headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
        body: JSON.stringify({ fields: encodeFields(data) }),
    });
    if (!res.ok) throw new Error(`No se pudo escribir ${path}: HTTP ${res.status} ${await res.text()}`);
}
