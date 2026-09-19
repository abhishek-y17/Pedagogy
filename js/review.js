// Classic script. Final review screen (Phase 2, session_handoff.md item D):
// built entirely from the in-memory draft, every section tap-to-edit (jumps
// back into that exact step via steps.js's goToStep), single Submit action
// that is the ONLY call site for finalizeDraft() — see state.js. Re-validates
// registration at submit time as a defensive re-check (item 1): the register
// step's own Continue button already blocks on the same rules, so this is a
// belt-and-braces safety net, not the only gate.
//
// Courses/activities (Phase 3, js/courses.js) are real tap-chip steps now —
// this screen still just reflects whatever's actually on the draft, same as
// every other section, so no change was needed here beyond the "Skipped"
// wording below once js/quiz.js grew a real skip action.
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
        <div><dt>Courses of interest</dt><dd>${escapeHtml(p.courses.length ? p.courses.join(', ') : 'None selected yet')}</dd></div>
        <div><dt>Activities</dt><dd>${escapeHtml(p.activities.length ? p.activities.join(', ') : 'None selected yet')}</dd></div>
      </dl>
    `);
  }

  function renderFollowUpSection(draft) {
    const f = draft.followUp;
    return section('Follow-up preferences', 'request', `
      <dl class="review-fields">
        <div><dt>Preferred contact method</dt><dd>${escapeHtml(f.channel || 'Not answered yet')}</dd></div>
        <div><dt>Event/offer updates</dt><dd>${f.marketing ? 'Yes, please' : 'No thanks'}</dd></div>
        <div><dt>Note for the counsellor</dt><dd>${escapeHtml(f.preferredFollowup || '— (none)')}</dd></div>
      </dl>
    `);
  }

  function renderQuizSection(draft, datasets) {
    const stepIds = window.PED.steps.getQuestionStepIds(draft);
    const rows = stepIds.map((stepId, i) => {
      const questionId = draft.quiz.selectedQuestionIds[i];
      const question = datasets.questions.find(q => q.id === questionId);
      const answer = draft.quiz.answers.find(a => a.questionId === questionId);
      let answerText;
      if (!answer || answer.selected == null) {
        if (answer && answer.timedOut) answerText = 'Not answered (time ran out)';
        else if (answer && answer.skipped) answerText = 'Skipped';
        else answerText = 'Not answered yet';
      } else {
        answerText = answer.selected;
      }
      return `<div><dt>Q${i + 1}${question ? ': ' + escapeHtml(question.q) : ''}</dt><dd>${escapeHtml(answerText)}</dd>
        <button type="button" class="link-btn" data-jump="${escapeHtml(stepId)}">Edit</button></div>`;
    });
    return `
      <section class="review-section">
        <div class="review-section-head"><h3>Academic questions</h3></div>
        <dl class="review-fields review-fields--quiz">${rows.join('')}</dl>
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
      ${renderFollowUpSection(draft)}
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
        window.PED.registration.presentValidationFailure(result, () => {});
        onJump('register');
        return;
      }
      window.PED.state.mutateDraft(draft, () => {
        draft.registration.parentMobile = result.parentPhone;
        draft.registration.studentMobile = result.studentPhone;
      });
      window.PED.state.finalizeDraft(draft, datasets.questions);
      renderSubmitted(container, onDone);
    });
  }

  function renderSubmitted(container, onDone) {
    container.innerHTML = `
      <p class="eyebrow-small">ALL DONE</p>
      <h2 class="step-heading">You're entered — thank you!</h2>
      <p class="field-hint">A counsellor may follow up using the details you gave us. One equal-chance draw
      entry has been created for this student, independent of quiz score or how much of the experience
      was completed.</p>
      <div class="step-actions">
        <button type="button" class="primary" id="submittedDoneBtn">Done</button>
      </div>
    `;
    container.querySelector('#submittedDoneBtn').addEventListener('click', onDone);
  }

  window.PED.review = { renderReview };
})();
