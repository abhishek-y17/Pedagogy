// Classic script. Final review screen (Phase 2, session_handoff.md item D):
// built entirely from the in-memory draft, every section tap-to-edit (jumps
// back into that exact step via steps.js's goToStep), single Submit action
// that is the ONLY call site for finalizeDraft() — see state.js. Re-validates
// registration at submit time as a defensive re-check (item 1): the register
// step's own Continue button already blocks on the same rules, so this is a
// belt-and-braces safety net, not the only gate.
//
// Round C: courses/activities/follow-up sections removed along with their
// steps (js/steps.js) — this screen only ever reflects whatever's actually
// still on the draft.
(function () {
  'use strict';
  window.PED = window.PED || {};
  const { escapeHtml } = window.PED.chips;

  const GRADE_LOOKUP = {}; // filled lazily from registration.gradeOptionsFor to show real labels
  function gradeLabel(curriculum, value) {
    const options = window.PED.registration.gradeOptionsFor(curriculum);
    const match = options.find(o => o.value === value);
    return match ? match.label : (value || '—');
  }

  function section(title, stepId, bodyHtml, onJump) {
    return `
      <section class="review-section">
        <div class="review-section-head">
          <h3>${escapeHtml(title)}</h3>
          <button type="button" class="link-btn" data-jump="${escapeHtml(stepId)}">Edit</button>
        </div>
        ${bodyHtml}
      </section>
    `;
  }

  function renderRegistrationSection(draft, datasets) {
    const r = draft.registration;
    const streamLabel = (() => {
      if (!r.stream) return null;
      const opts = window.PED.questions.getStreamOptions(datasets.curriculumSubjects, r.curriculum);
      const match = opts.find(o => o.id === r.stream);
      return match ? match.label : r.stream;
    })();
    const rows = [
      ['Name', r.name],
      ['Date of birth', r.dob],
      ['Parent / guardian mobile', r.parentMobile],
      ['Student mobile', r.studentMobile || '— (not given)'],
      ['School', r.school || '—'],
      ['Curriculum', r.curriculum || '—'],
      ['Grade', r.curriculum ? gradeLabel(r.curriculum, r.grade) : (r.grade || '—')],
      ['Stream', streamLabel || 'Not applicable / no stream'],
      ['Terms & Conditions', r.tcsAccepted ? 'Accepted' : 'Not yet accepted'],
      ['Consent to contact', r.consentToContact ? 'Given' : 'Not yet given'],
      ['Updates about programs & offers', r.marketingOptIn ? 'Yes, please' : 'No thanks'],
    ];
    return section('Registration', 'register', `
      <dl class="review-fields">
        ${rows.map(([k, v]) => `<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}
      </dl>
    `);
  }

  function renderPreferencesSection(draft, datasets) {
    const p = draft.preferences;
    const destinationList = [...p.destinations.filter(d => d !== 'Other'), ...(p.destinationsOther || [])];
    const destinationsText = destinationList.length ? destinationList.join(', ') : 'None selected';

    let examText;
    if (p.competitiveExamPrep !== 'yes') {
      examText = p.competitiveExamPrep === 'no' ? 'Not preparing for a competitive exam' : 'Not answered yet';
    } else if (p.competitiveExams && p.competitiveExams.Other) {
      examText = `(free text) ${p.competitiveExams.Other}`;
    } else {
      const parts = Object.entries(p.competitiveExams || {}).map(([country, exams]) => `${country}: ${exams.join(', ')}`);
      examText = parts.length ? parts.join(' • ') : 'Yes, but no specific exams picked yet';
    }

    return section('Destinations & exam prep', 'destinations', `
      <dl class="review-fields">
        <div><dt>Destinations</dt><dd>${escapeHtml(destinationsText)}</dd></div>
        <div><dt>Competitive exam prep</dt><dd>${escapeHtml(examText)}</dd></div>
      </dl>
    `);
  }

  /** Each question renders as its own bordered block (not a run of thin
   * dl-rows that were hard to tell apart from each other) with the question
   * text, every answer option (so the visitor/staff can see what they were
   * choosing between, not just the pick), the selected option visually
   * marked, and its own Edit link — reported live 2026-09-21 that the old
   * layout made it unclear which line was the question at all. */
  function renderQuizSection(draft, datasets) {
    const stepIds = window.PED.steps.getQuestionStepIds(draft);
    const items = stepIds.map((stepId, i) => {
      const questionId = draft.quiz.selectedQuestionIds[i];
      const question = datasets.questions.find(q => q.id === questionId);
      const answer = draft.quiz.answers.find(a => a.questionId === questionId);
      let statusText = null;
      if (!answer || answer.selected == null) {
        if (answer && answer.timedOut) statusText = 'Not answered — time ran out';
        else if (answer && answer.skipped) statusText = 'Skipped';
        else statusText = 'Not answered yet';
      }
      const optionsHtml = question ? `
        <ul class="review-quiz-options">
          ${question.options.map(opt => `<li class="${answer && answer.selected === opt ? 'review-quiz-options--selected' : ''}">${escapeHtml(opt)}</li>`).join('')}
        </ul>
      ` : '';
      return `
        <div class="review-quiz-item">
          <div class="review-quiz-item-head">
            <p class="review-quiz-number">Question ${i + 1} of ${stepIds.length}</p>
            <button type="button" class="link-btn" data-jump="${escapeHtml(stepId)}">Edit</button>
          </div>
          <p class="review-quiz-question">${question ? escapeHtml(question.q) : 'This question could not be loaded.'}</p>
          ${optionsHtml}
          ${statusText ? `<p class="review-quiz-status">${escapeHtml(statusText)}</p>` : ''}
        </div>
      `;
    });
    return `
      <section class="review-section">
        <div class="review-section-head"><h3>Academic questions</h3></div>
        ${items.join('')}
      </section>
    `;
  }

  /**
   * `onDone` is called after a successful submit instead of the usual
   * onNext/goNext step-advance — review is the last step, and more
   * importantly, calling the ordinary onNext() here would re-save the
   * just-finalized (and now cleared-from-localStorage) draft right back into
   * the draft slot via mutateDraft's autosave. app.js's onDone instead resets
   * for the next visitor and returns to the hero screen.
   */
  function renderReview(container, draft, datasets, { onBack, onJump, onDone }) {
    container.innerHTML = `
      <p class="eyebrow-small">LAST STEP</p>
      <h2 class="step-heading">Review everything before you submit.</h2>
      <p class="field-hint">Tap "Edit" on any section to jump back and change it. Nothing is saved until you submit.</p>
      ${renderRegistrationSection(draft, datasets)}
      ${renderPreferencesSection(draft, datasets)}
      ${renderQuizSection(draft, datasets)}
      <div class="step-actions">
        <button type="button" class="quiet" id="reviewBackBtn">&larr; Back</button>
        <button type="button" class="primary" id="reviewSubmitBtn">Submit &rarr;</button>
      </div>
    `;

    container.querySelectorAll('[data-jump]').forEach(btn => {
      btn.addEventListener('click', () => onJump(btn.dataset.jump));
    });
    container.querySelector('#reviewBackBtn').addEventListener('click', onBack);
    container.querySelector('#reviewSubmitBtn').addEventListener('click', () => {
      // Defensive re-check (item 1): the register step's own Continue button
      // already enforces this before a visitor can even reach later steps, so
      // this should never actually fail in normal use — see file header.
      const result = window.PED.registration.validateRegistrationForSubmit(draft.registration);
      if (!result.ok) {
        // Navigate back to register only once the modal is actually
        // dismissed, not immediately alongside opening it — see
        // presentValidationFailure()'s comment in registration.js. This stays
        // a modal (rather than an inline error, unlike registration.js's own
        // fields) because Review has no live editable field to attach the
        // error to — it's a summary screen, not a form.
        window.PED.registration.presentValidationFailure(result, () => onJump('register'));
        return;
      }
      window.PED.state.mutateDraft(draft, () => {
        draft.registration.parentMobile = result.parentPhone;
        draft.registration.studentMobile = result.studentPhone;
      });
      const outcome = window.PED.state.finalizeDraft(draft, datasets.questions);
      if (!outcome.ok) {
        // codexreview.md finding, fixed here: finalizeDraft()'s underlying
        // saveRecords() can fail (storage quota, private-mode restrictions),
        // and that failure used to be silently discarded — the review screen
        // always showed the success confirmation regardless, which could
        // lose a real registration with no visible sign anything went wrong.
        // The draft is left un-cleared on failure (state.js), so this is a
        // real, recoverable retry path, not a dead end.
        window.PED.modal.open(
          "We couldn't save this",
          '<p>Something went wrong saving your registration on this device. Nothing has been lost — please try Submit again, and let a staff member know if it keeps happening.</p>',
          [{ label: 'Try again', action: () => {} }]
        );
        return;
      }
      renderSubmitted(container, onDone);
    });
  }

  /** Confirmation screen after a successful submit. Reworked 2026-09-21 (live
   * feedback: the plain text-only version didn't feel like a real
   * confirmation, and the visitor had nowhere to go from there). Adds a
   * code-drawn animated checkmark + a small confetti burst (no image assets,
   * per CLAUDE.md's visual-design direction; both skip under
   * prefers-reduced-motion), the requested copy (thank-you + WhatsApp-updates
   * note), and an auto-redirect back to the hero ("win an iPad" landing)
   * after 5 seconds — with a manual "Continue now" escape hatch so nobody is
   * stuck waiting on the timer. The equal-odds compliance line from the
   * original copy is kept, just as a secondary line rather than the headline. */
  function renderSubmitted(container, onDone) {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    container.innerHTML = `
      <div class="submitted-confirm">
        <div class="submitted-badge" aria-hidden="true">
          <svg viewBox="0 0 80 80" width="88" height="88">
            <circle class="submitted-badge-ring" cx="40" cy="40" r="36" fill="none" stroke-width="5"/>
            <path class="submitted-badge-check" d="M24 41 L35 52 L57 28" fill="none" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          ${reduceMotion ? '' : `<div class="submitted-confetti">${Array.from({ length: 10 }).map((_, i) => `<span class="confetti-dot" style="--i:${i}"></span>`).join('')}</div>`}
        </div>
        <p class="eyebrow-small">ALL DONE</p>
        <h2 class="step-heading">Thank you for participating!</h2>
        <p class="submitted-lead">You're now in the contest to win an iPad. One equal-chance draw entry
        has been created for you, independent of quiz score or how much of the experience was completed.</p>
        <p class="submitted-whatsapp">You'll get updates on your registered mobile number via WhatsApp.</p>
        <div class="step-actions">
          <button type="button" class="quiet" id="submittedDoneBtn">Continue now</button>
        </div>
        <p class="submitted-redirect-note" id="submittedRedirectNote" role="status" aria-live="polite"></p>
      </div>
    `;

    let remaining = 5;
    const noteEl = container.querySelector('#submittedRedirectNote');
    noteEl.textContent = `Returning to the start in ${remaining}s...`;
    const intervalId = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) { clearInterval(intervalId); onDone(); return; }
      noteEl.textContent = `Returning to the start in ${remaining}s...`;
    }, 1000);

    container.querySelector('#submittedDoneBtn').addEventListener('click', () => {
      clearInterval(intervalId);
      onDone();
    });
  }

  // renderSubmitted is exported too (Round E item 1): the grade-9/10
  // direct-submit path in js/registration.js reuses this exact same
  // confirmation screen after finalizing, rather than duplicating it.
  window.PED.review = { renderReview, renderSubmitted };
})();
