// Classic script. Mini-games (Phase 3), ported from reference/pedagogy-expo.html's
// trail() and memoryGame() as REAL interactive mechanics (a generated grid to
// tap in order / a study-then-recall symbol sequence), not micro-interactions.
// The original awarded "+20 points" and showed a running score on completion —
// stripped entirely here, matching the same "no score/points shown" standard
// enforced everywhere else in this build (grep clean, see RUN_LOG.md). Neither
// game is wired into staff-side completion/correctness logging — a deliberate
// scope cut for this round, not an oversight: these are a paced interactive
// beat in the journey with no data trail, unlike the academic questions.
// Neither game stores anything on the draft, so free back/forward navigation
// (including a later "Edit" jump from review, which never targets a game step)
// can't leave stale/inconsistent game state behind — re-entering just deals a
// fresh shuffle.
(function () {
  'use strict';
  window.PED = window.PED || {};

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Shared shell: heading/hint/body, a status line, and a Back + Skip button.
   * The Skip button doubles as "Continue →" once the puzzle is solved (same
   * pattern as the reference prototype's skipGame button) — either way it just
   * calls onNext, so there's exactly one way forward regardless of whether the
   * visitor actually finished the puzzle. */
  function renderGameShell(container, { eyebrow, heading, hint, bodyHtml, onBack, onNext }) {
    container.innerHTML = `
      <p class="eyebrow-small">${eyebrow}</p>
      <h2 class="step-heading">${heading}</h2>
      <p class="field-hint">${hint}</p>
      ${bodyHtml}
      <p class="field-hint field-hint--soft" id="gameStatus" role="status"></p>
      <div class="step-actions">
        <button type="button" class="quiet" id="gameBackBtn">&larr; Back</button>
        <button type="button" class="quiet" id="gameSkipBtn">Skip puzzle</button>
      </div>
    `;
    container.querySelector('#gameBackBtn').addEventListener('click', onBack);
    const skipBtn = container.querySelector('#gameSkipBtn');
    skipBtn.addEventListener('click', onNext);
    return { statusEl: container.querySelector('#gameStatus'), skipBtn };
  }

  function markComplete(skipBtn, message, statusEl) {
    statusEl.textContent = message;
    skipBtn.textContent = 'Continue →';
    skipBtn.classList.remove('quiet');
    skipBtn.classList.add('primary');
  }

  /** PUZZLE 1 · NUMBER TRAIL — a shuffled 1..12 grid, tapped in ascending
   * order. Mis-taps are tracked only as a local counter for the status line's
   * wording ("Try N next") — never displayed as a count, never a score. */
  function renderGame1(container, draft, onNext, onBack) {
    const COUNT = 12;
    const nums = shuffle(Array.from({ length: COUNT }, (_, i) => i + 1));
    let expected = 1;

    const { statusEl, skipBtn } = renderGameShell(container, {
      eyebrow: 'PUZZLE 1 &middot; NUMBER TRAIL',
      heading: 'Tap the numbers from smallest to largest.',
      hint: 'No timer here &mdash; take your time.',
      bodyHtml: `<div class="tiles" id="trailTiles">${nums.map(n => `<button type="button" class="tile" data-n="${n}">${n}</button>`).join('')}</div>`,
      onBack,
      onNext,
    });
    statusEl.textContent = 'Start with 1.';

    container.querySelectorAll('#trailTiles [data-n]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (Number(btn.dataset.n) === expected) {
          btn.disabled = true;
          btn.classList.add('tile--correct');
          expected++;
          if (expected > COUNT) markComplete(skipBtn, 'Nice work — trail complete!', statusEl);
          else statusEl.textContent = `Next: ${expected}`;
        } else {
          btn.classList.add('tile--miss');
          setTimeout(() => btn.classList.remove('tile--miss'), 220);
          statusEl.textContent = `Try ${expected} next.`;
        }
      });
    });
  }

  /** PUZZLE 2 · PATTERN RECALL — study a symbol sequence, hide it, tap it back
   * from memory. A mistake resets the attempt and re-shows the sequence
   * (retry-on-mistake), same as the reference prototype. */
  function renderGame2(container, draft, onNext, onBack) {
    const SYMBOLS = ['●', '▲', '■', '★'];
    const NAMES = ['Circle', 'Triangle', 'Square', 'Star'];
    const LENGTH = 5;
    const target = Array.from({ length: LENGTH }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
    let index = 0;

    const { statusEl, skipBtn } = renderGameShell(container, {
      eyebrow: 'PUZZLE 2 &middot; PATTERN RECALL',
      heading: 'Remember the pattern.',
      hint: 'Study the symbols, hide them, then tap the same sequence back. No timer here.',
      bodyHtml: `
        <div class="pattern" id="patternDisplay">${target.join(' ')}</div>
        <button type="button" class="primary" id="patternReadyBtn">Hide &amp; play</button>
        <div class="tiles" id="patternKeys" hidden>
          ${SYMBOLS.map((s, i) => `<button type="button" class="tile tile--symbol" data-symbol="${s}" aria-label="${NAMES[i]}">${s}</button>`).join('')}
        </div>
      `,
      onBack,
      onNext,
    });

    const displayEl = container.querySelector('#patternDisplay');
    const readyBtn = container.querySelector('#patternReadyBtn');
    const keysEl = container.querySelector('#patternKeys');

    readyBtn.addEventListener('click', () => {
      displayEl.textContent = '• '.repeat(target.length).trim();
      readyBtn.hidden = true;
      keysEl.hidden = false;
    });

    keysEl.querySelectorAll('[data-symbol]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.symbol === target[index]) {
          index++;
          statusEl.textContent = target.slice(0, index).join(' ');
          if (index === target.length) {
            keysEl.querySelectorAll('button').forEach(b => { b.disabled = true; });
            markComplete(skipBtn, 'Sequence complete — nicely done!', statusEl);
          }
        } else {
          index = 0;
          displayEl.textContent = target.join(' ');
          keysEl.hidden = true;
          readyBtn.hidden = false;
          readyBtn.textContent = 'Try again';
          statusEl.textContent = 'Have another look — your draw chances are unchanged.';
        }
      });
    });
  }

  window.PED.games = { renderGame1, renderGame2 };
})();
