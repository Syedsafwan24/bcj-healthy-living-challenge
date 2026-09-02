# BCJ Healthy Living Challenge — Web Application Build Specification

**Client:** Bhatkal Community Jeddah (bcjed.com)
**Programme:** BCJ Healthy Lifestyle, 90 Days / 12-Week Challenge
**Document:** Build specification v3.0, 30 August 2026
**Companion files:** Version 5 scoring specification (PDF), Version 6 scoring specification (DOCX)

---

## 0. How to use this document

This document does not replace the BCJ scoring specifications. It translates them into a schema, a stack and a set of screens.

Precedence when the three documents disagree:

| Rank | Source | Authority |
| --- | --- | --- |
| 1 | `..._Version_6_...docx` | Scoring rules, challenge list, weekly structure |
| 2 | `..._Version_5_...pdf` | Only for content absent from V6, meaning the diet categories in V5 section 6 |
| 3 | This document | Schema, stack, screens, design |

V6 replaces the V5 lifestyle-challenge sequence. Do not reintroduce the three V5 challenges that V6 dropped (Complete all scheduled workouts, No fast food, Family activity day).

Anything not in V5, V6 or the client brief is out of scope for v1.

---

## 1. Scope

- Participant registration, replacing the current 7-page Google Form.
- One email address may register several participants. Each participant receives a unique registration ID.
- Participant dashboard. A participant logs one record per day and sees their own score, weekly progress and final score. A participant cannot see any other participant's records.
- Leaderboard showing rank, display name, final score and final percentage (V6 section 9).
- Admin dashboard. Register and activate participants, assign diet category, view records, correct inputs, set the deadline, export results, review audit history (V6 section 11).
- Server-side scoring. V6 section 8 requires that browser-calculated totals are not trusted.
- Stack: Next.js, shadcn/ui, PostgreSQL.

Out of scope for v1: fitness-tracker integrations, offline mode, WhatsApp notifications, Urdu translation, evidence uploads, streak mechanics. None of these appear in the BCJ documents.

---

## 2. Access model

Two roles only.

| Role | Access |
| --- | --- |
| `SUPER_ADMIN` | Everything. Manages participants, corrections, settings, exports, audit, and other super admin accounts. |
| `PARTICIPANT` | Own daily records and own scores. The leaderboard. Nothing else. |

There is no middle admin tier and no viewer or verifier role.

### 2.1 Participant sign-in

No password. No OTP. No magic link.

The registration ID is the credential. After registration it is shown on screen and emailed to the address given. To sign in, the participant enters the ID.

Because one email may register several participants, each participant has their own ID and signs in separately. There is no profile switcher.

If a participant loses the ID, they enter their email address and every ID registered against it is re-sent to that address.

### 2.2 The ID must not be guessable

V5 section 13 shows the example `BCJ0001`. If IDs run in sequence and the ID is the only credential, then anyone who has `BCJ0041` can guess `BCJ0042` and open another participant's account. In a competition with a public leaderboard, that allows a participant to alter a rival's entries. It also defeats the audit trail required by V6 section 8, because the log would record the wrong person.

The fix costs nothing and changes no screen. The ID keeps a readable sequential part and gains four random characters:

```
BCJ0001-7K2M
```

The sequential part stays useful for support and sorting. The random suffix makes the ID unguessable. The participant still types one code.

Two supporting rules:

- The registration ID does not appear on the leaderboard. V6 section 9 lists rank, approved display name, final score and final percentage, and does not include the ID.
- Sign-in is rate limited, five attempts per IP per minute.

This is recorded as open item O-13. If BCJ wants plain sequential IDs, the alternative is a two-field sign-in, ID plus registered mobile number, which also avoids a password.

### 2.3 Admin sign-in

A super admin can change any score, read every participant's health data, and alter the settings that drive the whole competition. The controls below are sized to that, not to the participant flow.

**Credentials.** Email plus password plus a TOTP code from an authenticator app. All three are required on every sign-in. There is no "remember this device" option and no way to disable the second factor.

Passwords are hashed with argon2id at the current OWASP parameters. Minimum length 12 characters, with no composition rules and no forced rotation, which is what NIST 800-63B recommends. The TOTP secret is encrypted at rest with AES-GCM using a key held in the environment and not in the database, so a database dump alone does not yield working second factors.

**Recovery.** At enrolment the admin is shown eight single-use recovery codes. Only hashes are stored. There is no password-reset link that bypasses TOTP: a locked-out admin is restored by another super admin, or by a recovery code.

**At least two super admin accounts must exist.** With mandatory TOTP and no email-only reset path, a single account plus a lost phone locks BCJ out of its own competition. The application refuses to disable the last remaining active admin.

**Account creation.** No self-registration. An existing super admin sends an invite, which is a single-use token valid for 48 hours. The invited person sets their password and enrols TOTP on first sign-in, in one step. An admin account cannot reach any admin route until TOTP enrolment completes.

**Sessions.** Admin sessions are server-side rows, revocable at any time, with an 8-hour absolute expiry and a 30-minute idle timeout. The cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, and uses a distinct cookie name from the participant session so the two can never be confused by a middleware bug. An admin can see and revoke their own active sessions, and a super admin can revoke anyone's.

**Rate limiting and lockout.** Five failed attempts per IP per minute, and an account lock for 15 minutes after ten consecutive failures. Failed attempts return the same message and take the same time whether or not the email exists.

**Re-authentication.** The password and TOTP are requested again, regardless of an active session, before creating or disabling an admin account, before setting `rules_locked` back to false, and before a bulk export that includes health fields.

**Logging.** Every admin sign-in, failed attempt, session revocation, correction, settings change and health-data view is written to `audit_log` with the actor, IP and timestamp.

Optional, if BCJ wants it: restrict `/admin` to a list of IP addresses. This works well for an office and badly for volunteers working from home, so it is offered rather than assumed.

---

## 3. Open items

Most of these are BCJ's own. V5 and V6 both mark several rules "approve before launch". Three block implementation.

### O-1. Nine challenges or ten. Blocking.

V6 section 2 names nine distinct challenges:

| Ref | Challenge | Activates |
| --- | --- | --- |
| C1 | Drink 2–3 L of water daily | Week 1 |
| C2 | Hit 8,000–10,000 steps daily | Week 2 |
| C3 | Cook all meals at home | Week 3 |
| C4 | No sugary drinks | Week 4 |
| C5 | Eat vegetables with every main meal | Week 5 |
| C6 | No eating after 8 PM | Week 6 |
| C7 | Sleep at least 7–8 hours per night | Week 7 |
| C8 | 10 minutes of mindfulness or breathing | Week 8 |
| C9 | Limit screen time before bed | Week 9 |

V6 then states that there are 10 lifestyle challenges, lists C10 as "Repeat all challenges together" with a maximum of 10 points, and shows Weeks 10 to 12 with a daily maximum of 110.

C10 is a phase label. Nothing new is measured in Week 10, so there is no input field for those 10 points.

If C10 is a phase, Weeks 10 to 12 activate C1 to C9 and the daily maximum is 100. V6 section 5 then needs correcting. If a tenth challenge is intended, BCJ names it and 110 stands.

This document assumes the first reading.

### O-2. 90 days or 84 days. Blocking.

The registration form is titled "BCJ HEALTHY LIFESTYLE, 90 DAYS". Both scoring documents describe 12 weeks, which is 84 days, with a final score capped at 1,200. Scoring the extra 6 days would create a partial Week 13 and raise the maximum to 1,300.

Assumed: 84 days, 12 weeks, maximum 1,200.

### O-3. Missing submission scores 0%.

V5 section 10 and V6 section 8 both mark this as recommended and requiring approval. Assumed: yes.

### O-4. Submission deadline and correction window.

V6 section 8 requires these to be defined before launch. Assumed: cutoff 23:59 Jeddah time, self-correction allowed for 3 days, admin correction after that.

### O-5. Tie-break rule.

V5 section 11 and V6 section 9 require approval before launch if one is needed. Assumed if none is given: higher final score, then earlier registration.

### O-6. Diet compliance definition.

V5 section 5 states that a diet occasion earns its 2 points only when the participant follows the approved plan for that occasion, and that BCJ should approve the exact definition before launch. The app records Yes or No. BCJ defines what Yes means, and the definition is shown as helper text beside each meal.

### O-7. The registration form has no email field. Blocking.

Page 1 collects Full Name, Mobile No., Age, Gender, Area of Residence, Height, Weight, Blood Group, Blood Pressure, Diabetes/Sugar, Blood Sugar Reading, Starting Weight, Registration Date and Residence Status. There is no email field.

Email is required, because the registration ID is delivered by email and the lost-ID recovery flow depends on it.

### O-8. Pages 2 to 7 of the Google Form could not be read.

Google Forms renders later pages in the browser, so only page 1 was retrievable. BCJ should supply a PDF print of the full form or the response sheet header row. The schema carries an `extra jsonb` column so additional fields need no migration.

### O-9. Rounding on quantitative challenges.

"250 ml = 1 point" does not define what 2.4 L scores. Assumed: floor. `points = min(floor(value / unit), 10)`, applied the same way to water, steps and sleep.

### O-10. Weight and Starting Weight are both on the form.

Confirm whether these are the same measurement. If so, collapse to one field.

### O-11. Diet categories appear in V5 only.

V6 references the approved BCJ diet plan but does not list categories. V5 section 6 gives Kids (10 to 17 years), 50–60 kg, 60–75 kg, 75–90 kg, and 90 kg and above. Confirm these carry forward, and define what happens for an adult under 50 kg.

### O-12. Hosting location.

The form collects blood pressure, diabetes status and blood sugar. BCJ should confirm whether data must stay in Saudi Arabia. This decides hosting and is expensive to change after launch.

### O-13. Registration ID format.

See section 2.2. Assumed: `BCJ0001-7K2M`, sequential part plus four random characters.

---

## 4. Scoring model

Restatement of V6, reading O-1 as "C10 is a phase" and O-9 as floor.

### 4.1 Week

```
weekNo = floor(daysBetween(startDate, entryDate) / 7) + 1
```

Week 1 begins on the official start date. Dates outside `startDate` through `startDate + 83` are not scorable.

### 4.2 Active challenges

Challenges are cumulative. A challenge that unlocks in a given week stays active for every remaining week. Week 2 does not replace Week 1's water target, it adds steps on top of it.

```
activeChallenges = C1 through C[min(weekNo, 9)]
```

Weeks 10, 11 and 12 activate C1 to C9, the same set as Week 9.

| Week | C1 water | C2 steps | C3 home | C4 sugar | C5 veg | C6 late | C7 sleep | C8 mind | C9 screen | Active |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Yes | | | | | | | | | 1 |
| 2 | Yes | Yes | | | | | | | | 2 |
| 3 | Yes | Yes | Yes | | | | | | | 3 |
| 4 | Yes | Yes | Yes | Yes | | | | | | 4 |
| 5 | Yes | Yes | Yes | Yes | Yes | | | | | 5 |
| 6 | Yes | Yes | Yes | Yes | Yes | Yes | | | | 6 |
| 7 | Yes | Yes | Yes | Yes | Yes | Yes | Yes | | | 7 |
| 8 | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | | 8 |
| 9 | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | 9 |
| 10 | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | 9 |
| 11 | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | 9 |
| 12 | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes | 9 |

Diet is active every day from Week 1 and is not part of this table.

**The active set is derived from the entry's own week, never from today's week.** If a participant edits a Week 2 record while the competition is in Week 7, that record still has two active challenges and a maximum of 30, not seven and 80. The same applies to an admin correction made at any later point, and to any recomputation triggered by the nightly job. Scoring functions take `entryDate` and derive `weekNo` from it; they never read the current date.

This is the most likely place for a scoring bug, so section 4.8 includes a test for it.

### 4.3 Points per challenge

| Type | Rule | Max |
| --- | --- | --- |
| Quantitative | `min(floor(value / unit), 10)` | 10 |
| Yes/No | Yes = 10, No = 0 | 10 |
| No input | 0 | |

Units: water 0.25 L per point, steps 1,000 per point, sleep 1 hour per point.

### 4.4 Diet

Active every day from Week 1. Five occasions, Breakfast, Mid-morning, Lunch, Evening snack and Dinner, each Yes/No worth 2 points. Maximum 10. Part of the ordinary score, not a bonus and not a tie-breaker (V6 section 9).

### 4.5 Daily

```
lifestyleMax    = activeChallenges * 10
lifestyleEarned = sum of per-challenge points
dietMax         = 10
dietEarned      = 2 * (occasions marked Yes)

dailyPoints     = lifestyleEarned + dietEarned
maxPoints       = lifestyleMax + dietMax
dailyPercentage = dailyPoints / maxPoints * 100
```

### 4.6 Weekly and final

```
weeklyPercentage = average of that week's 7 daily percentages
finalScore       = sum of the 12 weekly percentages       (max 1,200)
```

Store percentages at 4 decimal places and round only for display. Rounding at each step makes the exports disagree with the screen.

### 4.7 Daily maxima

| Week | Active | Lifestyle | Diet | Daily max |
| --- | --- | --- | --- | --- |
| 1 | 1 | 10 | 10 | 20 |
| 2 | 2 | 20 | 10 | 30 |
| 3 | 3 | 30 | 10 | 40 |
| 4 | 4 | 40 | 10 | 50 |
| 5 | 5 | 50 | 10 | 60 |
| 6 | 6 | 60 | 10 | 70 |
| 7 | 7 | 70 | 10 | 80 |
| 8 | 8 | 80 | 10 | 90 |
| 9 | 9 | 90 | 10 | 100 |
| 10 to 12 | 9 | 90 | 10 | 100 |

If BCJ resolves O-1 the other way, Weeks 10 to 12 become 10, 100, 10, 110.

### 4.8 Test vectors

Write these as unit tests before building any screen.

| # | Week | Inputs | Points / Max | Daily % |
| --- | --- | --- | --- | --- |
| T1 | 1 | water 2.0 L, diet 5/5 | 18 / 20 | 90.0000 |
| T2 | 2 | water 2.0 L, steps 7,400, diet 4/5 | 23 / 30 | 76.6667 |
| T3 | 3 | water 3.0 L, steps 8,200, C3 Yes, diet 4/5 | 36 / 40 | 90.0000 |
| T4 | 7 | water 2.5 L, steps 10,500, C3 Y, C4 Y, C5 Y, C6 No, sleep 7.5 h, diet 5/5 | 67 / 80 | 83.7500 |
| T5 | 10 | all nine at full marks, diet 5/5 | 100 / 100 | 100.0000 |
| T6 | 4 | no record, deadline passed | 0 / 50 | 0.0000 |
| T7 | 1 | water 0.249 L, diet 0/5 | 0 / 20 | 0.0000 |
| T8 | 2 | water 2.0 L, steps 999, diet 5/5 | 18 / 30 | 60.0000 |
| T9 | 2 | a Week 2 record scored while the competition is in Week 7. Water 2.0 L, steps 7,400, diet 4/5 | 23 / 30 | 76.6667 |

T2 and T3 are taken from the worked examples in V5 section 9.

T9 exists because the active set must come from the entry's own date. If the function reads the current date instead, this case returns 23 / 80 and the participant is scored against seven challenges they had not yet been given.

Also test that a date before the start date is rejected, that a second record for the same participant and date is impossible, and that an admin correction recomputes the day, the week and the final score together.

---

## 5. Screens

### 5.1 Participant

| Route | Purpose |
| --- | --- |
| `/` | Programme overview and register link |
| `/register` | Registration form, section 10 field list |
| `/register/success` | Displays the registration ID on screen and confirms it has been emailed |
| `/login` | Single field for the registration ID |
| `/login/recover` | Enter an email address, receive all IDs registered against it |
| `/app` | Today. Active challenges, inputs, daily score, maximum and percentage |
| `/app/history` | Own past days, editable inside the correction window |
| `/app/progress` | Own weekly percentages and final score to date |
| `/app/leaderboard` | Rank, display name, final score, final percentage |
| `/app/plan` | Own diet category and plan, V5 section 6 |
| `/app/profile` | Own contact details |

`/app` follows V6 section 6: profile and approved diet category, current challenge week, all active lifestyle challenges, water, steps and sleep inputs, Yes/No behaviour inputs, five diet inputs, automatic daily score, maximum and percentage, weekly progress, final score, and submission status.

Every participant route is scoped to the signed-in participant. The server derives the participant from the session cookie and never from a URL parameter or request body.

### 5.2 Admin

| Route | Purpose |
| --- | --- |
| `/admin` | Registrations, today's submission count, averages |
| `/admin/participants` | Register and activate participants, assign diet category |
| `/admin/participants/[id]` | Daily records and progress for one participant |
| `/admin/entries` | Day view across participants |
| `/admin/entries/[id]/edit` | Correct verified inputs. Scores recompute and are never edited directly |
| `/admin/settings` | Start date, submission deadline, correction window |
| `/admin/exports` | Daily, weekly and final results as CSV, XLSX and PDF |
| `/admin/audit` | Audit history |
| `/admin/accounts` | Super admin accounts. Invite, disable, revoke sessions |
| `/admin/security` | Own TOTP enrolment, recovery codes, active sessions |

---

## 6. Tech stack

| Layer | Choice | Note |
| --- | --- | --- |
| Framework | Next.js 15, App Router, TypeScript | Client requirement |
| Styling | Tailwind CSS v4 | shadcn/ui's current target |
| Components | shadcn/ui | Client requirement |
| Database | PostgreSQL 16+ | Client requirement |
| ORM | Drizzle ORM | Prisma is a workable alternative |
| Sessions | `jose` signed cookies plus a `sessions` table | No auth library needed. Participants sign in with a code, admins with email and password |
| Password hashing | `@node-rs/argon2` | Admin accounts only |
| Two-factor | `otpauth` | TOTP for admin accounts, mandatory |
| Secret encryption | Node `crypto` AES-256-GCM | Encrypts the stored TOTP secret |
| Validation | Zod | One schema for form, server action and insert |
| Forms | react-hook-form | shadcn's form component is built on it |
| Tables | TanStack Table | Admin lists |
| Charts | Recharts via shadcn `chart` | Weekly progress |
| Dates | date-fns | |
| CSV export | Hand-written, no dependency | |
| XLSX export | `exceljs` | |
| PDF export | `@react-pdf/renderer` | Renders on the server without a browser binary |
| Email | Resend | Registration ID delivery and recovery |
| Scheduled job | Vercel Cron | One nightly job, section 7.2 |
| Tests | Vitest | Section 4.8 vectors |

Better Auth and Auth.js were considered and dropped. Both are built around passwords, OAuth and email verification flows, none of which this application uses. A `sessions` table and a signed cookie are less code.

Hosting: Vercel with a managed Postgres such as Neon or Supabase, unless O-12 requires the data to stay in Saudi Arabia, in which case a VM with Docker and Postgres in the same region. Either way, run nightly backups and test a restore before launch. Self-reported daily entries cannot be reconstructed if they are lost.

---

## 7. Database schema

Flat structure. One row per participant per day, one column per input, matching the field list in V6 section 10 and V5 section 13.

There is no `users` table. Because the registration ID is the credential and one email may register several participants, email is a non-unique column on `participants`.

```sql
-- ---------- competition settings, single row ----------
CREATE TABLE settings (
  id                  int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  start_date          date NOT NULL,
  total_weeks         int  NOT NULL DEFAULT 12,
  max_active_week     int  NOT NULL DEFAULT 9,        -- O-1
  timezone            text NOT NULL DEFAULT 'Asia/Riyadh',
  submission_cutoff   time NOT NULL DEFAULT '23:59',  -- O-4
  correction_days     int  NOT NULL DEFAULT 3,        -- O-4
  missing_scores_zero boolean NOT NULL DEFAULT true,  -- O-3
  rules_locked        boolean NOT NULL DEFAULT false
);
```

`rules_locked` implements V6 section 8, which forbids changing scoring rules during the competition without formal approval. Once it is true, `start_date`, `total_weeks` and `max_active_week` become read-only.

```sql
-- ---------- admin accounts ----------
CREATE TABLE admins (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email              citext NOT NULL UNIQUE,
  name               text NOT NULL,
  password_hash      text,                    -- null until the invite is accepted
  totp_secret_enc    bytea,                   -- AES-GCM, key from TOTP_ENCRYPTION_KEY
  totp_enrolled_at   timestamptz,
  recovery_codes     text[] NOT NULL DEFAULT '{}',  -- argon2id hashes, single use
  status             text NOT NULL DEFAULT 'invited', -- invited | active | disabled
  invite_token_hash  text,
  invite_expires_at  timestamptz,
  failed_attempts    int NOT NULL DEFAULT 0,
  locked_until       timestamptz,
  last_login_at      timestamptz,
  last_login_ip      inet,
  created_at         timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES admins(id)
);

-- ---------- diet categories, V5 section 6 ----------
CREATE TABLE diet_categories (
  id         serial PRIMARY KEY,
  code       text NOT NULL UNIQUE,  -- kids_10_17 | kg_50_60 | kg_60_75 | kg_75_90 | kg_90_plus
  title      text NOT NULL,
  min_age    int, max_age int,
  min_weight numeric(5,2), max_weight numeric(5,2),
  plan       text
);

-- ---------- participants ----------
CREATE SEQUENCE participant_seq START 1;

CREATE TABLE participants (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id    text NOT NULL UNIQUE,   -- 'BCJ0001-7K2M', generated in a server action
  seq_no             int  NOT NULL DEFAULT nextval('participant_seq'),
  email              citext NOT NULL,        -- deliberately NOT unique, O-7
  full_name          text NOT NULL,
  display_name       text NOT NULL,
  mobile             text NOT NULL,
  age                int  NOT NULL,
  gender             text NOT NULL,          -- male | female
  area_of_residence  text NOT NULL,
  residence_status   text NOT NULL,          -- bachelor | family
  height_cm          numeric(5,2),
  weight_kg          numeric(5,2) NOT NULL,  -- required, determines diet category
  starting_weight_kg numeric(5,2),           -- O-10
  diet_category_id   int REFERENCES diet_categories(id),
  status             text NOT NULL DEFAULT 'pending',  -- pending | active | withdrawn
  registered_at      timestamptz NOT NULL DEFAULT now(),
  extra              jsonb NOT NULL DEFAULT '{}'       -- form pages 2 to 7, O-8
);

CREATE INDEX ON participants (email);
CREATE INDEX ON participants (status);

-- health fields kept separate, admin only
CREATE TABLE participant_health (
  participant_id  uuid PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
  blood_group     text,
  blood_pressure  text,
  diabetes_status text,     -- no | diagnosed | not_sure
  blood_sugar     text
);

-- ---------- sessions ----------
CREATE TABLE sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id uuid REFERENCES participants(id) ON DELETE CASCADE,
  admin_id       uuid REFERENCES admins(id) ON DELETE CASCADE,
  expires_at     timestamptz NOT NULL,        -- absolute: 8 h for admins
  idle_expires_at timestamptz,                -- admins only: 30 min, extended on activity
  ip             inet,
  user_agent     text,
  revoked_at     timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(participant_id, admin_id) = 1)
);

CREATE INDEX ON sessions (expires_at);
CREATE INDEX ON sessions (admin_id) WHERE admin_id IS NOT NULL;
```

A session is valid only when `revoked_at IS NULL`, `now() < expires_at`, and, for admin sessions, `now() < idle_expires_at`. Deleting rows is not enough on its own, because a revoked session must stay visible in the admin's own session list until it expires.

The `seq_no` column keeps the readable ordinal used in the registration ID and in sorting. `registration_id` is generated in a server action as `'BCJ' || lpad(seq_no, 4, '0') || '-' || random4()`, where `random4()` draws four characters from a set that excludes `0`, `O`, `1`, `I` and `L`. The `UNIQUE` constraint catches any collision.

```sql
-- ---------- one record per participant per date ----------
CREATE TABLE daily_entries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_id   uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  entry_date       date NOT NULL,
  week_no          int  NOT NULL,

  water_litres     numeric(5,2) CHECK (water_litres >= 0),
  steps            int          CHECK (steps >= 0),
  sleep_hours      numeric(4,2) CHECK (sleep_hours >= 0),

  c3_cook_at_home  boolean,
  c4_no_sugary     boolean,
  c5_vegetables    boolean,
  c6_no_late_food  boolean,
  c8_mindfulness   boolean,
  c9_screen_time   boolean,

  breakfast        boolean,
  mid_morning      boolean,
  lunch            boolean,
  evening_snack    boolean,
  dinner           boolean,

  daily_points     int,
  max_points       int,
  daily_percentage numeric(9,4),

  status           text NOT NULL DEFAULT 'draft',  -- draft | submitted | locked | missing
  submitted_at     timestamptz,
  computed_at      timestamptz,

  UNIQUE (participant_id, entry_date)
);

CREATE INDEX ON daily_entries (entry_date);
CREATE INDEX ON daily_entries (participant_id, week_no);

CREATE TABLE weekly_scores (
  participant_id uuid NOT NULL REFERENCES participants(id) ON DELETE CASCADE,
  week_no        int  NOT NULL,
  percentage     numeric(9,4) NOT NULL,
  days_counted   int  NOT NULL,
  computed_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (participant_id, week_no)
);

CREATE TABLE final_scores (
  participant_id   uuid PRIMARY KEY REFERENCES participants(id) ON DELETE CASCADE,
  final_score      numeric(10,4) NOT NULL,
  final_percentage numeric(6,3)  NOT NULL,
  computed_at      timestamptz NOT NULL DEFAULT now()
);

-- ---------- audit history, V5 section 12 and V6 section 8 ----------
CREATE TABLE audit_log (
  id            bigserial PRIMARY KEY,
  actor_admin_id uuid REFERENCES admins(id),
  actor_participant_id uuid REFERENCES participants(id),
  action        text NOT NULL,
  entity_type   text NOT NULL,
  entity_id     uuid,
  field         text,
  old_value     text,
  new_value     text,
  reason        text,
  ip            inet,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ON audit_log (entity_id, created_at DESC);
```

`audit_log` is append-only. Grant the application role `INSERT` and `SELECT` on it, never `UPDATE` or `DELETE`.

Leaderboard query. The registration ID is not selected, per V6 section 9.

```sql
SELECT RANK() OVER (ORDER BY f.final_score DESC, p.registered_at ASC) AS rank,
       p.display_name, f.final_score, f.final_percentage
FROM final_scores f
JOIN participants p ON p.id = f.participant_id
WHERE p.status = 'active'
ORDER BY rank;
```

The tie-break inside `ORDER BY` is a placeholder until O-5 is answered.

---

## 8. Scoring implementation

### 8.1 Structure

`lib/scoring.ts` is a pure function. It takes the settings, the entry's raw inputs and the date, and returns `dailyPoints`, `maxPoints` and `dailyPercentage`. It performs no database access, so the section 4.8 vectors run as fast unit tests.

`lib/scoring-save.ts` wraps it in a transaction. It writes the three calculated columns on `daily_entries`, recomputes that week's `weekly_scores` row, and recomputes `final_scores`. All three succeed or none do.

All writes go through Server Actions. The client sends raw inputs. No endpoint accepts a point value or a percentage, per V6 section 8. The browser may preview a score using the same pure function for immediate feedback, and the server value replaces the preview on save.

Recomputation runs when a participant submits, when an admin corrects an entry, and when the nightly job marks a day missing.

### 8.2 Nightly job

One cron run per day, after the cutoff, in the settings timezone.

1. For each active participant with no submitted entry for a past scorable date, insert a `missing` entry with null inputs.
2. Score those days at 0%, if `missing_scores_zero` is true.
3. Lock entries older than the correction window.
4. Recompute the affected weekly and final scores.

---

## 9. Design

### 9.1 Palette

The palette is built for a health and fitness product rather than a corporate site. Two things drive it.

First, the primary green is a fresh emerald rather than a forest green. BCJ's published theme colour, `#023223`, is very dark and low in saturation. It works as an institutional brand mark and looks heavy on a screen a participant opens every day to log water and steps. It is kept as `green-900`, so it still anchors headers, dark surfaces and the dark theme, and the interactive range of the scale is shifted lighter and more saturated.

Second, every tracked metric gets its own hue, chosen so the colour matches what is being measured. This is the convention across health apps and it means a participant reading a chart does not have to consult a legend.

**Primary, vitality green**

| Token | Hex | OKLCH |
| --- | --- | --- |
| `green-50` | `#EBFAF2` | `oklch(0.9718 0.0190 162.94)` |
| `green-100` | `#CFF3E1` | `oklch(0.9335 0.0445 163.83)` |
| `green-200` | `#A0E7C6` | `oklch(0.8719 0.0847 164.00)` |
| `green-300` | `#63D5A3` | `oklch(0.7931 0.1277 162.48)` |
| `green-400` | `#2FBC82` | `oklch(0.7080 0.1453 160.60)` |
| `green-500` | `#12A06A` | `oklch(0.6244 0.1375 160.02)` |
| `green-600` | `#0B8256` | `oklch(0.5367 0.1178 160.45)` |
| `green-700` | `#086543` | `oklch(0.4488 0.0970 161.10)` |
| `green-800` | `#064B33` | `oklch(0.3666 0.0761 163.00)` |
| `green-900` | `#023223` | `oklch(0.2821 0.0566 166.36)` — BCJ brand colour |
| `green-950` | `#011C13` | `oklch(0.2019 0.0392 168.11)` |

**Metric hues**

| Metric | Token | Hex | OKLCH |
| --- | --- | --- | --- |
| Water, C1 | `metric-water` | `#06B6D4` | `oklch(0.7148 0.1257 215.22)` |
| Steps, C2 | `metric-steps` | `#F97316` | `oklch(0.7049 0.1867 47.60)` |
| Sleep, C7 | `metric-sleep` | `#6366F1` | `oklch(0.5854 0.2041 277.12)` |
| Diet | `metric-nutrition` | `#22C55E` | `oklch(0.7227 0.1920 149.58)` |
| Mindfulness and screen time, C8 and C9 | `metric-mind` | `#A78BFA` | `oklch(0.7090 0.1592 293.54)` |
| Health baseline fields, admin only | `metric-vitals` | `#F43F5E` | `oklch(0.6450 0.2154 16.44)` |

Cyan for water, orange for movement, indigo for sleep and violet for mental rest are the associations a participant already brings with them. `metric-vitals` marks blood pressure, blood sugar and blood group in admin screens, so those fields are visually separated from performance data.

**Score bands**

The daily progress ring and the weekly bars run through a four-step spectrum rather than a single colour. A participant sees the direction of their score before they read the number.

| Daily percentage | Token | Hex |
| --- | --- | --- |
| 0 to 49 | `band-low` | `#EF4444` |
| 50 to 69 | `band-mid` | `#F59E0B` |
| 70 to 84 | `band-good` | `#84CC16` |
| 85 to 100 | `band-high` | `#22C55E` |

**Accent and semantic**

Gold marks the top three leaderboard positions only: `gold-50 #FDF7E7`, `gold-300 #EFCB6A`, `gold-500 #D4A017`, `gold-700 #8A6408`.

Semantic colours: `success #22C55E`, `warning #F59E0B`, `danger #DC2626`, `info #06B6D4`. `success` and `info` deliberately reuse the nutrition and water hues, so the palette does not carry two nearly identical greens or two nearly identical blues.

**Neutrals**

A near-neutral grey with a slight green cast, so it sits with the primary rather than fighting it.

| Token | Hex | Token | Hex |
| --- | --- | --- | --- |
| `n-50` | `#F7FAF9` | `n-500` | `#6B7B74` |
| `n-100` | `#EFF3F1` | `n-600` | `#4E5C56` |
| `n-200` | `#E2E8E5` | `n-700` | `#3A4640` |
| `n-300` | `#CBD5D0` | `n-800` | `#232C28` |
| `n-400` | `#9AA8A2` | `n-900` | `#161C19` |
| | | `n-950` | `#0A0E0C` |

### 9.2 Contrast

Measured ratios for every pair the interface uses.

| Pair | Ratio | Result |
| --- | --- | --- |
| White on `green-600` | 4.84 : 1 | Passes AA |
| White on `green-700` | 7.11 : 1 | Passes AA |
| White on `green-500` | 3.35 : 1 | Large text only |
| `green-700` on white | 7.11 : 1 | Passes AA |
| `green-600` on white | 4.84 : 1 | Passes AA |
| `n-900` on `metric-water` | 7.12 : 1 | Passes AA |
| White on `metric-water` | 2.43 : 1 | Fails, do not use |
| `n-900` on `metric-steps` | 6.17 : 1 | Passes AA |
| White on `metric-sleep` | 4.47 : 1 | Large text only |
| `n-900` on `metric-nutrition` | 7.59 : 1 | Passes AA |
| `n-900` on `metric-mind` | 6.35 : 1 | Passes AA |
| `n-900` on `band-low` | 4.60 : 1 | Passes AA |
| `n-900` on `band-mid` | 8.05 : 1 | Passes AA |
| `n-900` on `band-good` | 8.75 : 1 | Passes AA |
| White on `danger #DC2626` | 4.83 : 1 | Passes AA |
| White on `gold-500` | 2.38 : 1 | Fails, do not use |
| `green-950` on `gold-500` | 7.51 : 1 | Passes AA |
| `n-600` on white | 7.03 : 1 | Passes AA |
| `n-500` on white | 4.46 : 1 | Large text only |
| `n-900` on `n-50` | 16.47 : 1 | Passes AA |
| `green-300` on `green-900` | 7.81 : 1 | Passes AA, dark mode |
| `green-200` on `green-950` | 12.53 : 1 | Passes AA, dark mode |

Rules that follow from the measurements:

- Primary buttons use `green-600`. `green-500` is for charts, borders and large display type.
- The metric hues are fill and stroke colours for rings, bars and lines. They are not button backgrounds. Where text must sit on one, it is `n-900`, never white.
- `metric-water` in particular fails badly with white text, at 2.43 : 1. For a filled water control that needs a label, use `#0E7490`, which reaches 5.36 : 1 with white.
- `band-low` is a ring fill. Destructive buttons use `danger #DC2626`, which passes with white text.
- `muted-foreground` is `n-600`, not `n-500`. `n-500` sits just under the threshold at 4.46 : 1 and is for large text and non-essential detail only.
- Gold and amber always carry dark text.

### 9.3 shadcn/ui tokens, Tailwind v4

```css
@layer base {
  :root {
    --radius: 0.625rem;
    --background:             oklch(1 0 0);
    --foreground:             oklch(0.2191 0.0107 163.80);  /* n-900   */
    --card:                   oklch(1 0 0);
    --card-foreground:        oklch(0.2191 0.0107 163.80);
    --popover:                oklch(1 0 0);
    --popover-foreground:     oklch(0.2191 0.0107 163.80);
    --primary:                oklch(0.5367 0.1178 160.45);  /* green-600 */
    --primary-foreground:     oklch(0.9826 0.0034 174.48);
    --secondary:              oklch(0.9718 0.0190 162.94);  /* green-50  */
    --secondary-foreground:   oklch(0.4488 0.0970 161.10);  /* green-700 */
    --accent:                 oklch(0.9765 0.0220 89.79);   /* gold-50   */
    --accent-foreground:      oklch(0.5287 0.1065 81.73);   /* gold-700  */
    --muted:                  oklch(0.9606 0.0050 165.01);  /* n-100     */
    --muted-foreground:       oklch(0.4608 0.0199 167.73);  /* n-600     */
    --destructive:            oklch(0.5771 0.2152 27.33);   /* #DC2626   */
    --destructive-foreground: oklch(0.9826 0.0034 174.48);
    --border:                 oklch(0.9256 0.0076 164.93);  /* n-200     */
    --input:                  oklch(0.9256 0.0076 164.93);
    --ring:                   oklch(0.6244 0.1375 160.02);  /* green-500 */

    /* metric hues */
    --chart-1: oklch(0.7148 0.1257 215.22);  /* water     */
    --chart-2: oklch(0.7049 0.1867 47.60);   /* steps     */
    --chart-3: oklch(0.5854 0.2041 277.12);  /* sleep     */
    --chart-4: oklch(0.7227 0.1920 149.58);  /* nutrition */
    --chart-5: oklch(0.7090 0.1592 293.54);  /* mind      */

    /* score bands */
    --band-low:  oklch(0.6368 0.2078 25.33);
    --band-mid:  oklch(0.7686 0.1647 70.08);
    --band-good: oklch(0.7681 0.2044 130.85);
    --band-high: oklch(0.7227 0.1920 149.58);
  }

  .dark {
    --background:           oklch(0.2019 0.0392 168.11);  /* green-950 */
    --foreground:           oklch(0.9718 0.0190 162.94);
    --card:                 oklch(0.2821 0.0566 166.36);  /* green-900 */
    --card-foreground:      oklch(0.9718 0.0190 162.94);
    --popover:              oklch(0.2821 0.0566 166.36);
    --popover-foreground:   oklch(0.9718 0.0190 162.94);
    --primary:              oklch(0.7931 0.1277 162.48);  /* green-300 */
    --primary-foreground:   oklch(0.2019 0.0392 168.11);
    --secondary:            oklch(0.3666 0.0761 163.00);  /* green-800 */
    --secondary-foreground: oklch(0.9335 0.0445 163.83);
    --accent:               oklch(0.5287 0.1065 81.73);
    --accent-foreground:    oklch(0.9765 0.0220 89.79);
    --muted:                oklch(0.3666 0.0761 163.00);
    --muted-foreground:     oklch(0.8719 0.0847 164.00);  /* green-200 */
    --destructive:          oklch(0.5771 0.2152 27.33);
    --destructive-foreground: oklch(0.9826 0.0034 174.48);
    --border:               oklch(0.3666 0.0761 163.00);
    --input:                oklch(0.3666 0.0761 163.00);
    --ring:                 oklch(0.7080 0.1453 160.60);  /* green-400 */
  }
}
```

`--radius: 0.625rem` is the shadcn default and is left unchanged. The metric hues are exposed as `--chart-1` to `--chart-5` so the shadcn chart wrapper picks them up without extra configuration, and the four score bands are separate variables because they are applied by value rather than by series.

### 9.4 Fonts

Inter for the interface, JetBrains Mono for registration IDs. Both are loaded through `next/font/google`, which downloads the files at build time and serves them from the application's own origin, so there is no runtime request to Google.

```ts
// app/fonts.ts
import { Inter, JetBrains_Mono } from 'next/font/google';

export const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-sans',
  display: 'swap',
});

export const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
});
```

Inter has tabular figures, which keeps leaderboard columns aligned and stops the point counter from changing width as digits change.

```css
.tabular { font-variant-numeric: tabular-nums; }
```

Apply it to every score, percentage, point counter, rank and step count.

JetBrains Mono is used wherever a registration ID appears, so that `0` and `O`, and `1` and `l`, are distinguishable when a participant reads the code back over the phone.

Type scale: 12, 14, 16, 20, 24, 32 and 48 px. Body text is 16 px. The daily percentage displays at 48 px.

### 9.5 Component notes

- The form grows as the weeks pass. In Week 1 a participant fills one lifestyle input and five diet toggles. From Week 9 onwards it is nine and five, every day, for the rest of the competition. Group the lifestyle challenges under two headings, `New this week` and `Continuing`, with the new challenge first and briefly explained. From Week 10, when nothing new unlocks, the heading becomes `All challenges` and the screen states that Weeks 10 to 12 repeat the full set.
- Do not pre-fill any input from the previous day. Carrying yesterday's values forward would make a long form quicker to complete, and it would also let a participant submit without reading anything, which inflates scores and defeats the integrity rules in V6 section 8. Every day starts empty.
- Each challenge row carries its metric hue from section 9.1 on the icon and the small progress bar, so water, steps, sleep and diet stay identifiable across the log screen, the history calendar and the charts.
- Water, steps and sleep use number inputs with plus and minus buttons stepping by 250 ml, 1,000 steps and 0.5 hours. These are the same increments as one point, so the point counter moves by one per tap. The conversion is shown live, for example "2.25 L = 9 points".
- Yes/No challenges use two buttons with neither selected by default. An untouched control looks different from an explicit No, even though both score zero.
- Diet is five rows, each with the meal name and a Yes/No control, with a running total out of 10.
- The daily score shows the percentage large at the top with points over maximum beneath, as V6 section 6 requires. The surrounding ring is filled with the score band from section 9.1, so the colour and the number agree.
- Submission status is a banner showing draft, submitted or locked, with the deadline.
- The registration ID is displayed on `/register/success` in monospace with a copy button.
- Touch targets are at least 44 px. Focus rings use `--ring`. The score is always shown as a number and never carried by colour alone.

---

## 10. Registration fields

Page 1 of 7 of the Google Form, read 30 August 2026. Pages 2 to 7 render client-side and could not be retrieved. See O-8.

| Field | Type | Required | Column |
| --- | --- | --- | --- |
| Full Name | text | yes | `participants.full_name` |
| Mobile No. | text | yes | `participants.mobile` |
| Age | number | yes | `participants.age` |
| Gender | Male / Female | yes | `participants.gender` |
| Area of Residence | text | yes | `participants.area_of_residence` |
| Height | number | no | `participants.height_cm` |
| Weight | number | no, make required | `participants.weight_kg` |
| Blood Group | A+ A- B+ B- AB+ AB- O+ O- | no | `participant_health.blood_group` |
| Blood Pressure | text | no | `participant_health.blood_pressure` |
| Diabetes / Sugar | No / Yes-Diagnosed / Not Sure | no | `participant_health.diabetes_status` |
| Blood Sugar Reading | text | no | `participant_health.blood_sugar` |
| Starting Weight | number | no | `participants.starting_weight_kg`, O-10 |
| Registration Date | date | no | `participants.registered_at`, server-set |
| Residence Status | Bachelor / Family | yes | `participants.residence_status` |
| Email | not on the form | yes | `participants.email`, O-7 |

Weight is made required because it determines the diet category in V5 section 6, which the site assigns at registration.

---

## 11. Integrity and privacy

From V5 section 12 and V6 section 8:

- Unique participant ID. One record per participant per date, enforced by the `UNIQUE` constraint.
- Duplicate submissions prevented by that constraint plus `ON CONFLICT DO UPDATE`.
- Numeric inputs validated as non-negative, in Zod at the boundary and by `CHECK` constraints in the database.
- All scoring server-side. No endpoint accepts a calculated value.
- Audit history of edits recording actor, timestamp, old value, new value and a required reason.
- Submission deadline and correction window configurable in settings.
- Admin export of daily, weekly and final results.
- Scoring rules locked once the competition starts, through `rules_locked`.

Additional to those documents:

- Participant sign-in is rate limited to five attempts per IP per minute. This matters more than usual because the registration ID is the only credential.
- The registration ID is unguessable, per section 2.2.
- Admin accounts require a password and a TOTP code on every sign-in, with lockout, short sessions and re-authentication for sensitive actions. See section 2.3.
- Security headers on every response: `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: same-origin`, and a Content-Security-Policy without `unsafe-inline`. `/admin` also sends `X-Robots-Tag: noindex`.
- Health fields, meaning blood pressure, diabetes status, blood sugar and blood group, are stored in a separate table, visible to super admins only, and never appear on the leaderboard or in participant-facing exports. See O-12 on hosting location.

---

## 12. Build phases

| Phase | Scope | Done when |
| --- | --- | --- |
| P0 | O-1, O-2, O-3, O-4, O-5, O-7 and O-13 answered. Full form contents supplied | Answers in writing |
| P1 | Next.js, Tailwind and shadcn scaffold. Schema and migrations. Sessions. Admin password, TOTP, invites and lockout. Palette and fonts | An admin signs in with password and TOTP, a second admin is invited and enrols, and a participant signs in with a code |
| P2 | `lib/scoring.ts` and the section 4.8 tests | All vectors pass |
| P3 | Registration, ID generation, ID email, recovery flow, admin approval | A family of four registers from one email and receives four IDs |
| P4 | Daily entry screen, history, editing inside the window | A participant completes a full week |
| P5 | Admin participants, corrections with audit, settings | A correction updates day, week and final score together |
| P6 | Leaderboard, CSV, XLSX and PDF exports, nightly job | Exports match the screen exactly |
| P7 | Backup and restore test, security pass, UAT with about 20 community members | Sign-off. The security pass covers admin lockout, session revocation, re-authentication, and confirms no participant route can reach another participant's data |

Build P2 before P3 and P4.

---

## 13. Environment

```
DATABASE_URL=
SESSION_SECRET=
TOTP_ENCRYPTION_KEY=          # 32 bytes, base64. Encrypts admin TOTP secrets
TOTP_ISSUER=BCJ Challenge     # label shown in the authenticator app
NEXT_PUBLIC_APP_URL=
RESEND_API_KEY=
EMAIL_FROM=
CRON_SECRET=
ADMIN_IP_ALLOWLIST=           # optional, comma separated, blank disables the check
```

`TOTP_ENCRYPTION_KEY` is held only in the environment. If it is stored in the database or committed to the repository, encrypting the TOTP secrets achieves nothing.

Run nightly backups with a tested restore before launch, and alert if the nightly job fails. A silent failure means missing days are never scored.

---

## Appendix A. Challenge configuration

| Ref | Challenge | Type | Rule | Activates |
| --- | --- | --- | --- | --- |
| C1 | Drink 2–3 L of water daily | Quantitative | 250 ml = 1 point, cap 10 | Week 1 |
| C2 | Hit 8,000–10,000 steps daily | Quantitative | 1,000 steps = 1 point, cap 10 | Week 2 |
| C3 | Cook all meals at home | Yes/No | Yes = 10, No = 0 | Week 3 |
| C4 | No sugary drinks | Yes/No | Yes = 10, No = 0 | Week 4 |
| C5 | Eat vegetables with every main meal | Yes/No | Yes = 10, No = 0 | Week 5 |
| C6 | No eating after 8 PM | Yes/No | Yes = 10, No = 0 | Week 6 |
| C7 | Sleep at least 7–8 hours per night | Quantitative | 1 hour = 1 point, cap 10 | Week 7 |
| C8 | 10 minutes of mindfulness or breathing | Yes/No | Yes = 10, No = 0 | Week 8 |
| C9 | Limit screen time before bed | Yes/No | Yes = 10, No = 0 | Week 9 |

Diet occasions, 2 points each, active every day: Breakfast, Mid-morning, Lunch, Evening snack, Dinner.

Diet categories from V5 section 6, pending O-11: Kids 10 to 17 years, 50–60 kg, 60–75 kg, 75–90 kg, 90 kg and above.

## Appendix B. shadcn/ui components

```bash
npx shadcn@latest add \
  button card input label select checkbox switch textarea form \
  badge avatar separator tabs dialog sheet dropdown-menu \
  alert alert-dialog sonner table skeleton progress \
  calendar popover tooltip toggle-group chart pagination sidebar
```

`toggle-group` is the Yes/No control. `input-otp` is not needed, since there is no OTP.
