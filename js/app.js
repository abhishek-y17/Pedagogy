import { loadDatasets } from './data.js';
import { loadDraft, createDraft, saveDraft } from './state.js';

const views = document.querySelectorAll('[data-view-panel]');
const navButtons = document.querySelectorAll('.site-nav button[data-view]');

function showView(id) {
  views.forEach(v => { v.hidden = v.id !== `view-${id}`; });
  navButtons.forEach(b => b.classList.toggle('is-active', b.dataset.view === id));
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

async function boot() {
  const datasets = await loadDatasets();
  console.log(
    `[pedagogy] datasets loaded: ${datasets.schools.counts?.total_schools ?? '?'} schools, ` +
    `${Object.keys(datasets.curriculumSubjects.curricula ?? {}).length} curricula, ` +
    `${Object.keys(datasets.destinationExams.destinations ?? {}).length} destination-exam entries`
  );

  const draft = loadDraft() || createDraft('full');
  saveDraft(draft);
  console.log('[pedagogy] draft state ready', draft.schema, draft.mode);
}

boot().catch(err => console.error('[pedagogy] boot failed', err));
