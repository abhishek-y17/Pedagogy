// Classic script. Pooled academic-quiz timer (Phase 2, PLAN.md / session_handoff.md
// Section 3C; reduced from 5 to 3 minutes per Abhi's 2026-09-20 voice note) —
// ~3 minutes shared across the 5 full-path questions, scaled proportionally
// to the same per-question budget (180000ms / 5 = 36000ms per question) for
// express (1 question), not an arbitrary separate number. Visible/counting
// only while a question step is on screen; hidden and paused everywhere else.
// Survives free back-navigation because the budget consumed lives on the
// draft (timerElapsedMs), not in page state — see state.js's
// quiz.timerStartedAt/timerElapsedMs.
(function () {
  'use strict';
  window.PED = window.PED || {};

  const FULL_BUDGET_MS = 3 * 60 * 1000;   // 5 questions
  const EXPRESS_BUDGET_MS = FULL_BUDGET_MS / 5;   // 1 question, same per-question rate

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
