// Classic script. Step order + navigation, built from reference/pedagogy-expo.html's
// structure (NOT v2's swipe-deck version) per CLAUDE.md "Structural vs. visual
// reference": question -> preference-chip step -> game -> question ->
// preference-chip step -> game -> question -> preference-chip step -> request/finish.
//
// The destinations -> "Are you preparing for any competitive exam?" -> country-
// filtered exam list insertion is per session_handoff.md Section 6: the Yes/No
// question always follows destinations; the exam-list step is conditional on a
// "yes" answer (or renders as free-text if "Other" was the only destination,
// which is a content decision inside that step, not a visibility decision here).
//
// FIVE academic questions (session_handoff.md Section 3C, locked): q1/q2/q3 keep
// their original positions opening each Q->P->G triad. q4 and q5 are placed
// immediately after 'activities' (the last preference step) and before 'request',
// as a closing pair. That placement: (a) keeps the original Q->P->G rhythm intact
// for the first two cycles (q1/destinations/game1, q2/courses/game2) rather than
// interleaving mid-triad, (b) doesn't strand any preference step — 'activities'
// still has its own question (q3) immediately before it, unchanged from the
// 3-question version, and (c) doesn't invent a third game or a fourth preference
// topic that isn't in spec. The pooled ~5-minute timer (Phase 2) runs across all
// five regardless of where they sit structurally, so this is purely about not
// breaking the established rhythm to make room for them.
//
// This is Phase 0/1 scaffolding: every screen is still built out incrementally
// (see app.js / registration.js). The order and the forward/back navigation are
// the real, testable part.
(function () {
  'use strict';
  window.PED = window.PED || {};

  // Round C (item 5/7/8): 'courses', 'activities' and 'request' are removed
  // entirely — only data points that predict course interest and openness to
  // studying abroad stay in scope. The remaining 5 academic questions are now
  // grouped 1/2/2 around the two games (q1 alone, then q2+q3, then q4+q5)
  // instead of trailing off as 3 questions in a row once 'activities' (which
  // used to sit between q3 and q4) was deleted — see round C item 9a.
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
    { id: 'game1', kind: 'game' },
    { id: 'q2', kind: 'question' },
    { id: 'q3', kind: 'question' },
    { id: 'game2', kind: 'game' },
    { id: 'q4', kind: 'question' },
    { id: 'q5', kind: 'question' },
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
