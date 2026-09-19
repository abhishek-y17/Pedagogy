// Classic script. Final "how should we follow up" step, wired to the
// `followUp` schema that's existed on the draft since Phase 0 (state.js) but
// had no real UI until now. Not a re-ask of consent (registration's
// consentToContact already covers whether Pedagogy may contact the visitor
// at all) — this refines HOW: channel preference and an optional note on
// what a counsellor should help with, matching the app's own stated goal of
// producing qualified counselling leads, not just registrations.
(function () {
  'use strict';
  window.PED = window.PED || {};
  const { escapeHtml } = window.PED.chips;

  const CHANNELS = ['Call', 'WhatsApp', 'Email', 'No preference'];

  function renderRequest(container, draft, datasets, onNext, onBack) {
    const f = draft.followUp;

    container.innerHTML = `
      <p class="eyebrow-small">ALMOST THERE</p>
      <h2 class="step-heading">One last thing before you go.</h2>
      <p class="field-hint">A counsellor may follow up using the contact details you already gave us.</p>

      <label>How would you like to hear from us?</label>
      <div class="chips" role="radiogroup" id="channelChips">
        ${CHANNELS.map((c, i) => `
          <label for="channel-${i}"><input type="radio" id="channel-${i}" name="channel" value="${escapeHtml(c)}"${f.channel === c ? ' checked' : ''}><span>${escapeHtml(c)}</span></label>
        `).join('')}
      </div>

      <label class="check">
        <input type="checkbox" id="marketingOptIn"${f.marketing ? ' checked' : ''}>
        <span class="check-box" aria-hidden="true"><svg viewBox="0 0 16 16"><polyline points="3,8.5 6.5,12 13,4.5"/></svg></span>
        <span class="check-text">Also send me occasional updates about Pedagogy events and offers.</span>
      </label>

      <label>Anything specific you'd like a counsellor to help with? <span class="field-hint field-hint--soft" style="display:inline;margin:0 0 0 4px;">(optional)</span>
        <textarea id="requestNote" rows="3" placeholder="e.g. Engineering options in Germany">${escapeHtml(f.preferredFollowup || '')}</textarea>
      </label>

      <div class="step-actions">
        <button type="button" class="quiet" id="requestBackBtn">&larr; Back</button>
        <button type="button" class="primary" id="requestNextBtn">Continue &rarr;</button>
      </div>
    `;

    const $ = sel => container.querySelector(sel);

    container.querySelectorAll('#channelChips input[type=radio]').forEach(input => {
      input.addEventListener('change', () => window.PED.state.mutateDraft(draft, () => { f.channel = input.value; }));
    });
    $('#marketingOptIn').addEventListener('change', e => window.PED.state.mutateDraft(draft, () => { f.marketing = e.target.checked; }));
    $('#requestNote').addEventListener('input', e => window.PED.state.mutateDraft(draft, () => { f.preferredFollowup = e.target.value; }));

    $('#requestBackBtn').addEventListener('click', onBack);
    $('#requestNextBtn').addEventListener('click', () => {
      // Reaching this step at all means the visitor wants follow-up (that's the
      // whole point of the stall) — no separate yes/no toggle needed on top of
      // registration's own consentToContact.
      window.PED.state.mutateDraft(draft, () => { f.counselling = true; });
      onNext();
    });
  }

  window.PED.request = { renderRequest };
})();
