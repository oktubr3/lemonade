# Self-Hosting Lemonade

> **Status:** Draft / WIP. This guide is being validated end-to-end against a clean Firebase project before the public open-source launch. Sections marked `TODO` will be filled in or removed before v1.0.

Lemonade is designed to run on your own Firebase project — Bring Your Own Firebase (BYOF). The same codebase that powers `lemonadepass.com` runs in your account. Self-hosting is free of charge; the only costs are the Firebase services your usage triggers (Firestore reads/writes, Cloud Functions invocations, Hosting bandwidth), which for a single user normally fall well inside the Firebase free tier.

If you would rather not run your own infrastructure, you can buy a one-time hosted account at `lemonadepass.com` for US$ 29 (lifetime, while the project exists).

## What you will end up with

After completing this guide you will have:

- A Firebase project you control, with Auth, Firestore, Functions, and Hosting enabled
- The Lemonade PWA deployed at a URL you choose (Firebase Hosting subdomain or custom domain)
- All Cloud Functions deployed, secrets configured
- Optionally: the Chrome and/or Firefox extension loaded in developer mode and pointed at your backend

The encryption model and security boundaries of your self-hosted instance are identical to the hosted version. See [`ARCHITECTURE.md`](ARCHITECTURE.md) and [`../SECURITY.md`](../SECURITY.md) for the details.

## Prerequisites

- A Google account (for Firebase / Google Cloud)
- Node.js 18, 20, or 22 installed locally
- pnpm (`npm install -g pnpm`)
- Firebase CLI (`npm install -g firebase-tools`)
- ~30-45 minutes the first time

You do **not** need a credit card to start. The Firebase free tier (Spark plan) is enough to evaluate Lemonade. To deploy Cloud Functions you do need to upgrade to the Blaze (pay-as-you-go) plan, which still includes a generous free tier; for a single self-hosting user the typical monthly bill is well under US$ 1.

## Step 1 — Clone the repository

```bash
git clone https://github.com/oktubr3/lemonade.git
cd lemonade
pnpm install
cd functions && npm install && cd ..
```

## Step 2 — Create a Firebase project

1. Go to https://console.firebase.google.com and create a new project. Give it any name; the project ID is what matters downstream.
2. Once created, open **Project settings** → **General** and copy the **Web app** config (you will need this in step 5). If there is no Web app yet, register one.

## Step 3 — Enable Authentication

1. Firebase Console → **Authentication** → **Get started**.
2. Enable the **Google** provider. Lemonade currently relies on Google sign-in; other providers will likely work but are not officially supported yet.
3. Add your eventual deployment domain to the **Authorized domains** list.

## Step 4 — Configure Firestore

1. Firebase Console → **Firestore Database** → **Create database**.
2. Start in **production mode** (the project's security rules will be deployed in step 6).
3. Choose a region close to your users.

> The project's `firestore.rules` and `firestore.indexes.json` (in the repo root) will be deployed automatically by the Firebase CLI in step 6.

## Step 5 — Configure environment files

Create `.env.local` at the repo root with your Firebase Web app config:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

These values are public by design — Firebase Web API keys are not secrets; access is controlled by Firestore rules and App Check (optional).

> **Never commit `.env.local`.** The project `.gitignore` already excludes it.

## Step 6 — Configure Cloud Functions secrets

Lemonade Cloud Functions require server-side secrets stored in **Firebase Secret Manager**, not in `.env`. The required secrets are:

| Secret name | What it is | How to generate |
|---|---|---|
| `ENCRYPTION_KEY` | AES-256 key for server-side encryption of the main vault | `openssl rand -base64 32` |
| `HIBP_API_KEY` | Have I Been Pwned API key (optional, for breach checks) | Buy at https://haveibeenpwned.com/API/Key, US$ 3.95/month |
| `POLAR_ACCESS_TOKEN` | Polar billing token (optional, only if you want to charge for hosted access) | https://polar.sh dashboard |
| `POLAR_PRODUCT_ID` | Polar product ID for your lifetime SKU (optional) | Polar dashboard |
| `POLAR_WEBHOOK_SECRET` | Polar webhook signing secret (optional) | Polar dashboard |
| `GOOGLE_AI_API_KEY` | Google AI API key (optional, used for password strength insights) | https://aistudio.google.com |

> **TODO:** confirm the final list of required vs. optional secrets after the OSS code refactor. Some of the Polar-related ones may be removed for self-hosters.

Set each secret with:

```bash
firebase use your-project-id
firebase functions:secrets:set ENCRYPTION_KEY
# (paste value when prompted)
```

> **Critical:** `ENCRYPTION_KEY` cannot be rotated without re-encrypting all stored data. Choose carefully and back it up somewhere safe. If you lose it, every encrypted entry in your Firestore is unrecoverable.

## Step 7 — Deploy

```bash
firebase login
firebase use your-project-id
pnpm run build:manual
firebase deploy
```

The first deploy can take 5-10 minutes. Subsequent deploys for hosting-only changes complete in under a minute.

Your instance is now live at `https://your-project-id.web.app`.

## Step 8 — Optional: configure a browser extension

The extensions in `lemonade-chrome-extension/` and `lemonade-firefox-extension/` can point at your self-hosted backend.

> **TODO:** document how to override the backend URL in the extension manifest / config. As of this writing the extension assumes `lemonadepass.com` — making the backend configurable is tracked as a follow-up task.

For now, the simplest path for self-hosters is to load the extension unpacked (Chrome: `chrome://extensions` → Developer mode → Load unpacked; Firefox: `about:debugging` → This Firefox → Load Temporary Add-on) and patch the backend URL in code before loading.

## Updating to a new version

```bash
cd /path/to/lemonade
git pull origin main
pnpm install
cd functions && npm install && cd ..
pnpm run build:manual
firebase deploy
```

Major version upgrades (e.g. v2.x → v3.x) may require schema migrations. The release notes for each major version will document the migration steps.

## Troubleshooting

> **TODO:** populate this section as users report issues during the first weeks after launch. Expected categories: auth domain misconfiguration, missing secrets, Firestore index build delays, Firebase quota errors on free tier.

## Limitations of self-hosting

The following hosted-only features are not available in a single-instance self-hosted deployment:

- **Sharing across organizations.** Sharing a password with someone on a different Firebase project does not work; sharing inside your own instance does.
- **Emergency access between strangers.** Same reason — the emergency contact flow assumes a shared user directory.
- **Managed recovery.** Hosted users can request operator-assisted recovery; self-hosters are responsible for their own backup/recovery procedures.

These are not artificial restrictions — they require a shared backend, which by definition only exists on the hosted instance.

## Getting help

- Open a GitHub Discussion under the `self-hosting` category.
- For bugs in the codebase, open an issue.
- For vulnerabilities, follow [`../SECURITY.md`](../SECURITY.md) — do not file public issues.
