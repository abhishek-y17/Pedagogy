// Classic script. Single source of truth for the feature-detected haptic tap
// (Phase 4 haptics pass). navigator.vibrate does not exist at all on iPadOS
// Safari (confirmed: `typeof navigator.vibrate` is 'undefined' there, not a
// function that silently fails) — the typeof check below is a true no-op on
// that platform, never a thrown error or a hard dependency. On iPad the
// spring/scale visual feedback already built into every tappable control
// (chips.js/styles.css's button/chip/checkbox motion) is the primary "felt"
// response; this is an enhancement layered on top for platforms that do
// support it, not a replacement for that motion language.
(function () {
  'use strict';
  window.PED = window.PED || {};

  function tap(pattern) {
    if (typeof navigator.vibrate === 'function') {
      try { navigator.vibrate(pattern || 8); } catch (e) { /* ignore */ }
    }
  }

  window.PED.haptics = { tap };
})();
