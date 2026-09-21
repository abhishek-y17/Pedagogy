// Classic script. Registration step: date of birth (not an age band), two
// visually distinct phone fields (parent mandatory, student optional), each
// split into its own editable country-code box (preset +971) and local-number
// box, real T&Cs modal + two separate checkboxes, school autocomplete against
// the real dataset with curriculum auto-fill/skip, and a non-alarming popup
// (not a silent block) when the parent number is missing at submit.
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
  // Shortened again same day (Abhi, 2026-09-20 voice note): "10th year of
  // school" read as too wordy live — plain ordinal only.
  const PLAIN_GRADE_LABELS = ['10th', '11th', '12th'];
  // Internal value is stable across curricula so downstream filtering never has to care
  // which label the visitor actually saw.
  const GRADE_VALUES = ['stage10', 'stage11', 'stage12'];

  function gradeOptionsFor(curriculum) {
    const labels = GRADE_LABELS[curriculum] || PLAIN_GRADE_LABELS;
    return GRADE_VALUES.map((value, i) => ({ value, label: labels[i] }));
  }

  // Canonical derivation now lives in js/questions.js (getStreamOptions) so
  // question-eligibility validation can never drift from what this picker
  // shows — see that file's comment. Local alias for readability below.
  const getStreamOptions = (curriculumSubjects, curriculumName) =>
    window.PED.questions.getStreamOptions(curriculumSubjects, curriculumName);

  // Same UAE-05-number / international-number normalization as both reference
  // prototypes. Format-checked only — no OTP, no verification call (standing decision).
  function normalizePhone(v) {
    if (!v) return null;
    let s = v.trim().replace(/[\s()-]/g, '');
    if (s.startsWith('00')) s = '+' + s.slice(2);
    if (/^05\d{8}$/.test(s)) s = '+971' + s.slice(1);
    return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
  }

  // Country code + local number now live in two separate boxes (Abhi's
  // 2026-09-20 voice note — preset +971, editable for other countries).
  // Combines them into the same E.164-ish string normalizePhone() already
  // validates, dropping a leading trunk '0' from the local number (visitors
  // habitually type "05xxxxxxxx" even once the +971 is already supplied
  // separately by the country-code box).
  function combinePhone(countryCode, localNumber) {
    let num = (localNumber || '').replace(/\D/g, '');
    if (!num) return null;
    if (num.startsWith('0')) num = num.slice(1);
    return normalizePhone((countryCode || '+971') + num);
  }

  // Letters (incl. accented), spaces, hyphens, apostrophes, periods only — covers
  // "Mary-Jane", "O'Brien", "Md. Rahman", rejects digits/symbols like "test@gmail.com".
  const NAME_PATTERN = /^[\p{L}][\p{L}\s'.-]*$/u;

  // Live-filtering helpers: strip disallowed characters as the visitor types,
  // rather than only rejecting at submit. normalizePhone()/combinePhone() above
  // stay the real format check at submit — these just keep junk characters out
  // along the way.
  function sanitizeName(v) {
    return (v || '').replace(/[^\p{L}\s'.-]/gu, '');
  }
  // Local-number box: digits only — the country code lives in its own box now.
  function sanitizePhoneInput(v) {
    return (v || '').replace(/\D/g, '');
  }
  // Country-code box: a single leading '+' followed by digits only.
  function sanitizeCountryCode(v) {
    const digits = (v || '').replace(/\D/g, '');
    return digits ? '+' + digits : '';
  }

  // Deliberately generous bounds (not a strict 15–18) — this is a fat-finger
  // guard against a typo'd DOB (e.g. landing in 1990) or a future date, not a
  // precise age gate, since a held-back or skipped-ahead real Class 10–12
  // student can legitimately fall outside a tight range.
  const MIN_AGE = 12;
  const MAX_AGE = 24;
  function ageFromDob(dobStr) {
    const dob = new Date(dobStr);
    if (isNaN(dob.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) age--;
    return age;
  }

  function renderOptions(list) {
    return list.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
  }

  /**
   * Single source of truth for "is this registration complete enough to
   * proceed" — used by the register step's own Continue button AND, as a
   * defensive re-check, by the review screen's Submit button (Phase 2 item 1:
   * "Submit is also the missing-parent-number gate"). Returns a plain result
   * object rather than showing UI itself, so each caller can present it in its
   * own context (the register step already has its fields on screen; the
   * review screen needs to jump back to register first).
   */
  function validateRegistrationForSubmit(reg) {
    if (!reg.name || reg.name.trim().length < 2) return { ok: false, kind: 'alert', message: 'Please enter your full name.' };
    if (!NAME_PATTERN.test(reg.name.trim())) return { ok: false, kind: 'alert', message: 'That name has numbers or symbols in it — please use letters only (hyphens and apostrophes are fine).' };
    if (!reg.dob) return { ok: false, kind: 'alert', message: 'Please enter a date of birth.' };
    if (new Date(reg.dob) > new Date()) return { ok: false, kind: 'alert', message: 'That date of birth is in the future — please check it.' };
    const age = ageFromDob(reg.dob);
    if (age === null || age < MIN_AGE || age > MAX_AGE) return { ok: false, kind: 'alert', message: `That date of birth doesn't look right for a Class 10–12 student — please double-check it.` };
    if (!reg.tcsAccepted) return { ok: false, kind: 'alert', message: 'Please accept the Terms & Conditions to continue.' };
    if (!reg.consentToContact) return { ok: false, kind: 'alert', message: 'Please agree to be contacted (including via WhatsApp) to continue.' };

    const parentPhone = combinePhone(reg.parentCountryCode, reg.parentMobileLocal);
    if (!parentPhone) return { ok: false, kind: 'parentMissing' };

    const studentPhone = reg.studentMobileLocal ? combinePhone(reg.studentCountryCode, reg.studentMobileLocal) : null;
    if (reg.studentMobileLocal && !studentPhone) return { ok: false, kind: 'alert', message: 'That student mobile number doesn’t look valid — check the country code and number.' };

    return { ok: true, parentPhone, studentPhone };
  }

  /** Shared modal presentation for a failed validateRegistrationForSubmit() result.
   * `onDismiss` fires once the visitor actually closes/acts on the modal — the
   * register step passes a re-focus of the parent-mobile field; the review
   * screen passes a jump back to the register step (see js/review.js). Both
   * failure kinds now route through an explicit action button rather than a
   * bare `modal.alert()`, specifically so a caller that needs to navigate
   * afterward (review.js) can do so only once the modal is actually
   * dismissed — firing that navigation immediately alongside opening the
   * modal left it floating over a screen that had already moved on
   * underneath it (reported live 2026-09-21, same bug class as the quiz
   * timer's stray Skip-confirm modal fixed earlier this round). */
  function presentValidationFailure(result, onDismiss) {
    const dismiss = onDismiss || (() => {});
    if (result.kind === 'parentMissing') {
      window.PED.modal.open(
        'A parent/guardian number is needed',
        `<p>Since the iPad prize can only be handed over through a parent or guardian, we need a
         reachable parent/guardian mobile number before we can continue &mdash; not to alarm you,
         just so we can arrange collection and any follow-up.</p>
         <p>Please add a number in the format <strong>+971 5xxxxxxxx</strong> (or your country code).</p>`,
        [{ label: 'Go back and add it', action: dismiss }]
      );
    } else {
      window.PED.modal.open('Please check this', `<p>${result.message}</p>`, [{ label: 'OK', action: dismiss }]);
    }
  }

  // Substantive content here is real (data use + equal-odds draw), but the full
  // permit-reviewed legal text (eligibility, prize details, entry deadline, draw
  // time, claim rules) is still pending from Pedagogy/legal — swap this for that
  // text the moment it's delivered. Framed plainly rather than as a visible
  // "rehearsal placeholder" disclaimer, since a real visitor reads this screen.
  const TCS_TEXT = `
    <h3>Terms &amp; Conditions</h3>
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

    // Defense-in-depth on top of the JS age-range check: bound the native
    // date picker itself so it can't even offer an implausible date.
    const today = new Date();
    const dobMax = new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate()).toISOString().slice(0, 10);
    const dobMin = new Date(today.getFullYear() - MAX_AGE, today.getMonth(), today.getDate()).toISOString().slice(0, 10);

    container.innerHTML = `
      <p class="eyebrow-small">YOUR JOURNEY STARTS HERE</p>
      <h2 class="step-heading">First, make it yours.</h2>

      <div class="field-row two-col">
        <label>Full name
          <input type="text" id="regName" required minlength="2" maxlength="80"
            placeholder="e.g. Aarav Sharma" value="${escapeHtml(reg.name || '')}"
            autocomplete="off-name-x" spellcheck="false" autocorrect="off" autocapitalize="words">
        </label>
        <label>Date of birth
          <input type="date" id="regDob" required value="${escapeHtml(reg.dob || '')}"
            min="${dobMin}" max="${dobMax}" autocomplete="off-dob-x">
        </label>
      </div>
      <p class="field-hint field-hint--soft" id="nameHint" hidden>Just checking &mdash; is that the full name? Single names are fine if that is what's on record.</p>

      <div class="contact-cards">
        <div class="contact-card contact-card--required">
          <p class="contact-card-label">Parent / guardian mobile <span class="badge badge--required">Required</span></p>
          <p class="field-hint">Needed so a parent can be reached to arrange prize handover to a minor.</p>
          <div class="phone-input-row">
            <input type="tel" id="regParentCountryCode" class="phone-country-code" placeholder="+971"
              value="${escapeHtml(reg.parentCountryCode || '+971')}" autocomplete="off-parent-cc-x" spellcheck="false" autocorrect="off" aria-label="Parent/guardian country code">
            <input type="tel" id="regParentMobile" class="phone-number" placeholder="5xxxxxxxx" value="${escapeHtml(reg.parentMobileLocal || '')}"
              autocomplete="off-parent-mobile-x" spellcheck="false" autocorrect="off" aria-label="Parent/guardian mobile number">
          </div>
          <p class="field-hint field-hint--soft">We may reach out on WhatsApp &mdash; please make sure this number is active on WhatsApp.</p>
        </div>
        <div class="contact-card contact-card--optional">
          <p class="contact-card-label">Student mobile</p>
          <div class="phone-input-row">
            <input type="tel" id="regStudentCountryCode" class="phone-country-code" placeholder="+971"
              value="${escapeHtml(reg.studentCountryCode || '+971')}" autocomplete="off-student-cc-x" spellcheck="false" autocorrect="off" aria-label="Student country code">
            <input type="tel" id="regStudentMobile" class="phone-number" placeholder="5xxxxxxxx" value="${escapeHtml(reg.studentMobileLocal || '')}"
              autocomplete="off-student-mobile-x" spellcheck="false" autocorrect="off" aria-label="Student mobile number">
          </div>
          <p class="field-hint field-hint--soft">We may reach out on WhatsApp &mdash; please make sure this number is active on WhatsApp.</p>
        </div>
      </div>

      <div class="school-field">
        <label>School name
          <input type="text" id="regSchoolInput" placeholder="Start typing your school's name" value="${escapeHtml(reg.school || '')}"
            maxlength="120" autocomplete="off-school-x" spellcheck="false" autocorrect="off" autocapitalize="words">
        </label>
        <ul class="school-suggestions" id="schoolSuggestions" hidden></ul>
        <p class="field-hint" id="schoolCurriculumNote" hidden></p>
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
          <span class="check-text">I have read and accept the <a href="#" id="tcsLink">Terms &amp; Conditions</a>, and I'd like to
          receive updates about Pedagogy's programs and offers.</span>
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
      if (reg.grade && options.some(o => o.value === reg.grade)) {
        $('#regGrade').value = reg.grade;
      } else {
        // A <select> always shows its first option as visually selected even
        // with no explicit choice — persist that same default onto the draft
        // so review.js's "every registration field shown" actually matches
        // what the visitor saw, instead of showing "—" for a field that
        // never looked empty on screen (found in Phase 2 review-screen QA).
        $('#regGrade').value = options[0].value;
        window.PED.state.mutateDraft(draft, () => { reg.grade = options[0].value; });
      }
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

    $('#regName').addEventListener('input', e => {
      const clean = sanitizeName(e.target.value);
      if (clean !== e.target.value) e.target.value = clean;
      window.PED.state.mutateDraft(draft, () => { reg.name = clean; });
    });
    $('#regDob').addEventListener('change', e => window.PED.state.mutateDraft(draft, () => { reg.dob = e.target.value; }));
    $('#regParentCountryCode').addEventListener('input', e => {
      const clean = sanitizeCountryCode(e.target.value);
      if (clean !== e.target.value) e.target.value = clean;
      window.PED.state.mutateDraft(draft, () => { reg.parentCountryCode = clean; });
    });
    $('#regParentMobile').addEventListener('input', e => {
      const clean = sanitizePhoneInput(e.target.value);
      if (clean !== e.target.value) e.target.value = clean;
      window.PED.state.mutateDraft(draft, () => { reg.parentMobileLocal = clean; });
    });
    $('#regStudentCountryCode').addEventListener('input', e => {
      const clean = sanitizeCountryCode(e.target.value);
      if (clean !== e.target.value) e.target.value = clean;
      window.PED.state.mutateDraft(draft, () => { reg.studentCountryCode = clean; });
    });
    $('#regStudentMobile').addEventListener('input', e => {
      const clean = sanitizePhoneInput(e.target.value);
      if (clean !== e.target.value) e.target.value = clean;
      window.PED.state.mutateDraft(draft, () => { reg.studentMobileLocal = clean; });
    });
    $('#regCurriculum').addEventListener('change', e => {
      window.PED.state.mutateDraft(draft, () => { reg.curriculum = e.target.value; reg.stream = null; });
      refreshGradeOptions();
      refreshStreamOptions();
    });
    $('#regGrade').addEventListener('change', e => window.PED.state.mutateDraft(draft, () => { reg.grade = e.target.value; }));
    $('#regStream').addEventListener('change', e => window.PED.state.mutateDraft(draft, () => { reg.stream = e.target.value; }));
    // Timestamps (Phase 4 staff-dashboard item: "T&Cs-acceptance and
    // consent-to-contact timestamps") — recorded the moment each is checked,
    // cleared back to null if unchecked so a stale timestamp never survives
    // an unchecked box. Round D follow-up: the T&Cs checkbox was merged with
    // marketing opt-in into a single checkbox (Abhi's explicit call — checking
    // T&Cs now also opts the visitor into marketing updates; it's no longer
    // independently optional/trackable) — both fields are set together here.
    $('#regTcs').addEventListener('change', e => {
      window.PED.haptics.tap();
      window.PED.state.mutateDraft(draft, () => {
        reg.tcsAccepted = e.target.checked;
        reg.tcsAcceptedAt = e.target.checked ? new Date().toISOString() : null;
        reg.marketingOptIn = e.target.checked;
        reg.marketingOptInAt = e.target.checked ? new Date().toISOString() : null;
      });
    });
    $('#regConsent').addEventListener('change', e => {
      window.PED.haptics.tap();
      window.PED.state.mutateDraft(draft, () => {
        reg.consentToContact = e.target.checked;
        reg.consentToContactAt = e.target.checked ? new Date().toISOString() : null;
      });
    });

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
        // Reported live 2026-09-21: picking a school did nothing on a real
        // iPad. Root cause — a classic mobile-Safari race, invisible to
        // Playwright's default `.click()` (which dispatches a mouse click,
        // not a real touch sequence, even on the iPad test project): tapping
        // the <li> first fires `blur` on #regSchoolInput, which used to only
        // be handled by a 150ms-delayed clearSuggestions() — on a real touch
        // device that blur can remove this <li> from the DOM before its own
        // `click` handler ever runs, so the tap silently does nothing. Fixed
        // by committing the selection on `pointerdown` (fires before blur)
        // and preventing the default there so focus never leaves the input
        // in the first place.
        li.addEventListener('pointerdown', e => {
          e.preventDefault();
          window.PED.haptics.tap();
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
      const result = validateRegistrationForSubmit(reg);
      if (!result.ok) { presentValidationFailure(result, () => $('#regParentMobile').focus()); return; }

      window.PED.state.mutateDraft(draft, () => {
        reg.parentMobile = result.parentPhone;
        reg.studentMobile = result.studentPhone;
        reg.school = reg.school ? reg.school.trim() : null;
        reg.schoolKey = reg.schoolKey || (reg.school ? window.PED.schools.schoolKeyFor(reg.school) : null);
      });
      onNext();
    });
  }

  window.PED.registration = {
    renderRegister, gradeOptionsFor, getStreamOptions, normalizePhone, combinePhone, TCS_TEXT,
    validateRegistrationForSubmit, presentValidationFailure,
    NAME_PATTERN, sanitizeName, sanitizePhoneInput, sanitizeCountryCode, MIN_AGE, MAX_AGE, ageFromDob,
  };
})();
