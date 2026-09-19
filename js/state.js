// Classic script. State machine + data model.
// Step order/interaction mechanics follow reference/pedagogy-expo.html (see
// CLAUDE.md "Structural vs. visual reference") — chip-grid destinations with
// search overlay, tap-chip courses/activities, question -> preference -> game
// interleaving (see js/steps.js for the concrete order).
(function () {
  'use strict';
  window.PED = window.PED || {};

  const SCHEMA = 'pedagogy.v5';
  const RECORDS_KEY = 'pedagogy-expo-records';
  const DRAFT_KEY = 'pedagogy-expo-draft';

  /** A fresh in-memory draft. Nothing here is a saved record until finalizeDraft(). */
  function createDraft(mode) {
    mode = mode || 'full';
    return {
      schema: SCHEMA,
      mode, // 'full' | 'express'
      currentStepId: 'register',
      registration: {
        name: null,
        dob: null,
        parentMobile: null,   // mandatory
        studentMobile: null,  // optional
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
        destinations: [],              // top-10 chip grid selections (may include the literal "Other")
        destinationsOther: [],         // specific countries picked via the "Other" search overlay
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

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.schema === SCHEMA ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function saveDraft(draft) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      return true;
    } catch (e) {
      return false;
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
  }

  /**
   * Mutate the draft and immediately persist it. This is the pattern every
   * form field / step transition uses so a mid-registration background-tab
   * discard on iPad Safari never loses progress.
   */
  function mutateDraft(draft, mutator) {
    mutator(draft);
    saveDraft(draft);
    return draft;
  }

  /**
   * One-action reset between visitors — wipes the in-progress draft and starts
   * clean. Does not touch finalized records in RECORDS_KEY.
   */
  function resetForNewVisitor(mode) {
    clearDraft();
    const fresh = createDraft(mode);
    saveDraft(fresh);
    return fresh;
  }

  /** Only point at which a draft becomes a saved, finalized record. */
  function finalizeDraft(draft) {
    const records = loadRecords();
    draft.meta.id = draft.meta.id || `P-${crypto.randomUUID()}`;
    draft.meta.createdAt = new Date().toISOString();
    records.push(draft);
    saveRecords(records);
    clearDraft();
    return draft;
  }

  function loadRecords() {
    try {
      const raw = localStorage.getItem(RECORDS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function saveRecords(records) {
    try {
      localStorage.setItem(RECORDS_KEY, JSON.stringify(records));
      return true;
    } catch (e) {
      return false;
    }
  }

  window.PED.state = {
    createDraft,
    loadDraft,
    saveDraft,
    clearDraft,
    mutateDraft,
    resetForNewVisitor,
    finalizeDraft,
    loadRecords,
    saveRecords,
  };
})();
