# Performance review

Measured 31 August 2026 against the live local database.

## The headline: the app is not slow — `next dev` is

The same routes, same database, same machine, warm (second request):

| Route | `next dev` | `next build && next start` | Difference |
| --- | --- | --- | --- |
| `/admin` | 2.63 s | **0.032 s** | 82× |
| `/admin/participants` | 1.19 s | **0.031 s** | 38× |
| `/admin/audit` | 2.40 s | **0.067 s** | 36× |
| `/admin/leaderboard` | 0.40 s | **0.027 s** | 15× |
| `/admin/entries` | 0.21 s | **0.023 s** | 9× |
| `/admin/settings` | 0.17 s | **0.017 s** | 10× |
| `/app/leaderboard` | — | **0.003 s** | — |

Every production response is **17–67 ms**. Nothing here is slow.

`next dev` compiles each route on demand, ships an unminified React
development build, generates source maps and re-checks modules on every
request. It is a development tool and is *expected* to feel sluggish. **Judge
speed with `npm run build && npm start`, never with `npm run dev`.**

The database is not a factor either. Measured with `EXPLAIN ANALYZE`:

| Query | Execution time |
| --- | --- |
| participant status counts (`/admin` tiles) | 0.088 ms |
| audit list, 100 rows with two joins | 0.373 ms |

Current volumes: 6 participants, 322 daily entries, 251 audit rows.

## Real improvements worth making anyway

These are genuine inefficiencies. None of them explain the sluggishness above,
but each is worth fixing before the roster grows.

### 1. Every admin page does its session work twice — including two writes

`src/app/admin/layout.tsx` calls `getAdminSession()` then
`touchAdminSession()`. The page inside it then calls `requireAdmin()`
(`src/lib/auth/guards.ts`), which calls both again. So every admin page view
runs:

- 2 × `SELECT` on `sessions` joined to `admins`
- 2 × `UPDATE` on `sessions` (extending the idle window)

Two writes per page view is the part that matters — writes take locks and
generate WAL. Fix: wrap `getAdminSession` in React's `cache()` so the read is
deduplicated within a request, and touch the idle window once per request
rather than once per component that asks.

Same duplication exists for participants via `requireParticipant()` in
`src/app/app/layout.tsx` and each page.

### 2. `audit_log` has no index on `created_at`

Present indexes are the primary key and `(entity_id, created_at DESC)`. The
default `/admin/audit` view filters on nothing and does
`ORDER BY created_at DESC LIMIT 100`, so it sorts the whole table.

Irrelevant at 251 rows. But the audit log is the fastest-growing table in the
system — one row per submission, per correction, per sign-in, per health-data
view. A 12-week competition with 200 participants writes at least
200 × 84 ≈ 17,000 rows from submissions alone, before corrections and logins.
Add `CREATE INDEX ON audit_log (created_at DESC)`.

### 3. `/app/progress` ships 306 kB of JavaScript

Recharts is the bulk of it. It is the heaviest route in the app, and it is
participant-facing — the people most likely to be on a mid-range phone on
mobile data. The chart is below the fold. Load it with `next/dynamic` and a
skeleton so the score and the weekly list paint first.

### 4. No loading states

There is no `loading.tsx` anywhere, so a navigation shows nothing until the
server responds. At 30 ms that is invisible in production, but it is the
difference between "instant" and "did my click register?" on a slow connection.
Add `loading.tsx` skeletons for the admin list routes and the participant
screens, reusing the existing `Skeleton` component.

### 5. Data caching for the leaderboard

Every page is `dynamic = "force-dynamic"`, which is **required** — the CSP
nonce cannot be embedded in a prerendered page (see the README note). Pages
therefore cannot be cached, but their *data* can. The leaderboard is identical
for every viewer and changes only when someone submits; wrapping
`getLeaderboard()` in `unstable_cache` with a short revalidate, invalidated by
the existing `revalidatePath` calls, would remove that query from every view.

Lower value than 1–4, and it adds a staleness question. Worth doing only if the
leaderboard becomes hot.

## What was done, 31 August 2026

| Change | Effect |
| --- | --- |
| `next dev --turbopack` is now the default dev script | `/admin` warm **2.63 s → 0.21 s** in development |
| `getAdminSession`, `getParticipantSession` and `touchAdminSession` wrapped in React `cache()` | One session read and **one** UPDATE per request instead of two of each |
| `loading.tsx` for 11 routes, with skeletons mirroring each layout | Navigation feels answered immediately |
| `audit_log` index on `created_at DESC`, and the existing entity index realigned | At 30,000 rows: **3.430 ms → 0.045 ms** — see below |
| Weekly chart loaded with `next/dynamic` | `/app/progress` First Load JS **306 kB → 194 kB** |

### The index null-ordering trap

Adding the index was not enough. Drizzle's column `.desc()` **inside `index()`**
emits `DESC NULLS LAST`, while the query helper `desc()` emits a plain `DESC`,
which in Postgres means `NULLS FIRST`. Postgres will not use an index whose null
ordering differs from the sort — even on a `NOT NULL` column. Measured on 30,000
synthetic rows:

| `ORDER BY` | Plan | Time |
| --- | --- | --- |
| `created_at DESC` (what the app emits) against a `NULLS LAST` index | Seq Scan + Sort | 3.430 ms |
| `created_at DESC NULLS LAST` against the same index | Index Scan | 0.026 ms |

Both audit indexes are now declared with raw `sql\`${t.createdAt} DESC\`` so they
match what the queries actually emit. **Any future index on a descending column
must do the same**, or it will be silently dead weight.

## Still open

- **Leaderboard data caching** — `unstable_cache` around `getLeaderboard()`.
  Not done: it adds a staleness question and the query is not hot yet.
- **Pagination for `/admin/entries`** — currently renders every active
  participant for a day. Fine at 6; worth revisiting past ~200.

## How to re-measure

```bash
npm run build && npm start          # never measure with npm run dev
# then, with an admin session cookie:
curl -s -o /dev/null -w "%{time_total}\n" -b "bcj_admin_session=$TOK" http://localhost:3000/admin
```

For query-level timing, `EXPLAIN ANALYZE` the statement directly in psql.
