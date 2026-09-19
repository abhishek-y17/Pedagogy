// Classic script. A small styled modal used for the real T&Cs dialog and for
// "clear, non-alarming popup" explanations (e.g. the missing-parent-number
// case) instead of a jarring native window.alert().
(function () {
  'use strict';
  window.PED = window.PED || {};

  let overlay = null;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="modal-card" role="dialog" aria-modal="true">
        <button type="button" class="modal-close" aria-label="Close">&times;</button>
        <div class="modal-title"></div>
        <div class="modal-body"></div>
        <div class="modal-actions"></div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('.modal-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    return overlay;
  }

  function close() {
    if (overlay) overlay.hidden = true;
  }

  /** actions: [{label, action}] rendered as buttons; a default "Close" is always added. */
  function open(title, bodyHtml, actions) {
    const el = ensureOverlay();
    el.querySelector('.modal-title').textContent = title;
    el.querySelector('.modal-body').innerHTML = bodyHtml;
    const actionsEl = el.querySelector('.modal-actions');
    actionsEl.innerHTML = '';
    (actions || []).forEach(a => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'primary';
      btn.textContent = a.label;
      btn.addEventListener('click', () => { close(); if (a.action) a.action(); });
      actionsEl.appendChild(btn);
    });
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'quiet';
    closeBtn.textContent = actions && actions.length ? 'Cancel' : 'Close';
    closeBtn.addEventListener('click', close);
    actionsEl.appendChild(closeBtn);
    el.hidden = false;
  }

  /** Simple one-button message, replacing native window.alert for in-flow validation. */
  function alertModal(message) {
    open('Please check this', `<p>${message}</p>`, []);
  }

  window.PED.modal = { open, close, alert: alertModal };
})();
