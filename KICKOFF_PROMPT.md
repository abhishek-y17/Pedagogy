Read CLAUDE.md, PLAN.md, and session_handoff.md in this folder fully before doing anything else — they contain the complete, resolved spec for this build (standing decisions, this round's stakeholder feedback, the structural/visual reference split between the two files in reference/, and the four data files in data/). Do not start writing app code until you've read all three.

Then do the following, in order:

1. **Environment setup.**
   - Initialize git in this folder if it isn't already a repo (`git init`), and confirm `.gitignore` is respected (`reference/` and `session_handoff.md` must never show up in `git status` as trackable — verify this explicitly).
   - This is a plain HTML/CSS/JS single-page app with no build step and no framework — confirm no package.json/node_modules is needed for the app itself. Set up a trivial local dev server for manual testing on this machine (e.g. `npx serve .` or Python's `http.server`) and tell me the exact command to run it.
   - If you want automated smoke testing (recommended, given the timeline), set up Playwright now (`npm init -y && npm install -D @playwright/test` or similar) as a dev-only dependency — this does not affect the shipped app, which stays plain HTML/CSS/JS.

2. **Create the initial file/directory structure** per CLAUDE.md's "Folder layout" and "Tech approach" sections:
   - `index.html`, `styles.css`, and one or a few JS modules (your call on how to split app.js — state/data-model, UI/rendering, and games/quiz logic are reasonable seams) at the repo root.
   - Confirm `assets/logo/`, `data/` (with `schools.json`, `curriculum_subjects.json`, `destination_exams.json`, `raw/`), and `reference/` are already present and untouched — don't move or rename anything in them.
   - Wire up the dev server so `index.html` loads cleanly with no console errors before you write any real feature code.

3. **Start Phase 0 of PLAN.md**: bring in the real logo, confirm the palette/fonts you're carrying forward from `reference/pedagogy-expo-v2.html`, and set up the basic state-machine/data-model skeleton using `reference/pedagogy-expo.html`'s structure and step order as the reference (not v2's) — per CLAUDE.md's "Structural vs. visual reference" section.

Stop and summarize what you've set up before moving into Phase 1 (registration + landing page), so I can sanity-check the foundation before you build on top of it. Use the taste skill for anything visual, per CLAUDE.md.

Remember: everything stays local (`localStorage` as the system of record) through the full build and testing — no external database, no deploy, no hosting setup, until I explicitly say the local build is proven out and we're ready to migrate.
