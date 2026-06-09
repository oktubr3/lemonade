// PBKDF2 SHA-256 en Web Worker para no bloquear el main thread
// durante unlock/setup/change del Env Vault. El worker deriva 256 bits crudos
// que despues el main thread importa como CryptoKey AES-GCM (operacion rapida).

self.onmessage = async (e) => {
    const { id, password, salt, iterations = 600000 } = e.data || {};
    try {
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            "raw",
            encoder.encode(password),
            "PBKDF2",
            false,
            ["deriveBits"]
        );
        const bits = await crypto.subtle.deriveBits(
            {
                name: "PBKDF2",
                salt: encoder.encode(salt),
                iterations,
                hash: "SHA-256",
            },
            keyMaterial,
            256
        );
        self.postMessage({ id, ok: true, bits }, [bits]);
    } catch (err) {
        self.postMessage({ id, ok: false, error: err?.message || String(err) });
    }
};
