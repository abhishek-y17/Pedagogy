// Classic script (not an ES module — see js/generated/data.js's header comment
// for why). Depends on js/generated/data.js having already run and set
// window.PED.GENERATED; load order is enforced by <script> tag order in index.html.
(function () {
  'use strict';
  window.PED = window.PED || {};
  const GENERATED = window.PED.GENERATED;

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

  function loadDatasets() {
    if (cache) return cache;
    if (!GENERATED) {
      throw new Error('[pedagogy] FATAL: js/generated/data.js did not load before js/data.js.');
    }

    const { SCHOOLS, CURRICULUM_SUBJECTS, DESTINATION_EXAMS, QUESTION_BANK } = GENERATED;

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

  window.PED.data = { loadDatasets };
})();
