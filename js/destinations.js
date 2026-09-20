// Classic script. Destinations step (chip grid + "Other" search overlay, per
// reference/pedagogy-expo.html's chips() mechanism), the competitive-exam
// Yes/No question, and the country-filtered/grouped/deduped exam list
// (session_handoff.md Section 6, data/destination_exams.json).
(function () {
  'use strict';
  window.PED = window.PED || {};
  const { escapeHtml, renderChipGrid } = window.PED.chips;

  function renderDestinations(container, draft, datasets, onNext, onBack) {
    const prefs = draft.preferences;
    const destinationKeys = Object.keys(datasets.destinationExams.destinations); // the 9 named + "Other"

    container.innerHTML = `
      <p class="eyebrow-small">YOUR STUDY PLANS</p>
      <h2 class="step-heading">Where could your next chapter begin?</h2>
      <p class="field-hint">Tap any that apply. Choose "Other" to search the full country list.</p>
      <div id="destChipGrid"></div>
      <div id="otherPicksWrap"></div>
      <p class="field-hint field-hint--soft" id="destValidationHint" hidden>Select at least one destination to continue.</p>
      <div class="step-actions">
        <button type="button" class="quiet" id="destBackBtn">&larr; Back</button>
        <button type="button" class="primary" id="destNextBtn">Continue &rarr;</button>
      </div>
    `;

    const $ = sel => container.querySelector(sel);
    const otherPicks = prefs.destinationsOther || (prefs.destinationsOther = []);

    // Round C item 3: at least one destination must be picked before Continue
    // is usable — this step previously let a visitor click straight through
    // with nothing selected.
    function refreshNextState() {
      const valid = prefs.destinations.length > 0;
      $('#destNextBtn').disabled = !valid;
      $('#destValidationHint').hidden = valid;
    }

    function renderOtherPicks() {
      const wrap = $('#otherPicksWrap');
      if (!otherPicks.length) { wrap.innerHTML = ''; return; }
      wrap.innerHTML = '<p class="field-hint">Also considering: ' +
        otherPicks.map(c => escapeHtml(c)).join(', ') + '</p>';
    }

    // Tracks whether "Other" was selected BEFORE this change, so the search
    // dialog only opens on the actual off->on transition. Root cause of the
    // original bug: chips.js's onChange fires on every toggle in the whole
    // grid, and the old check (`selected.includes('Other')`) is true on any
    // subsequent toggle too as long as "Other" is still checked — so ticking
    // an unrelated destination chip (or anything else) while "Other" stayed
    // selected re-ran openCountrySearch() and reset the dialog out from under
    // whatever the visitor was doing.
    let otherWasSelected = prefs.destinations.includes('Other');
    renderChipGrid($('#destChipGrid'), {
      name: 'destinations',
      options: destinationKeys,
      selected: prefs.destinations,
      exclusiveValues: [],
      onChange: selected => {
        window.PED.state.mutateDraft(draft, () => { prefs.destinations = selected; });
        const otherIsSelected = selected.includes('Other');
        if (otherIsSelected && !otherWasSelected) openCountrySearch();
        otherWasSelected = otherIsSelected;
        refreshNextState();
      },
    });
    renderOtherPicks();
    refreshNextState();

    function openCountrySearch() {
      const all = window.PED.COUNTRIES;
      const bodyHtml = `
        <input type="text" id="countrySearchInput" placeholder="Search countries" autocomplete="off">
        <ul id="countrySearchResults" class="school-suggestions"></ul>
      `;
      window.PED.modal.open('Choose a country', bodyHtml, []);
      const input = document.getElementById('countrySearchInput');
      const results = document.getElementById('countrySearchResults');
      function renderResults(query) {
        const q = query.trim().toLowerCase();
        const matches = (q ? all.filter(c => c.toLowerCase().includes(q)) : all).slice(0, 20);
        results.innerHTML = matches.map(c => `<li data-country="${escapeHtml(c)}">${escapeHtml(c)}</li>`).join('');
        results.querySelectorAll('li').forEach(li => {
          li.addEventListener('click', () => {
            const country = li.dataset.country;
            if (!otherPicks.includes(country)) otherPicks.push(country);
            window.PED.state.mutateDraft(draft, () => {});
            renderOtherPicks();
            window.PED.modal.close();
          });
        });
      }
      renderResults('');
      input.addEventListener('input', () => renderResults(input.value));
      input.focus();
    }

    $('#destBackBtn').addEventListener('click', onBack);
    $('#destNextBtn').addEventListener('click', onNext);
  }

  function renderExamPrep(container, draft, datasets, onNext, onBack) {
    const prefs = draft.preferences;
    container.innerHTML = `
      <p class="eyebrow-small">YOUR STUDY PLANS</p>
      <h2 class="step-heading">Are you preparing for any competitive exam?</h2>
      <div class="chips" role="group">
        <label><input type="radio" name="examPrep" value="yes"${prefs.competitiveExamPrep === 'yes' ? ' checked' : ''}><span>Yes</span></label>
        <label><input type="radio" name="examPrep" value="no"${prefs.competitiveExamPrep === 'no' ? ' checked' : ''}><span>No</span></label>
      </div>
      <p class="field-hint field-hint--soft" id="examPrepValidationHint" hidden>Select Yes or No to continue.</p>
      <div class="step-actions">
        <button type="button" class="quiet" id="examPrepBackBtn">&larr; Back</button>
        <button type="button" class="primary" id="examPrepNextBtn">Continue &rarr;</button>
      </div>
    `;
    const $ = sel => container.querySelector(sel);

    // Round C item 3: Yes/No must be answered before Continue is usable.
    function refreshNextState() {
      const valid = prefs.competitiveExamPrep === 'yes' || prefs.competitiveExamPrep === 'no';
      $('#examPrepNextBtn').disabled = !valid;
      $('#examPrepValidationHint').hidden = valid;
    }

    container.querySelectorAll('input[name=examPrep]').forEach(r => {
      r.addEventListener('change', () => {
        window.PED.haptics.tap();
        window.PED.state.mutateDraft(draft, () => { prefs.competitiveExamPrep = r.value; });
        refreshNextState();
      });
    });
    refreshNextState();
    $('#examPrepBackBtn').addEventListener('click', onBack);
    $('#examPrepNextBtn').addEventListener('click', onNext);
  }

  /** Builds { countryName: [examName,...] } deduping an exam name to its first
   * occurring country, per session_handoff.md Section 6 ("deduped across
   * countries, don't flatten into one undifferentiated list"). */
  function groupExamsByCountry(destinationExams, countries) {
    const seen = new Set();
    const grouped = {};
    countries.forEach(country => {
      const info = destinationExams.destinations[country];
      if (!info) return;
      const names = info.exams.map(e => e.name).filter(name => {
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      });
      if (names.length) grouped[country] = names;
    });
    return grouped;
  }

  function renderExamList(container, draft, datasets, onNext, onBack) {
    const prefs = draft.preferences;
    const namedDestinations = prefs.destinations.filter(d => d !== 'Other');
    const onlyOther = namedDestinations.length === 0;

    if (onlyOther) {
      container.innerHTML = `
        <p class="eyebrow-small">YOUR STUDY PLANS</p>
        <h2 class="step-heading">Which exam(s) are you preparing for?</h2>
        <p class="field-hint">Tell us in your own words &mdash; a counsellor will follow up with specifics for your destination.</p>
        <textarea id="examFreeText" rows="3" maxlength="200" placeholder="e.g. TestAS for Germany">${escapeHtml(prefs.competitiveExams.Other || '')}</textarea>
        <p class="field-hint field-hint--soft" id="examListValidationHint" hidden>Please tell us which exam(s) to continue.</p>
        <div class="step-actions">
          <button type="button" class="quiet" id="examListBackBtn">&larr; Back</button>
          <button type="button" class="primary" id="examListNextBtn">Continue &rarr;</button>
        </div>
      `;
      const $ = sel => container.querySelector(sel);

      // Round C item 3: free-text answer must be non-empty before Continue.
      function refreshNextState() {
        const valid = !!(prefs.competitiveExams.Other || '').trim();
        $('#examListNextBtn').disabled = !valid;
        $('#examListValidationHint').hidden = valid;
      }

      $('#examFreeText').addEventListener('input', e => {
        window.PED.state.mutateDraft(draft, () => { prefs.competitiveExams = { Other: e.target.value }; });
        refreshNextState();
      });
      refreshNextState();
      $('#examListBackBtn').addEventListener('click', onBack);
      $('#examListNextBtn').addEventListener('click', onNext);
      return;
    }

    const grouped = groupExamsByCountry(datasets.destinationExams, namedDestinations);
    container.innerHTML = `
      <p class="eyebrow-small">YOUR STUDY PLANS</p>
      <h2 class="step-heading">Which exam(s) are you preparing for?</h2>
      ${Object.entries(grouped).map(([country, exams]) => `
        <p class="field-hint exam-group-label">${escapeHtml(country)}</p>
        <div class="exam-group" data-country="${escapeHtml(country)}"></div>
      `).join('')}
      <p class="field-hint field-hint--soft" id="examListValidationHint" hidden>Select at least one exam to continue.</p>
      <div class="step-actions">
        <button type="button" class="quiet" id="examListBackBtn">&larr; Back</button>
        <button type="button" class="primary" id="examListNextBtn">Continue &rarr;</button>
      </div>
    `;
    const $ = sel => container.querySelector(sel);

    // Round C item 3: at least one exam (across any listed country) must be
    // picked before Continue is usable.
    function refreshNextState() {
      const valid = Object.values(prefs.competitiveExams).some(list => Array.isArray(list) && list.length > 0);
      $('#examListNextBtn').disabled = !valid;
      $('#examListValidationHint').hidden = valid;
    }

    // competitiveExams is stored per-country: { [country]: [examName,...] }
    Object.entries(grouped).forEach(([country, exams]) => {
      const el = container.querySelector(`.exam-group[data-country="${CSS.escape(country)}"]`);
      const selected = prefs.competitiveExams[country] || (prefs.competitiveExams[country] = []);
      renderChipGrid(el, {
        name: `exam-${country}`,
        options: exams,
        selected,
        exclusiveValues: [],
        onChange: () => { window.PED.state.mutateDraft(draft, () => {}); refreshNextState(); },
      });
    });
    refreshNextState();

    $('#examListBackBtn').addEventListener('click', onBack);
    $('#examListNextBtn').addEventListener('click', onNext);
  }

  window.PED.destinations = { renderDestinations, renderExamPrep, renderExamList, groupExamsByCountry };
})();
