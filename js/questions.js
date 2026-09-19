// Classic script. Question bank schema + loader. The real bank (~50-70 questions
// per subject per difficulty tier per curriculum, per session_handoff.md Section
// 3K) has not been delivered yet — data/question_bank.json is a small stub so
// this loader and its validation can be built and tested now, and the real bank
// can drop in later without any code changes as long as it matches this schema.
(function () {
  'use strict';
  window.PED = window.PED || {};

  const REQUIRED_FIELDS = ['id', 'curriculum', 'eligible_stream_ids', 'subject', 'difficulty', 'language', 'q', 'options', 'answer'];
  const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

  /**
   * Normalizes whichever stream/cluster/category/track structure a curriculum
   * uses (see data/curriculum_subjects.json) into a plain [{id,label}] list, or
   * [] if the curriculum has no such structure (the "Other" bucket). Canonical
   * home for this derivation — both the registration stream picker
   * (js/registration.js) and question-eligibility filtering/validation below
   * call this, so a stream's id can never drift between the two.
   */
  function getStreamOptions(curriculumSubjects, curriculumName) {
    const c = (curriculumSubjects.curricula || {})[curriculumName];
    if (!c) return [];
    if (c.streams) return c.streams.map(s => ({ id: s.id, label: s.label }));
    if (c.groups) return c.groups.map(g => ({ id: g.id, label: g.label }));
    if (c.combination_clusters) return c.combination_clusters.map(cl => ({
      id: cl.id,
      label: cl.id.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()),
    }));
    if (c.ap_categories) return c.ap_categories.map(a => ({ id: a.id, label: a.label || a.id }));
    if (c.external_exam_tracks) return c.external_exam_tracks.map((t, i) => ({ id: `track-${i}`, label: t }));
    return [];
  }

  /** Maps curriculum_subjects.json's fine-grained `typical_course_interest`
   * strings onto the fixed 8 real chip options js/courses.js shows on the
   * courses step (Medicine/Engineering/Computing.../Undecided/Other aren't
   * data-driven, "Undecided"+"Other" have no interest mapping). Any interest
   * string not covered here is a values that doesn't map cleanly onto a
   * generic chip (e.g. "Pure Sciences") — dropped rather than force-mapped to
   * something misleading. */
  const INTEREST_TO_COURSE_CHIP = {
    Medicine: 'Medicine',
    Dentistry: 'Health sciences',
    Pharmacy: 'Health sciences',
    'Nursing / Allied Health': 'Health sciences',
    'Life Sciences': 'Health sciences',
    'Life Sciences / Biotechnology': 'Health sciences',
    'Pure Sciences': 'Engineering',
    Engineering: 'Engineering',
    Architecture: 'Engineering',
    'Applied / Vocational / Technical programs': 'Engineering',
    'Environmental Science': 'Engineering',
    'Technology / Computer Science': 'Computing / AI',
    'Data Science / Analytics': 'Computing / AI',
    'Business / Management': 'Business / Finance',
    'Finance / Accounting': 'Business / Finance',
    Economics: 'Business / Finance',
    'Hospitality / Tourism': 'Business / Finance',
    'Hospitality / Retail Management': 'Business / Finance',
    Law: 'Law',
    'Design / Fine Arts': 'Arts / Design',
    'Media / Journalism / Communication': 'Arts / Design',
    'Social Sciences': 'Humanities',
    Psychology: 'Humanities',
  };

  /**
   * Per data/curriculum_subjects.json's own app_integration_notes ("use each
   * stream/cluster's typical_course_interest array to PRE-SUGGEST, not
   * force, course-interest options later in the flow"): returns a de-duped
   * list of js/courses.js chip labels to visually highlight for this visitor's
   * chosen curriculum+stream. Never used to hide/restrict chips — courses.js
   * still shows every option, just reorders/marks these first. Empty for "Other"
   * curricula, an unset stream, or a stream with no typical_course_interest data.
   */
  function getSuggestedCourses(curriculumSubjects, curriculumName, streamId) {
    if (!streamId) return [];
    const c = (curriculumSubjects.curricula || {})[curriculumName];
    if (!c) return [];
    const list = c.streams || c.groups || c.combination_clusters || c.ap_categories || [];
    const item = list.find(s => s.id === streamId);
    if (!item || !Array.isArray(item.typical_course_interest)) return [];
    const mapped = item.typical_course_interest.map(x => INTEREST_TO_COURSE_CHIP[x]).filter(Boolean);
    return Array.from(new Set(mapped));
  }

  /**
   * Validates a question bank against the schema and against curriculum_subjects.json's
   * real stream/subject-group ids, so a typo'd eligible_stream_ids value fails loudly
   * at load time instead of silently excluding a question from every filter later.
   */
  function validateQuestionBank(bank, curriculumSubjects) {
    const errors = [];
    const seenIds = new Set();
    const curricula = curriculumSubjects.curricula || {};

    if (!bank || !Array.isArray(bank.questions)) {
      return ['question bank has no "questions" array'];
    }

    bank.questions.forEach((q, i) => {
      const where = `question[${i}]${q && q.id ? ` (${q.id})` : ''}`;

      for (const field of REQUIRED_FIELDS) {
        if (q[field] === undefined) errors.push(`${where}: missing required field "${field}"`);
      }
      if (!q.id) return;

      if (seenIds.has(q.id)) errors.push(`${where}: duplicate id`);
      seenIds.add(q.id);

      if (q.difficulty && !VALID_DIFFICULTIES.includes(q.difficulty)) {
        errors.push(`${where}: difficulty "${q.difficulty}" is not one of ${VALID_DIFFICULTIES.join('/')}`);
      }
      if (!Array.isArray(q.options) || q.options.length < 2 || new Set(q.options).size !== q.options.length) {
        errors.push(`${where}: options must be an array of unique values with at least 2 entries`);
      }
      if (Array.isArray(q.options) && !q.options.includes(q.answer)) {
        errors.push(`${where}: answer "${q.answer}" is not one of its own options`);
      }

      const curriculum = curricula[q.curriculum];
      if (!curriculum) {
        errors.push(`${where}: curriculum "${q.curriculum}" is not a key in curriculum_subjects.json`);
      } else if (Array.isArray(q.eligible_stream_ids) && q.eligible_stream_ids.length) {
        // Covers every curriculum shape (streams/groups/combination_clusters/
        // ap_categories/external_exam_tracks) via the same derivation
        // registration.js uses to populate the stream picker — see
        // getStreamOptions above. Previously this only checked .streams/.groups,
        // which silently let a typo'd British/American/SABIS id through
        // unvalidated (flagged in RUN_LOG.md 2026-09-19, fixed here).
        const validIds = new Set(getStreamOptions(curriculumSubjects, q.curriculum).map(o => o.id));
        for (const streamId of q.eligible_stream_ids) {
          if (!validIds.has(streamId)) {
            errors.push(`${where}: eligible_stream_ids value "${streamId}" is not a real stream/group id under curriculum "${q.curriculum}"`);
          }
        }
      }
    });

    return errors;
  }

  /** Loads and validates the bank, throwing loudly on any schema/reference error. */
  function loadQuestionBank(questionBank, curriculumSubjects) {
    const errors = validateQuestionBank(questionBank, curriculumSubjects);
    if (errors.length) {
      const msg = `[pedagogy] FATAL: question bank failed validation:\n- ${errors.join('\n- ')}`;
      console.error(msg);
      throw new Error(msg);
    }
    return questionBank.questions;
  }

  /**
   * Filters eligible questions for a visitor's declared curriculum/stream/subject.
   * An empty eligible_stream_ids on a question means "applies to every stream of
   * that curriculum" (see data/question_bank.json's note_on_stream_ids).
   */
  function getEligibleQuestions(questions, { curriculum, streamId, subject, difficulty }) {
    return questions.filter(q => {
      if (q.curriculum !== curriculum) return false;
      if (subject && q.subject !== subject) return false;
      if (difficulty && q.difficulty !== difficulty) return false;
      if (streamId && q.eligible_stream_ids.length && !q.eligible_stream_ids.includes(streamId)) return false;
      return true;
    });
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /**
   * Picks `count` unique questions for a visitor's quiz, with a fallback chain
   * so the stub bank (still small — session_handoff.md item K, real bank not
   * yet delivered) never comes up short or crashes:
   *   1. Eligible for the visitor's exact curriculum + stream.
   *   2. Topped up from the same curriculum, any stream (still on-curriculum,
   *      just not stream-matched — "the curriculum's generic pool").
   *   3. Topped up from the whole bank (any curriculum) as a last resort.
   * Logs via console.warn whenever tier 2 or 3 actually fires, so a thin bank
   * for some curriculum/stream combo is visible during Phase 2/5 QA rather
   * than silently under-serving that visitor.
   */
  function selectQuizQuestions(questions, count, { curriculum, streamId }) {
    const byId = new Map();
    const add = list => { for (const q of list) if (!byId.has(q.id)) byId.set(q.id, q); };

    add(getEligibleQuestions(questions, { curriculum, streamId }));
    if (byId.size < count) {
      const before = byId.size;
      add(getEligibleQuestions(questions, { curriculum }));
      if (byId.size > before) {
        console.warn(`[pedagogy] quiz fallback: only ${before} stream-matched question(s) for curriculum "${curriculum}" stream "${streamId || '(none)'}" — topped up to ${byId.size} from the same curriculum's other streams.`);
      }
    }
    if (byId.size < count) {
      const before = byId.size;
      add(shuffle(questions));
      console.warn(`[pedagogy] quiz fallback: only ${before} question(s) available for curriculum "${curriculum}" even after same-curriculum top-up — filled the remaining ${Math.min(count, byId.size) - before} slot(s) from the whole bank (any curriculum).`);
    }
    return shuffle(Array.from(byId.values())).slice(0, count);
  }

  window.PED.questions = { validateQuestionBank, loadQuestionBank, getEligibleQuestions, getStreamOptions, selectQuizQuestions, getSuggestedCourses };
})();
