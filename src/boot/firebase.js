import { initializeApp } from "firebase/app";
// Import only the services you need, e.g. auth, firestore, etc.
import { getAuth, connectAuthEmulator, signInWithCredential, GoogleAuthProvider, setPersistence, browserLocalPersistence, browserSessionPersistence } from "firebase/auth";
import { initializeFirestore, connectFirestoreEmulator, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getFunctions } from "firebase/functions";

// Firebase configuration
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
    }),
});
export const functions = getFunctions(app, 'us-central1');

// Emuladores (tests e2e). Dos condiciones, las dos necesarias:
//   - `import.meta.env.DEV`: en un build de produccion es `false` y todo este
//     bloque desaparece del bundle, asi que un flag mal puesto no puede apuntar
//     la app de los usuarios a un emulador.
//   - `VITE_USE_EMULATORS=true`: explicito, para que `quasar dev` normal siga
//     hablando con el proyecto de siempre. No se decide por hostname.
// Los tests ademas usan un proyecto `demo-*`, que Firebase nunca conecta a la
// nube aunque algo de esto falle.
// String(): app-vite convierte "true" en el booleano `true` al inyectar el env,
// asi que comparar contra el string a secas da siempre false.
export const usingEmulators = import.meta.env.DEV && String(import.meta.env.VITE_USE_EMULATORS) === 'true';
if (usingEmulators) {
    // Los puertos vienen del env para que los e2e usen un bloque propio y no
    // choquen con los emuladores de otro proyecto; sin env, los de Firebase.
    const authPort = Number(import.meta.env.VITE_EMULATOR_AUTH_PORT) || 9099;
    const firestorePort = Number(import.meta.env.VITE_EMULATOR_FIRESTORE_PORT) || 8080;
    connectAuthEmulator(auth, `http://127.0.0.1:${authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, '127.0.0.1', firestorePort);

    // Login para los tests e2e, sin el popup de Google. El emulador de Auth
    // acepta como id_token un JSON sin firmar, asi que esto crea la sesion de un
    // usuario de Google de mentira. El popup no sirve para tests: entrega el
    // resultado a traves de un iframe que depende de un script bajado de
    // apis.google.com, y si ese script tarda el login queda colgado sin error
    // (medido: con 4 s de demora falla siempre; asi fallaba el setup en CI).
    // Vive dentro de este bloque, asi que no existe en un build de produccion.
    window.__e2eSignIn = ({ email, name }) =>
        signInWithCredential(auth, GoogleAuthProvider.credential(JSON.stringify({
            sub: email,
            email,
            email_verified: true,
            name,
        })));
    // Token del usuario actual, para que un test llame a una Cloud Function tal
    // como lo haria alguien con su sesion y sin pasar por la interfaz (por
    // ejemplo: comprobar que la API rechaza lo que la pantalla ya no ofrece).
    window.__e2eIdToken = () => auth.currentUser.getIdToken();
}

// Export persistence functions for use in the composable
export { setPersistence, browserLocalPersistence, browserSessionPersistence };
