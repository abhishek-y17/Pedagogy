# Run Log

Append-only log, one entry per work session/run. Not every run needs an entry — only log when something actually happened (ran the app, built a feature, hit an error, made a decision). Newest entry on top.

Format per entry:
```
## YYYY-MM-DD HH:MM — short title
**Ran:** what was executed/built this run
**Good:** what worked / progress made
**Changed:** files added/modified, decisions made
**Issues:** errors, exceptions, blockers, anything that needed a workaround
```

---

## 2026-09-19 — Log file created, project kickoff
**Ran:** Created this run log per user request, about to read KICKOFF_PROMPT.md and session_handoff.md to begin the build.
**Good:** Repo structure already in place — CLAUDE.md, PLAN.md, session_handoff.md, real data files (schools.json, curriculum_subjects.json, destination_exams.json), reference prototypes, logo assets all present.
**Changed:** Added RUN_LOG.md at repo root.
**Issues:** None yet.
