// Classic script. School-name autocomplete against the real data/schools.json
// dataset (518 schools) and the curriculum-prefill/skip logic session_handoff.md
// Section 3G specifies.
(function () {
  'use strict';
  window.PED = window.PED || {};

  function searchSchools(schools, query, limit) {
    limit = limit || 8;
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return schools
      .filter(s => s.school_name.toLowerCase().includes(q))
      .slice(0, limit);
  }

  function schoolKeyFor(name) {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  window.PED.schools = { searchSchools, schoolKeyFor };
})();
