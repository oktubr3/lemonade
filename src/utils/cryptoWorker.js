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

// Current (v3): enc key and verifier are domain-separated via HKDF so neither can be
// derived from the other even if an attacker reads the stored verifier.
export async function deriveAesKey(password, salt, iterations = 600000) {
    const root = await deriveBits(password, salt, iterations);
    const encBits = await hkdfExpand(root, "lemonade-enc-v1");
    return crypto.subtle.importKey(
        "raw", encBits, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
}

export async function derivePasswordVerifier(password, salt, iterations = 600000) {
    const root = await deriveBits(password, salt, iterations);
    const verBits = await hkdfExpand(root, "lemonade-ver-v1");
    return Array.from(new Uint8Array(verBits), b => b.toString(16).padStart(2, "0")).join("");
}

// Legacy (v1/v2): raw PBKDF2 bits used directly — kept only for transparent migration.
export async function deriveAesKeyRaw(password, salt, iterations) {
    const bits = await deriveBits(password, salt, iterations);
    return crypto.subtle.importKey(
        "raw", bits, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
    );
}

export async function derivePasswordVerifierRaw(password, salt, iterations) {
    const bits = await deriveBits(password, salt, iterations);
    return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2, "0")).join("");
}
