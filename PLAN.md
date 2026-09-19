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

## Phase 2 — Saturday night / Sunday: question + review flow
- Remove per-question correct/incorrect reveal. Add free back-and-forth navigation across the whole journey (registration fields included) via a persistent in-memory draft.
- Build the final review screen: every registration field and every answer/selection shown, editable (tap to jump back), single Submit action at the end that's the only point data is finalized/saved.
- Timer: one pooled ~5-minute timer covering **5 academic questions** on the full path, counting down only while an academic question is shown (paused/hidden during registration and preference steps, resumes on the next academic question). Confirmed — build this directly, no longer a decision point.
- Conditional question filtering by chosen stream/course using `data/curriculum_subjects.json` (e.g., no Commerce content for a PCMB student) — the real mapping is delivered, wire it in for real rather than a placeholder map. It will scale automatically once the larger question bank lands, as long as new questions are tagged with the same stream/subject-group ids used in that file.
- Remove score/points display everywhere in the participant-facing UI; keep completion/correctness logged for the staff view only.

## Phase 3 — Sunday: selection redesign + skip rules
- Replace the swipe-card decks with the new pattern: grid of top-10 (or top-N) chips + an "Other" option opening a searchable dropdown for the full list. **[DECISION NEEDED, minor]** whether this applies to all three decks (destinations/courses/activities, recommended default) or destinations only — default to all three if not answered in time.
- Remove the skip button from every data-collection/preference step. Add it back only on academic questions, with the final approved popup copy: **"Completing all questions makes your winning chance higher."** (Draw mechanic stays equal-odds regardless — see `session_handoff.md` Section 4 item 1.)
- Wire the school/curriculum and stream/course filtering into this redesigned selection flow so the two pieces work together, not as separate patches.

## Phase 4 — Sunday night / Monday: staff view, polish, haptics
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
