// Classic script. Academic quiz question step (Phase 2). No per-question
// correct/incorrect reveal (session_handoff.md item D) and no score/points
// shown anywhere (standing decision) — selecting an option just marks it
// selected; correctness is only computed later, at finalizeDraft(), for
// staff-side analytics (see state.js). No skip button this round — that's
// explicitly Phase 3 scope (session_handoff.md item B) and is NOT added here;
// free back/forward navigation (already built) is how a visitor can leave an
// unanswered question for now.
(function () {
  'use strict';
  window.PED = window.PED || {};
  const { escapeHtml } = window.PED.chips;

  /** Ensures draft.quiz.selectedQuestionIds is populated (once, at first entry
   * into any question step) using the visitor's derived curriculum/stream. */
  function ensureSelection(draft, datasets) {
    if (draft.quiz.selectedQuestionIds.length) return;
    const count = window.PED.steps.getQuestionCount(draft);
    const picked = window.PED.questions.selectQuizQuestions(datasets.questions, count, {
      curriculum: draft.registration.curriculum,
      streamId: draft.registration.stream || null,
    });
    window.PED.state.mutateDraft(draft, () => {
      draft.quiz.selectedQuestionIds = picked.map(q => q.id);
    });
  }

  function getAnswer(draft, questionId) {
    return draft.quiz.answers.find(a => a.questionId === questionId) || null;
  }

  function setAnswer(draft, questionId, selected) {
    window.PED.state.mutateDraft(draft, () => {
      const existing = draft.quiz.answers.find(a => a.questionId === questionId);
      if (existing) existing.selected = selected;
      else draft.quiz.answers.push({ questionId, selected, skipped: false, timedOut: false });
    });
  }

  /** Timeout default (Phase 2 item 2): stop accepting new answers, mark every
   * still-unanswered selected question as unanswered (not wrong — equal-odds
   * rule is unaffected either way), and advance to review. This is a
   * reasonable-default judgment call, not a locked decision — see RUN_LOG.md. */
  function handleTimeout(draft, onGotoReview) {
    window.PED.state.mutateDraft(draft, () => {
      for (const qid of draft.quiz.selectedQuestionIds) {
        const existing = draft.quiz.answers.find(a => a.questionId === qid);
        if (!existing) draft.quiz.answers.push({ questionId: qid, selected: null, skipped: false, timedOut: true });
        else if (existing.selected == null) existing.timedOut = true;
      }
    });
    onGotoReview();
  }

  /** Renders one academic question. Returns a cleanup function (stops the
   * countdown interval) — app.js calls it before rendering the next step. */
  function renderQuestion(container, draft, datasets, stepId, onNext, onBack, onGotoReview) {
    ensureSelection(draft, datasets);
    const index = window.PED.steps.getQuestionIndex(draft, stepId);
    const total = window.PED.steps.getQuestionCount(draft);
    const questionId = draft.quiz.selectedQuestionIds[index];
    const question = datasets.questions.find(q => q.id === questionId);
    const existingAnswer = getAnswer(draft, questionId);
    const expired = window.PED.timer.isExpired(draft);

    if (!question) {
      // Should be unreachable given selectQuizQuestions' fallback chain, but
      // fail visibly rather than silently rendering a blank question if it
      // ever does happen (e.g. a corrupted draft from an older schema).
      container.innerHTML = `<p class="field-hint">This question couldn't be loaded. Use Back/Next to continue.</p>
        <div class="step-actions"><button type="button" class="quiet" id="qBackBtn">&larr; Back</button>
        <button type="button" class="primary" id="qNextBtn">Next &rarr;</button></div>`;
      container.querySelector('#qBackBtn').addEventListener('click', onBack);
      container.querySelector('#qNextBtn').addEventListener('click', onNext);
      return;
    }

    container.innerHTML = `
      <p class="eyebrow-small">ACADEMIC QUESTION ${index + 1} / ${total}${question.placeholder ? ' &middot; PLACEHOLDER CONTENT' : ''}</p>
      <div class="quiz-timer" id="quizTimer" role="timer" aria-live="polite"></div>
      <h2 class="step-heading">${escapeHtml(question.q)}</h2>
      <div class="chips chips--quiz" role="radiogroup" id="quizOptions">
        ${question.options.map((opt, i) => `
          <label for="qopt-${i}">
            <input type="radio" id="qopt-${i}" name="quizOption" value="${escapeHtml(opt)}"${existingAnswer && existingAnswer.selected === opt ? ' checked' : ''}${expired ? ' disabled' : ''}>
            <span>${escapeHtml(opt)}</span>
          </label>`).join('')}
      </div>
      <div class="step-actions">
        <button type="button" class="quiet" id="qBackBtn">&larr; Back</button>
        <button type="button" class="primary" id="qNextBtn">Next &rarr;</button>
      </div>
    `;

    container.querySelectorAll('#quizOptions input[type=radio]').forEach(input => {
      input.addEventListener('change', () => setAnswer(draft, questionId, input.value));
    });
    container.querySelector('#qBackBtn').addEventListener('click', onBack);
    container.querySelector('#qNextBtn').addEventListener('click', onNext);

    const timerEl = container.querySelector('#quizTimer');
    function tick() {
      const remaining = window.PED.timer.getRemainingMs(draft);
      timerEl.textContent = `Time left for these questions: ${window.PED.timer.formatRemaining(remaining)}`;
      timerEl.classList.toggle('quiz-timer--low', remaining <= 30000);
      if (remaining <= 0) {
        clearInterval(intervalId);
        container.querySelectorAll('#quizOptions input[type=radio]').forEach(i => { i.disabled = true; });
        handleTimeout(draft, onGotoReview);
      }
    }
    tick();
    const intervalId = setInterval(tick, 500);
    return () => clearInterval(intervalId);
  }

  window.PED.quiz = { renderQuestion, ensureSelection, getAnswer };
})();
