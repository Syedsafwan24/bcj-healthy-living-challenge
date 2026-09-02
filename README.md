# BCJ Healthy Living Challenge

Web application for the Bhatkal Community Jeddah 12-week healthy lifestyle
challenge. Built to `BCJ_Healthy_Living_Challenge_Web_App_Build_Specification.md`,
which translates the V5 and V6 scoring specifications into a schema, a stack
and a set of screens.

**Precedence when the documents disagree:** V6 DOCX → V5 PDF → the build
specification. The scoring rules implemented here follow V6, reading C10 as a
phase label (open item O-1) and rounding quantitative values down (O-9).

---

## Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js 15, App Router, TypeScript |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui |
| Database | PostgreSQL 16+ |
| ORM | Drizzle |
| Sessions | `jose` signed cookies plus a `sessions` table |
| Password hashing | `@node-rs/argon2` (admin accounts only) |
| Two-factor | `otpauth`, TOTP for admins (`ADMIN_REQUIRE_TOTP`) |
| Validation | Zod |
| Tables / charts | TanStack Table, Recharts via shadcn `chart` |
| Exports | hand-written CSV, `exceljs`, `@react-pdf/renderer` |
| Email | SMTP via `nodemailer` |
| Tests | Vitest |

---

## Getting started

```bash
npm install
cp .env.example .env.local          # then fill in the values, see below
npm run db:migrate                  # extensions, sequence, tables
SEED_ADMIN_EMAIL="you@example.com" SEED_ADMIN_NAME="Your Name" npm run db:seed
npm run dev
```

`db:seed` prints a single-use invitation link. Open it within 48 hours to set a
password and enrol an authenticator app in one step.

### Environment

Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Signs the participant and admin session cookies |
| `TOTP_ENCRYPTION_KEY` | 32 bytes, base64. AES-256-GCM key for admin TOTP secrets |
| `TOTP_ISSUER` | Label shown in the authenticator app |
| `NEXT_PUBLIC_APP_URL` | Absolute URL, used in emails |
| `SMTP_HOST` | Mail host, e.g. `smtp.gmail.com`. Leave blank in development: mail is logged instead of sent |
| `SMTP_PORT` | `465` for implicit TLS, `587` for STARTTLS |
| `SMTP_USER` / `SMTP_PASSWORD` | Mailbox credentials. Gmail and most hosts need an **app password**, not the account password |
| `SMTP_SECURE` | Optional. Derived from the port unless set |
| `EMAIL_FROM` | Sender address. Must be the authenticated mailbox or a verified alias, or the host will rewrite or reject it |
| `CRON_SECRET` | Bearer token the nightly job requires |
| `ADMIN_REQUIRE_TOTP` | `true` (default) requires an authenticator code on every organiser sign-in. `false` turns it off — see below |
| `ADMIN_IP_ALLOWLIST` | Optional, comma separated. Blank disables the check |

`TOTP_ENCRYPTION_KEY` is held only in the environment. If it is stored in the
database or committed to the repository, encrypting the TOTP secrets achieves
nothing.

### Email

The specification names Resend; BCJ chose SMTP on their own mailbox instead, so
`src/lib/email.ts` sends through nodemailer. Three messages go out: the
registration ID at sign-up, every ID held against an address on lost-ID
recovery, and organiser invitations.

**With SMTP unset, mail is logged to the console rather than sent.** That keeps
the flows usable in development, and it means a misconfigured transport fails
silently in production — a registration is never lost because an email could
not be delivered, and the ID is always shown on screen as well. Nothing else
will tell you mail is broken, so check it explicitly:

```bash
npm run mail:test                       # connection and credentials only
npm run mail:test -- you@example.com    # send a real message
```

Gmail needs 2-Step Verification on the account and an **app password**
(myaccount.google.com → Security → App passwords); the ordinary account
password is rejected. Gmail also rewrites the `From` header to the
authenticated address, so set `EMAIL_FROM` to that mailbox.

Gmail's free tier allows roughly 500 recipients a day, which is ample here —
one message per registration plus occasional recovery emails.

### Database grants

`audit_log` is append-only. After migrating, run once as the database owner:

```bash
psql "$DATABASE_URL" -v app_role=bcj_app -f src/db/grants.sql
```

---

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Vitest: the section 4.8 scoring vectors and the ID rules |
| `npm run test:integration` | The same rules against a real database |
| `npm run test:e2e` | Browser smoke test of the P7 sign-off list |
| `npm run db:generate` | Generate a migration from `src/db/schema.ts` |
| `npm run db:migrate` | Apply bootstrap SQL then the migrations |
| `npm run db:seed` | Settings, diet categories, first admin invite |
| `npm run lint` | ESLint |
| `npm run mail:test` | Verify SMTP; pass an address to send a real test message |
| `npx tsx scripts/demo-seed.ts` | Demo participants and entries for UAT (`--clean` removes them) |

---

## How scoring works

`src/lib/scoring.ts` is a pure function: no database, no environment, no clock.
`src/lib/scoring-save.ts` wraps it in a transaction that writes the three
calculated columns on `daily_entries`, recomputes that week's `weekly_scores`
row and recomputes `final_scores` — all three or none.

```
weekNo           = floor(daysBetween(startDate, entryDate) / 7) + 1
activeChallenges = C1 through C[min(weekNo, 9)]        cumulative
quantitative     = min(floor(value / unit), 10)        water 0.25 L, steps 1,000, sleep 1 h
yes/no           = Yes 10, No 0
dietEarned       = 2 × occasions marked Yes            max 10, every day from week 1
dailyPercentage  = (lifestyleEarned + dietEarned) / (activeChallenges × 10 + 10) × 100
weeklyPercentage = average of that week's seven daily percentages
finalScore       = sum of the 12 weekly percentages    max 1,200
```

**The active set comes from the entry's own date, never from today.** A week 2
record corrected during week 7 is still scored against two challenges and a
maximum of 30. Test vector T9 exists to protect this, and every scoring
function takes `entryDate` rather than reading the clock.

Percentages are stored at four decimal places and rounded only for display, so
the exports and the screens agree.

All nine vectors from specification section 4.8 are in
`src/lib/scoring.test.ts`, alongside tests for the cumulative active set, the
daily maxima table, floor rounding, the competition window and the score bands.

```bash
npm test                 # 42 unit tests, no database needed
npm run test:integration # the same rules against DATABASE_URL
```

The integration suite covers the three checks section 4.8 asks for that need a
database: a date before the start date is rejected, a second record for the
same participant and date is impossible, and a correction recomputes the day,
the week and the final score together.

### End-to-end

`npm run test:e2e` drives a real browser through the phase P7 sign-off list:
registration, the participant and admin sign-ins, activation, logging a day,
an audited correction, the three export formats, the health-export
re-authentication, and the check that no participant route reaches another
participant's data.

```bash
npm run dev
export E2E_ADMIN_EMAIL=you@example.com
export E2E_ADMIN_PASSWORD='your password'
export E2E_TOTP_SECRET=YOURBASE32SECRET
npm run test:e2e -- http://localhost:3000
```

Playwright is a development dependency added for this suite; it is not part of
the stack table above and nothing in the application imports it.

---

## Access model

Two roles, `SUPER_ADMIN` and `PARTICIPANT`. No middle tier.

**Participants** sign in with their registration ID and nothing else:
`BCJ0001-SYED`, a readable ordinal plus the first four letters of their name.
Sign-in is rate limited to five attempts per IP per minute, and the ID never
appears on the leaderboard. A participant who loses their ID enters their email
address and every ID registered against it is re-sent there.

> **The ID is guessable, and it is the only credential.** Specification
> section 2.2 calls for four *random* characters precisely because a
> predictable ID lets one participant sign in as another and change their
> entries — and display names are public on the leaderboard, so the suffix can
> be derived from there. BCJ chose the name suffix on 31 August 2026 with that
> trade-off explained. Two supported ways to close it:
>
> - set `ID_SUFFIX_MODE` in `src/lib/registration-id.ts` to `"random"`, which
>   restores section 2.2 exactly; or
> - add the second sign-in field O-13 offers — registration ID plus registered
>   mobile number — which keeps the readable ID and still avoids a password.

**Admins** need an email, a password and a TOTP code on every sign-in. There is
no "remember this device". Passwords are argon2id at OWASP parameters, minimum 12 characters, no composition rules
and no forced rotation. Sessions are server-side rows with an 8-hour absolute
expiry and a 30-minute idle timeout, revocable at any time. Password and TOTP
are requested again before creating or disabling an account, before unlocking
the scoring rules, and before an export that includes health fields.

The application refuses to disable the last remaining active admin: with
mandatory TOTP and no email-only reset path, one account plus a lost phone
locks BCJ out of its own competition.

### Turning two-factor off

`ADMIN_REQUIRE_TOTP=false` removes the authenticator step: organisers sign in
with an email and a password, invitations skip the QR enrolment, and every
re-authentication prompt asks for the password alone. Nothing else changes —
the password check, rate limiting, lockout, session expiry, the audit trail and
the health-export re-authentication all still apply.

Specification section 2.3 requires the second factor, because an organiser can
rewrite any score, read every participant's health data and change the settings
that drive the competition. Leave it on in production; the switch exists so BCJ
can set the system up before organisers have authenticator apps.

Switching it back on costs nothing except that already-active organisers have
no enrolled secret, so re-invite them from `/admin/accounts` to enrol.

---

## Project layout

```
src/
  app/
    page.tsx                     programme overview
    register/                    registration, ID generation, success screen
    login/                       participant sign-in and lost-ID recovery
    app/                         participant area: today, history, progress,
                                 leaderboard, plan, profile
    admin/                       overview, participants, entries, settings,
                                 exports, audit, accounts, security
    api/cron/nightly/            the nightly job
  components/                    shared UI, shadcn/ui in components/ui
  db/                            drizzle schema, migrations, seed, grants
  lib/
    challenges.ts                Appendix A configuration
    scoring.ts                   pure scoring, section 4
    scoring-save.ts              transactional persistence, section 8.1
    dates.ts                     calendar arithmetic in the competition timezone
    settings.ts                  settings, deadlines and the write window
    auth/                        sessions, passwords, TOTP, rate limits, guards
    exports/                     CSV, XLSX and PDF builders
  middleware.ts                  CSP nonce, IP allowlist, signed-out redirects
```

---

## The nightly job

One run per day after the cutoff, in the settings timezone. It inserts a
`missing` entry for every active participant with no record for a past scorable
date, scores those days at 0% when `missing_scores_zero` is true, locks every
entry once the 12 weeks have ended, and recomputes the affected weekly and
final scores.

`vercel.json` schedules it at 21:05 UTC, which is 00:05 in Asia/Riyadh. Adjust
that if the timezone or the cutoff changes.

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-app/api/cron/nightly
```

**Alert if this job fails.** A silent failure means missing days are never
scored.

---

## Open items

Every one of these is BCJ's decision. The application implements the assumption
the build specification records, and each is marked in the code where it bites.

| Ref | Question | Assumed |
| --- | --- | --- |
| O-1 | Nine challenges or ten | C10 is a phase label. Weeks 10–12 repeat C1–C9, daily max 100 |
| O-2 | 90 days or 84 | 84 days, 12 weeks, maximum 1,200 |
| O-3 | Missing submission scores 0% | Yes |
| O-4 | Deadline and correction window | BCJ's rule: any day of the challenge stays open to the participant until the last day of week 12. The 23:59 Jeddah cutoff is the deadline on that final day only. This replaces the 3-day rolling window originally assumed, so `settings.correction_days` is retained on the row but unused |
| O-5 | Tie-break | Higher final score, then earlier registration |
| O-6 | Diet compliance definition | Placeholder helper text on `/app/plan` |
| O-7 | No email field on the form | Email required at registration |
| O-8 | Form pages 2–7 unread | `participants.extra jsonb` carries them without a migration |
| O-9 | Rounding | Floor |
| O-10 | Weight vs starting weight | Kept as two fields |
| O-11 | Diet categories | V5 section 6 five bands; under 50 kg flagged for review |
| O-12 | Hosting location | Not decided — see the note on `/admin/exports` |
| O-13 | Registration ID format | `BCJ0001-SYED` — name suffix, at BCJ's request. See the warning under "Access model" |
| **O-14** | **C7 cannot be maxed at its stated target** — see below | Implemented as V6 states |

### O-14, raised during the build

C7 is titled "Sleep at least 7–8 hours per night" and scores 1 point per hour,
capped at 10. A participant who sleeps exactly 8 hours therefore scores 8 of
10, and would need 10 hours to reach full marks.

The other two quantitative challenges do not behave this way: C1 tops out at
2.5 L, inside its stated 2–3 L target, and C2 at 10,000 steps, the top of its
8,000–10,000 range. Only sleep asks for more than the challenge sets out.

The application implements the rule exactly as V6 states it. BCJ should decide
whether that is intended, or whether the sleep rule should cap at the target —
for example 1.25 points per hour, so 8 hours scores 10. Changing it is a
one-line change to `unit` in `src/lib/challenges.ts` plus a test vector.

Settings that change scoring — start date, total weeks, active weeks, and
whether a missing day scores zero — rescore every participant when saved, and
are frozen once `rules_locked` is set. Unlocking requires re-authentication and
is written to the audit history.

---

## Before launch

Specification section 12, phase P7:

- Run nightly backups and **test a restore**. Self-reported daily entries
  cannot be reconstructed if they are lost.
- Apply `src/db/grants.sql` so `audit_log` really is append-only.
- Create a second super admin account.
- Alert on nightly job failure.
- Confirm O-12 before choosing where to host: the form collects blood pressure,
  diabetes status and blood sugar.
- Set `ADMIN_REQUIRE_TOTP=true` and re-invite every organiser so they enrol an
  authenticator app.
- Security pass: admin lockout, session revocation, re-authentication, and
  confirm no participant route can reach another participant's data.
  `npm run test:e2e` covers this list.

### A note on the Content-Security-Policy

`src/middleware.ts` issues a per-request nonce so the policy carries no
`unsafe-inline`. A nonce cannot be embedded in a statically prerendered page,
so **every page that needs JavaScript is rendered dynamically** — that is what
the `export const dynamic = "force-dynamic"` lines on the public pages are for.
If you make one of them static again, its scripts will be blocked and the page
will render but never become interactive. `/_not-found` is the one static
route, and it deliberately contains no client components.
