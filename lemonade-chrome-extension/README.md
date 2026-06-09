# Lemonade Password Manager - Chrome Extension

Extension de Chrome para autocompletar credenciales desde Lemonade Password Manager.

## Funcionalidades

- **Autenticacion con Google**: Usa el mismo login que la PWA
- **Lista de credenciales**: Muestra todas tus passwords sincronizadas
- **Favoritos**: Los items destacados aparecen primero con estrella verde
- **Ordenamiento**: A-Z / Z-A con favoritos siempre arriba
- **Busqueda**: Filtra credenciales por titulo, usuario o URL
- **Autofill**: Click en una credencial para llenar el formulario activo
- **Copiar password**: Boton para copiar la password al portapapeles

## Estructura del Proyecto

```
lemonade-chrome-extension/
├── manifest.json           # Configuracion de la extension (Manifest V3)
├── background/
│   └── service-worker.js   # Maneja auth y comunicacion con Firebase
├── content/
│   ├── content-script.js   # Detecta formularios e inyecta UI
│   └── styles.css          # Estilos del boton flotante
├── popup/
│   ├── popup.html          # UI del popup
│   ├── popup.js            # Logica del popup
│   └── popup.css           # Estilos del popup
└── icons/
    ├── icon-16.png
    ├── icon-32.png
    ├── icon-48.png
    └── icon-128.png
```

## Configuracion OAuth

La extension usa OAuth 2.0 con un cliente tipo "Web application":

- **Client ID**: `824994283249-a5bc9h45cjqj8op01lubv0dsfbv2m44u.apps.googleusercontent.com`
- **Redirect URI**: `https://eebmoakgjfoefknjcpcbgelkjbhfkbhm.chromiumapp.org`

### Para configurar en otro proyecto:

1. Crear OAuth Client en Google Cloud Console tipo "Web application"
2. Agregar redirect URI: `https://<extension-id>.chromiumapp.org`
3. Actualizar `GOOGLE_CLIENT_ID` en `service-worker.js`

## Instalacion (Desarrollo)

1. Abrir `chrome://extensions/`
2. Activar "Developer mode"
3. Click en "Load unpacked"
4. Seleccionar la carpeta `lemonade-chrome-extension`

## Uso

1. Click en el icono de Lemonade en la barra de Chrome
2. Iniciar sesion con Google
3. Ver lista de credenciales
4. Click en una credencial para autocompletar el formulario activo
5. O usar el boton de copiar para copiar la password

## Notas Tecnicas

- **Manifest V3**: Usa service workers en lugar de background pages
- **Firebase REST API**: Comunicacion directa con Firestore via REST
- **Structured Queries**: Filtra por userId en el servidor (requerido por security rules)
- **Token Refresh**: Maneja automaticamente la renovacion de tokens

## Extension ID Fijo

El `manifest.json` incluye una `key` para mantener el extension ID constante:
- ID: `eebmoakgjfoefknjcpcbgelkjbhfkbhm`

Esto es necesario para que el OAuth redirect URI funcione correctamente.
