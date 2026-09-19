// Step order + navigation, built from reference/pedagogy-expo.html's structure
// (NOT v2's swipe-deck version) per CLAUDE.md "Structural vs. visual reference":
// question -> preference-chip step -> game -> question -> preference-chip step ->
// game -> question -> preference-chip step -> request/finish.
//
// The destinations -> "Are you preparing for any competitive exam?" -> country-
// filtered exam list insertion is per session_handoff.md Section 6: the Yes/No
// question always follows destinations; the exam-list step is conditional on a
// "yes" answer (or renders as free-text if "Other" was the only destination,
// which is a content decision inside that step, not a visibility decision here).
//
// This is Phase 0 scaffolding: every screen is a placeholder (see app.js). The
// order and the forward/back navigation are the real, testable part.
//
// NOTE: this models the FULL path only, matching pedagogy-expo.html (which has
// no express path — express was a v2 addition). Express-path sequencing is
// deferred; draft.mode still records 'full' | 'express' for when that lands.

export const FULL_PATH_STEPS = [
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
  { id: 'courses', kind: 'preference' },
  { id: 'game2', kind: 'game' },
  { id: 'q3', kind: 'question' },
  { id: 'activities', kind: 'preference' },
  { id: 'request', kind: 'request' },
  { id: 'review', kind: 'review' },
];

function stepsFor(draft) {
  // Only one path is modeled today; kept as a function so a future
  // EXPRESS_PATH_STEPS can be switched in by draft.mode without touching callers.
  return FULL_PATH_STEPS;
}

export function getVisibleSteps(draft) {
  return stepsFor(draft)
    .filter(step => !step.isVisible || step.isVisible(draft))
    .map(step => step.id);
}

export function getCurrentIndex(draft) {
  return getVisibleSteps(draft).indexOf(draft.currentStepId);
}

export function isFirstStep(draft) {
  return getCurrentIndex(draft) === 0;
}

export function isLastStep(draft) {
  const steps = getVisibleSteps(draft);
  return getCurrentIndex(draft) === steps.length - 1;
}

export function goNext(draft) {
  const steps = getVisibleSteps(draft);
  const i = steps.indexOf(draft.currentStepId);
  if (i >= 0 && i < steps.length - 1) draft.currentStepId = steps[i + 1];
  return draft;
}

export function goPrev(draft) {
  const steps = getVisibleSteps(draft);
  const i = steps.indexOf(draft.currentStepId);
  if (i > 0) draft.currentStepId = steps[i - 1];
  return draft;
}

/** Direct jump, used by the review screen's "tap to edit" links (session_handoff.md item D). */
export function goToStep(draft, id) {
  const steps = getVisibleSteps(draft);
  if (steps.includes(id)) draft.currentStepId = id;
  return draft;
}
