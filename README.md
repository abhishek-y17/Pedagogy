# Pedagogy — Sharjah Education Show interactive stall app

An interactive registration + academic-quiz + lead-capture web experience built for **Pedagogy Educational Services'** stall at the International Education Show, Expo Centre Sharjah, UAE (11–13 October 2026).

Visitors register with real details; 9th/10th graders submit directly from there, while 11th/12th graders (the real qualified NEET/JEE counselling leads) continue on to tell the app about their study destinations and competitive-exam plans, answer a handful of curriculum-filtered academic questions against a pooled timer, and review everything on one screen before submitting — all in service of one goal: real, qualified counselling leads for higher-studies/NEET/exam guidance, not just registration counts or prize entries.

## What it does

- **Registration** — name, date of birth, curriculum and grade/class (Grade 9 and up), mandatory parent/guardian mobile + optional student mobile (each validated to the exact digit count its country code expects, e.g. 9 digits for +971 UAE), a real Terms & Conditions modal with two separate consent checkboxes (T&Cs, and consent-to-contact covering WhatsApp/Business API messaging), and a school-name autocomplete against a real 518-school dataset (Dubai/Abu Dhabi/Sharjah) that auto-fills curriculum and skips the manual curriculum question when possible. Every field shows a live inline error once touched, rather than a submit-time popup. **A 9th/10th-grade visitor submits directly from this one screen** — no destinations/quiz/review steps for that group; 11th/12th continue on to the full flow below.
- **Destinations & exam prep** — a tap-to-select chip grid of the top study destinations with an "Other" search overlay for the full country list, followed by a country-filtered, grouped list of relevant competitive/entrance exams (e.g. JEE/NEET/CLAT for India, UCAT/LNAT for the UK).
- **Academic quiz** — 4 questions on the full path (1 on the fast "express" path), filtered by the visitor's curriculum and stream so a Science-PCM student is never shown Commerce-only content, against one pooled 90-second timer that only counts down while a question is on screen. No per-question right/wrong reveal and no score/points are ever shown to the visitor.
- **Review & submit** — a single screen showing every registration, preference and quiz answer with per-section "Edit" links that jump back to that exact step (and back to Review again once you're done editing), and one Submit action that's the only point a record is actually finalized.
- **Staff dashboard** — gated behind a long-press-the-logo + PIN prompt (a casual deterrent, not real authentication). Shows every submitted record's full detail, flags likely-duplicate registrations for manual review (never silently blocked or silently left unflagged), and lets staff mark a flagged pair as reviewed/merged/not-a-duplicate (both linked records move together).

## Standing product decisions

- Grade 9 and up (9th/10th get a direct-submit shortcut, 11th/12th get the full flow — see "What it does" above); English only; 2–3 stall-owned iPads/laptops, no personal devices.
- No OTP/phone verification — numbers are format-checked only; verification happens naturally when a counsellor follows up.
- Every registered, non-duplicate student has **equal draw odds**, regardless of quiz score or how much of the experience they completed.
- **Fully local-first for this build phase.** `localStorage` is the system of record — there is no backend, no hosting, and no live deployment yet. That migration is an explicit, separate later step once the local build has been fully tested end-to-end.

## Tech stack

Plain HTML/CSS/JS — no framework, no bundler, no build step for the shipped app. Classic `<script>` tags on a shared `window.PED` namespace (not ES modules — those are blocked by CORS when the page is opened directly via `file://`, which this app needs to support). [Playwright](https://playwright.dev/) is the only dev dependency, used purely for the automated test suite.

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
tests/                        Playwright end-to-end test suite
assets/logo/                  the real Pedagogy logo — the only image asset in the app
```

## Running it locally

Requires [Node.js](https://nodejs.org/) (for the dev server and test tooling only — the app itself needs no build step).

```bash
npm install
npm run dev
```

This starts a static file server for the project root. Open the address it prints in your browser (iPad/tablet-width or a laptop window is the intended layout; phone support is secondary).

You can also skip the dev server entirely and just double-click `index.html` to open it directly via `file://` — this is verified to work in real Chrome and Edge (see `scripts/check-file-protocol.js`).

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

This is a pre-launch build. The question bank is real and delivered (10,080 questions across two merged deliveries — see `data/QUESTION_BANK_SOURCES.md`), though no subject-teacher has independently reviewed it for factual accuracy yet (`reviewed_by: null` on every record). A few files in this repo (`js/staff.js`, `js/app.js`, `styles.css`) currently contain a clearly-marked, staff-gated test-only shortcut for exercising the quiz flow during development — search for `TEST ONLY` to find it. It's flagged for removal before the live event and is not reachable by a real visitor.
