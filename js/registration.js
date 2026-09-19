// Classic script. Registration step: date of birth (not an age band), two
// visually distinct phone fields (parent mandatory, student optional), real
// T&Cs modal + two separate checkboxes, school autocomplete against the real
// dataset with curriculum auto-fill/skip, and a non-alarming popup (not a
// silent block) when the parent number is missing at submit.
(function () {
  'use strict';
  window.PED = window.PED || {};
  const { escapeHtml } = window.PED.chips;

  const CURRICULA = ['Indian', 'IB', 'British', 'American', 'UAE MoE', 'SABIS', 'Other'];

  function gradeOptionsFor(curriculum) {
    if (curriculum === 'British') return ['Year 11', 'Year 12', 'Year 13'];
    if (curriculum === 'IB') return ['MYP5', 'DP1', 'DP2'];
    if (curriculum === 'Other') return ['Early stage (~Class 10)', 'Mid stage (~Class 11)', 'Final stage (~Class 12)'];
    return ['Class 10', 'Class 11', 'Class 12'];
  }

  /** Normalizes whichever stream/cluster/category/track structure a curriculum
   * uses (see data/curriculum_subjects.json) into a plain [{id,label}] list, or
   * [] if the curriculum has no such structure (the "Other" bucket). */
  function getStreamOptions(curriculumSubjects, curriculumName) {
    const c = (curriculumSubjects.curricula || {})[curriculumName];
    if (!c) return [];
    if (c.streams) return c.streams.map(s => ({ id: s.id, label: s.label }));
    if (c.groups) return c.groups.map(g => ({ id: g.id, label: g.label }));
    if (c.combination_clusters) return c.combination_clusters.map(cl => ({
      id: cl.id,
      label: cl.id.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()),
    }));
    if (c.ap_categories) return c.ap_categories.map(a => ({ id: a.id, label: a.label || a.id }));
    if (c.external_exam_tracks) return c.external_exam_tracks.map((t, i) => ({ id: `track-${i}`, label: t }));
    return [];
  }

  // Same UAE-05-number / international-number normalization as both reference
  // prototypes. Format-checked only — no OTP, no verification call (standing decision).
  function normalizePhone(v) {
    if (!v) return null;
    let s = v.trim().replace(/[\s()-]/g, '');
    if (s.startsWith('00')) s = '+' + s.slice(2);
    if (/^05\d{8}$/.test(s)) s = '+971' + s.slice(1);
    return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
  }

  function renderOptions(list) {
    return list.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  }

  const TCS_TEXT = `
    <h3>Terms &amp; Conditions (rehearsal placeholder)</h3>
    <p>This is placeholder text for the rehearsal build — the approved, permit-reviewed
    Terms &amp; Conditions for the live iPad giveaway (eligibility, prize details, entry
    deadline, draw time and claim rules) will replace this before the event.</p>
    <p>By registering you agree that Pedagogy Educational Services may keep the details
    you provide to manage this registration and tailor today's questions to your stage.
    One equal-chance draw entry is created per eligible, non-duplicate student regardless
    of quiz score or how much of the experience is completed.</p>
  `;

  /**
   * Renders the registration step into `container`. Calls onNext(draft) once the
   * form is valid and the visitor taps Continue.
   */
  function renderRegister(container, draft, datasets, onNext) {
    const { schools, curriculumSubjects } = datasets;
    const reg = draft.registration;

    container.innerHTML = `
      <p class="eyebrow-small">YOUR JOURNEY STARTS HERE</p>
      <h2 class="step-heading">First, make it yours.</h2>
      <p class="field-hint">Use fictional details in this rehearsal.</p>

      <div class="field-row two-col">
        <label>Student name
          <input type="text" id="regName" required minlength="2" maxlength="80" value="${escapeHtml(reg.name || '')}">
        </label>
        <label>Date of birth
          <input type="date" id="regDob" required value="${escapeHtml(reg.dob || '')}">
        </label>
      </div>

      <div class="contact-cards">
        <div class="contact-card contact-card--required">
          <p class="contact-card-label">Parent / guardian mobile <span class="badge badge--required">Required</span></p>
          <p class="field-hint">Needed so a parent can be reached to arrange prize handover to a minor.</p>
          <input type="tel" id="regParentMobile" placeholder="+971 5xxxxxxxx" value="${escapeHtml(reg.parentMobile || '')}">
        </div>
        <div class="contact-card contact-card--optional">
          <p class="contact-card-label">Student mobile <span class="badge badge--optional">Optional</span></p>
          <input type="tel" id="regStudentMobile" placeholder="+971 5xxxxxxxx" value="${escapeHtml(reg.studentMobile || '')}">
        </div>
      </div>

      <label>Whose number is the parent/guardian one above?
        <select id="regContactRole">
          <option value="">Choose</option>
          <option${reg.contactRole === 'Parent' ? ' selected' : ''}>Parent</option>
          <option${reg.contactRole === 'Guardian' ? ' selected' : ''}>Guardian</option>
        </select>
      </label>

      <div class="school-field">
        <label>School name
          <input type="text" id="regSchoolInput" autocomplete="off" placeholder="Start typing your school's name" value="${escapeHtml(reg.school || '')}">
        </label>
        <ul class="school-suggestions" id="schoolSuggestions" hidden></ul>
        <p class="field-hint" id="schoolCurriculumNote" hidden></p>
      </div>

      <div class="field-row two-col" id="curriculumFieldWrap">
        <label>Curriculum
          <select id="regCurriculum">
            <option value="">Choose</option>
            ${renderOptions(CURRICULA)}
          </select>
        </label>
        <label>Grade / class
          <select id="regGrade"></select>
        </label>
      </div>

      <label id="streamFieldWrap" hidden>Stream, if applicable
        <select id="regStream"></select>
      </label>

      <div class="tcs-block">
        <label class="check">
          <input type="checkbox" id="regTcs"${reg.tcsAccepted ? ' checked' : ''}>
          I have read and accept the <a href="#" id="tcsLink">Terms &amp; Conditions</a>.
        </label>
        <label class="check">
          <input type="checkbox" id="regConsent"${reg.consentToContact ? ' checked' : ''}>
          I consent to Pedagogy contacting me about this registration and follow-up,
          including via WhatsApp / WhatsApp Business API messaging.
        </label>
      </div>

      <div class="step-actions">
        <button type="button" class="primary" id="registerNextBtn">Continue &rarr;</button>
      </div>
    `;

    const $ = sel => container.querySelector(sel);

    function refreshGradeOptions() {
      $('#regGrade').innerHTML = renderOptions(gradeOptionsFor(reg.curriculum));
      if (reg.grade && gradeOptionsFor(reg.curriculum).includes(reg.grade)) $('#regGrade').value = reg.grade;
    }

    function refreshStreamOptions() {
      const options = getStreamOptions(curriculumSubjects, reg.curriculum);
      const wrap = $('#streamFieldWrap');
      if (!options.length) {
        wrap.hidden = true;
        return;
      }
      wrap.hidden = false;
      $('#regStream').innerHTML = '<option value="">Not applicable / no stream</option>' +
        options.map(o => `<option value="${escapeHtml(o.id)}">${escapeHtml(o.label)}</option>`).join('');
      if (reg.stream) $('#regStream').value = reg.stream;
    }

    function setCurriculum(curriculum, skipManualField) {
      reg.curriculum = curriculum;
      $('#regCurriculum').value = curriculum || '';
      $('#curriculumFieldWrap').querySelector('label:first-child').style.display = skipManualField ? 'none' : '';
      refreshGradeOptions();
      refreshStreamOptions();
    }

    refreshGradeOptions();
    refreshStreamOptions();

    $('#regName').addEventListener('input', e => window.PED.state.mutateDraft(draft, () => { reg.name = e.target.value; }));
    $('#regDob').addEventListener('change', e => window.PED.state.mutateDraft(draft, () => { reg.dob = e.target.value; }));
    $('#regParentMobile').addEventListener('input', e => window.PED.state.mutateDraft(draft, () => { reg.parentMobile = e.target.value; }));
    $('#regStudentMobile').addEventListener('input', e => window.PED.state.mutateDraft(draft, () => { reg.studentMobile = e.target.value; }));
    $('#regContactRole').addEventListener('change', e => window.PED.state.mutateDraft(draft, () => { reg.contactRole = e.target.value; }));
    $('#regCurriculum').addEventListener('change', e => {
      window.PED.state.mutateDraft(draft, () => { reg.curriculum = e.target.value; reg.stream = null; });
      refreshGradeOptions();
      refreshStreamOptions();
    });
    $('#regGrade').addEventListener('change', e => window.PED.state.mutateDraft(draft, () => { reg.grade = e.target.value; }));
    $('#regStream').addEventListener('change', e => window.PED.state.mutateDraft(draft, () => { reg.stream = e.target.value; }));
    $('#regTcs').addEventListener('change', e => window.PED.state.mutateDraft(draft, () => { reg.tcsAccepted = e.target.checked; }));
    $('#regConsent').addEventListener('change', e => window.PED.state.mutateDraft(draft, () => { reg.consentToContact = e.target.checked; }));

    // --- School autocomplete ---
    const schoolInput = $('#regSchoolInput');
    const suggestionsEl = $('#schoolSuggestions');
    const curriculumNoteEl = $('#schoolCurriculumNote');

    function clearSuggestions() {
      suggestionsEl.hidden = true;
      suggestionsEl.innerHTML = '';
    }

    schoolInput.addEventListener('input', () => {
      const value = schoolInput.value;
      window.PED.state.mutateDraft(draft, () => { reg.school = value; reg.schoolKey = null; });
      curriculumNoteEl.hidden = true;
      const matches = window.PED.schools.searchSchools(schools.schools, value);
      if (!matches.length) { clearSuggestions(); return; }
      suggestionsEl.hidden = false;
      suggestionsEl.innerHTML = matches.map(m =>
        `<li data-id="${escapeHtml(m.id)}">${escapeHtml(m.school_name)} <small>${escapeHtml(m.emirate)} &middot; ${escapeHtml(m.curriculum_tags.join(' / '))}</small></li>`
      ).join('');
      suggestionsEl.querySelectorAll('li').forEach(li => {
        li.addEventListener('click', () => {
          const school = matches.find(m => m.id === li.dataset.id);
          window.PED.state.mutateDraft(draft, () => {
            reg.school = school.school_name;
            reg.schoolKey = window.PED.schools.schoolKeyFor(school.school_name);
          });
          schoolInput.value = school.school_name;
          clearSuggestions();
          const tags = school.curriculum_tags;
          if (tags.length === 1) {
            curriculumNoteEl.hidden = false;
            curriculumNoteEl.textContent = `Curriculum set automatically from your school: ${tags[0]}.`;
            setCurriculum(tags[0], true);
          } else {
            curriculumNoteEl.hidden = false;
            curriculumNoteEl.textContent = `Your school offers more than one track (${tags.join(', ')}) — please confirm which one you're on.`;
            $('#regCurriculum').innerHTML = '<option value="">Choose your track</option>' + renderOptions(tags);
            setCurriculum(null, false);
          }
        });
      });
    });
    schoolInput.addEventListener('blur', () => setTimeout(clearSuggestions, 150));

    // --- T&Cs modal ---
    $('#tcsLink').addEventListener('click', e => {
      e.preventDefault();
      window.PED.modal.open('Terms & Conditions', TCS_TEXT);
    });

    // --- Continue / validation ---
    $('#registerNextBtn').addEventListener('click', () => {
      if (!reg.name || reg.name.trim().length < 2) { window.PED.modal.alert('Please enter the student’s name.'); return; }
      if (!reg.dob) { window.PED.modal.alert('Please enter a date of birth.'); return; }
      if (!reg.tcsAccepted) { window.PED.modal.alert('Please accept the Terms & Conditions to continue.'); return; }
      if (!reg.consentToContact) { window.PED.modal.alert('Please agree to be contacted (including via WhatsApp) to continue.'); return; }

      const parentPhone = normalizePhone(reg.parentMobile);
      if (!parentPhone) {
        window.PED.modal.open(
          'A parent/guardian number is needed',
          `<p>Since the iPad prize can only be handed over through a parent or guardian, we need a
           reachable parent/guardian mobile number before we can continue &mdash; not to alarm you,
           just so we can arrange collection and any follow-up.</p>
           <p>Please add a number in the format <strong>+971 5xxxxxxxx</strong> (or your country code).</p>`,
          [{ label: 'Go back and add it', action: () => schoolInput ? $('#regParentMobile').focus() : null }]
        );
        return;
      }
      const studentPhone = reg.studentMobile ? normalizePhone(reg.studentMobile) : null;
      if (reg.studentMobile && !studentPhone) { window.PED.modal.alert('That student mobile number doesn’t look valid — use an international format or a UAE 05xxxxxxxx number.'); return; }

      window.PED.state.mutateDraft(draft, () => {
        reg.parentMobile = parentPhone;
        reg.studentMobile = studentPhone;
        reg.school = reg.school ? reg.school.trim() : null;
        reg.schoolKey = reg.schoolKey || (reg.school ? window.PED.schools.schoolKeyFor(reg.school) : null);
      });
      onNext();
    });
  }

  window.PED.registration = { renderRegister, gradeOptionsFor, getStreamOptions, normalizePhone };
})();
