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
  // Every step in the full and express paths now has real content —
  // 'request' (follow-up channel + optional note) was the last one still
  // showing the generic dev placeholder, closed out for the final build.
  // renderPlaceholder() below is kept only as a fail-safe for an unrecognized
  // stepId (e.g. a future step added to steps.js without a renderer yet), not
  // because any real step still uses it. Every renderer draws its own
  // step-actions row with the same onNext/onBack contract, so there is
  // exactly one Back/Next affordance on screen at a time. A renderer may
  // return a cleanup function (only the quiz renderer does, for its
  // countdown interval) — renderStep() below always calls the previous
  // step's cleanup before rendering the next one.
  const onGotoReview = () => { PED.state.mutateDraft(draft, d => PED.steps.goToStep(d, 'review')); renderStep(); };
  const onJump = stepId => { PED.state.mutateDraft(draft, d => PED.steps.goToStep(d, stepId)); renderStep(); };
  const onSubmitted = () => {
    draft = PED.state.resetForNewVisitor(draft.mode);
    appShell.hidden = true;
    heroScreen.hidden = false;
  };

  const REAL_RENDERERS = {
    register: (el, onNext) => PED.registration.renderRegister(el, draft, datasets, onNext),
    destinations: (el, onNext, onBack) => PED.destinations.renderDestinations(el, draft, datasets, onNext, onBack),
    examPrep: (el, onNext, onBack) => PED.destinations.renderExamPrep(el, draft, datasets, onNext, onBack),
    examList: (el, onNext, onBack) => PED.destinations.renderExamList(el, draft, datasets, onNext, onBack),
    game1: (el, onNext, onBack) => PED.games.renderGame1(el, draft, onNext, onBack),
    courses: (el, onNext, onBack) => PED.courses.renderCourses(el, draft, datasets, onNext, onBack),
    game2: (el, onNext, onBack) => PED.games.renderGame2(el, draft, onNext, onBack),
    activities: (el, onNext, onBack) => PED.courses.renderActivities(el, draft, datasets, onNext, onBack),
    request: (el, onNext, onBack) => PED.request.renderRequest(el, draft, datasets, onNext, onBack),
    q1: (el, onNext, onBack) => PED.quiz.renderQuestion(el, draft, datasets, 'q1', onNext, onBack, onGotoReview),
    q2: (el, onNext, onBack) => PED.quiz.renderQuestion(el, draft, datasets, 'q2', onNext, onBack, onGotoReview),
    q3: (el, onNext, onBack) => PED.quiz.renderQuestion(el, draft, datasets, 'q3', onNext, onBack, onGotoReview),
    q4: (el, onNext, onBack) => PED.quiz.renderQuestion(el, draft, datasets, 'q4', onNext, onBack, onGotoReview),
    q5: (el, onNext, onBack) => PED.quiz.renderQuestion(el, draft, datasets, 'q5', onNext, onBack, onGotoReview),
    review: (el, onNext, onBack) => PED.review.renderReview(el, draft, datasets, { onBack, onJump, onDone: onSubmitted }),
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

  // Only the quiz renderer currently returns a cleanup (its countdown
  // interval) — tracked here so renderStep() can always stop the previous
  // step's timer/interval before tearing down its DOM, regardless of which
  // direction navigation came from (Next, Back, an edit-jump from review, or
  // the timeout auto-advance to review).
  let stepCleanup = null;

  function renderStep(direction) {
    if (stepCleanup) { stepCleanup(); stepCleanup = null; }

    // Pooled quiz timer: pause/resume based on the step we're entering, before
    // that step actually renders, so its own countdown display (if any)
    // starts from the correct remaining time on first paint.
    PED.state.mutateDraft(draft, d => PED.timer.syncForStep(d, d.currentStepId));

    const steps = PED.steps.getVisibleSteps(draft);
    const index = PED.steps.getCurrentIndex(draft);
    stepProgressEl.textContent = `Step ${index + 1} / ${steps.length}`;

    const onNext = () => { PED.state.mutateDraft(draft, PED.steps.goNext); renderStep('forward'); };
    const onBack = () => { PED.state.mutateDraft(draft, PED.steps.goPrev); renderStep('back'); };

    const renderer = REAL_RENDERERS[draft.currentStepId];
    if (renderer) {
      stepCleanup = renderer(stepContentEl, onNext, onBack) || null;
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
      if (entered === STAFF_PIN) {
        PED.staff.renderStaffDashboard(document.getElementById('view-staff'), datasets);
        showView('staff');
      } else {
        window.alert('Incorrect PIN.');
      }
    }, 900);
  }
  function disarmLongPress() { clearTimeout(pressTimer); }
  logoEl.addEventListener('pointerdown', armLongPress);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => logoEl.addEventListener(evt, disarmLongPress));

  // Haptic tap feedback (Phase 4 haptics pass) on every button anywhere in the
  // app — one delegated listener covers Back/Next/Continue/Submit/Skip/game
  // Skip-or-Continue/site-nav/modal actions and anything rendered dynamically
  // by a step renderer, so a future new button gets this for free without
  // per-file wiring. Chips/checkboxes/radios aren't <button> elements, so
  // they're wired individually where they're built (js/chips.js, js/quiz.js,
  // js/registration.js, js/request.js, js/destinations.js's examPrep toggle).
  // A true no-op on iPadOS Safari either way (js/haptics.js), never a hard
  // dependency — the spring/scale visual feedback on every one of those
  // elements is what actually carries the "felt" response there.
  document.addEventListener('click', e => {
    if (e.target.closest('button')) PED.haptics.tap();
  });

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
    datasets.questions = questions; // validated list — quiz.js/review.js read this, not questionBank raw
    console.log(
      `[pedagogy] datasets loaded: ${datasets.schools.schools.length} schools, ` +
      `${Object.keys(datasets.curriculumSubjects.curricula).length} curricula, ` +
      `${Object.keys(datasets.destinationExams.destinations).length} destination-exam entries, ` +
      `${questions.length} stub questions (validated)`
    );

    draft = PED.state.loadDraft() || PED.state.createDraft('full');
    PED.state.saveDraft(draft);
    console.log('[pedagogy] draft state ready', draft.schema, draft.mode, draft.currentStepId);

    // mode comes from which hero entry point the visitor tapped (primary CTA/
    // banner/drag-gesture -> 'full', the secondary express link -> 'express').
    // Safe to set on the still-fresh 'register'-step draft created just above —
    // a resumed mid-journey draft never reaches the hero at all (see the
    // currentStepId check below), so this can never silently flip an
    // in-progress visitor's mode mid-journey.
    PED.hero.wireHero(mode => {
      PED.state.mutateDraft(draft, d => { d.mode = mode; });
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
