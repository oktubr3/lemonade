# Lemonade Product Hunt Launch — Design Document

**Date:** 2026-02-18
**Goal:** Launch Lemonade on Product Hunt targeting Top 5 of the day + first real users
**Approach:** Developer Secret Vault positioning + authentic indie maker story

---

## Positioning

Lead with the Env Vault as the technical differentiator. Frame Lemonade as "the password manager I built for myself" — simple, secure, no bloat. The indie story goes in the maker comment, not the tagline.

## PH Listing Content

### Tagline (57 chars)
> The password manager I built for myself — simple, secure, with an Env Vault

### Description
> I got frustrated with password managers that feel like enterprise software. So I built the one I actually wanted to use — clean, fast, no bloat, and serious about security.
>
> Lemonade keeps your passwords, .env files, API keys, and secrets in one AES-256-GCM encrypted vault. It has a built-in TOTP authenticator with QR scanning, Emergency Access for trusted contacts, custom encrypted fields, Secure Notes, and browser extensions for Chrome and Firefox.
>
> No desktop app to install — it's a PWA that works on any device and stays up to date automatically. Biometric unlock with Passkeys. 10 languages. Free for up to 15 passwords, $2.99/mo for unlimited.
>
> The Env Vault is what makes it different: drag and drop your project folder and Lemonade detects your .env, credentials.json, API keys — everything you can't commit to git. Version-tracked, encrypted, exportable.

### Topics
Password Manager, Developer Tools, Security, Privacy

### Maker's First Comment
> Hey Product Hunt! I'm Mauro, an indie dev from Pergamino, Argentina.
>
> I built Lemonade because every password manager I tried felt either too complicated or not built for how developers actually work. I wanted one place for my passwords AND my .env files, API keys, and secrets — without having to learn a new system or install yet another Electron app.
>
> So I built it. It took a long time to polish, but I'm proud of where it is: AES-256-GCM encryption, Passkeys, TOTP with QR scanner, Emergency Access, extensions on both Chrome and Firefox stores, and the Env Vault that I use every day.
>
> The free tier is generous on purpose — I want you to try it without pressure.
>
> It's simple on purpose. I'd love to hear what you think.

## Assets Required

| Asset | Spec | Status |
|-------|------|--------|
| Thumbnail | 240x240 PNG | Have LemonadeLogo.png — verify dimensions |
| OG Image | 1200x630 | Have og-image.png — looks good |
| Gallery Image 1 | 1270x760 | NEEDED: Dashboard with passwords list (dark mode) |
| Gallery Image 2 | 1270x760 | NEEDED: Env Vault with .env file management |
| Gallery Image 3 | 1270x760 | NEEDED: TOTP authenticator with QR scanner |
| Gallery Image 4 | 1270x760 | NEEDED: Browser extension autofill popup |
| Gallery Image 5 | 1270x760 | NEEDED: Emergency Access configuration |
| Gallery Image 6 | 1270x760 | NEEDED: Security Analysis report |
| Gallery Image 7 | 1270x760 | NEEDED: Passkey biometric lock screen |
| Gallery Image 8 | 1270x760 | NEEDED: Mobile PWA installed on phone |

## Launch Day Strategy

- Schedule launch for 12:01 AM PT (4:01 AM Argentina) — use PH scheduled launch
- Best days: Tuesday, Wednesday, or Thursday
- Post maker comment immediately
- Respond to every PH comment — fast, genuine, no copy-paste
- Share on Twitter with prepared tweet
- Monitor comments every 1-2 hours
- Never ask for votes directly — PH penalizes this

### Tweet
> I've been building Lemonade for a long time — the password manager I wished existed as a developer. Today it's live on Product Hunt.
>
> Passwords, .env files, API keys — one encrypted vault. Free to try.
>
> [PH link]

## Post-Launch (day 2-7)

- Respond to late PH comments
- If Top 5: add PH badge to landing page
- Write a dev.to or IndieHackers post: "I built a password manager with an Env Vault"
- Ask happy users for PH reviews (reviews = 8x more traffic)

## What We Skip

- Promo codes (free tier is generous enough, no implementation needed)
- Paid promotion (organic only)
- Video demo (nice to have but not blocking)
