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
- `src-pwa/register-service-worker.js` - Registro SW con package `register-service-worker`, diálogos de actualización con snooze, dark mode support
- `src-pwa/custom-service-worker.js` - Service Worker con estrategias de cache (workbox)

### REGLAS INQUEBRANTABLES:
- **NUNCA poner `self.skipWaiting()` al inicio del custom-service-worker.js** - Esto hace que el SW se active solo sin mostrar el diálogo. El `skipWaiting` solo se ejecuta cuando el usuario confirma (via `postMessage({ type: 'SKIP_WAITING' })`)
- **NUNCA agregar `controllerchange → reload`** sin diálogo de por medio - Esto recarga la app sin preguntar al usuario
- **El package `register-service-worker` es obligatorio** - El registro manual con `navigator.serviceWorker.register()` no funciona correctamente con el boot system de Quasar
- **El callback `updated(reg)` es el punto de entrada** - Ahí se muestra el diálogo, no en `updatefound` ni en `statechange`

### Configuración crítica en quasar.config.cjs:
- `useFilenameHashes: true` - Cache busting con hashes únicos
- `workboxMode: "InjectManifest"` - Control personalizado del SW
- Framework plugins: ["Notify", "Dialog", "Dark", "Loading"]

### Referencia funcional:
Si algo se rompe, usar `/Users/mauroh/Apps/kiddie-cards/src-pwa/` como referencia. Tiene el mismo pattern y funciona correctamente.

### Testing:
Para probar cambios en el sistema de updates: hacer 2 deploys consecutivos. El primero instala el nuevo SW, el segundo genera la actualización que dispara el diálogo.

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
