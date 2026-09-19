// Question bank schema + loader. The real bank (~50-70 questions per subject per
// difficulty tier per curriculum, per session_handoff.md Section 3K) has not been
// delivered yet — data/question_bank.json is a small stub so this loader and its
// validation can be built and tested now, and the real bank can drop in later
// without any code changes as long as it matches this schema.

const REQUIRED_FIELDS = ['id', 'curriculum', 'eligible_stream_ids', 'subject', 'difficulty', 'language', 'q', 'options', 'answer'];
const VALID_DIFFICULTIES = ['easy', 'medium', 'hard'];

/**
 * Validates a question bank against the schema and against curriculum_subjects.json's
 * real stream/subject-group ids, so a typo'd eligible_stream_ids value fails loudly
 * at load time instead of silently excluding a question from every filter later.
 */
export function validateQuestionBank(bank, curriculumSubjects) {
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
      const validIds = new Set([
        ...(curriculum.streams || []).map(s => s.id),
        ...(curriculum.groups || []).map(g => g.id),
      ]);
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
export function loadQuestionBank(questionBank, curriculumSubjects) {
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
export function getEligibleQuestions(questions, { curriculum, streamId, subject, difficulty }) {
  return questions.filter(q => {
    if (q.curriculum !== curriculum) return false;
    if (subject && q.subject !== subject) return false;
    if (difficulty && q.difficulty !== difficulty) return false;
    if (streamId && q.eligible_stream_ids.length && !q.eligible_stream_ids.includes(streamId)) return false;
    return true;
  });
}
