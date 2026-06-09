# 🚀 Guía de Configuración - Lemonade Password Manager

## ✅ Estado Actual
- ✅ Código de seguridad implementado
- ✅ Firebase Functions configurado
- ✅ Frontend actualizado para usar Functions
- ✅ Servidor de desarrollo funcionando

## 🔧 Próximos Pasos

### PASO 1: Configurar Variables de Entorno

1. **Crea tu archivo de configuración local:**
   ```bash
   cp .env.local.example .env.local
   ```

2. **Obtén las credenciales de Firebase:**
   - Ve a [Firebase Console](https://console.firebase.google.com/)
   - Selecciona tu proyecto
   - Ve a "Configuración del proyecto" → "General"
   - Copia las credenciales del SDK

3. **Edita `.env.local` con tus credenciales:**
   ```
   VITE_FIREBASE_API_KEY=tu-api-key
   VITE_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=tu-proyecto-id
   VITE_FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=tu-sender-id
   VITE_FIREBASE_APP_ID=tu-app-id
   ```

### PASO 2: Configurar Firebase Functions

1. **Instala Firebase CLI si no lo tienes:**
   ```bash
   npm install -g firebase-tools
   ```

2. **Inicia sesión en Firebase:**
   ```bash
   firebase login
   ```

3. **Inicializa el proyecto (si no está inicializado):**
   ```bash
   firebase init
   ```
   - Selecciona: Functions, Firestore, Hosting
   - Elige tu proyecto existente
   - Acepta las configuraciones predeterminadas

4. **Genera una clave de cifrado segura:**
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

5. **Configura la clave en Firebase Functions:**
   ```bash
   firebase functions:config:set encryption.key="tu-clave-generada-aqui"
   ```

### PASO 3: Desplegar las Mejoras de Seguridad

1. **Ejecuta el script de despliegue:**
   ```bash
   ./deploy-security.sh
   ```

   O manualmente:
   ```bash
   # Desplegar reglas de Firestore
   firebase deploy --only firestore:rules
   
   # Desplegar índices
   firebase deploy --only firestore:indexes
   
   # Desplegar Functions
   firebase deploy --only functions
   
   # Desplegar hosting
   firebase deploy --only hosting
   ```

### PASO 4: Probar la Aplicación

1. **Inicia el servidor de desarrollo:**
   ```bash
   npm run dev
   ```

2. **Abre la aplicación en:** `http://localhost:9000`

3. **Prueba las funciones:**
   - Login con Google
   - Crear una contraseña
   - Editar una contraseña
   - Copiar contraseña
   - Eliminar contraseña

### PASO 5: Verificar Seguridad

1. **Ejecuta las pruebas de seguridad:**
   ```bash
   node test-security.js
   ```

2. **Verifica logs de Firebase:**
   ```bash
   firebase functions:log
   ```

3. **Revisa Firebase Console:**
   - Functions → Logs
   - Firestore → Reglas
   - Authentication → Usuarios

## 🔍 Solución de Problemas

### Error: "Functions not found"
- Verifica que las Functions estén desplegadas: `firebase deploy --only functions`
- Revisa los logs: `firebase functions:log`

### Error: "Permission denied"
- Verifica que las reglas de Firestore estén desplegadas
- Confirma que el usuario esté autenticado

### Error: "Rate limit exceeded"
- Espera 1 minuto antes de intentar nuevamente
- Esto es normal y esperado (protección de seguridad)

### Error de cifrado/descifrado
- Verifica que la clave esté configurada: `firebase functions:config:get`
- Redespliega las Functions: `firebase deploy --only functions`

## 🎯 Funciones Disponibles

### Frontend (Cliente)
- `passwordEntriesStore.addEntry(data)` - Crear entrada
- `passwordEntriesStore.updateEntry(id, data)` - Actualizar entrada
- `passwordEntriesStore.deleteEntry(id)` - Eliminar entrada
- `passwordEntriesStore.getDecryptedPassword(id)` - Obtener contraseña
- `passwordEntriesStore.getAuditLogs()` - Obtener logs

### Backend (Firebase Functions)
- `createPasswordEntry` - Crear con cifrado
- `updatePasswordEntry` - Actualizar con cifrado
- `getPasswordEntry` - Obtener descifrado
- `deletePasswordEntry` - Eliminar con log
- `getAuditLogs` - Obtener historial

## 📊 Monitoreo

### Métricas a Vigilar:
- Número de invocaciones de Functions
- Tiempo de respuesta de Functions
- Errores de autenticación
- Intentos bloqueados por rate limiting

### Logs Importantes:
- `firebase functions:log` - Logs de Functions
- Firebase Console → Firestore → Uso
- Firebase Console → Authentication → Usuarios

## 🔒 Recordatorios de Seguridad

1. **Nunca compartas tu clave de cifrado**
2. **Revisa logs regularmente**
3. **Mantén Firebase CLI actualizado**
4. **Backup regular de Firestore**
5. **Monitorea usuarios sospechosos**

## 🎉 ¡Listo!

Una vez completados todos los pasos, tu Lemonade Password Manager estará 100% seguro y listo para uso intensivo.

**¿Necesitas ayuda con algún paso específico?**