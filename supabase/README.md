# Supabase setup

The app writes every registration to Supabase (system of record) after saving it
instantly on the device (`localStorage`). If the network is down the record stays
in the device's outbox and syncs automatically when it's back.

## One-time setup (~10 minutes)

1. **Create the schema.** Supabase Dashboard -> *SQL Editor* -> *New query* -> paste
   all of [`migrations/0001_init.sql`](migrations/0001_init.sql) -> *Run*, then the same for
   [`migrations/0002_quiz_answers.sql`](migrations/0002_quiz_answers.sql) (one row per quiz question, filled
   automatically), then [`migrations/0003_destination_order.sql`](migrations/0003_destination_order.sql)
   (`destination_1/2/3` = the visitor's first, second and third country pick). All are safe to re-run.
2. **Create staff logins.** *Authentication* -> *Users* -> *Add user* -> *Create new user*
   (email + password, tick *Auto Confirm User*). One per staff member / stall device.
3. **Allowlist them.** Easiest and typo-proof: allowlist every user that exists in Authentication
   (run this only while all your Auth users are staff), then check the result:
   ```sql
   insert into public.staff_allowlist (email) select lower(email) from auth.users on conflict do nothing;
   select * from public.staff_allowlist;
   ```
   (Or by hand: `insert into public.staff_allowlist (email) values ('staff1@example.com');` — the email must
   match the Auth user exactly. A placeholder like `you@example.com` allowlists nobody.)
   Only allowlisted emails can read registrations, even if someone else somehow gets an account.
   The dashboard login is **email + password only** — there is no OAuth/social/magic-link code in the app.
   In *Authentication -> Sign In / Providers* leave only **Email** enabled (every social provider off).
4. **Turn off public signups.** *Authentication* -> *Sign In / Providers* -> disable
   *Allow new users to sign up* (belt and braces on top of the allowlist).
5. **Vercel env vars.** *Project -> Settings -> Environment Variables*: `SUPABASE_URL` and
   `SUPABASE_ANON_KEY` for **Production and Preview**. The build (`vercel.json` ->
   `scripts/build-config.js`) turns them into `js/generated/config.js`. Redeploy after changing them.
6. **Local dev.** Put the same two variables in `.env.local` (gitignored, see `.env.example`),
   then `npm run build:config` (also runs automatically before `npm run dev`; `npm test` always uses an empty config).

## Security model

- The `anon` key is public by design. It has **no table privileges**; it can only call
  `submit_registration(payload)`, which validates + size-caps input, inserts idempotently
  and runs duplicate detection server-side against all devices' data.
- Staff sign in with email + password (Supabase Auth). `is_staff()` (allowlist) gates
  `SELECT` on `registrations` (RLS) and `resolve_duplicate()`.
- Never put the `service_role` key or DB password in client code, `.env.local`, or git.
- Known residual risk: the public submit endpoint has no rate limiting beyond validation and
  a 64 KB payload cap. If spam appears, add Supabase's CAPTCHA/rate limits.

## Before the event

- Delete rehearsal/test rows: SQL Editor -> `truncate table public.registrations cascade;`
  (`cascade` is required — quiz answers reference registrations; or only the automated test rows:
  `delete from public.registrations where name like 'ZZ TEST%';`)
  (also use the staff dashboard's "Clear local data" on each device to drop local outboxes).
- Sign in once on each stall device's staff dashboard (long-press the logo) to confirm access.

## Verifying the live project

`STAFF_EMAIL=... STAFF_PASSWORD=... npm run verify:live` runs ~77 checks against the real database (anon lockdown,
input validation, idempotent resend, cross-device duplicates, every column read back, quiz answers table,
duplicate resolution). `npm run test:live` drives the real app in a browser against it (full path, grade 9,
offline->online, staff dashboard). Both create rows named `ZZ TEST ...` — delete them afterwards (query above).

## Handy queries

```sql
select count(*) from public.registrations;
select id, name, parent_mobile, duplicate_review_status from public.registrations where duplicate_flag order by created_at desc;
select device_id, count(*) from public.registrations group by 1;   -- per-device counts
select subject, difficulty, count(*) as asked, round(100.0 * avg((is_correct)::int), 1) as pct_correct
  from public.registration_answers where status = 'answered' group by 1, 2 order by 1, 2;   -- quiz performance
```

## Notes (2026-09-30)

- The staff dashboard no longer offers duplicate review actions (information only). `resolve_duplicate()` still exists in the database and is staff-only, but nothing in the app calls it.
- `registration_answers` also snapshots the NEET/JEE guarantee's effect: a NEET-style question shows `topic` beginning `NEET-style:`; `registrations.quiz->>'examFocus'` is `NEET`, `JEE` or `either` when the guarantee applied.

## Dashboard URL settings for the expo domain (2026-10-09)

Authentication -> URL Configuration: **Site URL** `https://expo.pedagogyedn.ae`. **Redirect URLs:** `https://expo.pedagogyedn.ae/**`, `https://pedagogy-sharjah-expo.vercel.app/**`, the Vercel preview pattern (`https://pedagogy-sharjah-expo-*.vercel.app/**`; confirm against a real preview URL), `http://localhost:5500/**`, `http://localhost:5501/**`. The app signs in with email + password only and never sends a redirect URL, so these only matter for Supabase-sent emails (invites, password resets). The REST and Auth APIs have no CORS allowlist to configure. If another site (e.g. the main Pedagogy site) shares this project, changing Site URL affects it too.
