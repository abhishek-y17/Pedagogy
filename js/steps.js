// Classic script. Step order + navigation, built from reference/pedagogy-expo.html's
// structure (NOT v2's swipe-deck version) per CLAUDE.md "Structural vs. visual
// reference".
//
// The destinations -> "Are you preparing for any competitive exam?" -> country-
// filtered exam list insertion is per session_handoff.md Section 6: the Yes/No
// question always follows destinations; the exam-list step is conditional on a
// "yes" answer (or renders as free-text if "Other" was the only destination,
// which is a content decision inside that step, not a visibility decision here).
//
// Round E, 2026-09-23: both mini-games (game1/game2) are removed from the flow
// entirely (see js/games.js's deletion and RUN_LOG.md — Abhi's direct
// instruction), and the academic quiz drops from 5 questions to FOUR. With no
// game left to interleave around, the four questions are grouped 1/3 instead
// of the old 1/2/2 game-spaced rhythm: q1 opens the full path (right after
// registration, before any preference step, unchanged from before), then
// destinations/examPrep/examList run as one uninterrupted preference block,
// then q2/q3/q4 close out the academic portion back-to-back immediately
// before review. This keeps every question and every preference step present
// exactly once, in a straightforward, easy-to-reason-about order, now that
// there's no game-pacing constraint to design around.
(function () {
  'use strict';
  window.PED = window.PED || {};

  const FULL_PATH_STEPS = [
    { id: 'register' },
    { id: 'q1', kind: 'question' },
    { id: 'destinations', kind: 'preference' },
    { id: 'examPrep', kind: 'preference' },
    {
      id: 'examList',
      kind: 'preference',
      isVisible: draft => draft.preferences.competitiveExamPrep === 'yes',
    },
    { id: 'q2', kind: 'question' },
    { id: 'q3', kind: 'question' },
    { id: 'q4', kind: 'question' },
    { id: 'review', kind: 'review' },
  ];

  // Express stays fast per session_handoff.md Section 3C's default (1 academic
  // question, PLAN.md Phase 1): no games (they're the main time cost of the full
  // path), but the destinations/exam-prep lead-capture data is still worth
  // collecting since it's the whole point of the stall, not something to cut
  // for speed. Only one question total; nothing to interleave (round C item 9a
  // is moot here — there was never more than one question on this path).
  const EXPRESS_PATH_STEPS = [
    { id: 'register' },
    { id: 'q1', kind: 'question' },
    { id: 'destinations', kind: 'preference' },
    { id: 'examPrep', kind: 'preference' },
    {
      id: 'examList',
      kind: 'preference',
      isVisible: draft => draft.preferences.competitiveExamPrep === 'yes',
    },
    { id: 'review', kind: 'review' },
  ];

  function stepsFor(draft) {
    return draft.mode === 'express' ? EXPRESS_PATH_STEPS : FULL_PATH_STEPS;
  }

  function getVisibleSteps(draft) {
    return stepsFor(draft)
      .filter(step => !step.isVisible || step.isVisible(draft))
      .map(step => step.id);
  }

  function getCurrentIndex(draft) {
    return getVisibleSteps(draft).indexOf(draft.currentStepId);
  }

  function isFirstStep(draft) {
    return getCurrentIndex(draft) === 0;
  }

  function isLastStep(draft) {
    const steps = getVisibleSteps(draft);
    return getCurrentIndex(draft) === steps.length - 1;
  }

  function goNext(draft) {
    const steps = getVisibleSteps(draft);
    const i = steps.indexOf(draft.currentStepId);
    if (i >= 0 && i < steps.length - 1) draft.currentStepId = steps[i + 1];
    return draft;
  }

  function goPrev(draft) {
    const steps = getVisibleSteps(draft);
    const i = steps.indexOf(draft.currentStepId);
    if (i > 0) draft.currentStepId = steps[i - 1];
    return draft;
  }

  /** Direct jump, used by the review screen's "tap to edit" links (session_handoff.md item D). */
  function goToStep(draft, id) {
    const steps = getVisibleSteps(draft);
    if (steps.includes(id)) draft.currentStepId = id;
    return draft;
  }

  /** 0-based position of a question step among ONLY the 'question'-kind steps
   * on this draft's path (q1 -> 0, q2 -> 1, ...). Used by js/quiz.js to map a
   * step id onto draft.quiz.selectedQuestionIds[index]. */
  function getQuestionStepIds(draft) {
    return stepsFor(draft).filter(s => s.kind === 'question').map(s => s.id);
  }

  function getQuestionIndex(draft, stepId) {
    return getQuestionStepIds(draft).indexOf(stepId);
  }

  function getQuestionCount(draft) {
    return getQuestionStepIds(draft).length;
  }

  window.PED.steps = {
    FULL_PATH_STEPS,
    EXPRESS_PATH_STEPS,
    getVisibleSteps,
    getCurrentIndex,
    isFirstStep,
    isLastStep,
    goNext,
    goPrev,
    goToStep,
    getQuestionStepIds,
    getQuestionIndex,
    getQuestionCount,
  };
})();
