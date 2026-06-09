// Registro unico de listener visibilitychange del documento. Los stores
// registran callbacks mediante onAppResume() y solo se agrega UN listener al
// DOM para toda la app, en vez de uno por store. Idempotente en HMR.

const callbacks = new Set();
let attached = false;

function handle() {
    if (typeof document === "undefined") return;
    if (document.visibilityState !== "visible") return;
    for (const cb of callbacks) {
        try {
            cb();
        } catch {
            // Nunca propagar errores de un callback a otros suscriptores
        }
    }
}

export function onAppResume(callback) {
    if (typeof callback !== "function") return () => {};
    callbacks.add(callback);
    if (!attached && typeof document !== "undefined") {
        document.addEventListener("visibilitychange", handle);
        attached = true;
    }
    return () => callbacks.delete(callback);
}
