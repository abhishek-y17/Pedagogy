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

  // Real per-curriculum grade naming, cross-checked against data/curriculum_subjects.json's
  // `structure` notes. SABIS deliberately falls back to the plain wording below: SABIS
  // schools follow either a British or American exam track, but data/schools.json has no
  // per-school field recording which track, so there is no reliable way to pick between
  // "Year 12" and "Grade 11" for a given SABIS school (flagged in RUN_LOG.md for Abhi).
  const GRADE_LABELS = {
    Indian: ['Class 10', 'Class 11', 'Class 12'],
    British: ['Year 11', 'Year 12', 'Year 13'],
    American: ['Grade 10', 'Grade 11', 'Grade 12'],
    IB: ['MYP Year 5', 'DP Year 1', 'DP Year 2'],
    'UAE MoE': ['Grade 10', 'Grade 11', 'Grade 12'],
  };
  // Abhi's call after seeing the wordy "Two years before final" phrasing live
  // (2026-09-19): default to plain, natural-reading labels instead of the
  // original curriculum-neutral data-minimization phrasing. Revisited
  // 2026-09-20: "Grade 10/11/12" specifically was rejected in favor of this
  // wording because "Grade" is itself curriculum-coded (American/UAE MoE
  // naming) and 264 of the 518 schools.json entries (British, Indian, IB,
  // SABIS) use "Year"/"Class"/MYP-DP instead — a Sharjah/Dubai family seeing
  // "Grade" pre-selection reads as a wrong-curriculum assumption, not a
  // neutral placeholder. This fallback is ALSO what "Other" and SABIS
  // curricula land on post-selection (see comment above), so it has to stay
  // curriculum-neutral in both positions, not just as a loading-state default.
  const PLAIN_GRADE_LABELS = ['10th year of school', '11th year of school', '12th year of school'];
  // Internal value is stable across curricula so downstream filtering never has to care
  // which label the visitor actually saw.
  const GRADE_VALUES = ['stage10', 'stage11', 'stage12'];

  function gradeOptionsFor(curriculum) {
    const labels = GRADE_LABELS[curriculum] || PLAIN_GRADE_LABELS;
    return GRADE_VALUES.map((value, i) => ({ value, label: labels[i] }));
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
        <label>Full name
          <input type="text" id="regName" required minlength="2" maxlength="80"
            placeholder="e.g. Aarav Sharma" value="${escapeHtml(reg.name || '')}"
            autocomplete="off-name-x" spellcheck="false" autocorrect="off" autocapitalize="words">
        </label>
        <label>Date of birth
          <input type="date" id="regDob" required value="${escapeHtml(reg.dob || '')}"
            autocomplete="off-dob-x">
        </label>
      </div>
      <p class="field-hint field-hint--soft" id="nameHint" hidden>Just checking &mdash; is that the full name? Single names are fine if that is what's on record.</p>

      <div class="contact-cards">
        <div class="contact-card contact-card--required">
          <p class="contact-card-label">Parent / guardian mobile <span class="badge badge--required">Required</span></p>
          <p class="field-hint">Needed so a parent can be reached to arrange prize handover to a minor.</p>
          <input type="tel" id="regParentMobile" placeholder="+971 5xxxxxxxx" value="${escapeHtml(reg.parentMobile || '')}"
            autocomplete="off-parent-mobile-x" spellcheck="false" autocorrect="off">
        </div>
        <div class="contact-card contact-card--optional">
          <p class="contact-card-label">Student mobile</p>
          <input type="tel" id="regStudentMobile" placeholder="+971 5xxxxxxxx" value="${escapeHtml(reg.studentMobile || '')}"
            autocomplete="off-student-mobile-x" spellcheck="false" autocorrect="off">
        </div>
      </div>

      <div class="school-field">
        <label>School name
          <input type="text" id="regSchoolInput" placeholder="Start typing your school's name" value="${escapeHtml(reg.school || '')}"
            autocomplete="off-school-x" spellcheck="false" autocorrect="off" autocapitalize="words">
        </label>
        <ul class="school-suggestions" id="schoolSuggestions" hidden></ul>
        <p class="field-hint" id="schoolCurriculumNote" hidden></p>
        <button type="button" class="link-btn" id="schoolNotListedBtn">My school isn't listed</button>
      </div>

      <div class="field-row two-col">
        <div class="curriculum-field" id="curriculumFieldWrap">
          <label>Curriculum
            <select id="regCurriculum">
              <option value="">Choose</option>
              ${renderOptions(CURRICULA)}
            </select>
          </label>
          <p class="derived-line" id="curriculumDerivedLine" hidden></p>
        </div>
        <label>Grade / class
          <select id="regGrade" autocomplete="off-grade-x"></select>
        </label>
      </div>

      <label id="streamFieldWrap" hidden>Stream, if applicable
        <select id="regStream"></select>
      </label>

      <div class="tcs-block">
        <label class="check">
          <input type="checkbox" id="regTcs"${reg.tcsAccepted ? ' checked' : ''}>
          <span class="check-box" aria-hidden="true"><svg viewBox="0 0 16 16"><polyline points="3,8.5 6.5,12 13,4.5"/></svg></span>
          <span class="check-text">I have read and accept the <a href="#" id="tcsLink">Terms &amp; Conditions</a>.</span>
        </label>
        <label class="check">
          <input type="checkbox" id="regConsent"${reg.consentToContact ? ' checked' : ''}>
          <span class="check-box" aria-hidden="true"><svg viewBox="0 0 16 16"><polyline points="3,8.5 6.5,12 13,4.5"/></svg></span>
          <span class="check-text">I consent to Pedagogy contacting me about this registration and follow-up,
          including via WhatsApp / WhatsApp Business API messaging.</span>
        </label>
      </div>

      <div class="step-actions">
        <button type="button" class="primary" id="registerNextBtn">Continue &rarr;</button>
      </div>
    `;

    const $ = sel => container.querySelector(sel);

    function refreshGradeOptions() {
      const options = gradeOptionsFor(reg.curriculum);
      $('#regGrade').innerHTML = options.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
      if (reg.grade && options.some(o => o.value === reg.grade)) $('#regGrade').value = reg.grade;
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

    // Known school with exactly one curriculum tag: the Curriculum <select> is hidden
    // entirely and replaced by a derived, correctable line (3a in this round's brief).
    // Every other case (no school picked yet, free-text/unlisted school, or a school
    // with 2+ curriculum tags) shows the select as a real required question.
    function setCurriculum(curriculum, derivedFromSchoolName) {
      reg.curriculum = curriculum;
      $('#regCurriculum').value = curriculum || '';
      const selectLabel = $('#curriculumFieldWrap').querySelector('label');
      const derivedLine = $('#curriculumDerivedLine');
      if (derivedFromSchoolName) {
        selectLabel.style.display = 'none';
        derivedLine.hidden = false;
        derivedLine.innerHTML = `${escapeHtml(curriculum)} curriculum &mdash; from ${escapeHtml(derivedFromSchoolName)}. ` +
          `Not right? <button type="button" class="link-btn" id="curriculumChangeItBtn">Change it</button>`;
        derivedLine.querySelector('#curriculumChangeItBtn').addEventListener('click', () => {
          setCurriculum(curriculum, null);
        });
      } else {
        selectLabel.style.display = '';
        derivedLine.hidden = true;
        derivedLine.innerHTML = '';
      }
      refreshGradeOptions();
      refreshStreamOptions();
    }

    // Restore derived-vs-manual curriculum display on reentry (e.g. navigating back
    // from the review screen) rather than always defaulting to the manual select.
    (function initCurriculumDisplay() {
      if (reg.schoolKey && reg.school && reg.curriculum) {
        const match = schools.schools.find(s => window.PED.schools.schoolKeyFor(s.school_name) === reg.schoolKey);
        if (match && match.curriculum_tags.length === 1 && match.curriculum_tags[0] === reg.curriculum) {
          setCurriculum(reg.curriculum, match.school_name);
          return;
        }
      }
      setCurriculum(reg.curriculum || null, null);
    })();

    $('#regName').addEventListener('input', e => window.PED.state.mutateDraft(draft, () => { reg.name = e.target.value; }));
    $('#regDob').addEventListener('change', e => window.PED.state.mutateDraft(draft, () => { reg.dob = e.target.value; }));
    $('#regParentMobile').addEventListener('input', e => window.PED.state.mutateDraft(draft, () => { reg.parentMobile = e.target.value; }));
    $('#regStudentMobile').addEventListener('input', e => window.PED.state.mutateDraft(draft, () => { reg.studentMobile = e.target.value; }));
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
      // Typing invalidates any previously-derived curriculum (the school it came from is
      // no longer confirmed) — fall back to the real, required manual question.
      $('#regCurriculum').innerHTML = '<option value="">Choose</option>' + renderOptions(CURRICULA);
      setCurriculum(null, null);
      const matches = window.PED.schools.searchSchools(schools.schools, value);
      if (!matches.length) { clearSuggestions(); return; }
      suggestionsEl.hidden = false;
      suggestionsEl.innerHTML = matches.map(m =>
        `<li data-id="${escapeHtml(m.id)}">${escapeHtml(m.school_name)} <small>${escapeHtml(m.emirate)} &middot; ${escapeHtml(m.curriculum_tags.join(' / '))}</small></li>`
      ).join('');
      suggestionsEl.querySelectorAll('li').forEach((li, i) => {
        // Staggered reveal for the dropdown items (motion pass, item 5).
        li.style.setProperty('--stagger-i', i);
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
            curriculumNoteEl.hidden = true;
            setCurriculum(tags[0], school.school_name);
          } else {
            curriculumNoteEl.hidden = false;
            curriculumNoteEl.textContent = `Your school offers more than one track (${tags.join(', ')}) — please confirm which one you're on.`;
            $('#regCurriculum').innerHTML = '<option value="">Choose your track</option>' + renderOptions(tags);
            setCurriculum(null, null);
          }
        });
      });
    });
    schoolInput.addEventListener('blur', () => setTimeout(clearSuggestions, 150));

    $('#schoolNotListedBtn').addEventListener('click', () => {
      window.PED.state.mutateDraft(draft, () => { reg.school = reg.school || ''; reg.schoolKey = 'unlisted'; });
      clearSuggestions();
      curriculumNoteEl.hidden = false;
      curriculumNoteEl.textContent = "No problem — just fill in your curriculum below.";
      $('#regCurriculum').innerHTML = '<option value="">Choose</option>' + renderOptions(CURRICULA);
      setCurriculum(null, null);
      schoolInput.focus();
    });

    // --- Full-name soft hint (mononyms are common here; never a hard block) ---
    const nameHintEl = $('#nameHint');
    $('#regName').addEventListener('blur', () => {
      const words = (reg.name || '').trim().split(/\s+/).filter(Boolean);
      nameHintEl.hidden = words.length !== 1;
    });

    // --- T&Cs modal ---
    $('#tcsLink').addEventListener('click', e => {
      e.preventDefault();
      window.PED.modal.open('Terms & Conditions', TCS_TEXT);
    });

    // --- Continue / validation ---
    $('#registerNextBtn').addEventListener('click', () => {
      if (!reg.name || reg.name.trim().length < 2) { window.PED.modal.alert('Please enter your full name.'); return; }
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

  window.PED.registration = { renderRegister, gradeOptionsFor, getStreamOptions, normalizePhone, TCS_TEXT };
})();
