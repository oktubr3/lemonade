# Lemonade Product Hunt Launch — Implementation Plan

> **For Claude:** Follow this plan task-by-task.

**Goal:** Prepare and execute Lemonade's Product Hunt launch
**Architecture:** PH listing setup + assets preparation + launch day execution
**Design doc:** `docs/plans/2026-02-18-product-hunt-launch-design.md`

---

### Task 1: Verify and prepare logo thumbnail

**What:** Ensure LemonadeLogo.png works as PH thumbnail (240x240)

**Steps:**
1. Check dimensions of `docs/assets/images/LemonadeLogo.png`
2. If not 240x240, resize it (keep transparent background)
3. Save as `docs/assets/images/ph-thumbnail-240x240.png`

---

### Task 2: Take gallery screenshots (MANUAL — Mauro does this)

**What:** Take 8 screenshots at 1270x760 from the live app at app.lemonadepass.app

**Screenshots needed:**
1. **Dashboard** — passwords list view, dark mode, with some entries visible
2. **Env Vault** — showing environment variables with folder structure
3. **TOTP** — the 2FA setup dialog with QR scanner or the TOTP code countdown
4. **Browser Extension** — the Chrome extension popup on a login page
5. **Emergency Access** — trusted contacts configuration in Settings
6. **Security Analysis** — AI analysis results showing password health
7. **Lock Screen** — passkey biometric authentication prompt
8. **Mobile** — the app on a phone screen (or responsive view at mobile width)

**Tips:**
- Use dark mode for all screenshots — looks more premium
- Clean up any test data — use realistic-looking entries
- Browser: hide bookmarks bar for cleaner shots
- For mobile: use Chrome DevTools device toolbar or take a real phone screenshot

**Save to:** `docs/assets/images/ph-gallery/` (create folder)

---

### Task 3: Set up Product Hunt listing

**What:** Create the launch on producthunt.com

**Steps:**
1. Go to https://www.producthunt.com/posts/new
2. Fill in:
   - **Name:** Lemonade Password Manager
   - **Tagline:** The password manager I built for myself — simple, secure, with an Env Vault
   - **URL:** https://lemonadepass.app
   - **Thumbnail:** Upload LemonadeLogo.png (or ph-thumbnail)
   - **Gallery:** Upload the 8 screenshots from Task 2
   - **Description:** Copy from design doc
   - **Topics:** Password Manager, Developer Tools, Security, Privacy
   - **Maker:** Add yourself
3. Schedule launch for next available Tue/Wed/Thu at 12:01 AM PT
4. DO NOT publish yet — review everything first

---

### Task 4: Prepare maker comment

**What:** Have the first comment ready to post the moment it goes live

**Comment text (copy from design doc):**
> Hey Product Hunt! I'm Mauro, an indie dev from Pergamino, Argentina.
>
> I built Lemonade because every password manager I tried felt either too complicated or not built for how developers actually work. I wanted one place for my passwords AND my .env files, API keys, and secrets — without having to learn a new system or install yet another Electron app.
>
> So I built it. It took a long time to polish, but I'm proud of where it is: AES-256-GCM encryption, Passkeys, TOTP with QR scanner, Emergency Access, extensions on both Chrome and Firefox stores, and the Env Vault that I use every day.
>
> The free tier is generous on purpose — I want you to try it without pressure.
>
> It's simple on purpose. I'd love to hear what you think.

**Save this in a note** so you can paste it instantly on launch day.

---

### Task 5: Prepare tweet

**What:** Have the Twitter post ready

**Tweet text:**
> I've been building Lemonade for a long time — the password manager I wished existed as a developer. Today it's live on Product Hunt.
>
> Passwords, .env files, API keys — one encrypted vault. Free to try.
>
> [PH link]

**Post this** after the PH listing goes live and the maker comment is posted.

---

### Task 6: Launch day checklist

**Morning (when you wake up):**
- [ ] Verify the PH listing went live at 12:01 AM PT
- [ ] Post the maker comment immediately
- [ ] Post the tweet
- [ ] Check the listing looks correct (images, links, description)

**During the day (every 1-2 hours):**
- [ ] Check PH for new comments — respond to each one personally
- [ ] Thank people who upvote or leave reviews
- [ ] If someone reports a bug — acknowledge it, fix it if quick
- [ ] Check your PH ranking periodically

**End of day:**
- [ ] Check final ranking
- [ ] Thank the community in a follow-up comment
- [ ] Note any feedback or feature requests for later

---

### Task 7: Post-launch (days 2-7)

- [ ] Continue responding to PH comments
- [ ] If Top 5: add PH badge to lemonadepass.app landing page
- [ ] Write a post for dev.to or IndieHackers about building Lemonade
- [ ] Ask satisfied users to leave a PH review
- [ ] Track signups and engagement from the launch

---

## Quick Reference

| Item | Content |
|------|---------|
| **App URL** | https://app.lemonadepass.app |
| **Landing** | https://lemonadepass.app |
| **Chrome Ext** | Published (ID: lblkhcfbpmelkmhjdpdkfamicaganhik) |
| **Firefox Ext** | Published |
| **Pricing** | Free (15 passwords) / Premium $2.99/mo |
| **Differentiator** | Env Vault — .env, API keys, credentials in encrypted vault |
