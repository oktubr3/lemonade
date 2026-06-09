# Security Audit — Pre-OSS-Flip

> Fecha: 2026-05-21
> Auditor: Claude (sesión asistida con Mauro)
> Scope: Verificar exposición de Lemonade antes del flip a repo público

## Veredicto

**🟢 SEGURO PARA FLIP** — sin hallazgos críticos ni altos.
2 mejoras medias recomendadas (10 min), 3 mejoras opcionales post-flip.

---

## Lo que se verificó

### ✅ Secrets en git history (TODA la historia, no solo HEAD)
- Filter exhaustivo: `api_key`, `secret`, `password`, `token`, `private_key`,
  `BEGIN.*PRIVATE`, `client_secret`, `sk_live`, `sk_test`, `whsec_`, `polar_`,
  `AKIA*` (AWS), `AIza*` (Google), `ghp_*`/`ghs_*` (GitHub)
- **Resultado**: 0 secrets reales. Único hit son `apiKey: "AIzaSy..."` que son
  Firebase Web API keys **públicas por diseño** (ver INFO #1 abajo).

### ✅ Archivos `.env` trackeados
- Solo `.env.example` y `functions/.env.example`. **Ningún .env real**.
- `.env`, `.env.local`, `functions/.env`, `functions/.env.local`,
  `firebase-debug.log` están en `.gitignore`.

### ✅ Service Account JSONs en el tree
- Cero archivos con `private_key`/`service_account`/`client_email` en el repo.

### ✅ Firestore Security Rules (`firestore.rules`)
- `password_entries`: read solo si `userId == auth.uid`; writes deshabilitados
  (solo Cloud Functions via Admin SDK)
- `users`: read propio o admin; create/update con whitelist `userPublicKeys()`
  (role/billing son server-owned)
- `audit_logs`, `secure_notes`, `shared_passwords`, `emergency_access`,
  `tickets`, `webauthn_*`: read según ownership, write `false`
- `env_*`: write directo desde cliente pero **content cifrado client-side**
  (zero-knowledge), key validation con `hasOnly()`
- `env_vault_settings`: enforced `kdfIterations >= 100000` para PBKDF2
- **Catch-all final**: `allow read, write: if false` para colecciones no
  declaradas

### ✅ Cloud Functions (`functions/index.js`)
- Todas las `onCall` verifican `context.auth` y throwean
  `unauthenticated` si falta
- Todas verifican ownership (`userId == auth.uid` o admin)
- Rate limiting implementado (`Rate limit exceeded` errors)
- Input validation (length, format, URL)
- Endpoints HTTP (`onRequest`) hacen `admin.auth().verifyIdToken(token)`
- **CORS whitelist específica** (no wildcards):
  ```
  localhost:9000/9001/9200, passmanager-d2b6d.web.app,
  passmanager-d2b6d.firebaseapp.com, app.lemonadepass.app, lemonadepass.app
  ```
- Admin verification con **triple check**:
  1. `ADMIN_EMAILS` env var → `isAdminEmail()`
  2. Firestore role check → `isUserAdmin()`
  3. Primary admin protection (no se puede degradar el admin original)

### ✅ GitHub Actions (`.github/workflows/ci.yml`)
- Usa solo placeholders (`ci-placeholder`, `ci.example.com`)
- No expone secrets reales en env vars
- Ningún `echo $SECRET` o similar

### ✅ Logs (`console.log` / `console.error`)
- 30+ logs analizados — ninguno imprime passwords, secrets, tokens o data
  cifrada
- Logs de operaciones admin sí incluyen emails (correcto, son operacionales)

### ✅ Encryption keys rotation
- `LEGACY_SECRET_KEY` v1 ya disabled (confirmado en sesión previa)
- `ENCRYPTION_KEY` actual en Secret Manager (server-managed)
- E2EE Env Vault: master key nunca sale del browser (PBKDF2 + AES-256-GCM
  client-side)

### ✅ CSP en hosting:app (`firebase.json`)
- Sin `unsafe-eval`, frame-ancestors estricto, sources whitelist específica

### ✅ .gitignore
- Cubre `.env*`, `firebase-debug.log`, `node_modules`, build dirs,
  `google-cloud-sdk/`, `.playwright-mcp/`

---

## Hallazgos a accionar

### 🟡 MEDIO 1 — Secrets legacy activos en Secret Manager

Listado actual en `passmanager-d2b6d`:

```
ENCRYPTION_KEY               ← activo, OK
GEMINI_API_KEY               ← activo, OK
POLAR_ACCESS_TOKEN           ← activo, OK
POLAR_PRODUCT_ID             ← activo, OK
POLAR_WEBHOOK_SECRET         ← activo, OK
LEGACY_CLIENT_KEY            ← ¿deshabilitar?
LEGACY_ENCRYPTION_KEY        ← ¿deshabilitar?
LEGACY_SECRET_KEY            ← v1 disabled, OK
LEMONSQUEEZY_API_KEY         ← migrado a Polar, deshabilitar
LEMONSQUEEZY_STORE_ID        ← migrado a Polar, deshabilitar
LEMONSQUEEZY_VARIANT_ID      ← migrado a Polar, deshabilitar
LEMONSQUEEZY_WEBHOOK_SECRET  ← migrado a Polar, deshabilitar
ORIGINAL_CLIENT_KEY          ← investigar uso, posiblemente deshabilitar
```

**Acción**: Verificar que las versions de los 5 LEMONSQUEEZY_* y los 2-3
LEGACY/ORIGINAL CLIENT_KEY estén **todas disabled** (no solo v1). Reduce
superficie de ataque si alguien obtiene credenciales del proyecto.

```bash
gcloud secrets versions list LEMONSQUEEZY_API_KEY --project=passmanager-d2b6d
# Para cada version activa:
gcloud secrets versions disable <N> --secret=LEMONSQUEEZY_API_KEY --project=passmanager-d2b6d
```

### 🟡 MEDIO 2 — `.gitignore` permisivo en `src-capacitor/`

- El dir local pesa 157MB con build artifacts de Android
- Verificado: actualmente **no hay archivos commiteados** ahí
- Pero `.gitignore` no lo cubre explícitamente — un `git add src-capacitor`
  accidental commitearía el world

**Acción**: Agregar al `.gitignore`:
```
# Capacitor Android build artifacts
src-capacitor/android/app/src/main/assets/public/
src-capacitor/android/.gradle/
src-capacitor/android/build/

# Defensa preventiva — Firebase service accounts (que nunca debería haber)
serviceAccount*.json
*-firebase-adminsdk-*.json
*-service-account-*.json
```

---

## Informativos (NO requieren acción)

### ℹ️ INFO 1 — Firebase Web API Keys hardcodeadas
Archivos:
- `lemonade-chrome-extension/background/service-worker.js:8`
- `lemonade-firefox-extension/background/background.js:8`

Key: `AIzaSyDGEDyUu_XxXcWV5oeKAH1q6JSeW17ua50` → proyecto `passmanager-d2b6d`

**Esto NO es un secret**. Documentación oficial Firebase:
> "Firebase-related API keys are different from typical API keys. Unlike how
> API keys are typically used, API keys for Firebase services are not used to
> control access to backend resources; that can only be done with Firebase
> Security Rules and Firebase App Check."
> — https://firebase.google.com/docs/projects/api-keys

La seguridad real está en:
- Firestore Security Rules (auditadas ✅)
- Auth (verificado en cada callable ✅)
- AppCheck (opcional, recomendado post-flip)

Self-hosters reemplazan esta key por la suya (documentado en
`dev-docs/SELF_HOSTING.md`).

### ℹ️ INFO 2 — Firebase AppCheck no habilitado
Defense in depth opcional. Sin AppCheck:
- Atacante con script puede llamar a callables haciéndose pasar por la app
- **Pero**: Auth + Security Rules + rate limiting ya mitigan el daño
- Bitwarden y otros PMs OSS funcionan sin AppCheck

**Recomendación**: Activar post-flip (requiere recompilar extensions con
debug tokens). No bloqueante.

### ℹ️ INFO 3 — GitHub Security features sin verificar (todavía es privado)
Gratis en repos públicos:
- Dependabot alerts + auto-PRs
- CodeQL scanning (análisis estático en cada PR)
- Secret scanning (bloquea PRs con secrets)
- Branch protection (require PR, no force-push)

**Acción día del flip**: Activar en GitHub Settings → Code security.

---

## Próximos pasos (orden recomendado)

### Antes del flip (10-15 min)

1. **Limpiar Secret Manager** — deshabilitar versions de LEMONSQUEEZY_* y
   verificar LEGACY/ORIGINAL CLIENT_KEY
2. **Mejorar `.gitignore`** — agregar bloques de `src-capacitor/` y
   `serviceAccount*.json`
3. **Confirmar 2FA en cuenta `oktubr3`** — GitHub Settings/Password and
   authentication

### Día del flip (post-public)

4. **Activar GitHub Security**: Dependabot, CodeQL, Secret scanning (Settings
   → Code security)
5. **Branch protection en `main`**: require PR, block force-push, block
   delete (Settings → Branches)
6. **Verificar SECURITY.md** tiene el email de contacto correcto para
   responsible disclosure
7. **Continuar con plan operativo**: merge feat → main → build → deploy →
   flip público → CLA Assistant → anuncios

### Post-flip (defense in depth, no urgente)

8. **Habilitar Firebase AppCheck** (1-2h, requiere debug tokens y recompilar
   extensions)
9. **Considerar bug bounty** ($500-1000 via GitHub Sponsors o similar)
10. **Setup status page** (Statuspage, Instatus, o GitHub status) para
    incidentes operativos
11. **Plan de respuesta a vulnerabilidades reportadas** — definir SLA
    (idealmente: critical 24h, high 7d, medium 30d)

---

## Conclusión

Este es un setup defensivo bien hecho. **El código se puede liberar tal
cual** sin riesgo material. Los hallazgos medios son higiene preventiva,
no bugs explotables.

La verdadera defensa post-flip es **operacional**: responder rápido a
reportes, mantener deps al día (Dependabot), monitorear logs (Firebase
Console).
