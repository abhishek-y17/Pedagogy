// Classic script. Mini-games (Phase 3), ported from reference/pedagogy-expo.html's
// trail() and memoryGame() as REAL interactive mechanics (a generated grid to
// tap in order / a study-then-recall symbol sequence), not micro-interactions.
// The original awarded "+20 points" and showed a running score on completion —
// stripped entirely here, matching the same "no score/points shown" standard
// enforced everywhere else in this build (grep clean, see RUN_LOG.md). Neither
// game is wired into staff-side completion/correctness logging — a deliberate
// scope cut for this round, not an oversight: these are a paced interactive
// beat in the journey with no data trail, unlike the academic questions.
// Neither game stores anything on the draft (so a duplicate/staff record never
// carries in-progress puzzle state), but each game's in-progress attempt is
// kept in a module-level variable here so that free back/forward navigation
// within the same visitor's session resumes exactly where they left off
// instead of re-dealing a fresh puzzle and silently discarding what they'd
// already tapped (reported live 2026-09-21). resetGameState() below is called
// on every "new visitor" / submit / test-jump reset in app.js so the next
// visitor never inherits a previous visitor's in-progress puzzle.
(function () {
  'use strict';
  window.PED = window.PED || {};

  let trailState = null;
  let patternState = null;

  function resetGameState() {
    trailState = null;
    patternState = null;
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /** Shared shell: heading/hint/body, a status line, and Back + Skip +
   * Continue buttons. Round C item 3: Continue starts disabled and only
   * enables once the puzzle is actually solved (markComplete below) — the
   * old free "Skip puzzle" that always worked regardless of completion is
   * still gone. Reworked 2026-09-21 (live instruction): each game now grants
   * a small number of chances before revealing a real Skip button — mandatory
   * effort, but not an unbounded one. This Skip is deliberately game-only:
   * academic questions (q1-q5) keep their own always-available Skip with its
   * separate compliance-approved popup copy (js/quiz.js) — the two are not
   * the same mechanism and this one carries no such copy. #gameSkipBtn starts
   * hidden; each game reveals it once its own chance cap is reached. */
  function renderGameShell(container, { eyebrow, heading, hint, bodyHtml, onBack, onNext }) {
    container.innerHTML = `
      <p class="eyebrow-small">${eyebrow}</p>
      <h2 class="step-heading">${heading}</h2>
      <p class="field-hint">${hint}</p>
      ${bodyHtml}
      <p class="field-hint field-hint--soft" id="gameStatus" role="status"></p>
      <div class="step-actions">
        <button type="button" class="quiet" id="gameBackBtn">&larr; Back</button>
        <button type="button" class="quiet" id="gameSkipBtn" hidden>Skip this puzzle</button>
        <button type="button" class="quiet" id="gameNextBtn" disabled>Continue &rarr;</button>
      </div>
    `;
    container.querySelector('#gameBackBtn').addEventListener('click', onBack);
    const nextBtn = container.querySelector('#gameNextBtn');
    nextBtn.addEventListener('click', onNext);
    const skipPuzzleBtn = container.querySelector('#gameSkipBtn');
    skipPuzzleBtn.addEventListener('click', onNext);
    return { statusEl: container.querySelector('#gameStatus'), skipBtn: nextBtn, skipPuzzleBtn };
  }

  function markComplete(skipBtn, message, statusEl) {
    statusEl.textContent = message;
    skipBtn.disabled = false;
    skipBtn.classList.remove('quiet');
    skipBtn.classList.add('primary');
  }

  /** Picks `count` distinct random integers in [min, max] (inclusive). */
  function randomDistinctInts(count, min, max) {
    const set = new Set();
    while (set.size < count) set.add(min + Math.floor(Math.random() * (max - min + 1)));
    return Array.from(set);
  }

  // Reworked 2026-09-21 (live instruction): a full wrong order used to be
  // retriable forever with no way out short of solving it. Two wrong full
  // submissions now reveal a real Skip button — effort is still required
  // (unlike the old always-free skip this round removed), but not unbounded.
  const MAX_TRAIL_WRONG_SUBMISSIONS = 2;

  /** PUZZLE 1 · NUMBER TRAIL — 5 fresh random 3-digit numbers (200-999),
   * tapped smallest to largest. Tap-to-select/tap-to-unselect (round 2026-09-21
   * rework, live feedback): a visitor taps tiles to build their own ordered
   * guess (each tap adds a numbered badge showing its position in their
   * order) and can tap an already-picked tile again to remove it and try a
   * different order — this replaces the earlier "reveals the correct next
   * number in the status line" mechanic, which was pointed out live as
   * basically giving the answer away instead of letting the visitor work it
   * out themselves. Correctness is only checked once all 5 are picked; if
   * wrong, the guess stays editable (nothing auto-clears) so the visitor can
   * unclick individual tiles and adjust rather than starting over blind. The
   * puzzle (values/order) is cached in module-level `trailState` so
   * re-entering via Back/Next resumes instead of re-dealing and losing
   * progress; only a fresh visitor (resetGameState()) gets a new shuffle. */
  function renderGame1(container, draft, onNext, onBack) {
    const COUNT = 5;
    if (!trailState) {
      const values = randomDistinctInts(COUNT, 200, 999);
      trailState = {
        values,
        ascending: values.slice().sort((a, b) => a - b),
        tiles: shuffle(values),
        order: [],           // values tapped so far, in the order the visitor tapped them
        complete: false,
        wrongSubmissions: 0, // full-5, incorrect-order attempts used so far
      };
    }
    const state = trailState;

    const { statusEl, skipBtn, skipPuzzleBtn } = renderGameShell(container, {
      eyebrow: 'PUZZLE 1 &middot; NUMBER TRAIL',
      heading: 'Tap the numbers from smallest to largest.',
      hint: 'Tap a number to place it next in your order. Tap it again to remove it. No timer here.',
      bodyHtml: `<div class="tiles" id="trailTiles">${state.tiles.map(n => `<button type="button" class="tile" data-n="${n}"><span class="tile-value">${n}</span></button>`).join('')}</div>`,
      onBack,
      onNext,
    });

    function outOfChances() { return state.wrongSubmissions >= MAX_TRAIL_WRONG_SUBMISSIONS; }

    function renderTiles() {
      container.querySelectorAll('#trailTiles [data-n]').forEach(btn => {
        const n = Number(btn.dataset.n);
        const pos = state.order.indexOf(n);
        const picked = pos !== -1;
        btn.classList.toggle('tile--selected', picked && !state.complete);
        btn.classList.toggle('tile--correct', state.complete);
        // Out of chances: only Skip remains, so lock the tiles rather than
        // let the visitor keep silently retrying past the stated cap.
        btn.disabled = state.complete || outOfChances();
        const badge = picked ? `<b class="tile-order-badge">${pos + 1}</b>` : '';
        btn.innerHTML = `${badge}<span class="tile-value">${n}</span>`;
      });
    }

    function renderStatus() {
      if (outOfChances()) { statusEl.textContent = 'No more tries left — tap Skip to move on, your draw chances are unchanged.'; return; }
      if (state.order.length === 0) { statusEl.textContent = 'Tap them in the order you think is correct.'; return; }
      // renderStatus() is only ever called with a full 5-tile order after the
      // correct case has already returned early above, so reaching COUNT here
      // always means the just-submitted order was wrong.
      if (state.order.length === COUNT) { statusEl.textContent = 'Not quite that order — tap a number to remove it and try again.'; return; }
      statusEl.textContent = `${state.order.length} of ${COUNT} placed — tap a number again to remove it.`;
    }

    renderTiles();
    skipPuzzleBtn.hidden = !outOfChances();
    if (state.complete) markComplete(skipBtn, 'Nice work — trail complete!', statusEl);
    else renderStatus();

    container.querySelectorAll('#trailTiles [data-n]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.complete) return;
        const n = Number(btn.dataset.n);
        const pos = state.order.indexOf(n);
        if (pos !== -1) state.order.splice(pos, 1); // unclick: remove from the guess
        else state.order.push(n);

        if (state.order.length === COUNT) {
          const isCorrect = state.order.every((v, i) => v === state.ascending[i]);
          if (isCorrect) {
            state.complete = true;
            renderTiles();
            markComplete(skipBtn, 'Nice work — trail complete!', statusEl);
            return;
          }
          state.wrongSubmissions++;
          renderTiles();
          skipPuzzleBtn.hidden = !outOfChances();
          renderStatus();
          return;
        }
        renderTiles();
        renderStatus();
      });
    });
  }

  // Round D follow-up: reverted from round C's Greek-letter pattern (felt too
  // hard for a fast stall interaction) back to plain geometry shapes — same
  // set and mechanic as the original build.
  const SYMBOLS = ['●', '▲', '■', '★'];
  const NAMES = ['Circle', 'Triangle', 'Square', 'Star'];

  // Reworked 2026-09-21 (live instruction): "Look again" was flagged as a
  // loophole — infinitely re-peekable, which defeats a memory puzzle
  // entirely. Wrong taps and Look-again uses now draw from the same small
  // pool of chances (a mistake gets a retry, a second mistake gets one more,
  // that's it) — once it's used up, Look Again and the answer tiles both lock
  // and a real Skip button appears, same shape as Number Trail's cap above.
  const MAX_PATTERN_CHANCES = 2;

  /** PUZZLE 2 · PATTERN RECALL — study a symbol sequence, hide it, tap it back
   * from memory. A wrong tap doesn't wipe progress back to zero — it just
   * doesn't count, and the visitor can immediately retry the same position
   * with prior progress untouched. "Look again" re-peeks at the full sequence
   * without losing progress either. Both draw from the same capped pool of
   * chances (MAX_PATTERN_CHANCES above). The sequence and progress are cached
   * in module-level `patternState` so re-entering via Back/Next resumes
   * exactly where the visitor left off; only a fresh visitor
   * (resetGameState()) gets a new sequence. Each correct tap updates the dot
   * row itself in real time (revealing the tapped symbol in place, not just
   * re-stating progress in the status line below). */
  function renderGame2(container, draft, onNext, onBack) {
    const LENGTH = 5;
    if (!patternState) {
      patternState = {
        target: Array.from({ length: LENGTH }, () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]),
        index: 0,
        phase: 'study',      // 'study' (sequence visible, not yet hidden) | 'recall' (hidden, tapping back)
        lookingAgain: false, // recall-phase overlay: re-peeking without losing `index`
        chancesUsed: 0,      // wrong taps + Look-again uses, combined
      };
    }
    const state = patternState;
    const target = state.target;

    const { statusEl, skipBtn, skipPuzzleBtn } = renderGameShell(container, {
      eyebrow: 'PUZZLE 2 &middot; PATTERN RECALL',
      heading: 'Remember the pattern.',
      hint: 'Study the symbols, hide them, then tap the same sequence back. Got one wrong? Just tap again — or use Look again. No timer here.',
      bodyHtml: `
        <div class="pattern" id="patternDisplay"></div>
        <button type="button" class="primary" id="patternReadyBtn">Hide &amp; play</button>
        <button type="button" class="quiet" id="patternLookAgainBtn" hidden>Look again</button>
        <div class="tiles" id="patternKeys" hidden>
          ${SYMBOLS.map((s, i) => `<button type="button" class="tile tile--symbol" data-symbol="${s}" aria-label="${NAMES[i]}">${s}</button>`).join('')}
        </div>
      `,
      onBack,
      onNext,
    });

    const displayEl = container.querySelector('#patternDisplay');
    const readyBtn = container.querySelector('#patternReadyBtn');
    const lookAgainBtn = container.querySelector('#patternLookAgainBtn');
    const keysEl = container.querySelector('#patternKeys');

    function outOfChances() { return state.chancesUsed >= MAX_PATTERN_CHANCES; }

    /** Renders the dot row for the recall phase: symbols already tapped
     * correctly show in place of their dot, the rest stay hidden as dots —
     * this is the real-time feedback surface, not the status line. */
    function renderRecallRow() {
      const revealed = target.slice(0, state.index).join(' ');
      const hidden = '• '.repeat(target.length - state.index).trim();
      displayEl.textContent = [revealed, hidden].filter(Boolean).join(' ');
    }

    function render() {
      if (state.phase === 'study' || state.lookingAgain) {
        displayEl.textContent = target.join(' ');
        readyBtn.hidden = false;
        readyBtn.disabled = false;
        readyBtn.textContent = state.lookingAgain ? 'Back to recall' : 'Hide & play';
        lookAgainBtn.hidden = true;
        keysEl.hidden = true;
        skipPuzzleBtn.hidden = true;
        return;
      }
      readyBtn.hidden = true;
      keysEl.hidden = false;
      renderRecallRow();
      if (state.index >= target.length) {
        keysEl.querySelectorAll('button').forEach(b => { b.disabled = true; });
        lookAgainBtn.hidden = true;
        skipPuzzleBtn.hidden = true;
        markComplete(skipBtn, 'Sequence complete — nicely done!', statusEl);
        return;
      }
      if (outOfChances()) {
        lookAgainBtn.hidden = true;
        skipPuzzleBtn.hidden = false;
        keysEl.querySelectorAll('button').forEach(b => { b.disabled = true; });
        statusEl.textContent = 'No more tries left — tap Skip to move on, your draw chances are unchanged.';
        return;
      }
      lookAgainBtn.hidden = false;
      skipPuzzleBtn.hidden = true;
      keysEl.querySelectorAll('button').forEach(b => { b.disabled = false; });
      if (!statusEl.textContent) statusEl.textContent = `${state.index} of ${target.length} placed.`;
    }

    render();

    readyBtn.addEventListener('click', () => {
      state.phase = 'recall';
      state.lookingAgain = false;
      statusEl.textContent = '';
      render();
    });

    lookAgainBtn.addEventListener('click', () => {
      state.chancesUsed++;
      state.lookingAgain = true;
      render();
    });

    keysEl.querySelectorAll('[data-symbol]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (outOfChances()) return;
        if (btn.dataset.symbol === target[state.index]) {
          state.index++;
          statusEl.textContent = '';
          render();
        } else {
          state.chancesUsed++;
          btn.classList.add('tile--miss');
          setTimeout(() => btn.classList.remove('tile--miss'), 220);
          statusEl.textContent = outOfChances()
            ? 'No more tries left — tap Skip to move on, your draw chances are unchanged.'
            : 'Not quite — tap again, or use "Look again" to re-check the pattern.';
          render();
        }
      });
    });
  }

  window.PED.games = { renderGame1, renderGame2, resetGameState };
})();
