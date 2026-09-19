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

  function wireHero(onStart) {
    const heroScreen = document.getElementById('heroScreen');
    const startBtn = document.getElementById('heroStartBtn');
    const banner = document.getElementById('prizeBanner');

    function start() {
      heroScreen.classList.add('hero-screen--exit');
      setTimeout(() => {
        heroScreen.hidden = true;
        onStart();
      }, 280);
    }

    startBtn.addEventListener('click', start);
    banner.addEventListener('click', start);

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
        start();
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
