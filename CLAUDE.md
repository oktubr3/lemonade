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

### 1. Versión de la API: **es el import path** (desde SDK 1.x)

Polar versiona por fecha (`YYYY-MM`) y **una request sin versión sigue a "Current", que cambia
cada trimestre**. Desde `@polar-sh/sdk@1.x` la versión ya no va en un header: el paquete publica
**un módulo por versión fechada** y elegís cuál importás.

```js
const { createPolar, webhooks } = require('@polar-sh/sdk/2026-10');
```

**Ese renglón es el pin.** Cambiarlo cambia el contrato entero. El `HTTPClient` con el hook
`beforeRequest` que había antes ya no existe (y no puede existir: la 1.x no exporta
`@polar-sh/sdk/lib/http`).

Los **webhooks se versionan aparte**, por endpoint, en el dashboard de Polar. El import de arriba
**no** los cubre.

> **OJO: la organización de Polar tiene DOS endpoints, y uno NO es de Lemonade** (verificado
> 2026-10-06 con `polar.webhooks.listWebhookEndpoints`):
>
> | id | destino | api_version |
> |---|---|---|
> | `1bdb07e7-9983-4945-afaf-40ae4248d8de` | `passmanager-d2b6d` — **Lemonade** | `2026-10` ✅ |
> | `29fed206-1dae-400f-98fc-5911d796f873` | `lime-expense-log` — **otro proyecto** | `2026-04` ⚠️ |
>
> Al tocar versiones, **apuntá al id, nunca "los dos"**: subir el de `lime-expense-log` le manda
> formato nuevo a un handler que no se migró.
>
> **Actualización 2026-10-13:** `lime-expense-log` quitó Polar y el plan premium el 2026-10-06 (hoy
> solo tiene `processVoiceExpense`, `processReceiptScan` y `healthCheck`). Ese endpoint apunta a una
> function que ya no existe: no hay migración pendiente ahí, y se puede borrar desde el dashboard de
> Polar. Mientras exista, la regla de arriba sigue valiendo: **apuntar al id**.
>
> **Verificado 2026-10-13 (tarde):** ese endpoint ya fue borrado. `listWebhookEndpoints` devuelve uno
> solo, el de Lemonade (`1bdb07e7…`, `2026-10`). La tabla de arriba queda como historia.

> **MIGRACIÓN COMPLETA el 2026-10-06**: código en `/2026-10`, desplegado, y el endpoint de Lemonade
> en `api_version: 2026-10`. Nada vence en enero de 2027 para este proyecto.
>
> El orden que se usó, y el que corresponde la próxima vez:
>
> 1. **Medir** que las formas de evento coincidan entre las dos versiones
> 2. Cambiar el import, `npm test` en `functions/`
> 3. **Desplegar** `handlePolarWebhook`, `createCheckoutUrl`, `getCustomerPortalUrl`
> 4. **Recién entonces** la versión del endpoint
>
> Al revés, Polar le manda el formato nuevo a un handler que espera el viejo. Acá dio igual porque
> los **11 tipos de evento** parsean idéntico en las dos (medido, y el test los cubre); en la
> próxima migración puede no dar igual, así que el paso 1 no se saltea.
>
> El endpoint se cambia por API, con firma posicional `(id, body)`:
>
> ```js
> await polar.webhooks.updateWebhookEndpoint(
>   '1bdb07e7-9983-4945-afaf-40ae4248d8de',   // passmanager-d2b6d, NO el de lime-expense-log
>   { api_version: '2026-10' }
> );
> ```

### 1-bis. Un major de una dependencia de `functions/` puede tumbar TODO el backend

`@polar-sh/sdk` 1.0 reorganizó el paquete y **quitó del `exports` los subpaths**
`/webhooks` y `/lib/http`, que `index.js` importaba. Mergear ese bump dejaba el módulo
tirando `ERR_PACKAGE_PATH_NOT_EXPORTED` en el `require` — **las 76 functions sin bootear**
en el próximo deploy.

El CI estaba ciego: el job solo corría `npm ci`, nunca un `require`. Por eso ahora
`functions/package.json` tiene un `test` que carga `index.js` de verdad, y el CI lo corre.
**No saques ese chequeo.**

### 1-ter. El SDK 1.x NO traduce camelCase ⟷ snake_case

La 0.49 era generada por Speakeasy y remapeaba los nombres en los dos sentidos, además de
convertir fechas a `Date`. La 1.x es a mano y **pasa el JSON tal cual**:

| | 0.49 | 1.x |
|---|---|---|
| Evento del webhook | `data.productId`, `data.currentPeriodEnd` (`Date`) | `data.product_id`, `data.current_period_end` (`string`) |
| Body de un request | `{ customerEmail, successUrl, customerId }` | `{ customer_email, success_url, customer_id }` |
| Respuesta | `session.customerPortalUrl` | `session.customer_portal_url` |

Esto no falla el build ni tira error: el handler lee `undefined`, el webhook devuelve 200 y
**alguien paga sin recibir su rol**. Si volvés a tocar la versión del SDK, verificá la forma
real con el test antes de confiar en el README.

### 2. Firma de webhooks: NO regeneres el secreto sin tocar el código

Polar cambió el esquema de firma el **8 de septiembre de 2026**:

| Secreto emitido | Clave HMAC |
|---|---|
| Antes del 2026-09-08 (*legacy*) | base64 del string `whsec_...` completo |
| Desde el 2026-09-08 (*Standard Webhooks*) | el cuerpo del secreto decodificado |

`validateEvent` del SDK 0.49.0 **solo probaba la legacy**, así que `handlePolarWebhook` usaba un
wrapper que reintentaba a mano con la otra derivación.

> **El secreto de este proyecto NO tiene el prefijo `whsec_`: empieza con `polar_whs_`**
> (verificado 2026-10-06 contra Secret Manager). Eso cambia el comportamiento del SDK y es la
> trampa principal de esta sección: casi toda la documentación habla de `whsec_`.

Con un secreto `polar_whs_`, el SDK 1.x deriva la clave como el **UTF-8 del string completo** y
prueba **una sola** derivación. Medido firmando con cada una y verificando con cada SDK
(`functions/test/polar-webhook.test.cjs`, corre en cada `npm test` y en CI):

| Firma generada con | 0.49 + wrapper | 1.x |
|---|---|---|
| `base64(cuerpo)` | RECHAZA | RECHAZA |
| `utf8(secreto completo)` | acepta | **acepta** |
| `base64(secreto completo)` | acepta (*) | RECHAZA |
| secreto **distinto** | RECHAZA | **RECHAZA** |

(*) Solo porque el wrapper le pasaba un **`Buffer`** a `validateEvent`. **La 1.x rechaza un Buffer
con `TypeError`**, así que ese reintento no se puede portar — y si se intenta, el `TypeError` no es
un `PolarWebhookVerificationError`, sale por el `throw` del handler y la entrega responde **500 en
vez de 403**. Se probó, el test lo atrapó, y por eso el wrapper no está.

La fila que importa sigue siendo la última: un secreto distinto se rechaza. Si alguna vez pasa,
el endpoint acepta eventos de cualquiera.

**Por qué la verificación nativa alcanza:** la clave la define el SDK **del propio Polar**, que es
quien emite el secreto y firma la entrega. Lo que la 0.49 aceptaba de más era un artefacto de los
Buffers, no un formato que Polar use.

**La trampa operativa:** resetear el secreto en el dashboard, o borrar y recrear el endpoint, te
devuelve un secreto nuevo. Si el prefijo cambia (`polar_whs_` → otra cosa), **volvé a correr
`npm test` en `functions/` con el formato nuevo antes de confiar**: la derivación depende del
prefijo, y equivocarse no se ve — la gente paga y no recibe su rol.

`validateEvent` es **async** desde la 1.x. Sin el `await`, un rechazo de firma sería una promesa
rechazada fuera del `try` y el endpoint seguiría procesando un evento sin verificar.

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

## Repo público: es un ESPEJO, no un remoto más

Hay dos repos y hacen cosas distintas:

| | |
|---|---|
| `oktubr3/lemonade-pass-manager` | **privado**, historia completa, acá se trabaja. Remote `origin`. |
| `oktubr3/lemonade` | **público** (AGPLv3), espejo. Remote `public`. |

El público se publica **un commit squasheado por release**, que reemplaza el árbol
entero. Es a propósito: la historia del privado no se expone nunca.

### Consecuencia: nada se mergea en el público

Cualquier merge ahí lo **pisa el próximo sync**. Son merges que se revierten solos.
Las dependencias se revisan, prueban y mergean acá; llegan allá con el sync.

### El sync NO debe llevar `.github/dependabot.yml` (INCIDENTE 2026-10-06)

El sync a 2.2.23 lo copió por error. En horas Dependabot abrió **6 PRs de version
update en el espejo**, incluido el bump de `@polar-sh/sdk` a 1.0.2 que acá ya
estaba descartado por tumbar las 76 functions. Siete PRs acumulados en el único
repo que los usuarios ven, mientras el mantenimiento real pasa en el privado.

Al armar un sync, **excluir ese archivo**:

```bash
git archive HEAD | tar -x -C <clon-del-publico>
rm -f <clon-del-publico>/.github/dependabot.yml
```

Los avisos de seguridad de GitHub siguen llegando sin el config.

### Procedimiento del sync

1. Clonar el público, rama `sync/publish-AAAA-MM-DD`
2. `git rm -rq .` y después `git archive HEAD | tar -x -C` desde el privado
3. Borrar `.github/dependabot.yml` (ver arriba)
4. Actualizar los zips de las extensiones si cambiaron (el público los sirve en la raíz)
5. **Escanear secretos** sobre el árbol final antes de commitear: `.env` reales,
   service accounts, claves privadas, `whsec_`, `polar_`, `ghp_`, `AKIA`. La
   Firebase Web API key **no** es un secreto (ver `dev-docs/SECURITY_AUDIT_PRE_FLIP.md`).
6. Un solo commit, PR, merge. `main` del público exige PR con `enforce_admins`.

## Fuentes de versión

La versión está repetida. Al subirla, cambiar **todas** en el mismo commit y buscar la anterior
con grep antes de buildear:

- `package.json` (la que usa `__APP_VERSION__`)
- `docs-site/index.html` (5 lugares) y `docs-site/script.js`
- `docs/index.html` (banner de consola de la landing)
- `CHANGELOG.md` (entrada nueva arriba)

`pnpm run build` incrementa el patch solo; si ya la subiste a mano, usar `pnpm run build:manual`.

## Panel de administración y tickets (rehecho en v2.2.27)

**Por qué era lento** (medido en los registros de Cloud Run el 2026-10-13, no supuesto): cada
function es un contenedor aparte que tarda ~14 s en arrancar en frío, y el panel llamaba a tres.
Con 30 usuarios y 341 contraseñas, las lecturas no eran el problema. Antes de optimizar una
pantalla lenta de este proyecto, mirar ahí:

```bash
gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="<function en minúsculas>"' \
  --project passmanager-d2b6d --limit 20 --format='value(timestamp,textPayload,httpRequest.latency)'
```

Cómo quedó, y lo que no hay que deshacer:

- **Una sola function en el camino de lectura**: `adminGetUsersHttp` devuelve la lista **y** las
  estadísticas. `adminGetStatsHttp`, `adminGetTicketsHttp` y `getOpenTicketsCountHttp` siguen
  existiendo solo para versiones viejas de la app todavía cacheadas por el service worker.
- **Toda function que la app llama está en `WARM_TARGETS`** (`keepWarm`), incluida
  `adminGetUsersHttp`. La que no está paga 8–14 s de arranque en su primer uso. Al agregar una
  function que el cliente llama, sumarla ahí (o a `NOT_WARMED` con el motivo):
  `functions/test/warm-targets.test.cjs` falla si no está en ninguna de las dos.
- **Cada arranque en frío deja una línea `boot: node ran Xs before index.js, index.js loaded in Ys`.**
  Con el `Starting new instance` de Cloud Run separa arranque del contenedor, del runtime y carga del
  archivo. Mirarla antes de tocar `require`s "para acelerar": en local `index.js` carga en 0,2 s.
- **Los tickets se leen en vivo desde Firestore** (`onSnapshot` en `useTickets.js`): las reglas ya
  dejaban leer a cada usuario los suyos y al admin todos. Las escrituras siguen por functions.
- **`MainLayout` pide la lista apenas detecta un admin**, así el panel abre con datos en memoria.
- **Último ingreso y fecha de alta salen de Firebase Auth** (`authFactsByUid`): los documentos de
  `users` nunca los guardaron.
- **Conteo de contraseñas**: una consulta que lee solo el dueño de cada entrada; arriba de
  `PASSWORD_SCAN_LIMIT` (20.000) cambia a un `count()` por usuario. En el emulador un `count()` por
  usuario fue **10 veces más lento** que leer todo (300 usuarios: 4,5 s contra 0,35 s): no pasar a
  esa estrategia "porque escala" sin medir.

Reglas de seguridad del panel, además de las de "Identidad" de más arriba:

- Toda function de admin entra por `requireAdmin()` (token revisado contra revocación, rol `admin`,
  **un** límite por acción). Las de tickets, por `requireTicketCaller()`.
- Dar o quitar el rol `admin` es solo para un admin principal (`isVerifiedAdminToken`).
- Un admin no puede quitarse su propio acceso. El admin principal ya estaba protegido por otra
  regla: para probar esta hace falta un admin que **no** esté en `ADMIN_EMAILS`.
- Texto de tickets: validar con `isNonEmptyText`. `sanitizeInput` devuelve intacto lo que no es
  string, y un objeto no tiene `.length`, así que pasaba todos los controles.
- `useTickets.js` y `useAdmin.js` limpian su estado cuando cambia el usuario, y **no cachean el
  token a mano**: `getIdToken()` ya lo cachea y refresca. Un caché propio sobrevivía a la sesión.

## 2FA y Google Authenticator (v2.3.0)

- **El formato de Google** es `otpauth-migration://offline?data=<base64 de un protobuf>`. El
  códec está hecho a mano en `src/utils/otpMigration.js` (dos mensajes planos; no hay runtime de
  protobuf). El parámetro `data` se lee con una regex, **nunca con `URLSearchParams`**: convierte
  `+` en espacio y rompe el base64 (hay un test que lo atrapa).
- **Google Authenticator parte la exportación en QR de a 10 cuentas** (`batch_size`,
  `batch_index`, `batch_id`). La importación acumula hasta tener todos; la exportación arma igual.
  El formato **no lleva período**: una cuenta con período distinto de 30 s no se exporta.
- **Los parámetros del TOTP** (`algorithm`, `digits`, `period`) se guardan en claro en
  `password_entries/{id}.totpParams` (no son secretos); sin ese campo valen SHA1 / 6 / 30. El
  generador vive en `functions/totp.js` y `functions/test/totp.test.cjs` lo prueba con los vectores
  del RFC 6238.
- **`exportTotpAccountsHttp` es la única function que devuelve un secreto TOTP al cliente.** Solo
  el dueño, 3 llamadas por minuto, registro de auditoría con la cantidad (nunca los secretos). No
  loguear su respuesta ni nombrar variables `secrets` en un `console.*` (CodeQL).
- **Importar en bloque es obligatorio**: `createPasswordEntryHttp` permite 5 por minuto y
  `saveTotpSecretHttp` 10. Por eso `importTotpAccountsHttp` hace todo en un batch. (La importación
  CSV todavía hace un pedido por entrada; ver el backlog.)
- **Entradas sin contraseña**: las que crea la importación solo tienen el 2FA. Un sobre cifrado de
  un string vacío tiene `encrypted: ''`, así que se reconoce con `isEncryptedValue()` (por tipo),
  no por verdad. En el cliente, `decryptedData.password ?? decryptedData`, nunca `||`.
- **La cámara escanea el cuadro entero** (`calculateScanRegion`). La región por defecto de
  qr-scanner es el centro reducido a 400 px: un QR de exportación que llena el cuadro no se lee.
  Y el mismo QR queda frente a la cámara varios segundos: las relecturas se ignoran sin aviso.
- **La cámara sí está en los e2e**: `e2e/helpers/fakeCamera.js` arma un video Y4M con los QR y
  Chromium lo usa como webcam. Para contar avisos no sirve `toHaveCount(0)` (reintenta hasta que se
  van solos): el test los registra con un `MutationObserver`.
- **El CSP de producción rompió la lectura de QR en v2.3.0** (arreglado en v2.3.1). qr-scanner
  carga la imagen subida como `blob:` y decodifica en un Worker `blob:`. En Chrome sobre Mac con
  chip Apple y macOS 13+ usa **siempre** el Worker, aunque haya `BarcodeDetector`. Por eso el CSP
  de la app tiene `img-src ... blob:` y `worker-src 'self' blob:`. **No los saques**: la cámara y
  la imagen dejan de leer sin ningún error visible para el usuario.
- **Los e2e del 2FA corren con el CSP de `firebase.json`** (`e2e/helpers/productionCsp.js`) y
  sin `BarcodeDetector`. El dev server no manda el CSP, y el Chromium de los tests usaba el
  detector nativo: así pasaron en verde con la función rota en producción. El helper reescribe el
  documento, y eso obliga a desactivar Local Network Access en esos tests (`CSP_LAUNCH_ARGS`).
- **Lo que los e2e no cubren**: un QR real de Google Authenticator filmado de un teléfono, ni
  importar el QR de Lemonade en la app real. Los tests usan el códec propio y la muestra pública.

## Tests: tres capas, y cuál corre dónde

| Capa | Comando | Qué necesita |
|---|---|---|
| Unitarios (Vitest) | `pnpm run test` | nada |
| Functions (firma de Polar + carga de `index.js`) | `cd functions && npm test` | nada |
| Reglas de Firestore (también en CI, job e2e) | `pnpm run test:rules` | emulador |
| **E2E (Playwright)** | `pnpm run test:e2e` | emuladores + JDK 21 |

### E2E: corre contra emuladores con un proyecto `demo-*`

`pnpm run test:e2e` levanta solo los emuladores (Auth, Firestore, Functions) y `quasar dev`, crea la
sesión de un usuario de prueba, siembra el vault y corre los tests. `E2E_DEBUG=1` muestra la
salida de los servidores; `pnpm run test:e2e:ui` abre el modo interactivo.

No puede tocar producción **por construcción**, no por cuidado:

1. El proyecto es `demo-lemonade`. Firebase nunca conecta un `demo-*` a la nube.
2. La app solo usa emuladores si `VITE_USE_EMULATORS=true` **y** `import.meta.env.DEV`. En un build
   de producción ese bloque no existe (verificado: 0 rastros en `dist/`).
3. `resetEmulators()` se niega a correr si el proyecto no empieza con `demo-`.

### Trampas que costaron tiempo (no las re-descubras)

- **El login de los tests NO usa el popup de Google.** El popup entrega el resultado por un iframe
  que depende de un script bajado de `apis.google.com`; si tarda, el login se cuelga sin error
  (medido: con 4 s de demora falla siempre — así fallaba el setup en CI de a ratos). Los tests entran
  con `window.__e2eSignIn` (`signInWithCredential`), que solo existe con emuladores. Consecuencia: el
  click en "Sign in with Google" y el popup no están cubiertos.
- **En el setup, la marca `lemonade_last_login` va ANTES de crear la sesión.** `MainLayout` también
  envuelve `/login` y desloguea a un usuario autenticado sin marca; con el orden inverso, quién ganaba
  dependía de cuán frías estuvieran las functions.
- **app-vite convierte `"true"` en el booleano `true`** al inyectar el env. `=== 'true'` da siempre
  false; por eso el flag se compara con `String(...)`.
- **Puertos propios, no los default de Firebase.** Los e2e usan 9199/8180/5101 (y 9100 para la
  app), definidos en `PORTS` de `playwright.config.js`. Con 9099/8080/5001 chocaban con los
  emuladores de otro proyecto que estaba corriendo en la misma máquina y la suite no arrancaba. El
  config de emuladores (`.firebase.e2e.json`, ignorado por git) se **deriva** de `firebase.json` en
  cada corrida, así que `firebase.json` no cambia y no hay una copia que mantener.
- **Sin reintentos, ni en CI.** La primera corrida de CI dio verde con dos tests que habían fallado
  y pasaron al segundo intento. En cambio el timeout de `expect` es de 20s: el dev server compila a
  demanda y cada function del emulador arranca en frío. Por lo mismo el tope por test es de 60s y el
  del setup de 180s: con el default de 30s el setup fallaba de a ratos en CI, a mitad del login.
- **JDK 21**: firebase-tools 15 lo exige para Firestore. El default de esta Mac es 17; el config usa
  `/opt/homebrew/opt/openjdk@21` si existe. En CI lo pone `setup-java`.
- **Cierre ordenado**: sin `gracefulShutdown: SIGINT`, Playwright mata al CLI y el emulador de
  Firestore (Java) queda huérfano en el 8080; la corrida siguiente no arranca.
- **Router en modo hash**: `waitForURL` no sirve (no hay evento `load`); se espera sobre
  `location.hash`.
- **La sesión de Firebase vive en IndexedDB**: `storageState({ indexedDB: true })`, si no el test
  arranca deslogueado.
- **El emulador de Functions contesta los preflight él mismo**, sin pasar por `corsHandler`, y no
  permite `OPTIONS`. Por eso el warmup se saltea con emuladores (`usingEmulators`).
- **Un test que no viste fallar no cuenta.** El de búsqueda pasaba con el bug reintroducido, porque
  el scoring solo corre con dos o más resultados y la semilla tenía uno. Al agregar un test,
  reintroducí el bug y miralo ponerse rojo.

### Trampas de los e2e del panel (2026-10-13)

- **`functions/.env` le gana a `webServer.env`.** El emulador de functions carga ese archivo, que
  en la máquina de desarrollo existe (con el `ADMIN_EMAILS` real) y en CI no: los mismos tests
  veían un admin principal distinto en cada lado. `playwright.config.js` escribe
  `functions/.env.demo-lemonade`, que tiene prioridad y solo se lee para el proyecto demo.
- **El rol `admin` se siembra** (`signInAsAdmin`): ninguna pantalla se lo da a quien no lo tiene.
- **Después del login, ir a otra ruta necesita una recarga.** La pantalla de login navega sola al
  inicio cuando termina de registrar la sesión, a veces después del `goto` del test.
- **Las llamadas que esperan un 403 o un 400 salen desde Node** (`callFunction`), no desde la
  página: el `fetch` del navegador deja un error en consola y rompe el test.
- **Crear tickets tiene un límite de 5 por minuto por usuario**: cada test usa su propio cliente.

### Lo que los e2e NO cubren

El fallo intermitente de la lista vacía (v2.2.22) **no se reproduce** contra el emulador: el código
original pasa los tests, porque sin latencia la carrera no se da. Los tests son guarda de regresión
de que la carga funciona, no una reproducción de aquel bug.

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
