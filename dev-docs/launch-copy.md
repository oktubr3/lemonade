# Launch Copy — Flip Day

> Drafts para anunciar Lemonade Password Manager el día del flip a OSS.
> Editar antes de postear. Cada plataforma tiene tono y reglas distintas.

---

## Show HN

**Title (≤80 chars, no emojis, no "I built", evita superlativos):**

```
Show HN: Lemonade – Open-source password manager, $29 one-time, self-host or hosted
```

**Body:**

```
Hi HN — I'm Mauro. I built Lemonade because I wanted a password
manager that I owned, paid once for, and could self-host if the project
ever disappeared.

Today I'm open-sourcing the whole thing under AGPLv3.

What it is:
- PWA (Quasar/Vue 3 + Firebase) + Chrome & Firefox extensions
- AES-256-GCM at rest (server-managed key, in Google Secret Manager)
- Optional E2EE "Env Vault" for secrets you want zero-knowledge:
  PBKDF2 (310k iterations) + client-side AES-256-GCM, server never
  sees the master key
- Autofill via extensions, TOTP, password history, secure notes,
  password sharing, emergency access
- i18n in 10 languages

Two ways to use it:
- Self-host: bring your own Firebase project (free tier works), follow
  dev-docs/SELF_HOSTING.md
- Hosted by me: app.lemonadepass.app, US$ 29 one-time. No subscription,
  no upsells, no feature gating between self-host and hosted

I'm honest about "lifetime": it means "while the project exists." If I
ever shut down the hosted instance, the code is AGPL and your data
exports cleanly. That's the whole point of OSS-first.

Things I'd love feedback on:
- The encryption model (AES-server-side + optional E2EE vault) — does
  this match how you'd want a PM to work, or do you want everything
  E2EE by default?
- Self-host walkthrough: I tested it on a fresh Firebase project but
  more eyes would help
- The CLA: I'm using one because I want the option to relicense if the
  ecosystem demands it; I know that's controversial

Repo: https://github.com/oktubr3/lemonade
Hosted: https://lemonadepass.com
Docs: dev-docs/ in the repo

Happy to answer anything.
```

---

## X / Twitter (≤280 chars)

**Variant A — straight:**

```
Open-sourced Lemonade today.

Password manager, AGPLv3, AES-256-GCM, optional E2EE vault, browser
extensions, self-host or pay $29 once.

No subs. No upsells. The hosted version runs the same code you can fork.

https://github.com/oktubr3/lemonade
```

**Variant B — punchy:**

```
Shipping Lemonade today: open-source password manager.

- AGPLv3
- Self-host on Firebase free tier, OR
- $29 one-time for hosted

Same code either way. No feature gates.

If I shut down hosted, you fork it. That's the deal.

https://github.com/oktubr3/lemonade
```

---

## Bluesky (≤300 chars)

```
Open-sourced my password manager today. Lemonade — AGPLv3, AES-256-GCM,
optional E2EE vault, Chrome + Firefox extensions.

Self-host on Firebase free tier, or pay $29 once for hosted.

Same code, no feature gates. If hosted dies, you fork.

https://github.com/oktubr3/lemonade
```

---

## Reddit — r/selfhosted

**Title:**
```
Lemonade — open-source password manager, self-hostable on Firebase free tier (or pay $29 once for hosted)
```

**Body:**
```
Hey r/selfhosted — just open-sourced Lemonade, a password manager I've
been working on. AGPLv3.

**Self-host story (the reason I'm posting here):**
- Backend is Firebase (Cloud Functions Node 22 + Firestore + Auth +
  Secret Manager)
- The free tier on Firebase actually covers a personal password manager
  comfortably — I tested it
- Walkthrough in dev-docs/SELF_HOSTING.md (clone, create your own
  Firebase project, set 4 secrets, deploy)
- Browser extensions (Chrome + Firefox, both MV3) point to your own
  hosted URL via a config flag

**Encryption:**
- Default vault: AES-256-GCM server-side, key in Google Secret Manager
- Optional "Env Vault" for stuff like API keys: PBKDF2 (310k) +
  client-side AES-256-GCM, master key never leaves your browser

**What you get:**
- PWA (works offline after first load), Chrome + Firefox autofill,
  TOTP, password sharing, password history, emergency access, secure
  notes, 10 languages

**What it's NOT:**
- Not E2EE everywhere by default (debatable design choice, happy to
  discuss)
- Not a Vaultwarden replacement if you specifically want Bitwarden
  compatibility — this is a different codebase

Repo: https://github.com/oktubr3/lemonade
```

---

## Reddit — r/opensource

**Title:**
```
Just released Lemonade — password manager, AGPLv3 + CLA, one-time payment for hosted
```

**Body:**
```
Quick context for r/opensource:

- License: AGPLv3
- CLA: yes, via CLA Assistant. I want the option to relicense if the
  project's needs change. Pre-emptively acknowledging that some folks
  won't contribute because of this; that's fair, and I respect it
- Funding: hosted version costs US$ 29 one-time (no subscription).
  Self-host is free. Same codebase either way — no "Community Edition"
  trick
- "Lifetime" caveat: if the hosted instance ever shuts down, you have
  the code under AGPL and your data exports cleanly

Built on Quasar/Vue 3 + Firebase. Encryption is AES-256-GCM (server)
with an optional E2EE vault (PBKDF2 + client AES-256-GCM).

Curious for feedback on the licensing/funding approach. I've seen the
"OSS but contributions need CLA + paid hosted" model work for some
projects and bomb for others.

https://github.com/oktubr3/lemonade
```

---

## Reddit — r/SideProject

**Title:**
```
After running it closed-source for a year, I open-sourced my password manager
```

**Body:**
```
Lemonade started as a closed-source SaaS at $2.99/mo. Got zero paying
users. Decided to flip the script:

- Open-sourced under AGPLv3 today
- Killed the subscription, replaced with $29 one-time for hosted
- Same code runs self-hosted on Firebase free tier
- All features unlocked — no premium gating

The bet: more users via self-host community, conversion happens because
people want me to handle ops, not because I'm gating features.

We'll see if it works. Either way the code is out.

If you want to break it / fork it / self-host: https://github.com/oktubr3/lemonade
```

---

## Posting order (recommended day-of)

1. **Push the public flip + deploy hosted** (so links work)
2. **HN first** — submit between 8–10am ET on Tue/Wed for best window
3. **Within 1 hour**, post Reddit (r/selfhosted, then r/opensource,
   then r/SideProject — space them ~20 min apart to avoid
   cross-posting flags)
4. **Tweet / Bluesky** with HN link once HN post is live
5. **Reply to comments** for the next 6 hours actively. Single biggest
   factor for HN traction.

## Notes on tone

- No emojis anywhere (HN/Reddit downvote them)
- No "we" — it's a solo project, say "I"
- Don't bury the AGPL or the CLA — say it upfront, the audience
  cares
- Don't oversell encryption — the "Env Vault" is the E2EE piece, the
  rest is server-key encryption. Be honest about the model
- Don't promise roadmap items
