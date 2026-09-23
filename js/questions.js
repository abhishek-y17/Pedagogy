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
   * that never comes up short or crashes:
   *   1. Eligible for the visitor's exact curriculum + stream.
   *   2. If tier 1 found NOTHING at all (a genuinely empty stream — see below),
   *      top up from the curriculum-neutral Aptitude pool rather than reaching
   *      into a different, irrelevant subject within the same curriculum.
   *   3. Topped up from the same curriculum, any stream (still on-curriculum,
   *      just not stream-matched — "the curriculum's generic pool").
   *   4. Topped up from the whole bank (any curriculum) as a last resort.
   * Logs via console.warn whenever tier 2, 3 or 4 actually fires, so a thin
   * bank for some curriculum/stream combo is visible during QA rather than
   * silently under-serving that visitor.
   *
   * Why tier 2 exists (codexreview.md finding, re-checked after the Round E
   * question-bank merge): even after that merge, a handful of real streams
   * still have zero eligible questions of their own — IB groups 1/2/6
   * (Language A, Language Acquisition, The Arts) and American's Capstone/
   * Arts/English/World Languages categories, none of which the delivered
   * banks cover (deliberately — language/literature/arts subjects were
   * excluded from both deliveries). Before this fix, tier 2 was "same
   * curriculum, any stream," which for e.g. an IB group-6 (Arts) visitor
   * meant silently serving Biology/Physics/Economics questions — exactly the
   * "irrelevant subject content" the standing decision says never to show.
   * The curriculum-neutral Aptitude pool (already used elsewhere for the
   * per-visitor ~1-in-3 substitution, see maybeSubstituteAptitude below) is a
   * defensible stand-in for a genuinely unmodeled stream: it isn't a WRONG
   * subject, just a subject-neutral one. This tier only fires when tier 1
   * found literally nothing for that stream — a visitor whose stream DOES
   * have some content, just not quite enough to fill every slot, still tops
   * up from tier 3 (same curriculum) first, matching the previous behavior.
   */
  function selectQuizQuestions(questions, count, { curriculum, streamId }) {
    const byId = new Map();
    const add = list => { for (const q of list) if (!byId.has(q.id)) byId.set(q.id, q); };

    add(getEligibleQuestions(questions, { curriculum, streamId }));
    const streamMatchedCount = byId.size;

    if (streamMatchedCount === 0 && streamId) {
      const before = byId.size;
      add(questions.filter(q => q.curriculum === 'Aptitude'));
      if (byId.size > before) {
        console.warn(`[pedagogy] quiz fallback: 0 eligible question(s) for curriculum "${curriculum}" stream "${streamId}" (a known-unmodeled stream) — filled from the curriculum-neutral Aptitude pool instead of a different, irrelevant subject in the same curriculum.`);
      }
    }

    if (byId.size < count) {
      const before = byId.size;
      add(getEligibleQuestions(questions, { curriculum }));
      if (byId.size > before) {
        console.warn(`[pedagogy] quiz fallback: only ${before} question(s) so far for curriculum "${curriculum}" stream "${streamId || '(none)'}" — topped up to ${byId.size} from the same curriculum's other streams.`);
      }
    }
    if (byId.size < count) {
      const before = byId.size;
      add(shuffle(questions));
      console.warn(`[pedagogy] quiz fallback: only ${before} question(s) available for curriculum "${curriculum}" even after same-curriculum top-up — filled the remaining ${Math.min(count, byId.size) - before} slot(s) from the whole bank (any curriculum).`);
    }
    return shuffle(Array.from(byId.values())).slice(0, count);
  }

  /**
   * Per-visitor coin-flip (not per-slot): with ~1/3 probability, swaps one
   * random slot in `selected` for a random question from the shared
   * "Aptitude" pool (question_bank_output/aptitude/, merged in by
   * scripts/merge-question-bank.js). Fires at most once per quiz regardless
   * of quiz length (full path 5 slots, express 1 slot), never touches the
   * question count (timer/review/staff-analytics all key off count), and is
   * a no-op if the Aptitude pool is empty. `rng` is injectable for tests.
   */
  function maybeSubstituteAptitude(selected, allQuestions, rng = Math.random) {
    if (!selected.length) return selected;
    if (rng() >= 1 / 3) return selected;
    const pool = allQuestions.filter(q => q.curriculum === 'Aptitude');
    if (!pool.length) return selected;
    const slot = Math.floor(rng() * selected.length);
    const replacement = pool[Math.floor(rng() * pool.length)];
    const next = selected.slice();
    next[slot] = replacement;
    console.log(`[pedagogy] aptitude substitution fired: slot ${slot} swapped for "${replacement.subject}" (${replacement.difficulty}, ${replacement.id}).`);
    return next;
  }

  window.PED.questions = { validateQuestionBank, loadQuestionBank, getEligibleQuestions, getStreamOptions, selectQuizQuestions, maybeSubstituteAptitude };
})();
