// Classic script. School-name autocomplete against the real data/schools.json
// dataset (518 schools) and the curriculum-prefill/skip logic session_handoff.md
// Section 3G specifies.
(function () {
  'use strict';
  window.PED = window.PED || {};

  // Client feedback (2026-09-29): typing "duba" should surface "Dubai
  // International School" before "American School of Dubai" — a name that
  // STARTS with the query (or has a word that starts with it) is a much
  // stronger match than the query merely appearing somewhere mid-name.
  function rankMatch(nameLower, q) {
    if (nameLower.startsWith(q)) return 0;
    if (nameLower.split(/\s+/).some(word => word.startsWith(q))) return 1;
    return 2;
  }

  function searchSchools(schools, query, limit) {
    limit = limit || 8;
    const q = query.trim().toLowerCase();
    // Client feedback (2026-09-29): the list was disappearing entirely after
    // the first typed character (this used to require 2+ characters before
    // returning anything, which was invisible when there was no browse list
    // to compare against — now that clicking the field shows a full browse
    // list at 0 characters, that same gap read as "the dropdown vanishes").
    // Filters and narrows continuously from the first character instead.
    if (!q) return [];
    return schools
      .filter(s => s.school_name.toLowerCase().includes(q))
      .map(s => ({ s, rank: rankMatch(s.school_name.toLowerCase(), q) }))
      .sort((a, b) => a.rank - b.rank || a.s.school_name.localeCompare(b.s.school_name))
      .slice(0, limit)
      .map(x => x.s);
  }

  // Client feedback (2026-09-29): tapping the (empty) school field should
  // immediately show a browsable list, not force two characters to be typed
  // first. Capped rather than all 518 — a scrollable ~20-row list stays
  // usable on an iPad-width dropdown; narrows further once they start typing
  // via searchSchools above.
  function browseSchools(schools, limit) {
    limit = limit || 20;
    return schools
      .slice()
      .sort((a, b) => a.school_name.localeCompare(b.school_name))
      .slice(0, limit);
  }

  function schoolKeyFor(name) {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  window.PED.schools = { searchSchools, browseSchools, schoolKeyFor };
})();
