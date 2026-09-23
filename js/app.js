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
  // Every step in the full and express paths has real content. 'courses',
  // 'activities' and 'request' were removed entirely in round C (items 5/7/8)
  // — only data points that predict course interest and openness to studying
  // abroad stay in scope; game1/game2 were removed entirely in round E (see
  // js/steps.js and RUN_LOG.md — js/games.js itself is deleted, not just
  // unhooked, per this project's established precedent for removed steps).
  // renderPlaceholder() below is kept only as a fail-safe for an unrecognized
  // stepId (e.g. a future step added to steps.js without a renderer yet), not
  // because any real step still uses it. Every renderer draws its own
  // step-actions row with the same onNext/onBack contract, so there is
  // exactly one Back/Next affordance on screen at a time. A renderer may
  // return a cleanup function (only the quiz renderer does, for its
  // countdown interval) — renderStep() below always calls the previous
  // step's cleanup before rendering the next one.
  // Round E item 8 fix: entering a step via Review's own "Edit" link sets
  // returnToReview so the very next Continue/Back-equivalent action lands
  // back on Review instead of resuming the normal forward step order (see
  // onNext/onBack below, which are the ones that actually consume the flag).
  // onGotoReview (the timer-timeout auto-advance) defensively clears it too,
  // so a stale flag from an abandoned edit can never leak into a later,
  // unrelated Continue.
  const onGotoReview = () => { PED.state.mutateDraft(draft, d => { d.returnToReview = false; PED.steps.goToStep(d, 'review'); }); renderStep(); };
  const onJump = stepId => { PED.state.mutateDraft(draft, d => { d.returnToReview = true; PED.steps.goToStep(d, stepId); }); renderStep(); };
  const onSubmitted = () => {
    draft = PED.state.resetForNewVisitor(draft.mode);
    appShell.hidden = true;
    // hero.js's start() adds 'hero-screen--exit' (opacity:0, pointer-events:none)
    // when a visitor begins their journey and never removes it — showing the
    // hero again here without clearing it left it invisible and completely
    // unclickable for every visitor after the very first submission of the
    // day (reported live 2026-09-21). Must be cleared every time the hero is
    // shown again, not just once at boot.
    heroScreen.classList.remove('hero-screen--exit');
    heroScreen.hidden = false;
  };

  const REAL_RENDERERS = {
    // Round E item 1: onSubmitted is also passed through as onDone, so a
    // grade-9/10 visitor's direct-submit path (js/registration.js) can show
    // the same confirmation screen and reset for the next visitor exactly
    // like the normal review-screen Submit does.
    register: (el, onNext) => PED.registration.renderRegister(el, draft, datasets, onNext, onSubmitted),
    destinations: (el, onNext, onBack) => PED.destinations.renderDestinations(el, draft, datasets, onNext, onBack),
    examPrep: (el, onNext, onBack) => PED.destinations.renderExamPrep(el, draft, datasets, onNext, onBack),
    examList: (el, onNext, onBack) => PED.destinations.renderExamList(el, draft, datasets, onNext, onBack),
    q1: (el, onNext, onBack) => PED.quiz.renderQuestion(el, draft, datasets, 'q1', onNext, onBack, onGotoReview),
    q2: (el, onNext, onBack) => PED.quiz.renderQuestion(el, draft, datasets, 'q2', onNext, onBack, onGotoReview),
    q3: (el, onNext, onBack) => PED.quiz.renderQuestion(el, draft, datasets, 'q3', onNext, onBack, onGotoReview),
    q4: (el, onNext, onBack) => PED.quiz.renderQuestion(el, draft, datasets, 'q4', onNext, onBack, onGotoReview),
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

    // Round E item 8 fix: js/steps.js's goToStep() (used by Review's Edit
    // links, see onJump above) is a bare jump with no memory of where the
    // visitor came from — previously, whatever ran next just followed the
    // normal forward step order, so a single-field edit turned into clicking
    // Next through every remaining step again instead of returning to
    // Review. Both onNext and onBack now check+consume draft.returnToReview
    // first: if it's set (only true right after an Edit-link jump), the very
    // next Continue/Back-equivalent action goes straight back to Review
    // instead of advancing/retreating through the normal sequence — covering
    // every section Review can jump into (registration, destinations/
    // examPrep/examList, and each quiz question's own Next-or-Skip, since
    // quiz.js's Skip action also calls this same onNext). Ordinary first-time
    // walkthrough navigation is unaffected: returnToReview starts false and
    // is only ever set by onJump, so goNext()/goPrev() run exactly as before
    // for every visitor who hasn't tapped an Edit link.
    const onNext = () => {
      PED.state.mutateDraft(draft, d => {
        if (d.returnToReview) { d.returnToReview = false; PED.steps.goToStep(d, 'review'); }
        else PED.steps.goNext(d);
      });
      renderStep('forward');
    };
    const onBack = () => {
      PED.state.mutateDraft(draft, d => {
        if (d.returnToReview) { d.returnToReview = false; PED.steps.goToStep(d, 'review'); }
        else PED.steps.goPrev(d);
      });
      renderStep('back');
    };

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

  // codexreview.md finding, fixed here: js/state.js's clearAllData() wipes
  // localStorage but has no way to reach app.js's own in-memory `draft`
  // variable — only this closure holds that reference. Without this, staff
  // clicking "Clear all local data" while a visitor's registration was open
  // in memory would leave that stale draft sitting in memory, and the
  // existing autosave handlers (visibilitychange/pagehide, below) would write
  // it straight back to localStorage on the next backgrounding/exit, quietly
  // undoing the clear. Passed into js/staff.js as onDataCleared, called right
  // after state.clearAllData() on every "Clear all local data" click.
  function resetInMemoryDraftAfterClear() {
    draft = PED.state.resetForNewVisitor(draft.mode);
  }

  // --- Staff-view gate: long-press the logo, then a PIN prompt. Not real
  // security — it only needs to stop a visitor from casually tapping their way
  // into the staff dashboard on a shared stall device.
  let pressTimer = null;
  function armLongPress() {
    pressTimer = setTimeout(() => {
      const entered = window.prompt('Staff PIN');
      if (entered === null) return;
      if (entered === STAFF_PIN) {
        PED.staff.renderStaffDashboard(document.getElementById('view-staff'), datasets, jumpToQuizForTesting, resetInMemoryDraftAfterClear);
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
  // app — one delegated listener covers Back/Next/Continue/Submit/Skip/
  // site-nav/modal actions and anything rendered dynamically by a step
  // renderer, so a future new button gets this for free without per-file
  // wiring. Chips/checkboxes/radios aren't <button> elements, so they're
  // wired individually where they're built (js/chips.js, js/quiz.js,
  // js/registration.js, js/destinations.js's examPrep toggle).
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

  // TEST ONLY — REMOVE BEFORE THE REAL EVENT (11-13 Oct 2026), see CLAUDE.md.
  // Staff-gated shortcut (same long-press-logo + PIN gate as the rest of the
  // staff dashboard, no separate gating mechanism) that seeds a fake-but-valid
  // draft and jumps straight to q1, so the quiz/review flow can be tested
  // without re-typing a full registration every time.
  function jumpToQuizForTesting() {
    draft = PED.state.resetForNewVisitor('full');
    const today = new Date();
    const testDob = new Date(today.getFullYear() - 16, today.getMonth(), today.getDate()).toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();
    PED.state.mutateDraft(draft, d => {
      d.registration.name = 'Test Visitor';
      d.registration.dob = testDob;
      d.registration.parentCountryCode = '+971';
      d.registration.parentMobileLocal = '501234567';
      d.registration.parentMobile = '+971501234567';
      d.registration.school = null;
      d.registration.schoolKey = null;
      d.registration.curriculum = 'Indian';
      d.registration.grade = 'stage11';
      d.registration.stream = null;
      d.registration.tcsAccepted = true;
      d.registration.tcsAcceptedAt = nowIso;
      d.registration.consentToContact = true;
      d.registration.consentToContactAt = nowIso;
      d.currentStepId = 'q1';
    });
    heroScreen.hidden = true;
    appShell.hidden = false;
    showView('home');
    renderStep();
  }

  function boot() {
    datasets = PED.data.loadDatasets();
    const questions = PED.questions.loadQuestionBank(datasets.questionBank, datasets.curriculumSubjects);
    datasets.questions = questions; // validated list — quiz.js/review.js read this, not questionBank raw
    console.log(
      `[pedagogy] datasets loaded: ${datasets.schools.schools.length} schools, ` +
      `${Object.keys(datasets.curriculumSubjects.curricula).length} curricula, ` +
      `${Object.keys(datasets.destinationExams.destinations).length} destination-exam entries, ` +
      `${questions.length} questions (validated)`
    );

    // Reported live 2026-09-21: a refresh while still on the registration
    // form kept showing stale values from a previous attempt (old test name/
    // phone numbers), which read as "this should have reset." A visitor who
    // hasn't advanced past registration hasn't made any progress worth
    // protecting, so that specific case now discards the loaded draft and
    // starts genuinely blank. Once currentStepId has moved past 'register',
    // the resilience this was built for is unchanged: a real visitor's
    // quiz/preference progress still survives an iPad Safari background-tab
    // discard exactly as before — only the pre-registration case changed.
    let loaded = PED.state.loadDraft();
    if (loaded && loaded.currentStepId === 'register') loaded = null;
    draft = loaded || PED.state.createDraft('full');
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
