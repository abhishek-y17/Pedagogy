// Classic script (see js/generated/data.js's header for why: ES modules are
// blocked over file:// by CORS in every current browser, verified empirically
// in both real Chrome and real Edge — RUN_LOG.md 2026-09-19). This file wires
// together the other window.PED.* modules; load order in index.html matters.
(function () {
  'use strict';
  const PED = window.PED;

  // Casual deterrent only — matches CLAUDE.md's standing decision that this build
  // has no real authentication anywhere (staff controls are "illustrative", same
  // as both reference prototypes). Long-press the logo to be prompted for this.
  const STAFF_PIN = '2026';

  const heroScreen = document.getElementById('heroScreen');
  const appShell = document.getElementById('appShell');
  const views = document.querySelectorAll('[data-view-panel]');
  const navButtons = document.querySelectorAll('.site-nav button[data-view]');
  const stepProgressEl = document.getElementById('stepProgress');
  const stepContentEl = document.getElementById('stepContent');
  const newVisitorBtn = document.getElementById('newVisitorBtn');
  const logoEl = document.querySelector('.brand-mark');

  let draft = null;
  let datasets = null;

  function showView(id) {
    views.forEach(v => { v.hidden = v.id !== `view-${id}`; });
    navButtons.forEach(b => b.classList.toggle('is-active', b.dataset.view === id));
  }

  navButtons.forEach(btn => btn.addEventListener('click', () => showView(btn.dataset.view)));

  // --- Step rendering ---------------------------------------------------
  // 'register', 'destinations', 'examPrep' and 'examList' have real content
  // (Phase 1). Every other step is still a labelled placeholder — built out in
  // Phase 2 onward — but the order and navigation around them are real. Every
  // renderer (real or placeholder) draws its own step-actions row with the
  // same onNext/onBack contract, so there is exactly one Back/Next affordance
  // on screen at a time.
  const REAL_RENDERERS = {
    register: (el, onNext) => PED.registration.renderRegister(el, draft, datasets, onNext),
    destinations: (el, onNext, onBack) => PED.destinations.renderDestinations(el, draft, datasets, onNext, onBack),
    examPrep: (el, onNext, onBack) => PED.destinations.renderExamPrep(el, draft, datasets, onNext, onBack),
    examList: (el, onNext, onBack) => PED.destinations.renderExamList(el, draft, datasets, onNext, onBack),
  };

  function renderPlaceholder(el, stepId, onNext, onBack, isFirst, isLast) {
    el.innerHTML = `
      <p class="eyebrow-small">PHASE 2+ PLACEHOLDER</p>
      <h2 class="step-heading">${stepId}</h2>
      <p class="field-hint">This screen is built in a later phase. Use Back/Next to keep testing the journey order around it.</p>
      <div class="step-actions">
        <button type="button" class="quiet" id="placeholderBackBtn"${isFirst ? ' disabled' : ''}>&larr; Back</button>
        <button type="button" class="primary" id="placeholderNextBtn">${isLast ? 'Finish (placeholder)' : 'Next →'}</button>
      </div>
    `;
    el.querySelector('#placeholderBackBtn').addEventListener('click', onBack);
    el.querySelector('#placeholderNextBtn').addEventListener('click', onNext);
  }

  function renderStep(direction) {
    const steps = PED.steps.getVisibleSteps(draft);
    const index = PED.steps.getCurrentIndex(draft);
    stepProgressEl.textContent = `Step ${index + 1} / ${steps.length}`;

    const onNext = () => { PED.state.mutateDraft(draft, PED.steps.goNext); renderStep('forward'); };
    const onBack = () => { PED.state.mutateDraft(draft, PED.steps.goPrev); renderStep('back'); };

    const renderer = REAL_RENDERERS[draft.currentStepId];
    if (renderer) {
      renderer(stepContentEl, onNext, onBack);
    } else {
      renderPlaceholder(stepContentEl, draft.currentStepId, onNext, onBack, PED.steps.isFirstStep(draft), PED.steps.isLastStep(draft));
    }

    // Direction-aware entrance (item 5): re-trigger the CSS animation by removing
    // and re-adding the class on the next frame.
    stepContentEl.classList.remove('step-anim-forward-in', 'step-anim-back-in');
    if (direction) {
      void stepContentEl.offsetWidth;
      stepContentEl.classList.add(direction === 'back' ? 'step-anim-back-in' : 'step-anim-forward-in');
    }
  }

  newVisitorBtn.addEventListener('click', () => {
    if (!confirm('Start a new visitor? The current in-progress entry (not yet submitted) will be cleared.')) return;
    draft = PED.state.resetForNewVisitor(draft.mode);
    renderStep();
    showView('home');
  });

  // --- Staff-view gate: long-press the logo, then a PIN prompt. Not real
  // security — it only needs to stop a visitor from casually tapping their way
  // into the staff dashboard on a shared stall device.
  let pressTimer = null;
  function armLongPress() {
    pressTimer = setTimeout(() => {
      const entered = window.prompt('Staff PIN');
      if (entered === null) return;
      if (entered === STAFF_PIN) showView('staff');
      else window.alert('Incorrect PIN.');
    }, 900);
  }
  function disarmLongPress() { clearTimeout(pressTimer); }
  logoEl.addEventListener('pointerdown', armLongPress);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => logoEl.addEventListener(evt, disarmLongPress));

  // Belt-and-braces autosave: every step transition already saves via mutateDraft,
  // but iPad Safari can discard a backgrounded tab's JS state without warning, so
  // force a save the moment the page is hidden or about to be torn down too.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && draft) PED.state.saveDraft(draft);
  });
  window.addEventListener('pagehide', () => { if (draft) PED.state.saveDraft(draft); });

  function boot() {
    datasets = PED.data.loadDatasets();
    const questions = PED.questions.loadQuestionBank(datasets.questionBank, datasets.curriculumSubjects);
    console.log(
      `[pedagogy] datasets loaded: ${datasets.schools.schools.length} schools, ` +
      `${Object.keys(datasets.curriculumSubjects.curricula).length} curricula, ` +
      `${Object.keys(datasets.destinationExams.destinations).length} destination-exam entries, ` +
      `${questions.length} stub questions (validated)`
    );

    draft = PED.state.loadDraft() || PED.state.createDraft('full');
    PED.state.saveDraft(draft);
    console.log('[pedagogy] draft state ready', draft.schema, draft.mode, draft.currentStepId);

    PED.hero.wireHero(() => {
      appShell.hidden = false;
      renderStep();
    });

    // Returning mid-journey on reload: skip the hero straight back into the app.
    if (draft.currentStepId !== 'register') {
      heroScreen.hidden = true;
      appShell.hidden = false;
      renderStep();
    }
  }

  try {
    boot();
  } catch (err) {
    console.error('[pedagogy] boot failed', err);
  }
})();
