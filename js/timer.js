// Classic script. Pooled academic-quiz timer (Phase 2, PLAN.md / session_handoff.md
// Section 3C). Round E, 2026-09-23: both mini-games were removed from the flow
// entirely (they were the main time cost of a full-path visit) and the quiz
// dropped from 5 to 4 questions, so the old 3-minute budget (already cut down
// from an original 5 minutes) was re-tuned too. New target: 90 seconds pooled
// across the 4 full-path questions (~22.5s/question) — comfortably inside the
// "1-2 minutes" the round asked for, and still generous per question given
// these are now the ONLY interactive beat on the full path (no game to pace
// against). Chosen over e.g. 120s because the games' removal makes the whole
// journey meaningfully faster end-to-end, and the point of the cut is a
// snappier stall interaction, not just proportional math. Express (1
// question) keeps the same per-question rate rather than an arbitrary
// separate number. Visible/counting only while a question step is on screen;
// hidden and paused everywhere else. Survives free back-navigation because
// the budget consumed lives on the draft (timerElapsedMs), not in page state
// — see state.js's quiz.timerStartedAt/timerElapsedMs.
(function () {
  'use strict';
  window.PED = window.PED || {};

  const FULL_BUDGET_MS = 90 * 1000;   // 4 questions, ~22.5s/question
  const EXPRESS_BUDGET_MS = FULL_BUDGET_MS / 4;   // 1 question, same per-question rate

  function budgetFor(draft) {
    return draft.mode === 'express' ? EXPRESS_BUDGET_MS : FULL_BUDGET_MS;
  }

  function isQuestionStep(stepId) {
    return /^q\d+$/.test(stepId || '');
  }

  /** Call on every step render. Starts the clock on a question step if it
   * isn't already running; pauses (and banks elapsed time) everywhere else. */
  function syncForStep(draft, stepId) {
    const onQuestion = isQuestionStep(stepId);
    if (onQuestion && draft.quiz.timerStartedAt == null) {
      draft.quiz.timerStartedAt = Date.now();
    } else if (!onQuestion && draft.quiz.timerStartedAt != null) {
      draft.quiz.timerElapsedMs += Date.now() - draft.quiz.timerStartedAt;
      draft.quiz.timerStartedAt = null;
    }
  }

  function getElapsedMs(draft) {
    const running = draft.quiz.timerStartedAt != null ? Date.now() - draft.quiz.timerStartedAt : 0;
    return draft.quiz.timerElapsedMs + running;
  }

  function getRemainingMs(draft) {
    return Math.max(0, budgetFor(draft) - getElapsedMs(draft));
  }

  function isExpired(draft) {
    return getRemainingMs(draft) <= 0;
  }

  function formatRemaining(ms) {
    const totalSeconds = Math.ceil(ms / 1000);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  window.PED.timer = { FULL_BUDGET_MS, EXPRESS_BUDGET_MS, budgetFor, isQuestionStep, syncForStep, getElapsedMs, getRemainingMs, isExpired, formatRemaining };
})();
