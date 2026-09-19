# Build plan — Sat morning to Tue morning demo

Today: Saturday. Demo: Tuesday morning, complete end-to-end interaction. That's roughly three working days. This plan is deliberately front-loaded — the riskiest, most-visible pieces (registration, landing page, the new selection interaction, the review-before-submit flow) come first, polish comes last, and anything that slips gets cut rather than left half-working.

All of the open decisions from Saturday morning are now resolved (see `session_handoff.md` Section 4) except one minor, non-blocking one (grid+search redesign scope — default to "all three decks" if not answered in time).

## Phase 0 — Saturday morning: decisions + scaffold
- ~~Resolve the 4 open decisions~~ — **done.** Timer model (pooled 5-min timer, 5 academic questions), visual design (keep palette/fonts, redo layout, no photos, logo-only + interactive/animated themes, use the taste skill), DOB collection (confirmed intentional), and skip-popup wording (final copy: "Completing all questions makes your winning chance higher" — the draw mechanic itself stays equal-odds; see `session_handoff.md` Section 4 item 1) are all locked in.
- Confirm tech approach: evolve `reference/pedagogy-expo-v2.html`'s **logic** (state machine, data model, no-OTP pattern) into an organized multi-file structure — **not** its visual layer, which is being rebuilt from scratch per the visual-design decision. Stay single-page-app, split into a few files (`index.html`, `styles.css`, `app.js` or a couple of JS modules) rather than introducing a framework/build step this weekend.
- Bring in the real logo (`assets/logo/`) and drop the placeholder "p." mark everywhere. Confirm no other image assets are added anywhere in the app.
- School/curriculum data and curriculum→subject/stream data are **no longer stubs** — `data/schools.json` (518 schools) and `data/curriculum_subjects.json` (researched stream/subject structure per curriculum) are real and delivered. Wire the school-autocomplete and stream-based question filtering against these directly. Question-bank data file is still a stub (real bank not yet delivered) — keep that one swappable.

## Phase 1 — Saturday: registration + landing page
- New landing/hero: logo-led "win an iPad" swipe-up banner reveal, tuned for iPad and Windows-laptop viewports first. Built entirely from code-driven interactive/animated visuals — no stock photography or illustration images, per the visual-design decision.
- Registration form rebuild: date of birth (replaces age band/18+ toggle), parent/guardian mobile (mandatory) + student mobile (optional) as two clearly separated fields, Terms & Conditions as a real hyperlink opening a modal/page (no inline "learn more" text block), two separate checkboxes (T&Cs acceptance, consent-to-contact incl. WhatsApp/Business API), and a clear non-alarming popup if parent number is missing at submit explaining why it's required (prize handover to a minor goes through the parent).
- School name field: autocomplete input wired to the real `data/schools.json` (518 schools, Sharjah/Dubai/Abu Dhabi). Selecting a known school pre-fills its curriculum tag and skips the manual curriculum question. Falls back to manual free-text name + manual curriculum selection when the school isn't in the list.

## Phase 2 — Saturday night / Sunday: question + review flow — **done 2026-09-20**
- ~~Remove per-question correct/incorrect reveal. Add free back-and-forth navigation~~ — free navigation was already built in Phase 0; no per-question reveal exists anywhere in `js/quiz.js`.
- ~~Build the final review screen~~ — `js/review.js`: every registration/preference/quiz field shown, each section (and each quiz question) individually tap-to-edit, single Submit is the only `finalizeDraft()` call site (verified by grep).
- ~~Timer~~ — `js/timer.js`: pooled 5:00 across 5 full-path questions, 1:00 on express (1 question, same 60s/question rate). Timeout behavior (auto-advance to review, mark unanswered) is a judgment call flagged for Abhi in RUN_LOG.md, not fully locked.
- ~~Conditional question filtering~~ — `js/questions.js`'s `selectQuizQuestions()`, wired to real `curriculum_subjects.json` stream ids for every curriculum shape (streams/groups/combination_clusters/ap_categories/external_exam_tracks). `data/question_bank.json` padded 4 -> 59 placeholder questions (still stub content, real bank still outstanding — item K) so filtering is actually testable end to end.
- ~~Remove score/points display~~ — confirmed via grep, nothing participant-facing shows score/points/correctness; `correct` is computed only at finalize for staff analytics.
- **Not done this phase, flagged in RUN_LOG.md 2026-09-20:** game1/game2 real content (unscoped — the reference prototype's games are substantial interactive mechanics, not micro-interactions; needs Abhi's call on whether they fit before Tuesday). courses/activities real content stays Phase 3 per this plan (unchanged). No UI path into express mode exists yet — worth deciding whether Phase 3 adds one.

## Phase 3 — Sunday: mini-games, express entry, selection redesign + skip rules — **done 2026-09-19**
- ~~Build game1/game2 as real interactive mechanics~~ — `js/games.js`: `trail()` (Number Trail) and `memoryGame()` (Pattern Recall), ported from `reference/pedagogy-expo.html` with every score/points trace stripped. Deliberately not wired into staff completion/correctness logging (scope cut, no data trail). Free back-navigation works since neither game touches the draft.
- ~~Fix the unreachable express path~~ — hero gained a real secondary entry point ("Just here for the quiz? Try the 60-second version") that sets `draft.mode = 'express'`; the primary CTA/banner/drag-gesture stay the default full-path choice.
- ~~Replace the swipe-card decks with the new pattern~~ — destinations already had its grid+search treatment from Phase 1. Courses/activities (`js/courses.js`) are plain tap-chip multi-selects with no search overlay, per CLAUDE.md's explicit "their lists are already short" call — the "all three decks vs. destinations only" decision from this line is resolved by that instruction, not left as a default.
- ~~Remove the skip button from every data-collection/preference step. Add it back only on academic questions~~ — done in `js/quiz.js`, exact approved popup copy: **"Completing all questions makes your winning chance higher."** (Draw mechanic stays equal-odds regardless — see `session_handoff.md` Section 4 item 1.)
- ~~Wire the school/curriculum and stream/course filtering into this redesigned selection flow~~ — `js/questions.js`'s `getSuggestedCourses()` marks (not restricts/pre-selects) courses matching the visitor's registered stream, per `curriculum_subjects.json`'s own "pre-suggest, not force" integration note. Activities has no equivalent data source in the delivered datasets, so it stays an unfiltered tap-chip list — not a gap, just nothing to filter by.

## Phase 4 — Sunday night / Monday: staff view, polish, haptics
- ~~Color/visual design pass~~ — **done 2026-09-19, folded in ahead of the rest of Phase 4** at Abhi's explicit request after reviewing a live registration screenshot ("reads flat and corporate for 16-18 year olds"). Applied the existing brand palette (blue/green/ink, no new colors) much more boldly across every step, not just registration: color-blocked step panels tinted per step kind, a real filled progress bar, bolder gradient/glow selected-and-valid states, gradient CTA fills with real shadow depth, brand-color accent dividers replacing gray hairlines, punchier badges with a small code-drawn triangle accent. See RUN_LOG.md for the full before/after screenshot set and file list.
- ~~Remove dev/rehearsal scaffolding for the final build~~ — **done same round**, Abhi: "treat this final build only." Removed the "Rehearsal build... use fictional details" banner and its copy, and the "PLACEHOLDER CONTENT" tag that was printing on real academic questions. Also built real content for the last standing placeholder screen (`request` — follow-up channel preference + optional note, using the `followUp` schema that had existed since Phase 0 with no UI) rather than leaving a labelled placeholder reachable in a "final" build.
- Update the staff dashboard for any new fields (DOB, dual phone numbers, T&Cs/consent timestamps, school + curriculum tag) so nothing new is invisible to staff.
- Animation and haptics pass: spring/scale feedback on taps and selections, feature-detected `navigator.vibrate` where supported, tuned specifically for iPad Safari where vibration isn't available — the animation has to carry the "felt" response on its own there, especially since there are no photos to lean on for visual richness.
- Performance pass: asset sizes (especially the logo and any animation assets), first-load time, no layout jank on iPad.

## Phase 5 — Monday: cross-device QA
- Full run-through on an actual iPad (Safari) and a Windows laptop (Chrome/Edge) — not just desktop Chrome dev tools. Fix anything that only breaks on real hardware (touch targets, viewport quirks, the Vibration API gap, autocomplete keyboard behavior).
- Full run-through of both full and express paths end to end, plus the staff dashboard, at least twice each.
- Freeze scope for anything not done by Monday evening — cut rather than ship half-working.

## Phase 6 — Monday night: rehearsal + fallback
- One full rehearsal run as if it were the actual stall (registration through takeaway, on the real devices).
- Confirm a fallback plan (what happens if a device or connection fails live) and a way to reset devices between test runs before Tuesday.

## Tuesday morning
Demo. Everything above should already be frozen and rehearsed — this morning is verification only, not new building.

## Explicit non-goals for this weekend
- No real backend/Supabase/Next.js migration — that's the right move before the actual event (11–13 Oct), not before Tuesday's demo. Flag it as fast-follow work once the demo is approved.
- No Arabic/multi-language work.
- No real OTP verification — stays as designed (format-check only).
- No stock photography or illustration image assets anywhere — logo only, everything else code-drawn.
