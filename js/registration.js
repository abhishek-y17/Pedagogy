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
  //
  // Round E, 2026-09-23: Grade 9 added ahead of stage10 (see GRADE_VALUES below) — a
  // deliberate, explicit reversal of the earlier "Class 10-12 only, no Class 9" standing
  // decision (see session_handoff.md's Standing decisions section for the business
  // reason: 11th/12th are the real qualified NEET/JEE counselling leads; 9th/10th are
  // still worth a registration record via the new direct-submit shortcut below, but not
  // the full quiz/data-collection experience). IB's stage9 label is 'MYP Year 4', not a
  // guess: curriculum_subjects.json's IB entry lists 'MYP Year 5' as the year immediately
  // before 'DP Year 1' (stage10 here), and the MYP runs Years 1-5 across Grades 6-10, so
  // MYP Year 4 is the one year earlier, i.e. Grade 9.
  const GRADE_LABELS = {
    Indian: ['Class 9', 'Class 10', 'Class 11', 'Class 12'],
    British: ['Year 10', 'Year 11', 'Year 12', 'Year 13'],
    American: ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'],
    IB: ['MYP Year 4', 'MYP Year 5', 'DP Year 1', 'DP Year 2'],
    'UAE MoE': ['Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'],
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
  // school" read as too wordy live — plain ordinal only. Extended with '9th'
  // Round E, 2026-09-23, for the same Grade-9 addition described above.
  const PLAIN_GRADE_LABELS = ['9th', '10th', '11th', '12th'];
  // Internal value is stable across curricula so downstream filtering never has to care
  // which label the visitor actually saw.
  const GRADE_VALUES = ['stage9', 'stage10', 'stage11', 'stage12'];

  // Round E item 1: 9th/10th graders get a direct-submit shortcut (see
  // renderRegister's button-mode logic below) instead of the full quiz/
  // data-collection/review experience — see session_handoff.md's Standing
  // decisions for the business reasoning.
  function isDirectSubmitGrade(grade) {
    return grade === 'stage9' || grade === 'stage10';
  }

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

  // Round E item 4: exact local-number digit counts per country code, so the
  // local-number box can both cap live typing and gate real validation,
  // rather than accepting any length. [min, max] covers the handful of codes
  // with a genuinely variable mobile length (e.g. Germany); everywhere else
  // min === max. Covers the countries behind data/schools.json's curriculum
  // mix (UAE, India, UK, US/Canada — SABIS/IB/British/American schools — plus
  // the 12 minor curricula's home countries), with a generous 7-12 digit
  // fallback range for anything not explicitly listed.
  const PHONE_DIGIT_RANGES = {
    '+971': [9, 9],    // UAE — local numbers start with 5
    '+91': [10, 10],   // India
    '+44': [10, 10],   // UK
    '+1': [10, 10],    // US / Canada
    '+63': [10, 10],   // Philippines
    '+92': [10, 10],   // Pakistan
    '+98': [10, 10],   // Iran
    '+61': [9, 9],     // Australia
    '+33': [9, 9],     // France
    '+49': [10, 11],   // Germany — mobile length genuinely varies
    '+81': [10, 10],   // Japan
    '+7': [10, 10],    // Russia
    '+880': [10, 10],  // Bangladesh
    '+34': [9, 9],     // Spain
    '+39': [9, 10],    // Italy — mobile length genuinely varies
  };
  const GENERIC_PHONE_DIGIT_RANGE = [7, 12];

  function expectedDigitRangeFor(countryCode) {
    return PHONE_DIGIT_RANGES[countryCode] || GENERIC_PHONE_DIGIT_RANGE;
  }

  /** Truncates already-sanitized (digits-only) local-number input to the max
   * length allowed for `countryCode` — the live typing cap. Runs *after*
   * sanitizePhoneInput's digit-only filtering, not instead of it. */
  function clampPhoneDigits(countryCode, digits) {
    const [, max] = expectedDigitRangeFor(countryCode);
    return digits.length > max ? digits.slice(0, max) : digits;
  }

  /** Real validation rule (not just the typing cap above): null if `digits` is
   * empty (required-ness is a separate check) or already the right length for
   * `countryCode`, otherwise a human-readable message. Catches the two cases
   * the typing cap alone can't: the country code changing after a number was
   * already typed (now too short/long for the new code), and a paste that
   * drops in a too-short string (nothing to truncate). */
  function phoneDigitError(countryCode, digits) {
    if (!digits) return null;
    const [min, max] = expectedDigitRangeFor(countryCode);
    if (digits.length >= min && digits.length <= max) return null;
    const need = min === max ? `exactly ${min} digits` : `${min}-${max} digits`;
    return `${countryCode || 'That country code'} numbers need ${need} (got ${digits.length}).`;
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

  // Deliberately generous bounds (not a strict 14–18) — this is a fat-finger
  // guard against a typo'd DOB (e.g. landing in 1990) or a future date, not a
  // precise age gate, since a held-back or skipped-ahead real Class 9–12
  // student can legitimately fall outside a tight range. Sanity-checked for
  // Round E's Grade 9 addition: a real 9th grader is typically 13-15, so the
  // existing MIN_AGE=12 floor already has headroom below that and does not
  // need lowering.
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

  // Codexreview finding (Round E): validateRegistrationForSubmit() and
  // getFieldErrors() used to duplicate the same rule set as two independent
  // functions, kept in sync only by developer discipline — a real risk that
  // a future new-field rule gets added to one and forgotten in the other.
  // getFieldErrors() below is now the single source of truth for what makes
  // each field valid and what its message says; validateRegistrationForSubmit()
  // is a thin early-return wrapper over it (see below) that adds only the
  // presentation-level differences a modal/alert needs versus an inline hint
  // (a field-name prefix on a couple of messages, and the special
  // 'parentMissing' kind that opens the dedicated explainer modal instead of
  // a generic alert).
  const ALERT_PREFIX = { studentMobile: 'Student mobile' };
  // Order matters here: it's the precedence a single combined alert/modal
  // shows an error in when several fields are simultaneously invalid (the
  // inline hints via getFieldErrors() show all of them at once instead).
  const VALIDATION_ORDER = ['name', 'dob', 'curriculum', 'grade', 'tcs', 'consent', 'parentMobile', 'studentMobile'];

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
    const errors = getFieldErrors(reg);
    for (const key of VALIDATION_ORDER) {
      if (!errors[key]) continue;
      if (key === 'parentMobile') {
        // Same distinction getFieldErrors() itself makes internally (missing
        // vs. wrong length vs. fails to combine into a valid number) — the
        // 'parentMissing' kind opens the dedicated explainer modal rather
        // than a generic alert, so it needs to be classified here rather
        // than just forwarding errors.parentMobile's message.
        const parentDigits = (reg.parentMobileLocal || '').replace(/\D/g, '');
        if (!parentDigits) return { ok: false, kind: 'parentMissing' };
        const lenError = phoneDigitError(reg.parentCountryCode, parentDigits);
        if (lenError) return { ok: false, kind: 'alert', message: `Parent/guardian mobile: ${lenError}` };
        return { ok: false, kind: 'parentMissing' }; // correct length but still fails to combine/normalize
      }
      const prefix = ALERT_PREFIX[key];
      return { ok: false, kind: 'alert', message: prefix ? `${prefix}: ${errors[key]}` : errors[key] };
    }

    return {
      ok: true,
      parentPhone: combinePhone(reg.parentCountryCode, reg.parentMobileLocal),
      studentPhone: combinePhone(reg.studentCountryCode, reg.studentMobileLocal),
    };
  }

  /**
   * Round E item 5: computes every field's validity independently (no
   * early return), so live inline hints (see renderRegister's
   * refreshValidity() below) can show multiple simultaneous problems at once
   * (e.g. an empty name AND an invalid DOB), which an early-return validator
   * can't do. This is the canonical rule set — validateRegistrationForSubmit()
   * above is derived from it, not a separate copy.
   */
  function getFieldErrors(reg) {
    const errors = {};
    const name = (reg.name || '').trim();
    if (!name || name.length < 2) errors.name = 'Please enter your full name.';
    else if (!NAME_PATTERN.test(name)) errors.name = 'That name has numbers or symbols in it — letters only (hyphens and apostrophes are fine).';

    if (!reg.dob) errors.dob = 'Please enter a date of birth.';
    else if (new Date(reg.dob) > new Date()) errors.dob = 'That date of birth is in the future — please check it.';
    else {
      const age = ageFromDob(reg.dob);
      if (age === null || age < MIN_AGE || age > MAX_AGE) errors.dob = `That date of birth doesn't look right for a Class 9–12 student — please double-check it.`;
    }

    if (!reg.curriculum) errors.curriculum = 'Please choose a curriculum.';
    if (!reg.grade) errors.grade = 'Please choose your grade/class.';

    // Round F item 2: the permanent hint right above this field already says
    // *why* a parent number is needed ("Needed so a parent can be reached to
    // arrange prize handover to a minor.") — restating that whole sentence
    // again here as the error left two near-identical lines stacked back to
    // back. This one just says what to do about it.
    const parentDigits = (reg.parentMobileLocal || '').replace(/\D/g, '');
    if (!parentDigits) {
      errors.parentMobile = 'Please add a parent/guardian mobile number.';
    } else {
      const lenError = phoneDigitError(reg.parentCountryCode, parentDigits);
      if (lenError) errors.parentMobile = lenError;
      else if (!combinePhone(reg.parentCountryCode, reg.parentMobileLocal)) errors.parentMobile = 'That doesn’t look like a valid number.';
    }

    const studentDigits = (reg.studentMobileLocal || '').replace(/\D/g, '');
    if (studentDigits) {
      const lenError = phoneDigitError(reg.studentCountryCode, studentDigits);
      if (lenError) errors.studentMobile = lenError;
      else if (!combinePhone(reg.studentCountryCode, reg.studentMobileLocal)) errors.studentMobile = 'That doesn’t look like a valid number.';
    }

    if (!reg.tcsAccepted) errors.tcs = 'Please accept the Terms & Conditions to continue.';
    if (!reg.consentToContact) errors.consent = 'Please agree to be contacted to continue.';

    return errors;
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
   * form is valid and the visitor taps Continue — or, for a grade-9/10 visitor
   * (see isDirectSubmitGrade above), finalizes the registration immediately
   * and calls onDone() instead, the same reset-and-show-hero callback the
   * normal review-screen Submit action uses (Round E item 1).
   */
  function renderRegister(container, draft, datasets, onNext, onDone) {
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
      <div class="field-row two-col">
        <p class="field-error" id="nameFieldError" hidden></p>
        <p class="field-error" id="dobFieldError" hidden></p>
      </div>
      <p class="field-hint field-hint--soft" id="nameHint" hidden>Just checking &mdash; is that the full name? Single names are fine if that is what's on record.</p>

      <div class="contact-cards">
        <div class="contact-card contact-card--required">
          <p class="contact-card-label">Parent / guardian mobile <span class="badge badge--required">Required</span></p>
          <p class="field-hint">Needed so a parent can be reached to arrange prize handover to a minor.</p>
          <div class="phone-input-row" id="parentPhoneRow">
            <input type="tel" id="regParentCountryCode" class="phone-country-code" placeholder="+971"
              value="${escapeHtml(reg.parentCountryCode || '+971')}" autocomplete="off-parent-cc-x" spellcheck="false" autocorrect="off" aria-label="Parent/guardian country code">
            <input type="tel" id="regParentMobile" class="phone-number" placeholder="5xxxxxxxx" value="${escapeHtml(reg.parentMobileLocal || '')}"
              autocomplete="off-parent-mobile-x" spellcheck="false" autocorrect="off" aria-label="Parent/guardian mobile number">
          </div>
          <p class="field-error" id="parentMobileFieldError" hidden></p>
          <p class="field-hint field-hint--soft">We may reach out on WhatsApp &mdash; please make sure this number is active on WhatsApp.</p>
        </div>
        <div class="contact-card contact-card--optional">
          <p class="contact-card-label">Student mobile</p>
          <div class="phone-input-row" id="studentPhoneRow">
            <input type="tel" id="regStudentCountryCode" class="phone-country-code" placeholder="+971"
              value="${escapeHtml(reg.studentCountryCode || '+971')}" autocomplete="off-student-cc-x" spellcheck="false" autocorrect="off" aria-label="Student country code">
            <input type="tel" id="regStudentMobile" class="phone-number" placeholder="5xxxxxxxx" value="${escapeHtml(reg.studentMobileLocal || '')}"
              autocomplete="off-student-mobile-x" spellcheck="false" autocorrect="off" aria-label="Student mobile number">
          </div>
          <p class="field-error" id="studentMobileFieldError" hidden></p>
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
          <p class="field-error" id="curriculumFieldError" hidden></p>
        </div>
        <div>
          <label>Grade / class
            <select id="regGrade" autocomplete="off-grade-x"></select>
          </label>
          <p class="field-error" id="gradeFieldError" hidden></p>
        </div>
      </div>
      <p class="field-hint field-hint--soft" id="grade9DirectSubmitHint" hidden>Class 9/10 registers directly &mdash; no quiz questions for this stage.</p>

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
        <p class="field-error" id="tcsFieldError" hidden></p>
        <label class="check">
          <input type="checkbox" id="regConsent"${reg.consentToContact ? ' checked' : ''}>
          <span class="check-box" aria-hidden="true"><svg viewBox="0 0 16 16"><polyline points="3,8.5 6.5,12 13,4.5"/></svg></span>
          <span class="check-text">I consent to Pedagogy contacting me about this registration and follow-up,
          including via WhatsApp / WhatsApp Business API messaging.</span>
        </label>
        <p class="field-error" id="consentFieldError" hidden></p>
      </div>

      <div class="step-actions">
        <button type="button" class="primary" id="registerNextBtn">Continue &rarr;</button>
      </div>
    `;

    const $ = sel => container.querySelector(sel);

    // Round F item 1: live from the very first render (Round E) meant a
    // completely fresh, untouched Register step already showed every
    // required field's error in red before the visitor had typed or clicked
    // anything — reported live as "looking broken". `touched` tracks which
    // individual fields the visitor has actually interacted with (blur for
    // text-ish inputs, change for selects/checkboxes — see the listeners
    // below); `attemptedSubmit` flips true on the first Continue/Submit click
    // and, once true, reveals every still-invalid field's error at once (the
    // normal "tried to skip ahead" case). Validity itself (and therefore the
    // Continue/Submit button's disabled state) is completely unaffected by
    // either of these — only whether the red text/border is currently shown.
    const touched = new Set();
    let attemptedSubmit = false;
    function isFieldVisible(key) { return attemptedSubmit || touched.has(key); }
    function markTouched(key) { touched.add(key); }

    /** Shows/hides one field's inline error — but only once that field is
     * "visible" per isFieldVisible() above, even though `message` here always
     * reflects the field's real current validity. Writes to the DOM only when
     * something actually changed, as one layer of defense (alongside the
     * button-label guard below, and the 150ms deferral on every touched-
     * tracking blur listener further down, which is the fix that actually
     * closed this out) against a real WebKit/iPad bug found while building
     * item 1: tapping Continue right after editing the field above it makes
     * that field's blur fire *during* the tap gesture, and any DOM write in
     * that window — even a same-tick one — could make WebKit cancel the
     * in-flight click outright. */
    function setFieldError(id, key, message) {
      const el = $('#' + id);
      if (!el) return;
      const show = !!message && isFieldVisible(key);
      const text = show ? message : '';
      if (el.hidden === !show && el.textContent === text) return;
      el.hidden = !show;
      el.textContent = text;
    }

    /** Round F item 3: mirrors setFieldError's show/hide decision onto the
     * actual input/select (or, for a phone pair, the shared .phone-input-row
     * wrapper around both its boxes) via .field-invalid, so the visitor can
     * see which exact box is wrong at a glance instead of only reading text
     * below it. Cleared the moment the field becomes valid or view-hidden,
     * same rule as the text. */
    function setInputInvalid(selector, key, message) {
      const el = $(selector);
      if (!el) return;
      const show = !!message && isFieldVisible(key);
      if (el.classList.contains('field-invalid') === show) return;
      el.classList.toggle('field-invalid', show);
    }

    /** Recomputes every field's live validity and updates: each field's own
     * inline error + input-level highlight (both gated on isFieldVisible()),
     * the grade-9/10 direct-submit hint/button label, and the primary
     * button's disabled state (Round E item 1: "Submit" must stay disabled
     * until the same mandatory fields this step already requires are
     * satisfied — extended to "Continue" too for consistency with every
     * other mandatory-gated step in this app). The disabled state is real
     * validity, not gated on touched/attempted — only the visible red
     * text/border waits for that. Called on init and after every field
     * change. Some callers defer this via setTimeout(0) (see the touched-blur
     * listeners below) specifically so it runs *after* a same-gesture click
     * on a different element has been fully delivered rather than racing it
     * — see that comment for why. A deferred call can therefore land after
     * the visitor has already navigated off this step entirely (the whole
     * container re-rendered by a different step), so every element lookup
     * here has to tolerate coming back null instead of assuming the step is
     * still live: `container` is the app's one persistent step-content
     * element (its innerHTML gets replaced wholesale on every step
     * transition, the element itself never detaches), so `.isConnected`
     * alone can't tell "this step" apart from "whatever step is showing
     * now" — checking that this render's own button is still the one
     * present can. */
    function refreshValidity() {
      if (!$('#registerNextBtn')) return;
      const errors = getFieldErrors(reg);
      setFieldError('nameFieldError', 'name', errors.name);
      setInputInvalid('#regName', 'name', errors.name);
      setFieldError('dobFieldError', 'dob', errors.dob);
      setInputInvalid('#regDob', 'dob', errors.dob);
      setFieldError('curriculumFieldError', 'curriculum', errors.curriculum);
      setInputInvalid('#regCurriculum', 'curriculum', errors.curriculum);
      setFieldError('gradeFieldError', 'grade', errors.grade);
      setInputInvalid('#regGrade', 'grade', errors.grade);
      setFieldError('parentMobileFieldError', 'parentMobile', errors.parentMobile);
      setInputInvalid('#parentPhoneRow', 'parentMobile', errors.parentMobile);
      setFieldError('studentMobileFieldError', 'studentMobile', errors.studentMobile);
      setInputInvalid('#studentPhoneRow', 'studentMobile', errors.studentMobile);
      setFieldError('tcsFieldError', 'tcs', errors.tcs);
      setFieldError('consentFieldError', 'consent', errors.consent);

      const directSubmit = isDirectSubmitGrade(reg.grade);
      const hintEl = $('#grade9DirectSubmitHint');
      if (hintEl.hidden !== !directSubmit) hintEl.hidden = !directSubmit;
      const btn = $('#registerNextBtn');
      // Round F item 1's blur listeners surfaced a real WebKit/iPad bug:
      // tapping Continue right after editing the field above it makes that
      // field's blur fire *during* the tap gesture (focus moving to the
      // button), and rewriting the button's own innerHTML in that window
      // could make WebKit drop the click entirely (button stayed enabled,
      // nothing happened, no click event ever fired). This guard (skip the
      // write when the label hasn't actually changed, true on nearly every
      // call once the initial render has run) helps, but the deferral on the
      // blur listeners themselves (150ms, see further down) is what actually
      // closed this out empirically — a same-tick write here was still
      // occasionally enough to trigger it even with this guard in place, once
      // the *other* touched-tracking blur listeners were still synchronous.
      const label = directSubmit ? 'Submit &rarr;' : 'Continue &rarr;';
      if (btn.innerHTML !== label) btn.innerHTML = label;
      btn.disabled = Object.keys(errors).length > 0;
      return errors;
    }

    function refreshGradeOptions() {
      const options = gradeOptionsFor(reg.curriculum);
      // Round E: Grade now gates a real behavior fork (grade 9/10 direct-
      // submit vs. the full 11/12 flow — see isDirectSubmitGrade above), so it
      // can no longer silently auto-default to whichever grade happens to be
      // first in the list the way it used to (that used to be harmless when
      // every grade led to the same flow). A real "Choose" placeholder, same
      // pattern as Curriculum, makes the visitor explicitly pick one instead —
      // getFieldErrors() below gates Continue/Submit on that choice existing.
      $('#regGrade').innerHTML = '<option value="">Choose</option>' +
        options.map(o => `<option value="${escapeHtml(o.value)}">${escapeHtml(o.label)}</option>`).join('');
      $('#regGrade').value = reg.grade && options.some(o => o.value === reg.grade) ? reg.grade : '';
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
      refreshValidity();
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
      refreshValidity();
    });
    $('#regDob').addEventListener('change', e => {
      window.PED.state.mutateDraft(draft, () => { reg.dob = e.target.value; });
      markTouched('dob');
      refreshValidity();
    });
    // Same "tabbed past without picking a date" gap as Curriculum/Grade/the
    // checkboxes above.
    $('#regDob').addEventListener('blur', () => { markTouched('dob'); setTimeout(refreshValidity, 150); });
    // Round E item 4: country-code changes re-clamp (and re-validate) any
    // already-typed local number live — e.g. switching from +91 (10 digits)
    // to +971 (9 digits) with "5012345678" already typed must immediately
    // trim it to 9 digits and re-check, not silently keep the wrong length.
    $('#regParentCountryCode').addEventListener('input', e => {
      const clean = sanitizeCountryCode(e.target.value);
      if (clean !== e.target.value) e.target.value = clean;
      window.PED.state.mutateDraft(draft, () => {
        reg.parentCountryCode = clean;
        const reclamped = clampPhoneDigits(clean, reg.parentMobileLocal || '');
        if (reclamped !== reg.parentMobileLocal) { reg.parentMobileLocal = reclamped; $('#regParentMobile').value = reclamped; }
      });
      refreshValidity();
    });
    // Round F item 1's touched-tracking, on 'blur' — deliberately deferred by
    // 150ms rather than called synchronously (same delay, same reasoning, as
    // the school-suggestion blur race elsewhere in this file). Tapping
    // Continue right after editing the field above it makes THIS blur fire
    // *during* that same tap gesture (focus moving from this input to the
    // button); mutating the DOM synchronously — or even on a same-tick
    // setTimeout(0) — inside that window was empirically found (real,
    // repeatable WebKit/iPad test failures, ~50% of runs) to make WebKit
    // cancel the in-flight click outright: button stayed enabled, nothing
    // happened, no click event ever fired. 150ms reliably lands after the
    // click has already been delivered (confirmed with a 10x repeat-each
    // stress run at 0ms — still failed intermittently — vs. 150ms, 0 failures).
    $('#regParentCountryCode').addEventListener('blur', () => { markTouched('parentMobile'); setTimeout(refreshValidity, 150); });
    $('#regParentMobile').addEventListener('input', e => {
      let clean = sanitizePhoneInput(e.target.value);
      clean = clampPhoneDigits(reg.parentCountryCode, clean);
      if (clean !== e.target.value) e.target.value = clean;
      window.PED.state.mutateDraft(draft, () => { reg.parentMobileLocal = clean; });
      refreshValidity();
    });
    $('#regParentMobile').addEventListener('blur', () => { markTouched('parentMobile'); setTimeout(refreshValidity, 150); });
    $('#regStudentCountryCode').addEventListener('input', e => {
      const clean = sanitizeCountryCode(e.target.value);
      if (clean !== e.target.value) e.target.value = clean;
      window.PED.state.mutateDraft(draft, () => {
        reg.studentCountryCode = clean;
        const reclamped = clampPhoneDigits(clean, reg.studentMobileLocal || '');
        if (reclamped !== reg.studentMobileLocal) { reg.studentMobileLocal = reclamped; $('#regStudentMobile').value = reclamped; }
      });
      refreshValidity();
    });
    $('#regStudentCountryCode').addEventListener('blur', () => { markTouched('studentMobile'); setTimeout(refreshValidity, 150); });
    $('#regStudentMobile').addEventListener('input', e => {
      let clean = sanitizePhoneInput(e.target.value);
      clean = clampPhoneDigits(reg.studentCountryCode, clean);
      if (clean !== e.target.value) e.target.value = clean;
      window.PED.state.mutateDraft(draft, () => { reg.studentMobileLocal = clean; });
      refreshValidity();
    });
    $('#regStudentMobile').addEventListener('blur', () => { markTouched('studentMobile'); setTimeout(refreshValidity, 150); });
    $('#regCurriculum').addEventListener('change', e => {
      window.PED.state.mutateDraft(draft, () => { reg.curriculum = e.target.value; reg.stream = null; });
      refreshGradeOptions();
      refreshStreamOptions();
      markTouched('curriculum');
      refreshValidity();
    });
    // 'change' alone only fires once a *different* option is actually picked
    // — a visitor who opens/tabs through Curriculum or Grade and leaves it on
    // the "Choose" placeholder without picking anything would never trigger
    // it, so its required-field error would never have a chance to reveal
    // itself. 'blur' catches that case too (deferred for the same WebKit/iPad
    // click-race reason as the other blur listeners above).
    $('#regCurriculum').addEventListener('blur', () => { markTouched('curriculum'); setTimeout(refreshValidity, 150); });
    $('#regGrade').addEventListener('change', e => {
      window.PED.state.mutateDraft(draft, () => { reg.grade = e.target.value; });
      markTouched('grade');
      refreshValidity();
    });
    $('#regGrade').addEventListener('blur', () => { markTouched('grade'); setTimeout(refreshValidity, 150); });
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
      markTouched('tcs');
      refreshValidity();
    });
    // Same "tabbed past without changing it" gap as Curriculum/Grade above.
    $('#regTcs').addEventListener('blur', () => { markTouched('tcs'); setTimeout(refreshValidity, 150); });
    $('#regConsent').addEventListener('change', e => {
      window.PED.haptics.tap();
      window.PED.state.mutateDraft(draft, () => {
        reg.consentToContact = e.target.checked;
        reg.consentToContactAt = e.target.checked ? new Date().toISOString() : null;
      });
      markTouched('consent');
      refreshValidity();
    });
    $('#regConsent').addEventListener('blur', () => { markTouched('consent'); setTimeout(refreshValidity, 150); });

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
    // The whole handler body is deferred, not just refreshValidity() — found
    // empirically (real, if intermittent, WebKit/iPad test failures) that
    // even the nameHintEl.hidden write alone was enough to occasionally
    // cancel an in-flight tap on Continue when this blur fires as a side
    // effect of that same tap (focus leaving this field for the button).
    // Deferring the entire body means literally nothing touches the DOM
    // synchronously inside the blur handler.
    $('#regName').addEventListener('blur', () => {
      setTimeout(() => {
        const words = (reg.name || '').trim().split(/\s+/).filter(Boolean);
        nameHintEl.hidden = words.length !== 1;
        markTouched('name');
        refreshValidity();
      }, 150);
    });

    // --- T&Cs modal ---
    $('#tcsLink').addEventListener('click', e => {
      e.preventDefault();
      window.PED.modal.open('Terms & Conditions', TCS_TEXT);
    });

    // Reflect the draft's current state (grade default, any pre-filled
    // fields on Back-navigation re-entry) before the visitor touches anything.
    refreshValidity();

    // --- Continue / Submit ---
    // Round E item 5: registration validation no longer surfaces through
    // alert()/modal popups (presentValidationFailure is still used by
    // review.js's own defensive re-check, which has no live field to attach
    // an inline error to) — every failure here is one of the inline errors
    // refreshValidity() already keeps live, so Continue/Submit just re-runs
    // it, focuses the first invalid field, and stops if anything's still
    // wrong (normally unreachable since the button is disabled whenever
    // errors exist, but kept as a real guard rather than trusting the
    // disabled attribute alone).
    $('#registerNextBtn').addEventListener('click', () => {
      // Round F item 1: a Continue/Submit attempt reveals every still-invalid
      // field's error at once, same as any well-behaved form — in practice
      // the button is already disabled whenever an error exists (see below),
      // so this mostly matters as the same defensive guard the surrounding
      // comment already describes (not trusting the disabled attribute
      // alone) rather than a commonly-hit path.
      attemptedSubmit = true;
      const errors = refreshValidity();
      const firstInvalidId = { name: 'regName', dob: 'regDob', curriculum: 'regCurriculum', grade: 'regGrade', parentMobile: 'regParentMobile', studentMobile: 'regStudentMobile', tcs: 'regTcs', consent: 'regConsent' };
      const firstKey = Object.keys(errors)[0];
      if (firstKey) { const el = $('#' + firstInvalidId[firstKey]); if (el) el.focus(); return; }

      const result = validateRegistrationForSubmit(reg);
      if (!result.ok) { presentValidationFailure(result, () => $('#regParentMobile').focus()); return; }

      window.PED.state.mutateDraft(draft, () => {
        reg.parentMobile = result.parentPhone;
        reg.studentMobile = result.studentPhone;
        reg.school = reg.school ? reg.school.trim() : null;
        reg.schoolKey = reg.schoolKey || (reg.school ? window.PED.schools.schoolKeyFor(reg.school) : null);
      });

      // Round E item 1: grade 9/10 registers directly — no destinations/
      // examPrep/examList/quiz/review for this group, finalized via the exact
      // same finalizeDraft() path (and the exact same confirmation screen,
      // js/review.js's renderSubmitted) every other registration uses.
      if (isDirectSubmitGrade(reg.grade)) {
        const outcome = window.PED.state.finalizeDraft(draft, datasets.questions);
        if (!outcome.ok) {
          window.PED.modal.open(
            "We couldn't save this",
            '<p>Something went wrong saving your registration on this device. Nothing has been lost — please try Submit again, and let a staff member know if it keeps happening.</p>',
            [{ label: 'Try again', action: () => {} }]
          );
          return;
        }
        window.PED.review.renderSubmitted(container, onDone);
        return;
      }
      onNext();
    });
  }

  window.PED.registration = {
    renderRegister, gradeOptionsFor, getStreamOptions, normalizePhone, combinePhone, TCS_TEXT,
    validateRegistrationForSubmit, getFieldErrors, presentValidationFailure, isDirectSubmitGrade,
    NAME_PATTERN, sanitizeName, sanitizePhoneInput, sanitizeCountryCode, MIN_AGE, MAX_AGE, ageFromDob,
    expectedDigitRangeFor, phoneDigitError, clampPhoneDigits,
  };
})();
