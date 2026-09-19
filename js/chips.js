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
   * onChange(selectedArray): called after every toggle.
   */
  function renderChipGrid(container, { name, options, selected, exclusiveValues, onChange }) {
    exclusiveValues = exclusiveValues || [];
    container.innerHTML =
      '<div class="chips" role="group">' +
      options.map((opt, i) => {
        const id = `${name}-${i}`;
        const checked = selected.includes(opt) ? ' checked' : '';
        return `<label for="${id}"><input type="checkbox" id="${id}" name="${name}" value="${escapeHtml(opt)}"${checked}><span>${escapeHtml(opt)}</span></label>`;
      }).join('') +
      '</div>';

    container.querySelectorAll('input[type=checkbox]').forEach(input => {
      input.addEventListener('change', () => {
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
        if (onChange) onChange(selected);
      });
    });
  }

  window.PED.chips = { renderChipGrid, escapeHtml };
})();
