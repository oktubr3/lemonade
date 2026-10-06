# Contributing to Lemonade Password Manager

Thanks for your interest in contributing to Lemonade. This project is open source under the AGPLv3 license, and contributions of all sizes are welcome — bug reports, documentation fixes, new features, security audits.

## Before you start

- **Discuss large changes first.** For non-trivial features or refactors, open an issue or a discussion before sending a PR. This avoids wasted work if the change does not align with the roadmap.
- **Read the architecture overview.** See [`dev-docs/ARCHITECTURE.md`](dev-docs/ARCHITECTURE.md) for an overview of the encryption model, services, and data flow.
- **Security issues go through private disclosure.** Do not open public issues for vulnerabilities. See [`SECURITY.md`](SECURITY.md).

## Setting up your environment

Lemonade is a Quasar/Vue 3 PWA with a Firebase backend (Cloud Functions, Firestore, Auth). The repo also contains Chrome and Firefox extensions.

To run a local development copy you need:

- **Node.js 22.22+** (or 24/26/28/30). `@quasar/app-vite` 3 dropped Node 18 and 20 —
  the repo ships an `.nvmrc`, so `nvm use` picks a supported version.
- **pnpm 9** at the root and in `lemonade-*-extension/`. Pinned via `packageManager`
  in `package.json`; `corepack enable` will honour it.
- **npm** inside `functions/` only — it has its own `package-lock.json`.
- **Firebase CLI**, and your own Firebase project (free tier is enough).

### From a clean clone

```bash
nvm use                 # reads .nvmrc
corepack enable         # pnpm at the pinned version
pnpm install
(cd functions && npm install)

cp .env.example .env.local        # fill in your Firebase web config
cp functions/.env.example functions/.env   # ADMIN_EMAILS

pnpm run lint
pnpm run build:manual   # build without bumping the version
```

`.env.local` and `functions/.env` are git-ignored and **must be recreated on every
machine** — they are the only things a clone cannot give you. Everything else
(including Cloud Functions secrets, which live in Firebase Secret Manager) is
covered in [`dev-docs/SELF_HOSTING.md`](dev-docs/SELF_HOSTING.md).

### Toolchain gotchas that cost time

- **The two emulators need different CLI versions.** The Functions emulator requires
  `firebase-tools@latest`; with `@13` every function dies at load with a misleading
  `functions.config() has been removed` warning. The Firestore rules tests
  (`pnpm run test:rules`) are pinned to `@13` because newer CLIs need JDK 21.
- **Client env vars use the `VITE_` prefix**, declared explicitly in
  `quasar.config.js` → `build.env.clientPrefix`. app-vite 3 defaults to `QCLI_`;
  removing that line makes Firebase initialize without an API key and the app stops
  booting. See `CLAUDE.md` for the full list of build constants renamed in
  app-vite 3.
- **Verifying a deploy needs a hard reload.** The service worker will happily serve
  the previous bundle and make a broken deploy look healthy.

The full setup walkthrough — creating a Firebase project, enabling Auth providers, configuring Functions secrets, and deploying — is in [`dev-docs/SELF_HOSTING.md`](dev-docs/SELF_HOSTING.md). The same guide is what self-hosters use, so following it as a contributor is a useful pass-through review.

## Branching and commits

- Never commit directly to `main`.
- Branch names follow `feat/<short-name>`, `fix/<short-name>`, `hotfix/<short-name>`, or `docs/<short-name>`.
- Commit messages are **single-line**, lowercase, with Conventional Commit prefixes: `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `test:`, `perf:`. Keep titles under 60 characters. The body of the PR is where context belongs, not the commit message.
- Squash-merge is the default merge strategy.

Example:

```
feat: env vault supports multiline values
fix: autofill no longer triggers on iframes from cross-origin domains
docs: clarify byo-firebase quotas in self-hosting guide
```

## Code style

- Vue 3 + Composition API. Composables live in `src/composables/`.
- ESLint + Prettier configured at the root. Run `pnpm run lint` before pushing.
- TypeScript is not used in the main app today; do not introduce it without an issue/discussion first.
- For Cloud Functions (`functions/`), Node 22 runtime, plain JavaScript.

## Pull request checklist

Before opening a PR, confirm:

- [ ] `pnpm run lint` passes at the repo root.
- [ ] `pnpm run build:manual` succeeds (no version bump for PRs — that happens at release).
- [ ] If you touched `functions/`, `npm run lint` and `npm run build` succeed in `functions/`.
- [ ] You have not committed any `.env*` file, service account JSON, or signing key.
- [ ] You signed the CLA on your first PR (the bot will prompt you automatically).
- [ ] You added or updated tests where applicable.
- [ ] You updated `dev-docs/ARCHITECTURE.md` if you changed a public interface, data model, or security boundary.

## Contributor License Agreement (CLA)

Before your first PR is merged you will be asked to sign the Lemonade CLA via [CLA Assistant](https://cla-assistant.io/). The CLA confirms two things:

1. The code you contribute is yours to contribute (or you have rights to it).
2. You grant Lemonade the right to relicense your contribution in the future if a specific commercial agreement requires it. This is a defensive provision — the project itself stays AGPLv3.

If your employer claims rights over your off-hours work, you may need them to sign a corporate CLA. Open an issue and we will help coordinate.

## Communication

- **GitHub Issues** — bugs and concrete feature requests
- **GitHub Discussions** — questions, ideas, show-and-tell
- **Security Advisories** — private channel for vulnerabilities

We try to respond to issues and PRs within 48 hours during the first weeks after open-sourcing. Past that, response times will be best-effort.

## Recognition

Notable contributors are listed in the project README. The `founder` role is reserved for early supporters of the project as a thank-you for backing Lemonade before it was open source.

Welcome aboard.
