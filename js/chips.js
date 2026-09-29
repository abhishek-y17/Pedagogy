// Classic script. Generic tap-to-select chip grid, modeled on
// reference/pedagogy-expo.html's chips()/selected() functions: a labelled
// checkbox per option, hidden input + styled <span>, so it's a real (accessible,
// keyboard-operable) form control that happens to look like a chip. Includes
// the same mutual-exclusivity handling v1 used for values like "Undecided" /
// "None yet" (checking one of the configured exclusiveValues clears every other
// selection in the group, and checking anything else clears any exclusiveValues
// already checked).
(function () {
  'use strict';
  window.PED = window.PED || {};

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  /**
   * Renders a chip grid into `container`.
   * options: string[] of chip labels/values.
   * selected: string[] of currently-selected values (mutated in place on change).
   * exclusiveValues: string[] subset of options that clear all others when picked
   *   (and are themselves cleared if any non-exclusive chip is picked).
   * suggested: string[] subset of options to visually mark as a data-driven
   *   suggestion (a ✦ mark, per curriculum_subjects.json's "pre-suggest, not
   *   force" note — see js/questions.js's getSuggestedCourses). Purely visual;
   *   never affects selection/exclusivity behavior.
   * max: optional number — once `countSelected()` (selected.length by default,
   *   or the result of counting a caller-supplied combined total via
   *   `countFor`) reaches this, unchecked boxes disable until one is unchecked
   *   again. Only the destinations step passes this (client feedback,
   *   2026-09-29: cap destination countries at 3) — every other call site
   *   leaves it unset, so unlimited selection stays the default everywhere else.
   * countFor: optional () => number, used instead of selected.length to decide
   *   whether `max` has been hit — lets destinations.js count grid picks
   *   combined with its separate "Other" search-overlay picks as one total.
   * onChange(selectedArray): called after every toggle.
   */
  function renderChipGrid(container, { name, options, selected, exclusiveValues, suggested, max, countFor, onChange }) {
    exclusiveValues = exclusiveValues || [];
    suggested = suggested || [];
    const countSelected = countFor || (() => selected.length);
    container.innerHTML =
      '<div class="chips" role="group">' +
      options.map((opt, i) => {
        const id = `${name}-${i}`;
        const checked = selected.includes(opt) ? ' checked' : '';
        const spanClass = suggested.includes(opt) ? ' class="chip-suggested"' : '';
        return `<label for="${id}"><input type="checkbox" id="${id}" name="${name}" value="${escapeHtml(opt)}"${checked}><span${spanClass}>${escapeHtml(opt)}</span></label>`;
      }).join('') +
      '</div>';

    function refreshMaxState() {
      if (!max) return;
      const atCap = countSelected() >= max;
      container.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.disabled = atCap && !cb.checked;
      });
    }

    container.querySelectorAll('input[type=checkbox]').forEach(input => {
      input.addEventListener('change', () => {
        window.PED.haptics.tap();
        const value = input.value;
        if (input.checked) {
          if (exclusiveValues.includes(value)) {
            // picking an exclusive value clears everything else
            selected.length = 0;
            selected.push(value);
          } else {
            // picking a normal value clears any exclusive value already set
            for (const ex of exclusiveValues) {
              const idx = selected.indexOf(ex);
              if (idx >= 0) selected.splice(idx, 1);
            }
            if (!selected.includes(value)) selected.push(value);
          }
        } else {
          const idx = selected.indexOf(value);
          if (idx >= 0) selected.splice(idx, 1);
        }
        // reflect any programmatic clears (e.g. an exclusive pick unchecking siblings)
        container.querySelectorAll('input[type=checkbox]').forEach(cb => {
          cb.checked = selected.includes(cb.value);
        });
        refreshMaxState();
        if (onChange) onChange(selected);
      });
    });
    refreshMaxState();
  }

  window.PED.chips = { renderChipGrid, escapeHtml };
})();
