// Classic script. State machine + data model.
// Step order/interaction mechanics follow reference/pedagogy-expo.html (see
// CLAUDE.md "Structural vs. visual reference") — chip-grid destinations with
// search overlay, tap-chip courses/activities, question -> preference -> game
// interleaving (see js/steps.js for the concrete order).
(function () {
  'use strict';
  window.PED = window.PED || {};

  // Bumped v8 -> v9 for round D item 1: the marketing opt-in (flagged as
  // orphaned dead data in round C, under followUp.marketing) now lives on
  // Registration as a real checkbox — see js/registration.js. Renamed to
  // registration.marketingOptIn since "followUp" no longer means anything
  // once that step is gone; the followUp object itself is removed (it would
  // otherwise be empty). Safe to invalidate old in-progress drafts on load
  // (loadDraft() below just treats a schema mismatch as "no draft") — this is
  // pre-launch dev/rehearsal data only, never a real visitor record.
  // Bumped v9 -> v10 (2026-09-20): parentMobile/studentMobile split into an
  // editable country-code field (preset +971) plus a local-number field — see
  // js/registration.js. The combined, validated value still lands in
  // parentMobile/studentMobile at Continue/Submit time, so review.js/staff.js/
  // the duplicate-matching logic in this file are unaffected.
  const SCHEMA = 'pedagogy.v10';
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
        parentCountryCode: '+971',  // editable; preset to UAE, mandatory field's number lives in parentMobileLocal
        parentMobileLocal: null,    // mandatory — raw local number as typed, no country code
        parentMobile: null,         // final combined +countrycode+number, set only once validated at Continue/Submit
        studentCountryCode: '+971', // optional field's own country code
        studentMobileLocal: null,   // optional — raw local number as typed
        studentMobile: null,        // final combined, set only once validated
        school: null,
        schoolKey: null,
        curriculum: null,     // from schools.json tag, or manual fallback
        grade: null,
        stream: null,
        section: null,
        subjects: [],
        tcsAccepted: false,
        tcsAcceptedAt: null,        // ISO timestamp, set the moment the box is checked
        consentToContact: false,   // covers WhatsApp / Business API messaging
        consentToContactAt: null,  // ISO timestamp, same pattern as tcsAcceptedAt
        // Merged with the T&Cs checkbox (Abhi's explicit round D follow-up call):
        // checking T&Cs sets both tcsAccepted and marketingOptIn together — it is
        // no longer an independently optional/trackable choice. Kept as its own
        // field (mirroring tcsAccepted) rather than folded away, so staff/review
        // still show an explicit marketing-consent record.
        marketingOptIn: false,
        marketingOptInAt: null,    // ISO timestamp, same pattern as tcsAcceptedAt; null if never checked
      },
      preferences: {
        destinations: [],              // top-10 chip grid selections (may include the literal "Other")
        destinationsOther: [],         // specific countries picked via the "Other" search overlay
        competitiveExamPrep: null,     // 'yes' | 'no' | null (unanswered)
        competitiveExams: {},          // { [country]: [examName, ...] } or { Other: freeText }
      },
      quiz: {
        selectedQuestionIds: [], // fixed at first entry into a question step, so free
                                  // back-navigation always re-shows the same questions
        answers: [],       // [{ questionId, selected, skipped, timedOut }] — no `correct`
                            // field here; that's computed only at finalizeDraft() below,
                            // for staff-side analytics, never surfaced to the participant
                            // (standing decision: no score/points shown in the UI).
        timerStartedAt: null,   // epoch ms; null while paused (not on a question step)
        timerElapsedMs: 0,      // pooled budget consumed so far, counts only while a
                                 // question is on screen (js/timer.js owns start/pause)
      },
      meta: {
        id: null,
        createdAt: null,
        deviceId: null,
        recordStatus: null,   // set on finalize
        duplicateFlag: false,
        duplicateOfIds: [],          // meta.id of every other record this one reasonably matches
        duplicateReviewStatus: null, // null | 'pending' | 'reviewed' | 'merged' | 'dismissed'
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

  function normalizeForMatch(v) {
    return (v || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Standing decision: "likely duplicate registrations are flagged for staff
   * review, never silently blocked and never silently allowed to sit as two
   * active untouched entries." A "reasonable match" is: the same name + date
   * of birth + school (by schoolKey if both have one, else by normalized
   * school text), OR the same parent/guardian mobile (already normalized to
   * +country-code format by registration.js's validation before finalize).
   * Deliberately loose rather than exact-everything, since real visitors
   * retype their own details slightly differently between visits (typos,
   * "Dubai" vs "Dubai " vs a different school spelling) — false positives
   * just mean one extra staff glance, false negatives mean a duplicate goes
   * completely unflagged, and the standing decision explicitly prioritizes
   * against the latter.
   */
  function isReasonableMatch(a, b) {
    if (a.meta.id === b.meta.id) return false;
    const ra = a.registration, rb = b.registration;
    if (ra.parentMobile && rb.parentMobile && ra.parentMobile === rb.parentMobile) return true;
    const sameName = ra.name && rb.name && normalizeForMatch(ra.name) === normalizeForMatch(rb.name);
    const sameDob = ra.dob && rb.dob && ra.dob === rb.dob;
    if (!sameName || !sameDob) return false;
    if (ra.schoolKey && rb.schoolKey) return ra.schoolKey === rb.schoolKey;
    return !!(ra.school && rb.school && normalizeForMatch(ra.school) === normalizeForMatch(rb.school));
  }

  /** Every existing record that reasonably matches `candidate` (see above). */
  function findDuplicateMatches(records, candidate) {
    return records.filter(r => isReasonableMatch(candidate, r));
  }

  /**
   * Only point at which a draft becomes a saved, finalized record (Phase 2:
   * wired to the review screen's single Submit action — see js/review.js).
   * `questions` (the validated bank, optional) lets correctness get computed
   * and stored per answer for staff-side analytics only — never shown to the
   * participant anywhere in the UI (standing decision), and never used to
   * affect draw odds (equal-odds rule is independent of this).
   *
   * Duplicate flagging (Phase 4): computed against every already-finalized
   * record, in both directions. A new match doesn't just flag the new
   * record — it re-opens duplicateReviewStatus on every record it matches
   * back to 'pending' too, even one staff had previously reviewed/dismissed,
   * because a *new* incoming duplicate is new information staff haven't seen
   * yet; never silently left unflagged, per the standing decision.
   */
  function finalizeDraft(draft, questions) {
    if (Array.isArray(questions)) {
      const byId = new Map(questions.map(q => [q.id, q]));
      draft.quiz.answers = draft.quiz.answers.map(a => {
        const q = byId.get(a.questionId);
        return { ...a, correct: q && a.selected != null ? q.answer === a.selected : null };
      });
    }
    const records = loadRecords();
    draft.meta.id = draft.meta.id || `P-${crypto.randomUUID()}`;
    draft.meta.createdAt = new Date().toISOString();

    const matches = findDuplicateMatches(records, draft);
    if (matches.length) {
      draft.meta.duplicateFlag = true;
      draft.meta.duplicateOfIds = matches.map(m => m.meta.id);
      draft.meta.duplicateReviewStatus = 'pending';
      matches.forEach(m => {
        m.meta.duplicateFlag = true;
        if (!m.meta.duplicateOfIds.includes(draft.meta.id)) m.meta.duplicateOfIds.push(draft.meta.id);
        m.meta.duplicateReviewStatus = 'pending';
      });
    }

    records.push(draft);
    saveRecords(records);
    clearDraft();
    return draft;
  }

  /** Staff-dashboard mutation (mark reviewed/merged/dismissed) on an already
   * finalized record — the one place besides finalizeDraft() itself that
   * touches RECORDS_KEY, so a record can never end up silently untouched
   * once flagged (js/staff.js is the only caller). */
  function updateRecord(id, mutator) {
    const records = loadRecords();
    const record = records.find(r => r.meta.id === id);
    if (!record) return null;
    mutator(record);
    saveRecords(records);
    return record;
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
    updateRecord,
    findDuplicateMatches,
  };
})();
