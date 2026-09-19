import { loadDatasets } from './data.js';
import { loadQuestionBank } from './questions.js';
import { loadDraft, createDraft, saveDraft, mutateDraft, resetForNewVisitor } from './state.js';
import { getVisibleSteps, getCurrentIndex, isFirstStep, isLastStep, goNext, goPrev } from './steps.js';

// Casual deterrent only — matches CLAUDE.md's standing decision that this build
// has no real authentication anywhere (staff controls are "illustrative", same
// as both reference prototypes). Long-press the logo to be prompted for this.
const STAFF_PIN = '2026';

const views = document.querySelectorAll('[data-view-panel]');
const navButtons = document.querySelectorAll('.site-nav button[data-view]');
const stepProgressEl = document.getElementById('stepProgress');
const stepIdEl = document.getElementById('stepIdLabel');
const stepBackBtn = document.getElementById('stepBackBtn');
const stepNextBtn = document.getElementById('stepNextBtn');
const newVisitorBtn = document.getElementById('newVisitorBtn');
const logoEl = document.querySelector('.brand-mark');

let draft = null;

function showView(id) {
  views.forEach(v => { v.hidden = v.id !== `view-${id}`; });
  navButtons.forEach(b => b.classList.toggle('is-active', b.dataset.view === id));
}

function renderStep() {
  const steps = getVisibleSteps(draft);
  const index = getCurrentIndex(draft);
  stepProgressEl.textContent = `Step ${index + 1} / ${steps.length}`;
  stepIdEl.textContent = draft.currentStepId;
  stepBackBtn.disabled = isFirstStep(draft);
  stepNextBtn.textContent = isLastStep(draft) ? 'Finish (placeholder)' : 'Next →';
}

navButtons.forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

stepNextBtn.addEventListener('click', () => {
  mutateDraft(draft, goNext);
  renderStep();
});

stepBackBtn.addEventListener('click', () => {
  mutateDraft(draft, goPrev);
  renderStep();
});

newVisitorBtn.addEventListener('click', () => {
  if (!confirm('Start a new visitor? The current in-progress entry (not yet submitted) will be cleared.')) return;
  draft = resetForNewVisitor(draft.mode);
  renderStep();
  showView('home');
});

// Staff-view gate: long-press the logo, then a PIN prompt. Not real security —
// it only needs to stop a visitor from casually tapping their way into the
// staff dashboard on a shared stall device.
let pressTimer = null;
function armLongPress() {
  pressTimer = setTimeout(() => {
    const entered = window.prompt('Staff PIN');
    if (entered === null) return;
    if (entered === STAFF_PIN) {
      showView('staff');
    } else {
      window.alert('Incorrect PIN.');
    }
  }, 900);
}
function disarmLongPress() {
  clearTimeout(pressTimer);
}
logoEl.addEventListener('pointerdown', armLongPress);
['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => logoEl.addEventListener(evt, disarmLongPress));

// Belt-and-braces autosave: every step transition already saves via mutateDraft,
// but iPad Safari can discard a backgrounded tab's JS state without warning, so
// force a save the moment the page is hidden or about to be torn down too.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && draft) saveDraft(draft);
});
window.addEventListener('pagehide', () => {
  if (draft) saveDraft(draft);
});

async function boot() {
  const datasets = await loadDatasets();
  const questions = loadQuestionBank(datasets.questionBank, datasets.curriculumSubjects);
  console.log(
    `[pedagogy] datasets loaded: ${datasets.schools.schools.length} schools, ` +
    `${Object.keys(datasets.curriculumSubjects.curricula).length} curricula, ` +
    `${Object.keys(datasets.destinationExams.destinations).length} destination-exam entries, ` +
    `${questions.length} stub questions (validated)`
  );

  draft = loadDraft() || createDraft('full');
  saveDraft(draft);
  console.log('[pedagogy] draft state ready', draft.schema, draft.mode, draft.currentStepId);

  renderStep();
}

boot().catch(err => console.error('[pedagogy] boot failed', err));
