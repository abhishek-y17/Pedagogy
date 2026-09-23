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
  // Bumped v10 -> v11 (Round E, 2026-09-23): both mini-games removed and the
  // quiz step order/count changed (5 questions -> 4, no more game1/game2
  // steps — see js/steps.js), so an in-progress v10 draft's currentStepId
  // could point at a step id that no longer exists. New top-level
  // `returnToReview` flag added (item 8's Review-Edit-returns-to-Review fix,
  // see js/app.js) and `registration.grade` can now be 'stage9'. None of this
  // is safe to silently resume from an old schema, so — same as every prior
  // schema bump — loadDraft() below just treats the mismatch as "no draft"
  // and a visitor picking up a stale in-progress session starts fresh rather
  // than landing on a step id that no longer resolves to anything.
  const SCHEMA = 'pedagogy.v11';
  const RECORDS_KEY = 'pedagogy-expo-records';
  const DRAFT_KEY = 'pedagogy-expo-draft';

  /** A fresh in-memory draft. Nothing here is a saved record until finalizeDraft(). */
  function createDraft(mode) {
    mode = mode || 'full';
    return {
      schema: SCHEMA,
      mode, // 'full' | 'express'
      currentStepId: 'register',
      // Round E item 8: set only by app.js's onJump (Review's "Edit" links),
      // and consumed (read then cleared) by the very next Continue/Back-
      // equivalent action, which redirects straight back to Review instead of
      // resuming the normal forward step order — see js/app.js's onNext/onBack.
      returnToReview: false,
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

  /** Wipes every finalized record AND the in-progress draft on this device.
   * A genuinely destructive, staff-only action (js/staff.js gates it behind
   * a confirm() prompt) — added per PLAN.md Phase 6's "a way to reset
   * devices between test runs" and a repeated live request to clear
   * leftover test/demo data. Deliberately not scoped to "test records only":
   * there is no real/test distinction in this schema, and a partial wipe
   * would risk leaving stale duplicate-match references behind. */
  function clearAllData() {
    try { localStorage.removeItem(RECORDS_KEY); } catch (e) { /* ignore */ }
    clearDraft();
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

  /** Real bug, reported live 2026-09-21: `crypto.randomUUID()` throws in any
   * non-secure context (plain http:// over anything other than localhost —
   * e.g. one stall device serving the app and a second device, like an iPad,
   * reaching it over the LAN by IP address instead of localhost, which is
   * exactly how testing across two physical devices tends to happen). Since
   * this call sat inside finalizeDraft() with nothing catching it, the
   * uncaught exception silently killed the Submit handler right after
   * validation passed but before the confirmation screen ever rendered —
   * the button visually responded (a plain CSS :active state, no JS needed
   * for that) but the screen never advanced and no popup ever showed, since
   * the code never reached a point that would show one. This generator
   * tries the real crypto API first and falls back to a plain
   * Math.random()-based v4-shaped id otherwise — fine here since this id is
   * only ever used as a local record key, never anything security-sensitive. */
  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      try { return crypto.randomUUID(); } catch (e) { /* insecure context or unsupported — fall through */ }
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
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
   *
   * Return value (codexreview.md finding, fixed here): saveRecords() can fail
   * (storage quota, private-mode restrictions) and used to be called for its
   * side effect only, with the boolean it returns silently discarded —
   * finalizeDraft() would still clear the draft and the caller would still
   * show the success confirmation even though nothing was actually persisted,
   * quietly losing a real registration. Callers (js/review.js,
   * js/registration.js's grade-9/10 direct-submit path) must check `.ok`
   * before showing success, and must NOT treat the draft as consumed if it's
   * false — the draft is deliberately left un-cleared on failure so a retry
   * doesn't lose the visitor's already-entered data.
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
    const id = draft.meta.id || `P-${generateId()}`;
    const createdAt = new Date().toISOString();

    const matches = findDuplicateMatches(records, draft);
    const duplicateFlag = matches.length > 0;
    const duplicateOfIds = matches.map(m => m.meta.id);

    // These in-memory mutations (to `draft` itself and to the matched
    // existing records) only actually reach localStorage if saveRecords()
    // below succeeds — on failure they're harmlessly discarded along with
    // the rest of `records`, and draft.meta.id staying set means a retry
    // reuses the same id rather than minting a new one each attempt.
    draft.meta.id = id;
    draft.meta.createdAt = createdAt;
    draft.meta.duplicateFlag = duplicateFlag;
    draft.meta.duplicateOfIds = duplicateOfIds;
    draft.meta.duplicateReviewStatus = duplicateFlag ? 'pending' : draft.meta.duplicateReviewStatus;
    matches.forEach(m => {
      m.meta.duplicateFlag = true;
      if (!m.meta.duplicateOfIds.includes(id)) m.meta.duplicateOfIds.push(id);
      m.meta.duplicateReviewStatus = 'pending';
    });

    records.push(draft);
    const ok = saveRecords(records);
    if (ok) clearDraft();
    return { ok, record: draft };
  }

  /** Staff-dashboard duplicate resolution (Mark reviewed / Merged / Not a
   * duplicate). codexreview.md finding, fixed here: resolving a duplicate
   * used to update only the clicked record via the generic updateRecord()
   * below, leaving its linked match(es) still `duplicateReviewStatus:
   * 'pending'` — staff would think they'd closed out a duplicate pair when
   * only half of it moved, and the dashboard would keep counting it as
   * needing review. This resolves the clicked record AND every record listed
   * in its own duplicateOfIds together, in one localStorage write, so a
   * resolved pair (or group) always moves as a unit. */
  function resolveDuplicatePair(id, status) {
    const records = loadRecords();
    const record = records.find(r => r.meta.id === id);
    if (!record) return null;
    const linkedIds = new Set(record.meta.duplicateOfIds || []);
    record.meta.duplicateReviewStatus = status;
    records.forEach(r => {
      if (linkedIds.has(r.meta.id)) r.meta.duplicateReviewStatus = status;
    });
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
    clearAllData,
    mutateDraft,
    resetForNewVisitor,
    finalizeDraft,
    resolveDuplicatePair,
    loadRecords,
    saveRecords,
    findDuplicateMatches,
  };
})();
