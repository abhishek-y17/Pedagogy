// State machine + data model skeleton.
// Step order/interaction mechanics follow reference/pedagogy-expo.html (see
// CLAUDE.md "Structural vs. visual reference") — chip-grid destinations with
// search overlay, tap-chip courses/activities, question -> preference -> game
// interleaving. The exact step sequence (5 pooled-timer questions, where the
// new competitive-exam question slots in) is filled in during Phase 2; this
// file only defines the machinery so that sequence can be data-driven rather
// than hardcoded.

const SCHEMA = 'pedagogy.v5';
const RECORDS_KEY = 'pedagogy-expo-records';
const DRAFT_KEY = 'pedagogy-expo-draft';

/** A fresh in-memory draft. Nothing here is a saved record until finalizeDraft(). */
export function createDraft(mode = 'full') {
  return {
    schema: SCHEMA,
    mode, // 'full' | 'express'
    currentStepId: 'register',
    registration: {
      name: null,
      dob: null,
      parentMobile: null,   // mandatory
      studentMobile: null,  // optional
      contactRole: null,
      school: null,
      schoolKey: null,
      curriculum: null,     // from schools.json tag, or manual fallback
      grade: null,
      stream: null,
      section: null,
      subjects: [],
      tcsAccepted: false,
      consentToContact: false, // covers WhatsApp / Business API messaging
    },
    preferences: {
      destinations: [],              // chip-grid + "Other" search overlay
      competitiveExamPrep: null,     // 'yes' | 'no' | null (unanswered)
      competitiveExams: {},          // { [country]: [examName, ...] } or { Other: freeText }
      courses: [],
      activities: [],
    },
    quiz: {
      answers: [],       // [{ questionId, selected, skipped }]
      timerStartedAt: null,
      timerElapsedMs: 0, // pooled ~5-minute budget, counts only while a question is shown
    },
    followUp: {
      counselling: false,
      marketing: false,
      preferredFollowup: null,
      channel: null,
    },
    meta: {
      id: null,
      createdAt: null,
      deviceId: null,
      recordStatus: null,   // set on finalize
      duplicateFlag: false,
    },
  };
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && parsed.schema === SCHEMA ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDraft(draft) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
}

/**
 * Mutate the draft and immediately persist it. This is the pattern every future
 * form field / step transition should use (from Phase 1 onward) so a mid-registration
 * background-tab discard on iPad Safari never loses progress — persistence isn't
 * something to bolt on in Phase 4, every mutation already saves as it happens.
 */
export function mutateDraft(draft, mutator) {
  mutator(draft);
  saveDraft(draft);
  return draft;
}

/**
 * One-action reset between visitors (Phase 6 needs this at the stall, not just in
 * the eventual staff dashboard) — wipes the in-progress draft and starts clean.
 * Does not touch finalized records in RECORDS_KEY.
 */
export function resetForNewVisitor(mode = 'full') {
  clearDraft();
  const fresh = createDraft(mode);
  saveDraft(fresh);
  return fresh;
}

/** Only point at which a draft becomes a saved, finalized record. */
export function finalizeDraft(draft) {
  const records = loadRecords();
  draft.meta.id = draft.meta.id || `P-${crypto.randomUUID()}`;
  draft.meta.createdAt = new Date().toISOString();
  records.push(draft);
  saveRecords(records);
  clearDraft();
  return draft;
}

export function loadRecords() {
  try {
    const raw = localStorage.getItem(RECORDS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRecords(records) {
  try {
    localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
    return true;
  } catch {
    return false;
  }
}
