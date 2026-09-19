// Classic script. Courses and activities steps (Phase 3): plain tap-chip
// multi-selects, same reference/pedagogy-expo.html pattern already used for
// destinations before its grid+search redesign — no search overlay here
// (CLAUDE.md: "Courses and activities stay simple tap-chip multi-selects...
// their lists are already short"). Courses carries the same mutual-exclusivity
// handling as the reference ("Undecided" clears every other pick); activities
// has no exclusive value in the reference either, so none is added here.
(function () {
  'use strict';
  window.PED = window.PED || {};
  const { renderChipGrid } = window.PED.chips;

  const COURSE_OPTIONS = [
    'Medicine', 'Engineering', 'Computing / AI', 'Business / Finance', 'Law',
    'Arts / Design', 'Humanities', 'Health sciences', 'Undecided', 'Other',
  ];
  const ACTIVITY_OPTIONS = [
    'Sport', 'Coding / Robotics', 'Music', 'Art / Design', 'Debate / Writing',
    'Volunteering', 'Entrepreneurship', 'Other',
  ];

  /** Suggested-first ordering (visual only — courses.js/chips.js never hide or
   * restrict options based on this, see js/questions.js's getSuggestedCourses
   * for the "pre-suggest, not force" rationale from curriculum_subjects.json). */
  function orderWithSuggestedFirst(options, suggested) {
    if (!suggested.length) return options;
    const suggestedSet = new Set(suggested);
    return [...options.filter(o => suggestedSet.has(o)), ...options.filter(o => !suggestedSet.has(o))];
  }

  function renderCourses(container, draft, datasets, onNext, onBack) {
    const prefs = draft.preferences;
    const reg = draft.registration;
    const suggested = window.PED.questions.getSuggestedCourses(datasets.curriculumSubjects, reg.curriculum, reg.stream)
      .filter(c => COURSE_OPTIONS.includes(c));
    const options = orderWithSuggestedFirst(COURSE_OPTIONS, suggested);

    container.innerHTML = `
      <p class="eyebrow-small">WHAT WOULD YOU LIKE HELP EXPLORING?</p>
      <h2 class="step-heading">Which courses interest you?</h2>
      <p class="field-hint">Tap any that apply.${suggested.length ? ' <span aria-hidden="true">&#10022;</span> marks a strong match for your stream — just a hint, pick whatever genuinely interests you.' : ''}</p>
      <div id="coursesChipGrid"></div>
      <div class="step-actions">
        <button type="button" class="quiet" id="coursesBackBtn">&larr; Back</button>
        <button type="button" class="primary" id="coursesNextBtn">Continue &rarr;</button>
      </div>
    `;

    renderChipGrid(container.querySelector('#coursesChipGrid'), {
      name: 'courses',
      options,
      selected: prefs.courses,
      exclusiveValues: ['Undecided'],
      suggested,
      onChange: selected => window.PED.state.mutateDraft(draft, () => { prefs.courses = selected; }),
    });

    container.querySelector('#coursesBackBtn').addEventListener('click', onBack);
    container.querySelector('#coursesNextBtn').addEventListener('click', onNext);
  }

  function renderActivities(container, draft, datasets, onNext, onBack) {
    const prefs = draft.preferences;

    container.innerHTML = `
      <p class="eyebrow-small">THERE IS MORE TO YOU THAN EXAM RESULTS</p>
      <h2 class="step-heading">What do you enjoy outside class?</h2>
      <p class="field-hint">Tap any that apply.</p>
      <div id="activitiesChipGrid"></div>
      <div class="step-actions">
        <button type="button" class="quiet" id="activitiesBackBtn">&larr; Back</button>
        <button type="button" class="primary" id="activitiesNextBtn">Continue &rarr;</button>
      </div>
    `;

    renderChipGrid(container.querySelector('#activitiesChipGrid'), {
      name: 'activities',
      options: ACTIVITY_OPTIONS,
      selected: prefs.activities,
      exclusiveValues: [],
      onChange: selected => window.PED.state.mutateDraft(draft, () => { prefs.activities = selected; }),
    });

    container.querySelector('#activitiesBackBtn').addEventListener('click', onBack);
    container.querySelector('#activitiesNextBtn').addEventListener('click', onNext);
  }

  window.PED.courses = { renderCourses, renderActivities, COURSE_OPTIONS, ACTIVITY_OPTIONS };
})();
