// Datasets are inlined at dev-time by scripts/build-data.js (see js/generated/data.js
// and RUN_LOG.md 2026-09-19 "Decision 4a") — no runtime fetch(), so this works from
// a plain double-clicked index.html as well as a served page. Re-run
// `npm run build:data` any time a file under data/ changes.
import { SCHOOLS, CURRICULUM_SUBJECTS, DESTINATION_EXAMS, QUESTION_BANK } from './generated/data.js';

// Everything downstream (school autocomplete, stream filtering, exam chips, the
// quiz itself) depends on these being present. A silently-empty dataset must
// never be possible, so this fails loudly and immediately rather than letting
// the app limp along with e.g. no schools in the autocomplete.
function assertDataset(name, value, isEmpty) {
  if (value == null || isEmpty(value)) {
    const msg = `[pedagogy] FATAL: dataset "${name}" is missing or empty. ` +
      `Check data/${name}.json exists and is well-formed, then run "npm run build:data" ` +
      `to regenerate js/generated/data.js.`;
    console.error(msg);
    throw new Error(msg);
  }
}

let cache = null;

export function loadDatasets() {
  if (cache) return cache;

  assertDataset('schools', SCHOOLS, v => !Array.isArray(v.schools) || v.schools.length === 0);
  assertDataset('curriculum_subjects', CURRICULUM_SUBJECTS, v => !v.curricula || Object.keys(v.curricula).length === 0);
  assertDataset('destination_exams', DESTINATION_EXAMS, v => !v.destinations || Object.keys(v.destinations).length === 0);
  assertDataset('question_bank', QUESTION_BANK, v => !Array.isArray(v.questions) || v.questions.length === 0);

  cache = {
    schools: SCHOOLS,
    curriculumSubjects: CURRICULUM_SUBJECTS,
    destinationExams: DESTINATION_EXAMS,
    questionBank: QUESTION_BANK,
  };
  return cache;
}
