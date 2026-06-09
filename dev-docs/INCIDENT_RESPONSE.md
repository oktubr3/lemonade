# Incident Response Plan

> Operational playbook for security incidents in Lemonade Password Manager.
> This is a private operations doc — public-facing security reporting policy
> lives in `SECURITY.md` at the repo root.

---

## Contact

| Role | Channel | SLA for ACK |
|---|---|---|
| Primary maintainer | `maurohabbaby.dev@gmail.com` | 24h |
| Public disclosure (researchers) | `SECURITY.md` GitHub policy | 24h |
| User-facing comms | In-app banner + email blast | 48h after triage |

---

## Severity matrix

Severity drives every response decision below (ACK SLA, fix SLA, user
notification requirement, post-mortem requirement).

| Severity | Definition | ACK SLA | Fix SLA | User notice |
|---|---|---|---|---|
| **Critical** | Active exploit, plaintext password leak, full DB read, or auth bypass | **2h** | **24h** | **Mandatory, within 24h** |
| **High** | Exploitable vuln (no active exploit yet), single-user data leak, role escalation | **24h** | **7d** | Within 7d, post-fix |
| **Medium** | Theoretical vuln (e.g. timing attack, DoS, rate limit gap) | **48h** | **30d** | Optional, post-mortem only |
| **Low** | Best-practice gap, CSP improvement, dep update with no CVE impact | **7d** | **90d** | None |

---

## Triage decision tree

```
1. Is plaintext user data exposed or at risk?
   YES → CRITICAL
   NO  → continue

2. Can someone other than the user access their encrypted data + the
   decryption key in the same exploit chain?
   YES → CRITICAL
   NO  → continue

3. Can an attacker read/modify data of OTHER users without exploiting
   anything else first?
   YES → HIGH
   NO  → continue

4. Can an attacker escalate privileges, bypass auth, or DoS the service?
   YES → HIGH
   NO  → continue

5. Is there a known CVE in a dependency we use?
   - If CVSS >= 7.0 → HIGH
   - If CVSS 4.0–6.9 → MEDIUM
   - If CVSS < 4.0 → LOW

6. Everything else → LOW
```

---

## Standard response flow

### Step 1 — Receive & ACK (within ACK SLA)
- Reply to the reporter from `maurohabbaby.dev@gmail.com`
- Open a **private** GitHub Security Advisory: `gh api -X POST /repos/oktubr3/lemonade/security-advisories ...`
- Assign internal severity using the matrix above
- DO NOT discuss the vuln in public issues, PRs, or comments

### Step 2 — Verify (within 24h of ACK)
- Reproduce in a staging environment if possible (not against prod with real users)
- If unable to reproduce, ask reporter for more detail before downgrading severity
- Document the reproduction steps in the private advisory

### Step 3 — Fix (within Fix SLA)
- Develop the fix in a private fork branch (NOT a public PR)
- Get CodeQL + manual review before merging
- For Critical/High: pair with a researcher reviewer if available
- Merge to `main` only when the fix is ready to deploy in the same window

### Step 4 — Deploy
- Production deploy: `firebase deploy --only functions:<changed>,firestore:rules,hosting:app`
- Verify the fix in production (smoke test the exploit path)
- For Critical: rotate any potentially exposed secrets (`gcloud secrets versions add ENCRYPTION_KEY --data-file=-`)

### Step 5 — Notify
- See "User notification" section below for templates
- For Critical: in-app banner + email blast within 24h of fix deploy
- For High: email blast within 7d
- For Medium: blog post / changelog mention

### Step 6 — Post-mortem
- Within 14d of fix deploy
- Public post-mortem at `/blog/post-mortems/YYYY-MM-DD-slug.md` or as a
  GitHub Discussion
- Template at the bottom of this doc
- Credit the reporter (with their permission)

---

## Incident type checklists

### Database breach (Firestore data exposed)
1. Snapshot current Firestore state for forensics:
   `gcloud firestore export gs://passmanager-d2b6d-firestore-backups/incident-$(date +%Y%m%d-%H%M%S) --project=passmanager-d2b6d`
2. Identify the entry point (compromised SA, leaked credential, vuln in Functions, etc.)
3. If a Service Account is compromised: disable immediately in IAM
4. If `ENCRYPTION_KEY` may be exposed: ROTATE — create new version,
   re-encrypt all data via Function, disable old version
5. Email blast to all affected users (template below)
6. Public disclosure within 72h (GDPR-aligned cadence even though not strictly required)

### Credential leak (key in repo, service account in commit, etc.)
1. Rotate the leaked credential within 1h
2. Audit access logs for the credential's lifetime
3. If the credential gave Firestore access: assume DB breach and follow that checklist
4. Force-push history rewrite is NOT a fix — the credential is already public
   on mirrors/scanners. Rotation is the only fix.
5. Add the credential pattern to GitHub Secret Scanning custom rules to prevent recurrence

### Code vulnerability (XSS, injection, auth bypass)
1. Verify exploit reproduces against current `main`
2. Develop fix in private branch
3. Run CodeQL + manual review
4. Deploy to staging if available, smoke test
5. Production deploy with rollback plan ready
6. Monitor logs for 48h post-deploy

### Dependency CVE (Dependabot alert)
1. If CVSS >= 9.0: drop everything, treat as Critical
2. Read the CVE description — is the affected code path used by Lemonade?
3. If yes: deploy the patched version within SLA
4. If no (transitive dep, unused feature): document why we're not patching immediately
5. Schedule patch in next release cycle

### Account compromise (a single user reports unauthorized access)
1. Lock the affected account immediately:
   `gcloud firestore documents update users/<uid> --data='{"locked": true}'`
2. Audit `audit_logs/` for the user — find unusual access patterns
3. Force token revocation: `admin.auth().revokeRefreshTokens(uid)` via a function
4. If multiple users affected: escalate to Database Breach checklist
5. Email the user with timeline of unauthorized access and recommendations

### DoS / rate limit abuse
1. Identify abusive IPs/UIDs from Cloud Logging
2. Block at Cloud Armor or Firestore rules level
3. If a Function endpoint is being hammered: deploy a tighter rate limit
4. Severity is usually Medium unless service is degraded for legitimate users

---

## Rollback procedures

### Firestore data rollback
The most recent pre-flip backup is at:
```
gs://passmanager-d2b6d-firestore-backups/pre-oss-flip-20260608-214757
```
Subsequent backups follow the pattern `pre-oss-flip-YYYYMMDD-HHMMSS` or
`incident-YYYYMMDD-HHMMSS`.

To restore (DESTRUCTIVE — replaces all current data):
```bash
gcloud firestore import gs://passmanager-d2b6d-firestore-backups/<backup-folder> \
  --project=passmanager-d2b6d
```

Pre-restore checklist:
- [ ] Confirm with another person if available
- [ ] Take a snapshot of CURRENT state first (in case rollback is wrong)
- [ ] Put the hosted app in maintenance mode (deploy a maintenance page)
- [ ] Notify users via in-app banner BEFORE starting
- [ ] Disable writes in `firestore.rules` temporarily during restore

### Hosted app rollback
```bash
firebase hosting:clone passmanager-d2b6d:app:<previous-version-id> passmanager-d2b6d:app:live
```
Or via console: Hosting → Release history → previous version → Rollback.

### Cloud Functions rollback
```bash
gcloud functions deploy <function-name> --source=<previous-commit> ...
```
Easier: `git revert <bad-commit>` + redeploy: `firebase deploy --only functions:<name>`

### Firestore Rules rollback
```bash
# Revert the rules commit, redeploy:
git revert <bad-commit>
firebase deploy --only firestore:rules
```

### Secret rotation (full set)
```bash
P=passmanager-d2b6d
# Add new version with new key material from stdin
gcloud secrets versions add ENCRYPTION_KEY --data-file=- --project=$P < new-key.txt
# Disable old version
gcloud secrets versions disable <OLD_VER> --secret=ENCRYPTION_KEY --project=$P
# Redeploy Functions to pick up new version (they reference latest by default)
firebase deploy --only functions
```

---

## User notification templates

### Critical incident — email blast
```
Subject: [Lemonade] Important security update — action may be required

Hi [first name],

I'm writing to inform you of a security issue we identified on
[DATE] affecting Lemonade Password Manager.

WHAT HAPPENED:
[1-2 sentences, plain language, no jargon]

WAS YOUR DATA AFFECTED:
[Yes / No / We're still investigating]

WHAT WE DID:
[Fix deployed at TIME, rotated encryption keys, etc.]

WHAT YOU NEED TO DO:
[Specific action OR "no action required"]

We take security seriously and this incident has informed concrete
improvements to our process. A detailed post-mortem will be published
at [URL] within 14 days.

Questions: reply to this email or open an issue at
https://github.com/oktubr3/lemonade/issues

—Mauro
```

### Post-mortem template (public)
```markdown
# Post-mortem: [Short title]

**Date:** YYYY-MM-DD
**Severity:** Critical | High | Medium | Low
**Reporter:** [Name or "Internal"]
**Status:** Resolved

## Summary
[1-2 sentences for someone scrolling]

## Timeline (UTC)
- HH:MM — [event]
- HH:MM — [event]
- HH:MM — Fix deployed

## Root cause
[Technical explanation, no blame language]

## Detection
[How we found out — researcher report, monitoring alert, user report]

## User impact
[Who was affected, what data was exposed, what they need to do]

## Mitigation
[Immediate steps taken]

## Fix
[Code change, link to commit/PR, deploy timestamp]

## Prevention
[Process changes, monitoring additions, code patterns banned]

## Credits
[Reporter, with permission, and any other contributors]
```

---

## Pre-emptive monitoring (set up post-flip)

- **Dependabot alerts** — enabled at GitHub repo level
- **CodeQL** — runs on every PR
- **Secret scanning** — push protection enabled
- **GCP Audit Logs** — review weekly for unusual SA activity
- **Firestore Usage Dashboard** — alert if reads/writes spike 5x baseline
- **Cloud Functions error rate** — alert if any function > 1% error rate sustained

---

## Annual review

This document should be reviewed and updated:
- After any incident (lessons learned section)
- Every 12 months minimum
- When team size grows beyond 1 maintainer (escalation chain changes)
- When the stack changes materially (e.g. migrating off Firebase)

Last reviewed: 2026-06-08 (initial draft, pre-OSS-flip).
