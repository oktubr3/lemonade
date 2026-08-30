// Wrapper para crypto.worker.js. Mantiene una unica instancia del worker
// (lazy init al primer uso) y expone una API promise-based con dispatch por id
// para que multiples deriveKey en paralelo no se pisen.

let _worker = null;
let _nextId = 0;
const _pending = new Map();

function ensureWorker() {
    if (_worker) return _worker;
    _worker = new Worker(
        new URL("../workers/crypto.worker.js", import.meta.url),
        { type: "module" }
    );
    _worker.onmessage = (e) => {
        const { id, ok, bits, error } = e.data || {};
        const entry = _pending.get(id);
        if (!entry) return;
        _pending.delete(id);
        if (ok) entry.resolve(bits);
        else entry.reject(new Error(error || "crypto worker error"));
    };
    _worker.onerror = (err) => {
        for (const entry of _pending.values()) entry.reject(err);
        _pending.clear();
        // Drop the broken instance. Keeping it would make every later
        // postMessage go to a dead worker: postMessage does not throw, so the
        // promise would never settle and the unlock would hang forever.
        try { _worker?.terminate(); } catch { /* already gone */ }
        _worker = null;
    };
    return _worker;
}

// Deriva 256 bits via PBKDF2 (600k iter SHA-256) en el worker. Fallback a
// main thread si el entorno no soporta workers con type=module.
async function deriveBits(password, salt, iterations = 600000) {
    try {
        const worker = ensureWorker();
        const id = ++_nextId;
        return await new Promise((resolve, reject) => {
            _pending.set(id, { resolve, reject });
            worker.postMessage({ id, password, salt, iterations });
        });
    } catch {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            encoder.encode(password),
            "PBKDF2",
            false,
            ["deriveBits"]
        );
        return crypto.subtle.deriveBits(
            { name: "PBKDF2", salt: encoder.encode(salt), iterations, hash: "SHA-256" },
            keyMaterial,
            256
        );
    }
}

// HKDF expansion: splits raw PBKDF2 output into independent domain-separated keys.
async function hkdfExpand(rootBits, info) {
    const rootKey = await crypto.subtle.importKey("raw", rootBits, "HKDF", false, ["deriveBits"]);
    return crypto.subtle.deriveBits(
        { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: new TextEncoder().encode(info) },
        rootKey,
        256
    );
}

function toHex(bits) {
    return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, "0")).join("");
}

function importAesKey(bits) {
    return crypto.subtle.importKey(
        "raw", bits, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
}

// Current (v3): enc key and verifier are domain-separated via HKDF so neither can be
// derived from the other even if an attacker reads the stored verifier.
//
// PBKDF2 is by far the most expensive step (600k iterations). Every caller that
// needs BOTH the key and the verifier for the same password must use
// deriveVaultSecrets, which runs PBKDF2 once and expands the single root into
// both outputs. Calling deriveAesKey + derivePasswordVerifier separately doubles
// the cost for an identical result.
export async function deriveVaultSecrets(password, salt, iterations = 600000) {
    const root = await deriveBits(password, salt, iterations);
    const [encBits, verBits] = await Promise.all([
        hkdfExpand(root, "lemonade-enc-v1"),
        hkdfExpand(root, "lemonade-ver-v1"),
    ]);
    return { key: await importAesKey(encBits), verifier: toHex(verBits) };
}

export async function deriveAesKey(password, salt, iterations = 600000) {
    const root = await deriveBits(password, salt, iterations);
    return importAesKey(await hkdfExpand(root, "lemonade-enc-v1"));
}

export async function derivePasswordVerifier(password, salt, iterations = 600000) {
    const root = await deriveBits(password, salt, iterations);
    return toHex(await hkdfExpand(root, "lemonade-ver-v1"));
}

// Legacy (v1/v2): raw PBKDF2 bits used directly — kept only for transparent migration.
// Same single-root rule as above: use deriveVaultSecretsRaw when both are needed.
export async function deriveVaultSecretsRaw(password, salt, iterations) {
    const bits = await deriveBits(password, salt, iterations);
    return { key: await importAesKey(bits), verifier: toHex(bits) };
}

export async function deriveAesKeyRaw(password, salt, iterations) {
    return importAesKey(await deriveBits(password, salt, iterations));
}

export async function derivePasswordVerifierRaw(password, salt, iterations) {
    return toHex(await deriveBits(password, salt, iterations));
}
