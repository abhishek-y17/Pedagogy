# Pedagogy — Sharjah Education Show interactive stall app

An interactive registration + academic-quiz + lead-capture web experience built for **Pedagogy Educational Services'** stall at the International Education Show, Expo Centre Sharjah, UAE (11–13 October 2026).

Visitors register with real details; 9th/10th graders submit directly from there, while 11th/12th graders (the real qualified NEET/JEE counselling leads) continue on to tell the app about their study destinations and competitive-exam plans, answer a handful of curriculum-filtered academic questions against a pooled timer, and review everything on one screen before submitting — all in service of one goal: real, qualified counselling leads for higher-studies/NEET/exam guidance, not just registration counts or prize entries.

## What it does

- **Registration** — name, date of birth, curriculum and grade/class (Grade 9 and up), mandatory parent/guardian mobile + optional student mobile (each validated to the exact digit count its country code expects, e.g. 9 digits for +971 UAE), a real Terms & Conditions modal with two separate consent checkboxes (T&Cs, and consent-to-contact covering WhatsApp/Business API messaging), and a school-name autocomplete against a real 518-school dataset (Dubai/Abu Dhabi/Sharjah) that auto-fills curriculum and skips the manual curriculum question when possible. Every field shows a live inline error once touched, rather than a submit-time popup. **A 9th/10th-grade visitor submits directly from this one screen** — no destinations/quiz/review steps for that group; 11th/12th continue on to the full flow below.
- **Destinations & exam prep** — a tap-to-select chip grid of the top study destinations with an "Other" search overlay for the full country list, followed by a country-filtered, grouped list of relevant competitive/entrance exams (e.g. JEE/NEET/CLAT for India, UCAT/LNAT for the UK).
- **Academic quiz** — 4 questions on the full path (1 on the fast "express" path), filtered by the visitor's curriculum and stream so a Science-PCM student is never shown Commerce-only content, against one pooled 90-second timer that only counts down while a question is on screen. No per-question right/wrong reveal and no score/points are ever shown to the visitor.
- **NEET/JEE questions** — an Indian PCMB visitor, or anyone who picks NEET and/or JEE in the exam step, is always served at least one NEET/JEE-style question (NEET-style questions are the bank's "NEET-style:" topics; until JEE-style questions exist, hard-tier Indian Physics/Chemistry/Mathematics stand in for JEE).
- **Destination order** — the order a visitor picks their countries (first, second, third choice) is recorded and stored as `destination_1/2/3`.
- **Review & submit** — a single screen showing every registration, preference and quiz answer with per-section "Edit" links that jump back to that exact step (and back to Review again once you're done editing), and one Submit action that's the only point a record is actually finalized.
- **Staff dashboard** — reached by long-pressing the logo, then signing in with a Supabase Auth email + password (only allowlisted staff emails can read data). Shows every device's submitted records live (refreshes every ~10 s), each record's full detail, flags likely-duplicate registrations across all devices for manual review (never silently blocked or silently left unflagged), ~~and lets staff mark a flagged pair as reviewed/merged/not-a-duplicate (both linked records move together).~~ (superseded 2026-09-30, kept for history) Flagged duplicates are shown as information only ("Possible duplicate of ..."); the dashboard offers no review/merge actions. A build with no Supabase config (e.g. opened from `file://`) falls back to a local-only dashboard behind a casual PIN.

## Standing product decisions

- Grade 9 and up (9th/10th get a direct-submit shortcut, 11th/12th get the full flow — see "What it does" above); English only; 2–3 stall-owned iPads/laptops, no personal devices.
- No OTP/phone verification — numbers are format-checked only; verification happens naturally when a counsellor follows up.
- Every registered, non-duplicate student has **equal draw odds**, regardless of quiz score or how much of the experience they completed.
- **Local-first write, Supabase as the system of record.** A submit is saved to the device's `localStorage` instantly (visitors never wait on the network), then pushed to Supabase in the background from a retry outbox (on a timer, on the browser `online` event, and when the tab regains focus). Wifi dropping mid-event loses nothing.

## Tech stack

Plain HTML/CSS/JS — no framework, no bundler, no client build step. Hosted as static files on Vercel; data lives in Supabase (Postgres) reached with plain `fetch` (no SDK). Classic `<script>` tags on a shared `window.PED` namespace (not ES modules — those are blocked by CORS when the page is opened directly via `file://`, which this app needs to support). [Playwright](https://playwright.dev/) is the only dev dependency, used purely for the automated test suite.

## Project structure

```
index.html, styles.css       the app shell
js/                           one file per feature area (registration, destinations,
                               quiz, review, staff dashboard, state machine, …)
data/                         real delivered datasets (schools, curricula/streams,
                               destination-exam mappings, question bank)
js/generated/data.js          data/*.json inlined into a committed classic script
                               (regenerate with `npm run build:data` after editing data/)
scripts/                      one-off dev tooling (data build step, empirical
                               file:// and font-self-hosting checks)
js/sync.js                    Supabase outbox sync + staff auth (plain fetch)
supabase/                     database schema (migrations/0001_init.sql) + setup guide
scripts/build-config.js       writes js/generated/config.js from SUPABASE_URL / SUPABASE_ANON_KEY
tests/                        Playwright end-to-end test suite (Supabase mocked)
assets/logo/                  the real Pedagogy logo — the only image asset in the app
```

## Running it locally

Requires [Node.js](https://nodejs.org/) (for the dev server and test tooling only — the app itself needs no build step).

```bash
npm install
npm run dev      # regenerates js/generated/config.js from .env.local, then serves on :5500
```

This starts a static file server for the project root. Open the address it prints in your browser (iPad/tablet-width or a laptop window is the intended layout; phone support is secondary).

You can also skip the dev server entirely and just double-click `index.html` to open it directly via `file://` — this is verified to work in real Chrome and Edge (see `scripts/check-file-protocol.js`). Run `npm run build:config` once first if you want it to talk to Supabase; without that it runs local-only.

## Backend (Supabase) and deployment

See [`supabase/README.md`](supabase/README.md) for the one-time setup (run the SQL, create staff users, allowlist them, disable public signups).

- **Config:** `SUPABASE_URL` and `SUPABASE_ANON_KEY` come from Vercel environment variables (production) or `.env.local` (local; copy `.env.example`). `vercel.json` runs `node scripts/build-config.js` at deploy time, which writes the gitignored `js/generated/config.js`. With no valid values the app simply runs local-only.
- **Security model:** the public anon key can only call one function (`submit_registration`); it has no table access. Staff read data with their own Supabase Auth session, gated by an email allowlist and row-level security. The `service_role` key and DB password never go in client code or `.env.local`.
- **Deploys:** every push to `main` redeploys on Vercel.
- The test suite always serves an empty config and mocks every Supabase call, so it can never write to the real database.

## Running the tests

```bash
npm test
```

This runs a data-freshness check (fails if `data/*.json` was edited without regenerating `js/generated/data.js`) followed by the full Playwright suite across desktop Chromium and an iPad/WebKit emulation profile.

## Rebuilding generated data

If you edit anything under `data/`, regenerate the inlined data module before testing or running the app:

```bash
npm run build:data
```

## Status

This is a pre-launch build. The question bank is real and delivered (10,080 questions across two merged deliveries — see `data/QUESTION_BANK_SOURCES.md`), though no subject-teacher has independently reviewed it for factual accuracy yet (`reviewed_by: null` on every record). The dev-only "jump to quiz" staff-dashboard test shortcut that used to live in `js/staff.js`/`js/app.js`/`styles.css` has been removed (2026-09-29) now that this is the final build for the live event, not a demo build.
