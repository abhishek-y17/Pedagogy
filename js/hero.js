// Classic script. Landing hero: logo-led "win an iPad" swipe-up banner reveal
// that opens into registration. Entirely code-drawn (CSS shapes/gradients,
// no images beyond the logo) per CLAUDE.md's visual design direction. The
// banner is a real tap target (click always works) with an added upward-drag
// gesture as a shortcut — never the only way to trigger it, matching the same
// "swipe is a shortcut for an explicit action" principle both reference
// prototypes already use for their swipe interactions.
(function () {
  'use strict';
  window.PED = window.PED || {};

  // Feature-detected haptic tap (no-op on iPadOS Safari, which doesn't implement the
  // Vibration API — the motion layer below carries the "felt" response there instead).
  function tapHaptic() {
    if (typeof navigator.vibrate === 'function') navigator.vibrate(8);
  }

  function wireHero(onStart) {
    const heroScreen = document.getElementById('heroScreen');
    const startBtn = document.getElementById('heroStartBtn');
    const expressBtn = document.getElementById('heroExpressBtn');
    const banner = document.getElementById('prizeBanner');
    const tcsLink = document.getElementById('heroTcsLink');
    const visual = document.getElementById('heroVisual');
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // mode: 'full' | 'express'. Passed through to onStart so app.js can set
    // draft.mode before the first render — the primary CTA/banner/drag-gesture
    // all stay the default full-path choice; only the secondary express link
    // below picks 'express'.
    function start(mode) {
      tapHaptic();
      heroScreen.classList.add('hero-screen--exit');
      setTimeout(() => {
        heroScreen.hidden = true;
        onStart(mode);
      }, 280);
    }

    startBtn.addEventListener('click', () => start('full'));
    banner.addEventListener('click', () => start('full'));
    if (expressBtn) expressBtn.addEventListener('click', () => start('express'));
    tcsLink.addEventListener('click', () => {
      window.PED.modal.open('Terms & Conditions', window.PED.registration.TCS_TEXT);
    });

    // Pointer parallax on the floating cards + device (transform-only, hardware
    // accelerated). Skipped entirely under prefers-reduced-motion.
    if (visual && !reduceMotion && matchMedia('(hover: hover)').matches) {
      let raf = null;
      window.addEventListener('pointermove', e => {
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = null;
          const nx = (e.clientX / window.innerWidth - 0.5) * 2;
          const ny = (e.clientY / window.innerHeight - 0.5) * 2;
          visual.style.setProperty('--px', nx.toFixed(3));
          visual.style.setProperty('--py', ny.toFixed(3));
        });
      });
    }

    let dragging = false;
    let startY = 0;
    banner.addEventListener('pointerdown', e => {
      dragging = true;
      startY = e.clientY;
    });
    banner.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dy = startY - e.clientY;
      if (dy > 0) banner.style.transform = `translateY(${-Math.min(dy, 40)}px)`;
      if (dy > 60) {
        dragging = false;
        banner.style.transform = '';
        start('full');
      }
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt =>
      banner.addEventListener(evt, () => {
        dragging = false;
        banner.style.transform = '';
      })
    );
  }

  window.PED.hero = { wireHero };
})();
