# DIRECTIVAS

## Documentación

Para cada cosa que hagas en mi sistema, vas a tener esta documentación siempre leida, estudiada a la perfección y actualizada: https://quasar.dev/docs/

## VUE.js

Vas a ser experto en Vue.js y vas a conocer perfectamente la documentación: https://vuejs.org/

## Github

Siempre, antes de crear algo, vas a revisar en que rama de github estamos parados. Si estamos en main, vas a crear una rama Feat o Fix según lo que te estoy pidiendo que hagas en el promt.

## Package Manager

- En la raíz del proyecto usar **pnpm** (`pnpm-lock.yaml` es la fuente de verdad).
- Para instalar/verificar/build/lint en la app usar `pnpm install`, `pnpm run lint`, `pnpm run build:manual`, `pnpm audit`.
- No usar `npm install` ni `npm audit fix` en la raíz porque puede desalinear dependencias respecto de `pnpm-lock.yaml`.
- En `functions/` se usa **npm** porque tiene `functions/package-lock.json` propio.

## Deploys Firebase Functions

- Cuando haya que deployar Functions, **no redeployar todas las funciones por defecto**.
- Deployar solo las funciones nuevas o modificadas con `firebase deploy --only functions:nombreFuncion`.
- Si hay varias funciones modificadas, listarlas explicitamente: `firebase deploy --only functions:fn1,functions:fn2`.
- Evitar `firebase deploy` completo salvo que el usuario lo pida explicitamente o sea necesario por cambios coordinados de hosting/rules/functions.

## Sistema PWA Update Notification (CRÍTICO - NO ROMPER)

Este sistema es crítico para la seguridad. Lemonade es un password manager: si hay un bug de seguridad, los usuarios DEBEN recibir la actualización. Sin este sistema, los usuarios se quedan con versiones viejas indefinidamente.

### Cómo funciona:
1. El Service Worker (SW) nuevo se descarga en background
2. El SW queda en estado "waiting" (NO se activa solo)
3. `register-service-worker` detecta el nuevo SW y dispara `updated(reg)`
4. Se muestra un Dialog de Quasar pidiendo confirmación al usuario
5. Si acepta: se envía `SKIP_WAITING` al SW, el SW se activa y recarga la página
6. Si pospone: se guarda snooze de 30 min en localStorage

### Archivos principales:
> Rutas cambiadas por `@quasar/app-vite` 3 (antes `register-service-worker.js` y
> `custom-service-worker.js` en la raiz de `src-pwa/`). El framework solo busca los
> nombres nuevos; renombrarlos de vuelta desactiva el sistema de updates en silencio.
> `src-pwa/` ademas es ahora su propio paquete: sus deps (`register-service-worker`,
> `workbox-*`) viven en `src-pwa/package.json`, no en el `package.json` raiz.

- `src-pwa/register-sw.js` - Registro SW con package `register-service-worker`, diálogos de actualización con snooze, dark mode support
- `src-pwa/sw/custom-sw.js` - Service Worker con estrategias de cache (workbox)

### REGLAS INQUEBRANTABLES:
- **NUNCA poner `self.skipWaiting()` al inicio de `src-pwa/sw/custom-sw.js`** - Esto hace que el SW se active solo sin mostrar el diálogo. El `skipWaiting` solo se ejecuta cuando el usuario confirma (via `postMessage({ type: 'SKIP_WAITING' })`)
- **NUNCA agregar `controllerchange → reload`** sin diálogo de por medio - Esto recarga la app sin preguntar al usuario
- **El package `register-service-worker` es obligatorio** - El registro manual con `navigator.serviceWorker.register()` no funciona correctamente con el boot system de Quasar
- **El callback `updated(reg)` es el punto de entrada** - Ahí se muestra el diálogo, no en `updatefound` ni en `statechange`

### Configuración crítica en quasar.config.js:
- `useFilenameHashes: true` - Cache busting con hashes únicos
- `workboxMode: "InjectManifest"` - Control personalizado del SW
- Framework plugins: ["Notify", "Dialog", "Dark", "Loading"]

### Referencia funcional:
Si algo se rompe, usar `/Users/mauroh/Apps/kiddie-cards/src-pwa/` como referencia. Tiene el mismo pattern y funciona correctamente.

### Testing:
Para probar cambios en el sistema de updates: hacer 2 deploys consecutivos. El primero instala el nuevo SW, el segundo genera la actualización que dispara el diálogo.

## Variables de entorno y constantes del build (INCIDENTE 2026-08-27 — LEER ANTES DE TOCAR)

Un deploy dejó la app **completamente caída** (`auth/invalid-api-key`, no bootea) por esto.
Tres reglas, las tres aprendidas rompiendo producción.

### 1. El prefijo de cliente es `VITE_` y está declarado a mano

`@quasar/app-vite` 3 cambió el prefijo por defecto de `VITE_` a `QCLI_`. Este proyecto usa
`import.meta.env.VITE_FIREBASE_*` en `src/boot/firebase.js` y tiene 7 variables así en
`.env.local`. Sin la declaración explícita, **ninguna llega al bundle** y Firebase arranca
sin `apiKey`:

```js
// quasar.config.js > build
env: {
    clientPrefix: ["VITE_", "QCLI_"],
},
```

**No borres ese bloque.** Si algún día migrás las variables a `QCLI_`, hay que renombrarlas
en `.env.local`, en `.env.example` y en `src/boot/firebase.js` en el mismo commit.

### 2. `build.env` NO es un mapa de variables

En app-vite 3 es `{ clientPrefix, backendPrefix }`. Poner `env: { MI_VAR: "x" }` **pisa esa
estructura** y anula el prefijo → misma caída que arriba.

Para constantes propias va un `define` de Vite en `extendViteConf`:

```js
extendViteConf(viteConf) {
    viteConf.define = viteConf.define || {};
    viteConf.define.__APP_VERSION__ = JSON.stringify(pkg.version);
}
```

(`build.rawDefine` se probó y **no** sustituyó el identificador en el bundle.)

### 3. Las constantes del framework se renombraron en app-vite 3

| Antes (app-vite 2) | Ahora (app-vite 3) |
|---|---|
| `process.env.SERVICE_WORKER_FILE` | `import.meta.env.QUASAR_SERVICE_WORKER_FILE` |
| `process.env.PWA_FALLBACK_HTML` | `import.meta.env.QUASAR_PWA_FALLBACK_HTML` |
| `process.env.MODE` / `PROD` | `import.meta.env.MODE` / `PROD` |
| `process.env.VUE_ROUTER_MODE` / `_BASE` / `SERVER` | ya no se inyectan (el router los explicita) |

Con el nombre viejo el valor es `undefined` **sin error de build**. El síntoma del service
worker es característico: el navegador intenta registrar `/undefined`, recibe el `index.html`
y aborta con `unsupported MIME type ('text/html')` → **la app se queda sin sistema de
actualizaciones**, que en un gestor de contraseñas es el canal de los parches de seguridad.

Para ver qué inyecta la versión instalada:

```bash
grep -rhoE "define\['import\.meta\.env\.[A-Z_]+'\]" node_modules/@quasar/app-vite/lib/ | sort -u
```

## Verificar un deploy: el Service Worker te miente (CRÍTICO)

**El bug de arriba estuvo horas en producción porque la verificación post-deploy dio verde.**
La app cargaba, mostraba las 188 contraseñas y el banner con la versión correcta — pero el
navegador estaba ejecutando el **bundle anterior servido desde el cache del SW**.

Comparar el HTML del servidor contra el build local **NO alcanza**: prueba que el archivo
subió, no que el navegador lo ejecute.

Checklist obligatoria después de cada deploy de `hosting:app`:

1. **Comparar el hash del bundle que el navegador REALMENTE ejecuta** contra el compilado:

   ```js
   // en la consola de la app
   performance.getEntriesByType('resource').map(r => r.name).filter(n => /assets\/index-/.test(n))
   ```

   ```bash
   grep -oE '/assets/index-[A-Za-z0-9_-]+\.js' dist/pwa/index.html
   ```

   Si no coinciden, **estás mirando código viejo** y cualquier verificación es inválida.

2. **Forzar bypass del SW**: recarga dura (`Ctrl+Shift+R` / `Cmd+Shift+R`) o ventana de
   incógnito. Un solo hard reload habría mostrado el error el mismo día.
3. **Consola sin errores**, buscando en particular `boot error`, `FirebaseError`,
   `Error registrando SW` y la palabra `undefined`.
4. **El SW quedó registrado**: `(await navigator.serviceWorker.getRegistrations())` debe
   devolver `.../sw.js` en estado activo — no vacío, no `/undefined`.

5. **Sacar una captura de pantalla.** Consola limpia y assets correctos **no** prueban que la
   app se vea bien: el incidente de iconos convivió con cero errores en consola. Para
   cualquier cosa visual, la captura es la única verificación válida — chequeos por ancho de
   elemento o por `document.fonts.check()` dieron falsos negativos Y falsos positivos.

> Un `undefined` en el banner de la consola (`vundefined`) es la señal más barata de que el
> sistema de env se rompió. Si lo ves, no sigas: revisá el punto 1 de esta sección.

## Iconos que se ven como texto (INCIDENTE 2026-08-27)

Síntoma: en vez de los iconos aparece su nombre literal — `admin_panel_settings`, `vpn_key`,
`login`, `star` — superpuesto con las etiquetas. Pasó en toda la app tras subir a Quasar 2.27.

### Causa: el `*` global le pisa la fuente al `<span>` interno del icono

Desde **Quasar 2.27** QIcon envuelve la ligatura en un `<span>`:

```html
<i class="q-icon notranslate material-icons"><span>translate</span></i>
```

La regla `.material-icons` (que trae la familia y `font-feature-settings: 'liga'`) aplica al
`<i>`. Pero el `<span>` interno cae bajo el selector universal de `src/css/app.scss`:

```scss
* { font-family: 'Inter', ...; }   // pisa al <span> del icono
```

El texto se pinta con Inter → se ve la ligatura como texto. Fix vigente:

```scss
.q-icon > * { font-family: inherit; }
```

> **La causa de fondo es el `* { font-family }`**, que rompe la herencia en todo el árbol.
> Lo correcto es moverlo a `body` y dejar que herede, pero eso toca toda la tipografía de la
> app y merece su propia rama. Si tocás tipografía global, arrancá por ahí.

### Cómo NO diagnosticarlo (dos falsos negativos que costaron tiempo)

1. **`getBoundingClientRect().width` no sirve**: el `<i>` mide 24px aunque el texto desborde.
   Dio "24" con los iconos visiblemente rotos.
2. **`document.fonts.check()` tampoco**: puede dar `false` con la fuente perfecta, y `true`
   con los iconos igual de rotos — la fuente estaba cargada pero no aplicada al `<span>`.

**Para un bug visual, sacá una captura.** Fue lo único que dio la respuesta las dos veces.
Diagnóstico útil una vez que sospechás de la fuente:

```js
const i = document.querySelector('i.q-icon');
i.outerHTML;                                   // ¿la ligatura está en un <span>?
getComputedStyle(i.firstElementChild).fontFamily;  // ¿el HIJO tiene la familia correcta?
performance.getEntriesByType('resource').filter(r => /woff/.test(r.name));  // ¿pidió la fuente?
```

### `@font-face` sin `src` no parchea nada

`src/css/app.scss` tenía bloques así para ajustar `font-display` de una hoja ajena:

```scss
@font-face { font-family: 'Material Icons'; font-display: block; }  // NO HACER
```

Un `@font-face` sin `src` **no modifica** la declaración original: es una declaración
separada e inválida que, según el orden de los chunks CSS, puede pisar a la buena y dejar la
familia sin archivo. Con Vite 7 ganaba la real; con Rolldown (Vite 8) el orden se invirtió.
Se eliminaron. Si hace falta tocar `font-display`, hacelo en la declaración completa.

### `@quasar/extras` está pineado en v1 a propósito

v2 reorganizó las fuentes a `exports/` y app-vite 3 no las resuelve: el `@font-face` sale sin
`src`. **No subas a v2** sin verificar con una captura que los iconos siguen renderizando.

## Polar (cobros): versionado de API y firma de webhooks — NO TOCAR A CIEGAS

El cobro pasa por Polar: `createCheckoutUrl`, `getCustomerPortalUrl` y `handlePolarWebhook`.
Dos mecanismos distintos, los dos silenciosos si se rompen: nadie ve un error, simplemente
alguien paga y no recibe su rol.

### 1. Versión de la API: pineada a mano

Polar versiona por fecha (`YYYY-MM`) y **una request sin header sigue a "Current", que cambia
cada trimestre**. El SDK instalado (`@polar-sh/sdk@0.49.0`) fue generado contra `2026-04`
(`SDK_METADATA.openapiDocVersion`) pero **no manda el header**. Por eso `getPolarConfig`
inyecta un `HTTPClient` con un hook `beforeRequest`:

```js
polarHttpClient.addHook('beforeRequest', (request) => {
    request.headers.set('Polar-Version', POLAR_API_VERSION);  // '2026-04'
    return request;
});
```

**No saques ese hook.** Sin él, el contrato cambia solo en cada release trimestral de Polar,
sin un cambio de código de tu lado y sin fallar el build — la misma familia de bug que la
caída por el prefijo de variables de entorno.

Los **webhooks se versionan aparte**, por endpoint, en el dashboard de Polar. Los dos endpoints
actuales están en `2026-04` (verificado 2026-09-11). El header de arriba **no** los cubre.

> **Fecha límite: release de enero de 2027.** Ahí Polar elimina `2026-04`. Hay que migrar a
> `2026-10` antes: probar, y recién entonces cambiar `POLAR_API_VERSION` y la versión del
> endpoint de webhooks.

### 2. Firma de webhooks: NO regeneres el secreto sin tocar el código

Polar cambió el esquema de firma el **8 de septiembre de 2026**:

| Secreto emitido | Clave HMAC |
|---|---|
| Antes del 2026-09-08 (*legacy*) | base64 del string `whsec_...` completo |
| Desde el 2026-09-08 (*Standard Webhooks*) | el cuerpo del secreto decodificado |

`validateEvent` del SDK 0.49.0 **solo prueba la legacy** (únicamente la línea `1.0.0-alpha.19+`
prueba las dos). Por eso `handlePolarWebhook` usa el wrapper `validatePolarEvent`, que ante un
`WebhookVerificationError` reintenta con la clave Standard Webhooks pasada como `Buffer`.

Por qué `Buffer` y no una verificación propia: `validateEvent` **también parsea** el payload
(`current_period_end` → `currentPeriodEnd`, fechas a `Date`). Todo el handler lee camelCase, así
que verificar la firma a mano y saltear el parseo rompe cada rama del `switch` en silencio.

**La trampa operativa:** resetear el secreto en el dashboard, o borrar y recrear el endpoint,
te devuelve un secreto del esquema nuevo. Con el wrapper esto ya está cubierto; sin él, todas
las entregas responden **403**. Si algún día sacás el wrapper (por ejemplo al subir a la
1.0.0 del SDK), verificá antes con un evento de prueba.

Para probar sin tocar producción: firmá un payload con `standardwebhooks` usando cada una de
las dos derivaciones de clave y pasáselas al wrapper. Un secreto **distinto** tiene que seguir
dando `FIRMA RECHAZADA` — eso es lo que prueba que el fallback no afloja la verificación.

## Identidad: NUNCA por `users/{uid}.email` (AUDITORÍA 2026-09-22)

`users.email` lo escribía el propio cliente y el servidor lo usaba como identidad
para elegir el trustee de acceso de emergencia, el destinatario de un compartido,
el rol de admin y el fallback del webhook de Polar. Cualquier usuario podía
ponerse el email de otro y recibir, por ejemplo, **el vault completo descifrado**
de quien lo agregara como contacto de emergencia.

Reglas vigentes:

- Para resolver una persona por email: `resolveVerifiedUidByEmail(email)` (Firebase
  Auth + `emailVerified`). Nunca `db.collection('users').where('email', '==', x)`.
- Para "¿este uid es tal email?": `getVerifiedAuthEmail(uid)` (registro de Auth).
- Compuertas de admin por email: `isVerifiedAdminToken(decodedToken)` (exige
  `email_verified`). Nunca `isAdminEmail(decodedToken.email)` a secas.
- Trustee de emergencia: `isEmergencyTrustee(data, decodedToken)` (email
  verificado igual a `trusteeEmail` **y** uid vinculado).
- `email` no está en `userPublicKeys()` de `firestore.rules` y no hay `update` de
  admin directo sobre `users/*`: toda escritura de admin va por `adminUpdateUserHttp`.
- Transiciones de `emergency_access`: siempre por `transitionEmergencyAccess`
  (transacción). Un `get()` + `update()` suelto permite que una transición pise
  un revoke.
- Un evento de billing nunca pisa `admin`, `founder` ni `suspended` (`billingRole`).

El reporte completo (hallazgos, verificaciones y pistas pendientes de validar)
está en `~/security-audit-skill/lemonade-pass-manager/run-1/` (fuera del repo).

## Sistema de Versionado Automático

### Scripts disponibles:
- `npm run build` - Build con incremento automático de versión patch
- `npm run build:manual` - Build sin incrementar versión
- `npm run version:auto` - Incrementa patch manualmente
- `npm run version:minor` - Incrementa minor manualmente  
- `npm run version:major` - Incrementa major manualmente

### Archivo version.sh:
Script bash que maneja el incremento de versiones con feedback visual

## Extensiones de Browser

El proyecto incluye extensiones para Chrome y Firefox que permiten autofill de credenciales.

### Estructura:
- `lemonade-chrome-extension/` - Extensión para Chrome (MV3 con Service Worker)
- `lemonade-firefox-extension/` - Extensión para Firefox (MV3 con Background Scripts)

### Diferencias Clave Chrome vs Firefox:

| Aspecto | Chrome | Firefox |
|---------|--------|---------|
| API | `chrome.*` | `browser.*` (Promises nativas) |
| Background | Service Worker | Background Scripts |
| OAuth Redirect | `chromiumapp.org` | `extensions.allizom.org` |
| Manifest | Campo `key` | `browser_specific_settings.gecko` |

### Configuración OAuth para Firefox:

1. Cargar extensión en `about:debugging#/runtime/this-firefox`
2. En consola ejecutar: `browser.identity.getRedirectURL()`
3. En Google Cloud Console → Credentials → OAuth Client:
   - **Authorized JavaScript origins**: `https://[ID].extensions.allizom.org`
   - **Authorized redirect URIs**: Agregar AMBAS versiones (con y sin trailing slash):
     - `https://[ID].extensions.allizom.org`
     - `https://[ID].extensions.allizom.org/`
4. Esperar 1-2 minutos para propagación

### Packaging (ZIP para stores) — CRÍTICO

**SIEMPRE** generar el ZIP desde dentro del directorio de la extensión, no desde la raíz del proyecto. El `manifest.json` debe quedar en la raíz del ZIP, no dentro de una carpeta.

```bash
# CORRECTO
cd lemonade-chrome-extension && zip -r ../lemonade-chrome-extension-vX.Y.Z.zip .
cd lemonade-firefox-extension && zip -r ../lemonade-firefox-extension-vX.Y.Z.zip .

# INCORRECTO — genera lemonade-chrome-extension/manifest.json dentro del ZIP
zip -r lemonade-chrome-extension-vX.Y.Z.zip lemonade-chrome-extension/
```

### Porting Chrome → Firefox:
1. `chrome.*` → `browser.*`
2. Message listeners: usar Promise returns en vez de `sendResponse` callback
3. Manifest: quitar `key` y `offscreen`, agregar `browser_specific_settings.gecko`
4. Background: cambiar `service_worker` a `scripts` array
