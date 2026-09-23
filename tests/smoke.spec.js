const { test, expect } = require('@playwright/test');

async function startJourney(page) {
  await page.goto('/');
  await page.locator('#heroStartBtn').click();
  await expect(page.locator('#appShell')).toBeVisible();
}

async function completeRegistrationToDestinations(page, overrides) {
  await fillValidRegistration(page, overrides);
  await page.locator('#registerNextBtn').click();
  // 'q1' (the first academic question) sits between register and destinations
  // in the real step order. Next is gated on an actual answer (or Skip) being
  // given — reported live 2026-09-21 that free-advance-with-nothing-picked
  // was the wrong default for an academic question.
  await expect(page.locator('#quizOptions')).toBeVisible();
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click();
  await expect(page.locator('#stepContent h2')).toHaveText('Where could your next chapter begin?');
}

// Round E: grade is now a real required field (no silent default — see
// js/registration.js's refreshGradeOptions), so every full-path test needs an
// explicit grade. Defaults to 'stage11' (the full 11/12 flow every existing
// full-path test exercises); pass `grade: 'stage9'`/`'stage10'` to exercise
// the new direct-submit shortcut instead, or `grade: false` to leave it
// unset (for tests that want to assert the required-field gate itself).
async function fillValidRegistration(page, overrides) {
  overrides = overrides || {};
  await page.locator('#regName').fill(overrides.name || 'Aisha Rahman');
  await page.locator('#regDob').fill(overrides.dob || '2009-05-14');
  await page.locator('#regParentMobile').fill(overrides.parentMobile !== undefined ? overrides.parentMobile : '501234567');
  if (overrides.school !== false) {
    await page.locator('#regSchoolInput').fill(overrides.school || 'Delhi Private School');
    const firstSuggestion = page.locator('#schoolSuggestions li').first();
    if (await firstSuggestion.count()) await firstSuggestion.click();
  }
  if (overrides.grade !== false) {
    await page.locator('#regGrade').selectOption(overrides.grade || 'stage11');
  }
  await page.locator('#regTcs').check();
  await page.locator('#regConsent').check();
}

test('hero loads with no console errors and datasets/question bank validate', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto('/');
  await expect(page).toHaveTitle(/Pedagogy/);
  await expect(page.locator('.logo--hero')).toBeVisible();
  await expect(page.locator('#heroStartBtn')).toBeVisible();
  await expect(page.locator('.prize-banner')).toBeVisible();

  const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(fontFamily.toLowerCase()).toContain('system-ui');

  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});

test('hero start button opens the app shell on the register step', async ({ page }) => {
  await startJourney(page);
  await expect(page.locator('#stepContent h2')).toHaveText('First, make it yours.');
  // Full path, register through review: register, q1, destinations, examPrep,
  // (examList hidden until "Yes"), q2, q3, q4, review = 8 visible steps — both
  // mini-games were removed entirely in round E, and the quiz dropped from 5
  // questions to 4 (see js/steps.js), so this is 8, not the old 11.
  await expect(page.locator('#stepProgress')).toHaveText('Step 1 / 8');
});

test('prize banner tap also opens the app (not just the CTA button)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#prizeBanner').click();
  await expect(page.locator('#appShell')).toBeVisible();
});

// Round E item 5: this used to pop a modal on Continue click. It's now a live
// inline error under the parent-mobile field (item 5's own guidance: default
// non-field-specific messages to inline, and this one IS field-specific) —
// visible once the field is touched, and it explains why via the permanent
// hint sitting right above it (Round F item 2: the error itself no longer
// restates that whole explanation — the two used to say almost the same
// thing back to back).
test('registration explains why a parent number is needed via a live inline error, not a modal', async ({ page }) => {
  await startJourney(page);
  await fillValidRegistration(page, { parentMobile: '' });
  // Round F item 1: leaving the field blurs it (focus moves to the next
  // field filled by fillValidRegistration), which is what actually reveals
  // the error — a fresh, untouched field shows nothing (see the dedicated
  // "touched" tests below).
  await expect(page.locator('#parentMobileFieldError')).toBeVisible();
  await expect(page.locator('#parentMobileFieldError')).toHaveText('Please add a parent/guardian mobile number.');
  await expect(page.locator('.contact-card--required .field-hint').first()).toContainText('prize handover'); // the explanation still lives in the permanent hint above
  await expect(page.locator('#registerNextBtn')).toBeDisabled();
  await expect(page.locator('.modal-overlay')).toBeHidden();

  // Fixing it live clears the error and enables Continue, no submit attempt needed.
  await page.locator('#regParentMobile').fill('501234567');
  await expect(page.locator('#parentMobileFieldError')).toBeHidden();
  await expect(page.locator('#registerNextBtn')).toBeEnabled();
});

// ===================== Round C item 8: WhatsApp note replaces the request step =====================
test('registration mobile fields carry a WhatsApp-reachability note, replacing the removed follow-up step', async ({ page }) => {
  await startJourney(page);
  const hints = await page.locator('.contact-card .field-hint--soft').allTextContents();
  const whatsappHints = hints.filter(t => /WhatsApp/i.test(t));
  expect(whatsappHints.length).toBe(2); // parent card + student card
  expect(whatsappHints[0]).toContain('active on WhatsApp');
});

test('the removed courses/activities/request/game steps no longer exist on either path', async ({ page }) => {
  await startJourney(page);
  const stepIds = await page.evaluate(() =>
    window.PED.steps.FULL_PATH_STEPS.map(s => s.id).concat(window.PED.steps.EXPRESS_PATH_STEPS.map(s => s.id))
  );
  expect(stepIds).not.toContain('courses');
  expect(stepIds).not.toContain('activities');
  expect(stepIds).not.toContain('request');
  // Round E item 2: both mini-games removed entirely, js/games.js deleted.
  expect(stepIds).not.toContain('game1');
  expect(stepIds).not.toContain('game2');
  const fullPathQuestionCount = await page.evaluate(() => window.PED.steps.FULL_PATH_STEPS.filter(s => s.kind === 'question').length);
  expect(fullPathQuestionCount).toBe(4); // 5 -> 4 questions (item 3)
});

// ===================== Round D: marketing opt-in merged into the T&Cs checkbox =====================
test('marketing opt-in is merged into the T&Cs checkbox (Abhi\'s explicit call) and is reflected on review', async ({ page }) => {
  await startJourney(page);
  // Defaults unchecked.
  await expect(page.locator('#regTcs')).not.toBeChecked();
  await expect(page.locator('#regConsent')).not.toBeChecked();
  // No separate marketing checkbox exists anymore.
  await expect(page.locator('#regMarketingOptIn')).toHaveCount(0);
  await expect(page.locator('label:has(#regTcs)')).toContainText("updates about Pedagogy's programs and offers");

  await fillValidRegistration(page); // checks #regTcs and #regConsent
  await page.locator('#registerNextBtn').click();
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click();
  await walkDestinationsToReview(page);

  // Checking T&Cs (mandatory to register) also opts the visitor into
  // marketing updates — the two are the same checkbox now, so this is always
  // "Yes, please" for any successfully-submitted registration.
  await expect(page.locator('.review-section', { hasText: 'Registration' })).toContainText('Updates about programs & offers');
  await expect(page.locator('.review-section', { hasText: 'Registration' })).toContainText('Yes, please');
});

// ===================== Input validation hardening =====================
test('typing symbols/digits into the name field gets them stripped live, not just rejected at submit', async ({ page }) => {
  await startJourney(page);
  await page.locator('#regName').fill('test@gmail.com');
  await expect(page.locator('#regName')).toHaveValue('testgmail.com'); // @ stripped, letters/period survive
  await page.locator('#regName').fill('John123');
  await expect(page.locator('#regName')).toHaveValue('John'); // digits stripped
});

test('the submit-time NAME_PATTERN check is a real second gate, independent of live sanitization', async ({ page }) => {
  // Live sanitize-on-input (js/registration.js's #regName listener) already
  // strips digits/symbols as the visitor types, so an invalid name can't
  // normally reach validateRegistrationForSubmit() through the DOM at all.
  // Call the exported validator directly to prove it still rejects one on its
  // own, in case a future change to the input listener ever regresses that.
  await startJourney(page);
  const result = await page.evaluate(() => window.PED.registration.validateRegistrationForSubmit({
    name: "Mary-Jane O'Brien", dob: '2009-05-14', curriculum: 'Indian', grade: 'stage11', tcsAccepted: true, consentToContact: true, parentCountryCode: '+971', parentMobileLocal: '501234567',
  }));
  expect(result.ok).toBe(true); // hyphen/apostrophe names are explicitly allowed

  const rejected = await page.evaluate(() => window.PED.registration.validateRegistrationForSubmit({
    name: 'not@aname', dob: '2009-05-14', curriculum: 'Indian', grade: 'stage11', tcsAccepted: true, consentToContact: true, parentCountryCode: '+971', parentMobileLocal: '501234567',
  }));
  expect(rejected.ok).toBe(false);
  expect(rejected.message).toContain('numbers or symbols');
});

test('a date of birth implying an implausible age (~40) is rejected with a live inline error', async ({ page }) => {
  await startJourney(page);
  const tooOldDob = `${new Date().getFullYear() - 40}-05-14`;
  await fillValidRegistration(page, { dob: tooOldDob });
  await expect(page.locator('#dobFieldError')).toContainText("doesn't look right for a Class 9–12 student");
  await expect(page.locator('#registerNextBtn')).toBeDisabled();
});

test('a future date of birth is rejected with a live inline error', async ({ page }) => {
  await startJourney(page);
  const futureDob = `${new Date().getFullYear() + 1}-01-01`;
  await fillValidRegistration(page, { dob: futureDob });
  await expect(page.locator('#dobFieldError')).toContainText('in the future');
  await expect(page.locator('#registerNextBtn')).toBeDisabled();
});

test('typing symbols into the phone fields gets them stripped live', async ({ page }) => {
  await startJourney(page);
  await expect(page.locator('#regParentCountryCode')).toHaveValue('+971'); // preset default
  await page.locator('#regParentCountryCode').fill('+9abc71');
  await expect(page.locator('#regParentCountryCode')).toHaveValue('+971');
  await page.locator('#regParentMobile').fill('abc501234567');
  await expect(page.locator('#regParentMobile')).toHaveValue('501234567');
});

test('T&Cs opens a real modal, not an inline expandable block', async ({ page }) => {
  await startJourney(page);
  await page.locator('#tcsLink').click();
  await expect(page.locator('.modal-title')).toHaveText('Terms & Conditions');
  await page.locator('.modal-close').click();
});

test('picking a known school prefills curriculum and skips the manual question', async ({ page }) => {
  await startJourney(page);
  await page.locator('#regSchoolInput').fill('Delhi Private School');
  await expect(page.locator('#schoolSuggestions li').first()).toBeVisible();
  await page.locator('#schoolSuggestions li').first().click();
  // the manual curriculum <select> is replaced by a derived, correctable line
  await expect(page.locator('#curriculumDerivedLine')).toBeVisible();
  await expect(page.locator('#curriculumDerivedLine')).toContainText('Not right?');
  const curriculumLabelVisible = await page.locator('#curriculumFieldWrap label').first().isVisible();
  expect(curriculumLabelVisible).toBe(false);
});

// Reported live 2026-09-21: picking a school did nothing on a real iPad.
// Root cause: tapping a suggestion fires `blur` on the input (Safari's touch
// focus handling) before a `click` handler on the <li> would run, so the old
// click-based listener could lose the race and never fire at all. Playwright's
// default `.click()` doesn't reproduce this (it dispatches a full, correctly-
// ordered mouse sequence even on the iPad project), so this test deliberately
// fires the same adversarial ordering by hand: pointerdown, then an immediate
// blur, with no click event at all — proving the fix (committing on
// pointerdown + preventDefault, before blur can ever fire) actually holds.
test('a school suggestion is selected even if the input blurs immediately after (real-device touch race)', async ({ page }) => {
  await startJourney(page);
  await page.locator('#regSchoolInput').fill('Delhi Private School');
  const firstSuggestion = page.locator('#schoolSuggestions li').first();
  await expect(firstSuggestion).toBeVisible();
  await firstSuggestion.dispatchEvent('pointerdown');
  await page.locator('#regSchoolInput').dispatchEvent('blur');
  await expect(page.locator('#regSchoolInput')).toHaveValue(/Delhi Private School/);
  await expect(page.locator('#curriculumDerivedLine')).toBeVisible();
});

test('derived curriculum line has a working "Change it" to reveal the manual select', async ({ page }) => {
  await startJourney(page);
  await page.locator('#regSchoolInput').fill('Delhi Private School');
  await page.locator('#schoolSuggestions li').first().click();
  await expect(page.locator('#curriculumFieldWrap label').first()).toBeHidden();
  await page.locator('#curriculumDerivedLine button').click();
  await expect(page.locator('#curriculumFieldWrap label').first()).toBeVisible();
  await expect(page.locator('#curriculumDerivedLine')).toBeHidden();
});

test('grade options follow the chosen curriculum\'s real naming', async ({ page }) => {
  await startJourney(page);
  await page.locator('#regCurriculum').selectOption('British');
  await expect(page.locator('#regGrade')).toContainText('Year 11');
  await page.locator('#regCurriculum').selectOption('American');
  await expect(page.locator('#regGrade')).toContainText('Grade 10');
  await page.locator('#regCurriculum').selectOption('IB');
  await expect(page.locator('#regGrade')).toContainText('MYP Year 5');
});

// ===================== Round E item 9a: curriculum is now required =====================
// codexreview.md finding: curriculum was never actually required, so a
// visitor could reach the quiz with curriculum still at "Choose" and get
// served questions from the whole bank instead of a filtered stream. Written
// to fail against the pre-fix code (Continue would have been enabled here).
test('curriculum is required — Continue stays disabled and shows a live inline error once touched', async ({ page }) => {
  await startJourney(page);
  await fillValidRegistration(page, { school: false }); // no school pick means curriculum is never auto-derived
  // Round F item 1: the button is genuinely disabled from the moment
  // curriculum is missing — that part is immediate, not gated on touch —
  // but the red error text itself waits until the field is actually
  // interacted with (see the dedicated "fresh step looks clean" tests below).
  await expect(page.locator('#registerNextBtn')).toBeDisabled();
  await expect(page.locator('#curriculumFieldError')).toBeHidden();

  await page.locator('#regCurriculum').focus();
  await page.locator('#regCurriculum').blur(); // tabbed past without picking anything — still reveals the error
  await expect(page.locator('#curriculumFieldError')).toContainText('Please choose a curriculum');
  await expect(page.locator('#regCurriculum')).toHaveClass(/field-invalid/);

  await page.locator('#regCurriculum').selectOption('Indian');
  await expect(page.locator('#curriculumFieldError')).toBeHidden();
  await expect(page.locator('#regCurriculum')).not.toHaveClass(/field-invalid/);
  await expect(page.locator('#registerNextBtn')).toBeEnabled();
});

// Grade is now required too (Round E: it gates the direct-submit shortcut
// below, so it can no longer silently default to whichever grade happens to
// be listed first the way it used to).
test('grade is required — Continue stays disabled, and shows a live inline error once touched', async ({ page }) => {
  await startJourney(page);
  await fillValidRegistration(page, { grade: false });
  await expect(page.locator('#registerNextBtn')).toBeDisabled();
  await expect(page.locator('#gradeFieldError')).toBeHidden();

  await page.locator('#regGrade').focus();
  await page.locator('#regGrade').blur();
  await expect(page.locator('#gradeFieldError')).toContainText('Please choose your grade');
  await expect(page.locator('#registerNextBtn')).toBeDisabled();
});

// ===================== Round F item 1: don't show an error until the field is touched =====================
// Reported live: a completely fresh Register step already showed every
// required field's error in red before the visitor had done anything, which
// read as broken. Written to fail against the pre-Round-F code (which called
// refreshValidity() unconditionally on render with no touched concept at all
// — every one of these assertions on a fresh step would have found visible
// errors instead of none).
test('a completely fresh Register step shows zero visible errors, even though every required field is genuinely still invalid', async ({ page }) => {
  await startJourney(page);
  for (const id of ['nameFieldError', 'dobFieldError', 'curriculumFieldError', 'gradeFieldError', 'parentMobileFieldError', 'studentMobileFieldError', 'tcsFieldError', 'consentFieldError']) {
    await expect(page.locator('#' + id)).toBeHidden();
  }
  await expect(page.locator('.field-invalid')).toHaveCount(0);
  // Validity itself is completely unaffected — the button stays exactly as
  // strict as it always was, disabled while nothing has been filled in.
  await expect(page.locator('#registerNextBtn')).toBeDisabled();
});

test('a field\'s error appears once it is touched (blurred invalid), and only that field\'s — the rest stay clean', async ({ page }) => {
  await startJourney(page);
  await page.locator('#regName').fill(''); // still empty/invalid — no name was ever typed
  await page.locator('#regName').blur();
  await expect(page.locator('#nameFieldError')).toBeVisible();
  await expect(page.locator('#regName')).toHaveClass(/field-invalid/);
  // Every other still-invalid field must remain untouched and hidden.
  for (const id of ['dobFieldError', 'curriculumFieldError', 'gradeFieldError', 'parentMobileFieldError', 'tcsFieldError', 'consentFieldError']) {
    await expect(page.locator('#' + id)).toBeHidden();
  }

  // Fixing the touched field live clears its own error and highlight.
  await page.locator('#regName').fill('Aisha Rahman');
  await expect(page.locator('#nameFieldError')).toBeHidden();
  await expect(page.locator('#regName')).not.toHaveClass(/field-invalid/);
});

// ===================== Round E item 1: 9th/10th grade direct-submit shortcut =====================
// 11th/12th are the real qualified NEET/JEE counselling leads; 9th/10th are
// still worth a registration record, but not the full quiz/data-collection
// experience — see session_handoff.md's Standing decisions.
test('grade 10 shows "Submit" instead of "Continue", and finalizes directly with no destinations/quiz/review', async ({ page }) => {
  await startJourney(page);
  await fillValidRegistration(page, { grade: 'stage10' });
  await expect(page.locator('#registerNextBtn')).toHaveText('Submit →');
  await expect(page.locator('#grade9DirectSubmitHint')).toBeVisible();
  await expect(page.locator('#registerNextBtn')).toBeEnabled();

  const recordsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('pedagogy-expo-records') || '[]').length);
  await page.locator('#registerNextBtn').click();

  // Straight to the same confirmation screen every other path uses — no
  // destinations, exam prep, quiz questions or review interstitial at all
  // (a destinations/quiz/review screen would show a different h2 entirely,
  // e.g. "Where could your next chapter begin?" or "Review everything...").
  await expect(page.locator('.step-heading')).toHaveText('Thank you for participating!');
  const recordsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('pedagogy-expo-records') || '[]').length);
  expect(recordsAfter).toBe(recordsBefore + 1);
  const record = await page.evaluate(() => window.PED.state.loadRecords().slice(-1)[0]);
  expect(record.registration.grade).toBe('stage10');
  expect(record.quiz.answers).toEqual([]);
});

test('grade 9 also uses the direct-submit shortcut, and Submit stays disabled until the same mandatory fields as normal are met', async ({ page }) => {
  await startJourney(page);
  await page.locator('#regGrade').selectOption('stage9'); // curriculum defaults to generic labels here, that's fine
  await expect(page.locator('#registerNextBtn')).toHaveText('Submit →');
  await expect(page.locator('#registerNextBtn')).toBeDisabled(); // name/DOB/curriculum/parent number/T&Cs/consent still missing

  await fillValidRegistration(page, { grade: 'stage9' });
  await expect(page.locator('#registerNextBtn')).toBeEnabled();
});

// 11th/12th are completely unaffected by the shortcut — still "Continue",
// still the full flow.
test('grade 11/12 are unaffected by the direct-submit shortcut — still "Continue", still the full flow', async ({ page }) => {
  await startJourney(page);
  await fillValidRegistration(page, { grade: 'stage12' });
  await expect(page.locator('#registerNextBtn')).toHaveText('Continue →');
  await expect(page.locator('#grade9DirectSubmitHint')).toBeHidden();
  await page.locator('#registerNextBtn').click();
  await expect(page.locator('#quizOptions')).toBeVisible(); // q1, not a confirmation screen
});

// ===================== Round E item 4: exact-digit phone validation =====================
test('the local-number field blocks further digits once the current country code\'s exact length is reached', async ({ page }) => {
  await startJourney(page);
  await expect(page.locator('#regParentCountryCode')).toHaveValue('+971'); // UAE, 9 digits
  await page.locator('#regParentMobile').fill('5012345678901'); // way more than 9 digits
  await expect(page.locator('#regParentMobile')).toHaveValue('501234567'); // capped at 9, not silently accepted
});

test('changing the country code after a number is typed re-clamps it live and re-validates', async ({ page }) => {
  await startJourney(page);
  await page.locator('#regParentCountryCode').fill('+91'); // India, 10 digits
  await page.locator('#regParentMobile').fill('5012345678'); // exactly 10 digits for +91
  await expect(page.locator('#parentMobileFieldError')).toBeHidden();

  // Switching to +971 (UAE, 9 digits) with a 10-digit number already typed
  // must immediately trim it to 9 digits, not silently keep the wrong length.
  await page.locator('#regParentCountryCode').fill('+971');
  await expect(page.locator('#regParentMobile')).toHaveValue('501234567');
  await expect(page.locator('#parentMobileFieldError')).toBeHidden();
});

test('a parent number with the wrong digit count for its country code shows a live inline error', async ({ page }) => {
  await startJourney(page);
  await page.locator('#regParentCountryCode').fill('+91'); // India needs 10 digits
  await page.locator('#regParentMobile').fill('50123'); // only 5
  await expect(page.locator('#parentMobileFieldError')).toContainText('10 digits');
  await expect(page.locator('#registerNextBtn')).toBeDisabled();
});

test('an unrecognized school falls back to manual name + curriculum picker', async ({ page }) => {
  await startJourney(page);
  await page.locator('#regSchoolInput').fill('Some School Not In The Dataset Whatsoever');
  await expect(page.locator('#schoolSuggestions')).toBeHidden();
  await expect(page.locator('#regCurriculum')).toBeVisible();
});

test('full registration -> destinations -> exam-prep conditional flow', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);

  // Destinations: chip grid, tap-to-select (not swipe)
  await page.getByText('India', { exact: true }).click();
  await page.getByText('United Kingdom', { exact: true }).click();
  await page.locator('#destNextBtn').click();

  // Exam prep: Yes/No
  await expect(page.locator('#stepContent h2')).toHaveText('Are you preparing for any competitive exam?');
  await page.locator('input[name=examPrep][value=yes]').check();
  await page.locator('#examPrepNextBtn').click();

  // Exam list: grouped by the two selected countries, deduped
  await expect(page.locator('#stepContent h2')).toHaveText('Which exam(s) are you preparing for?');
  await expect(page.locator('.exam-group-label')).toHaveCount(2);
  await expect(page.getByText('NEET-UG')).toBeVisible();
  await expect(page.getByText('UCAT', { exact: true })).toBeVisible();
});

test('exam-prep "No" skips straight past the exam list step', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await page.getByText('India', { exact: true }).click();
  await page.locator('#destNextBtn').click();
  await page.locator('input[name=examPrep][value=no]').check();
  await page.locator('#examPrepNextBtn').click();
  await expect(page.locator('#stepContent h2')).not.toHaveText('Which exam(s) are you preparing for?');
});

test('"Other" as the only destination falls back to free-text exam entry', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await page.getByText('Other', { exact: true }).click();
  // country search overlay opens; close it without picking a specific country
  await expect(page.locator('.modal-title')).toHaveText('Choose a country');
  await page.locator('.modal-close').click();
  await page.locator('#destNextBtn').click();
  await page.locator('input[name=examPrep][value=yes]').check();
  await page.locator('#examPrepNextBtn').click();
  await expect(page.locator('#examFreeText')).toBeVisible();
});

test('going back and adding a real destination after an Other-only free-text exam answer clears the stale free text (reported review-screen bug)', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await page.getByText('Other', { exact: true }).click();
  await page.locator('.modal-close').click();
  await page.locator('#destNextBtn').click();
  await page.locator('input[name=examPrep][value=yes]').check();
  await page.locator('#examPrepNextBtn').click();
  await page.locator('#examFreeText').fill('TestAS for Germany');

  // Back to destinations, add a real country alongside "Other".
  await page.locator('#examListBackBtn').click();
  await page.locator('#examPrepBackBtn').click();
  await page.getByText('India', { exact: true }).click();
  await page.locator('#destNextBtn').click();
  await page.locator('#examPrepNextBtn').click(); // Yes already persisted

  // Exam list should now show the real India chip group, not the stale free-text box.
  await expect(page.locator('#examFreeText')).toHaveCount(0);
  await expect(page.locator('.exam-group-label')).toHaveText(['India']);
});

test('deselecting a destination after picking its exams removes that country from the record (reported review-screen bug)', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await page.getByText('India', { exact: true }).click();
  await page.getByText('United Kingdom', { exact: true }).click();
  await page.locator('#destNextBtn').click();
  await page.locator('input[name=examPrep][value=yes]').check();
  await page.locator('#examPrepNextBtn').click();
  await page.getByText('NEET-UG').click();
  await page.getByText('UCAT', { exact: true }).click();

  // Back to destinations, deselect United Kingdom.
  await page.locator('#examListBackBtn').click();
  await page.locator('#examPrepBackBtn').click();
  await page.getByText('United Kingdom', { exact: true }).click();
  await page.locator('#destNextBtn').click();
  await page.locator('#examPrepNextBtn').click();

  await expect(page.locator('.exam-group-label')).toHaveText(['India']);
  await expect(page.getByText('UCAT', { exact: true })).toHaveCount(0);
});

test('destinations "Other" search overlay finds and adds a specific country', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await page.getByText('Other', { exact: true }).click();
  await page.locator('#countrySearchInput').fill('Japan');
  await page.locator('#countrySearchResults li', { hasText: 'Japan' }).click();
  await expect(page.locator('#otherPicksWrap')).toContainText('Japan');
});

// ===================== Round C item 1: destinations "Other" dialog bug =====================
test('destinations "Other" dialog opens only on the off->on transition, never from an unrelated chip toggle', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);

  // Selecting "Other" opens the dialog (a real off->on transition).
  await page.getByText('Other', { exact: true }).click();
  await expect(page.locator('.modal-title')).toHaveText('Choose a country');
  await page.locator('.modal-close').click();
  await expect(page.locator('.modal-overlay')).toBeHidden();

  // Toggling an unrelated destination chip while "Other" stays selected must
  // NOT reopen it — this was the actual bug (chips.js's onChange fires on
  // every toggle in the grid, and the old check just asked "is Other still
  // selected", which stayed true here).
  await page.getByText('India', { exact: true }).click();
  await expect(page.locator('.modal-overlay')).toBeHidden();
  await page.getByText('United Kingdom', { exact: true }).click();
  await expect(page.locator('.modal-overlay')).toBeHidden();

  // Unchecking "Other" itself must just clear the selection, not reopen it.
  await page.getByText('Other', { exact: true }).click();
  await expect(page.locator('.modal-overlay')).toBeHidden();

  // Re-checking "Other" again is a real off->on transition and legitimately
  // reopens it — and it must start completely fresh (empty search box, no
  // leftover results from the earlier open).
  await page.getByText('Other', { exact: true }).click();
  await expect(page.locator('.modal-title')).toHaveText('Choose a country');
  await expect(page.locator('#countrySearchInput')).toHaveValue('');
});

test('draft persists across a reload (survives a backgrounded-tab discard)', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);

  await page.reload();
  await expect(page.locator('#appShell')).toBeVisible();
  await expect(page.locator('#stepContent h2')).toHaveText('Where could your next chapter begin?');
});

// Reported live 2026-09-21: refreshing while still on the registration form
// kept showing stale values from a previous attempt, which read as a bug —
// a visitor who hasn't advanced past registration hasn't lost any real
// progress, so that specific case now starts genuinely blank on reload.
// Once past registration, the resilience above (survives a reload) is
// unchanged — only this pre-registration case is different now.
test('reloading while still on the registration form starts blank, not with stale values from before', async ({ page }) => {
  await startJourney(page);
  await fillValidRegistration(page, { name: 'Stale Test Name' });
  await expect(page.locator('#regName')).toHaveValue('Stale Test Name');

  await page.reload();
  await page.locator('#heroStartBtn').click();
  await expect(page.locator('#appShell')).toBeVisible();
  await expect(page.locator('#stepContent h2')).toHaveText('First, make it yours.');
  await expect(page.locator('#regName')).toHaveValue('');
  await expect(page.locator('#regTcs')).not.toBeChecked();
});

test('staff dashboard has no visible nav entry and requires long-press + PIN', async ({ page }) => {
  await startJourney(page);
  await expect(page.getByRole('button', { name: 'Staff' })).toHaveCount(0);
  await expect(page.locator('#view-staff')).toBeHidden();

  page.once('dialog', dialog => dialog.accept('2026'));
  const logo = page.locator('.brand-mark');
  const box = await logo.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1000);
  await page.mouse.up();

  await expect(page.locator('#view-staff')).toBeVisible();
});

test('new visitor reset clears the draft back to the register step', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#newVisitorBtn').click();

  await expect(page.locator('#stepContent h2')).toHaveText('First, make it yours.');

  // a freshly-reset draft is back on 'register', so a reload correctly shows
  // the hero again (it's the welcome screen for whoever uses the device next)
  await page.reload();
  await expect(page.locator('#heroScreen')).toBeVisible();
  await expect(page.locator('#appShell')).toBeHidden();
});

// ===================== Phase 2: review + timer + filtering =====================

/** From the destinations step (where completeRegistrationToDestinations leaves
 * off), clicks through every remaining full-path step to reach review: pick a
 * destination, answer exam-prep "No" (skips the conditional examList step,
 * keeping this walker generic), then q2 -> q3 -> q4 -> review. Round E
 * removed both mini-games from the flow entirely, so there's nothing to play
 * through between questions anymore. */
async function walkDestinationsToReview(page) {
  await page.getByText('India', { exact: true }).click();
  await page.locator('#destNextBtn').click();
  await expect(page.locator('#stepContent h2')).toHaveText('Are you preparing for any competitive exam?');
  await page.locator('input[name=examPrep][value=no]').check();
  await page.locator('#examPrepNextBtn').click();

  await expect(page.locator('#quizOptions')).toBeVisible(); // q2
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click();
  await expect(page.locator('#quizOptions')).toBeVisible(); // q3
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click();
  await expect(page.locator('#quizOptions')).toBeVisible(); // q4
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click();

  await expect(page.locator('.review-section').first()).toBeVisible();
}

test('final review screen shows registration, preferences and quiz answers', async ({ page }) => {
  await startJourney(page);
  await fillValidRegistration(page, { name: 'Aisha Rahman' });
  await page.locator('#registerNextBtn').click();
  // Answer q1 so the review reflects a real selection, not "Not answered yet".
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click();
  await walkDestinationsToReview(page);

  await expect(page.locator('.review-section').first()).toBeVisible();
  await expect(page.locator('.review-section', { hasText: 'Registration' })).toContainText('Aisha Rahman');
  // Each question is its own block: number, full question text, every option
  // (not just the pick), and the selected option visually marked.
  await expect(page.locator('.review-quiz-item').first()).toContainText('Question 1 of 4');
  await expect(page.locator('.review-quiz-item').first().locator('.review-quiz-question')).not.toBeEmpty();
  await expect(page.locator('.review-quiz-item').first().locator('.review-quiz-options li')).toHaveCount(4);
  await expect(page.locator('.review-quiz-item').first().locator('.review-quiz-options--selected')).toHaveCount(1);
});

test('tapping Edit on a review section jumps back to that exact step', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await walkDestinationsToReview(page);

  await page.locator('.review-section', { hasText: 'Registration' }).getByText('Edit').click();
  await expect(page.locator('#stepContent h2')).toHaveText('First, make it yours.');
});

// ===================== Round E item 8: Review-Edit returns to Review =====================
// Reported bug: clicking Edit on Review took you to that step, but continuing
// from there just resumed the normal forward step order (goToStep() has no
// memory of where you came from), turning a one-field edit into clicking Next
// through every remaining step again. Fixed with draft.returnToReview, set by
// onJump (Review's Edit links) and consumed by the very next Continue/Back
// action (js/app.js's onNext/onBack). Each test here is written to fail
// against the pre-fix goToStep()-only behavior (which would land on the next
// step in sequence, not Review) and pass with the fix.
test('editing a registration field from Review returns to Review after one Continue, not the next step in sequence', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await walkDestinationsToReview(page);

  await page.locator('.review-section', { hasText: 'Registration' }).getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('#stepContent h2')).toHaveText('First, make it yours.');
  await page.locator('#regName').fill('Aisha Edited');
  await page.locator('#registerNextBtn').click();

  // Pre-fix, this would land on q1 (the normal next step after register) —
  // it must land back on Review instead, with the edit reflected.
  await expect(page.locator('#stepContent h2')).toHaveText('Review everything before you submit.');
  await expect(page.locator('.review-section', { hasText: 'Registration' })).toContainText('Aisha Edited');
});

test('editing a quiz answer from Review returns to Review after Next, not the next question', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await walkDestinationsToReview(page);

  await page.locator('.review-quiz-item').nth(1).getByRole('button', { name: 'Edit' }).click(); // q2's own Edit link
  await expect(page.locator('.eyebrow-small')).toContainText('ACADEMIC QUESTION 2');
  const options = page.locator('#quizOptions label');
  const optionCount = await options.count();
  await options.nth(optionCount - 1).click(); // pick a different option than before
  await page.locator('#qNextBtn').click();

  // Pre-fix, this would land on q3 — it must land back on Review instead.
  await expect(page.locator('#stepContent h2')).toHaveText('Review everything before you submit.');
});

test('editing destinations from Review returns to Review after Continue, not examPrep', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await walkDestinationsToReview(page);

  await page.locator('.review-section', { hasText: 'Destinations' }).getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('#stepContent h2')).toHaveText('Where could your next chapter begin?');
  await page.getByText('United Kingdom', { exact: true }).click();
  await page.locator('#destNextBtn').click();

  // Pre-fix, this would land on examPrep (the normal next step after
  // destinations) — it must land back on Review instead.
  await expect(page.locator('#stepContent h2')).toHaveText('Review everything before you submit.');
  await expect(page.locator('.review-section', { hasText: 'Destinations' })).toContainText('United Kingdom');
});

// "General back/next housekeeping" (item 8's own closing instruction): the
// returnToReview flag has to be consumed by Back too, not just Continue —
// otherwise clicking Back after an Edit-jump leaves it set, and the *next*
// unrelated Continue anywhere else in the app would wrongly redirect to
// Review. This test proves Back-from-an-edit also returns to Review (rather
// than the step before the edited one), and that navigation afterward is
// completely normal again (the flag was actually consumed, not left dangling).
test('backing out of a step reached via Review Edit also returns to Review, and normal navigation resumes after that', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await walkDestinationsToReview(page);

  await page.locator('.review-section', { hasText: 'Destinations' }).getByRole('button', { name: 'Edit' }).click();
  await expect(page.locator('#stepContent h2')).toHaveText('Where could your next chapter begin?');
  await page.locator('#destBackBtn').click();
  await expect(page.locator('#stepContent h2')).toHaveText('Review everything before you submit.');

  // The flag must be fully consumed: editing again and using Continue this
  // time still returns to Review (proving it wasn't left permanently stuck
  // in some broken state), and Submitting still works normally afterward.
  await page.locator('.review-section', { hasText: 'Destinations' }).getByRole('button', { name: 'Edit' }).click();
  await page.locator('#destNextBtn').click();
  await expect(page.locator('#stepContent h2')).toHaveText('Review everything before you submit.');
  await page.locator('#reviewSubmitBtn').click();
  await expect(page.locator('.step-heading')).toHaveText('Thank you for participating!');
});

test('submitting the review finalizes the record and only then (no earlier point calls finalizeDraft)', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await walkDestinationsToReview(page);

  const recordsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('pedagogy-expo-records') || '[]').length);
  await page.locator('#reviewSubmitBtn').click();
  await expect(page.locator('.step-heading')).toHaveText("Thank you for participating!");
  const recordsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('pedagogy-expo-records') || '[]').length);
  expect(recordsAfter).toBe(recordsBefore + 1);
  // the draft slot is cleared by finalizeDraft() the instant Submit is clicked
  // (not deferred until "Done") — confirms finalize really is the only save point.
  const draftAfterSubmitScreen = await page.evaluate(() => localStorage.getItem('pedagogy-expo-draft'));
  expect(draftAfterSubmitScreen).toBeNull();
  await page.locator('#submittedDoneBtn').click();
  await expect(page.locator('#heroScreen')).toBeVisible();
});

// Reported live 2026-09-21, root-caused via reproduction, not guessing:
// crypto.randomUUID() throws in any non-secure context (plain http:// over
// anything other than localhost — e.g. a second device on the stall's LAN
// reaching the host device by IP address instead of localhost, exactly how
// testing across two physical devices, like an iPad and a Windows laptop,
// tends to happen). That call sat inside finalizeDraft() with nothing
// catching it, so the uncaught exception silently killed the Submit handler
// right after validation passed but before the confirmation screen ever
// rendered: the button visually responded (a plain CSS :active state, no JS
// needed for that) but the screen never advanced and no popup ever showed.
// This test reproduces that exact insecure-context failure by making
// crypto.randomUUID throw exactly as it does for real, and confirms Submit
// still works via the Math.random()-based fallback (state.js's generateId()).
test('Submit still works even if crypto.randomUUID() is unavailable (reproduces the real insecure-context failure)', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window.crypto, 'randomUUID', {
      configurable: true,
      value: () => { throw new DOMException('The operation is insecure.', 'NotAllowedError'); },
    });
  });
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await walkDestinationsToReview(page);

  const recordsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('pedagogy-expo-records') || '[]').length);
  await page.locator('#reviewSubmitBtn').click();
  await expect(page.locator('.step-heading')).toHaveText('Thank you for participating!');
  const recordsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('pedagogy-expo-records') || '[]').length);
  expect(recordsAfter).toBe(recordsBefore + 1);
});

// Round E item 9c (codexreview.md finding): saveRecords() can fail (storage
// quota, private-mode restrictions), and that failure used to be silently
// discarded — finalizeDraft() still cleared the draft and Review still showed
// the success confirmation regardless, which could lose a real registration
// with no visible sign anything went wrong. Written to fail against the
// pre-fix code (which would show "Thank you for participating!" here) and
// pass now that a failed write shows a real, recoverable failure modal
// instead, with the draft left intact for a retry.
test('a storage-write failure on Submit shows a real failure message instead of the success screen, and does not lose the draft', async ({ page }) => {
  await page.addInitScript(() => {
    const realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'pedagogy-expo-records') throw new DOMException('Quota exceeded.', 'QuotaExceededError');
      return realSetItem.call(this, key, value);
    };
  });
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await walkDestinationsToReview(page);

  await page.locator('#reviewSubmitBtn').click();
  await expect(page.locator('.modal-title')).toHaveText("We couldn't save this");
  await expect(page.locator('.modal-body')).toContainText('Nothing has been lost');
  await expect(page.locator('.step-heading')).not.toHaveText('Thank you for participating!');

  // The draft must still be there for a retry — not silently cleared on failure.
  const draftStillThere = await page.evaluate(() => localStorage.getItem('pedagogy-expo-draft') !== null);
  expect(draftStillThere).toBe(true);
  const recordsCount = await page.evaluate(() => JSON.parse(localStorage.getItem('pedagogy-expo-records') || '[]').length);
  expect(recordsCount).toBe(0); // nothing partially written either
});

// Reported live 2026-09-21: the plain text-only confirmation gave no real
// sense that anything had happened. Reworked with the requested copy
// (thank-you + WhatsApp-updates note) and an auto-redirect back to the hero
// after 5 seconds, with "Continue now" as a manual escape hatch.
test('the confirmation screen shows the requested copy and auto-redirects to the hero after 5 seconds', async ({ page }) => {
  test.setTimeout(45000); // real 5s wall-clock wait, needs headroom under a full parallel run
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await walkDestinationsToReview(page);
  await page.locator('#reviewSubmitBtn').click();

  await expect(page.locator('.step-heading')).toHaveText('Thank you for participating!');
  await expect(page.locator('.submitted-lead')).toContainText('win an iPad');
  await expect(page.locator('.submitted-whatsapp')).toContainText('WhatsApp');
  await expect(page.locator('#submittedRedirectNote')).toContainText('Returning to the start');

  // Don't click anything — let the 5-second auto-redirect fire on its own.
  await expect(page.locator('#heroScreen')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#heroScreen')).not.toHaveClass(/hero-screen--exit/);
  await expect(page.locator('#heroStartBtn')).toBeEnabled();
});

test('"Continue now" on the confirmation screen skips the auto-redirect wait', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await walkDestinationsToReview(page);
  await page.locator('#reviewSubmitBtn').click();
  await expect(page.locator('.step-heading')).toHaveText('Thank you for participating!');

  const start = Date.now();
  await page.locator('#submittedDoneBtn').click();
  await expect(page.locator('#heroScreen')).toBeVisible();
  expect(Date.now() - start).toBeLessThan(2000); // didn't wait for the 5s timer
});

// Reported live 2026-09-21: after a submission, the hero shown for the next
// visitor was invisible AND unclickable all day — hero.js's start() adds
// 'hero-screen--exit' (opacity:0, pointer-events:none) on the way into the
// first visitor's journey and nothing ever removed it, so every visitor after
// the very first submission hit a dead screen. Playwright's toBeVisible()
// alone doesn't catch this (opacity:0 with a real layout box still counts as
// "visible"), so this test proves interactivity by actually completing a
// SECOND full journey after the first one submits.
test('the hero screen is fully interactive again for the next visitor after a submission (not just present in the DOM)', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await walkDestinationsToReview(page);
  await page.locator('#reviewSubmitBtn').click();
  await expect(page.locator('.step-heading')).toHaveText("Thank you for participating!");
  await page.locator('#submittedDoneBtn').click();
  await expect(page.locator('#heroScreen')).toBeVisible();

  await expect(page.locator('#heroScreen')).not.toHaveClass(/hero-screen--exit/);
  await expect(page.locator('#heroStartBtn')).toBeEnabled();
  // The real proof: a second visitor can actually start and reach registration.
  await page.locator('#heroStartBtn').click();
  await expect(page.locator('#appShell')).toBeVisible();
  await expect(page.locator('#stepContent h2')).toHaveText('First, make it yours.');
});

test('submit is blocked with the non-alarming popup if the parent number is missing (defensive re-check)', async ({ page }) => {
  // This state (reaching review with an invalid parent number) isn't reachable
  // through any real navigation today — the register step's own Continue
  // button already gates it, and there's no way to jump straight to review
  // bypassing that (confirmed: goToStep only fires from review's own "Edit"
  // links and the timer's timeout handler, neither of which touches
  // registration). Submit's re-check is a defensive net for a future bypass
  // (e.g. a Phase 3 skip path), so this test seeds a draft directly via
  // addInitScript (before the app's own boot() runs) rather than trying to
  // tamper with a live page's localStorage — a live page's pagehide-autosave
  // listener (js/app.js, for iPad Safari tab discards) correctly fights that
  // kind of tampering by re-saving its known-good in-memory draft.
  const draft = {
    schema: 'pedagogy.v11', mode: 'full', currentStepId: 'review', returnToReview: false,
    registration: {
      name: 'Aisha Rahman', dob: '2009-05-14',
      parentCountryCode: '+971', parentMobileLocal: '', parentMobile: '',
      studentCountryCode: '+971', studentMobileLocal: null, studentMobile: null,
      school: 'Delhi Private School Dubai', schoolKey: null, curriculum: 'Indian',
      grade: 'stage11', stream: null, section: null, subjects: [],
      tcsAccepted: true, consentToContact: true, marketingOptIn: false, marketingOptInAt: null,
    },
    preferences: { destinations: [], destinationsOther: [], competitiveExamPrep: null, competitiveExams: {} },
    quiz: { selectedQuestionIds: [], answers: [], timerStartedAt: null, timerElapsedMs: 0 },
    meta: { id: null, createdAt: null, deviceId: null, recordStatus: null, duplicateFlag: false },
  };
  await page.addInitScript(d => localStorage.setItem('pedagogy-expo-draft', JSON.stringify(d)), draft);
  await page.goto('/');

  await expect(page.locator('.review-section').first()).toBeVisible();
  await page.locator('#reviewSubmitBtn').click();
  await expect(page.locator('.modal-title')).toHaveText('A parent/guardian number is needed');
  // Dismissing via the plain X must NOT silently navigate away underneath the
  // modal (that was the bug — see registration.js's presentValidationFailure
  // comment) — only the actual "Go back and add it" action does.
  await page.locator('.modal-close').click();
  await expect(page.locator('#stepContent h2')).toHaveText('Review everything before you submit.');

  await page.locator('#reviewSubmitBtn').click();
  await page.locator('.modal-actions button', { hasText: 'Go back and add it' }).click();
  await expect(page.locator('#stepContent h2')).toHaveText('First, make it yours.');
});

test('quiz timer counts down on a question step and is absent on registration/preference steps', async ({ page }) => {
  await startJourney(page);
  await expect(page.locator('.quiz-timer')).toHaveCount(0); // register step: no timer
  await fillValidRegistration(page);
  await page.locator('#registerNextBtn').click();
  await expect(page.locator('.quiz-timer')).toBeVisible();
  const first = await page.locator('.quiz-timer').textContent();
  await page.waitForTimeout(1200);
  const second = await page.locator('.quiz-timer').textContent();
  expect(second).not.toBe(first);

  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click();
  await expect(page.locator('.quiz-timer')).toHaveCount(0); // destinations step: no timer
});

test('timer survives free back-navigation instead of resetting', async ({ page }) => {
  await startJourney(page);
  await fillValidRegistration(page);
  await page.locator('#registerNextBtn').click();
  await page.waitForTimeout(1500);
  const beforeBack = await page.evaluate(() => JSON.parse(localStorage.getItem('pedagogy-expo-draft')).quiz.timerElapsedMs
    + (JSON.parse(localStorage.getItem('pedagogy-expo-draft')).quiz.timerStartedAt ? Date.now() - JSON.parse(localStorage.getItem('pedagogy-expo-draft')).quiz.timerStartedAt : 0));
  await page.locator('#qBackBtn').click(); // back to register — pauses and banks elapsed time
  await page.waitForTimeout(300);
  await page.locator('#registerNextBtn').click(); // forward again — resumes, doesn't reset
  const remainingText = await page.locator('.quiz-timer').textContent();
  // Round E's 90-second budget (down from 3 minutes) means "close to the
  // start" is now close to 1:30, not 2:5x/2:4x — still close to 1:30, not
  // reset to 1:30 flat nor near zero.
  expect(remainingText).toMatch(/1:[0-2]\d/);
  expect(beforeBack).toBeGreaterThan(1000);
});

test('quiz filtering: an Indian PCM-stream visitor is served PCM-eligible questions, not Commerce-only ones', async ({ page }) => {
  await startJourney(page);
  await fillValidRegistration(page, { school: false });
  await page.locator('#regCurriculum').selectOption('Indian');
  await page.locator('#regStream').selectOption('science-pcm');
  await page.locator('#regTcs').check();
  await page.locator('#regConsent').check();
  await page.locator('#registerNextBtn').click();

  const questionText = await page.locator('#stepContent h2').textContent();
  // Derived from the live bank rather than hardcoded, so this doesn't rot when
  // the question bank is regenerated (see scripts/merge-question-bank.js).
  const commerceOnlyQuestions = await page.evaluate(() =>
    window.PED.GENERATED.QUESTION_BANK.questions
      .filter(q => q.curriculum === 'Indian' && q.eligible_stream_ids.length &&
        q.eligible_stream_ids.every(s => s.startsWith('commerce')))
      .map(q => q.q)
  );
  expect(commerceOnlyQuestions.length).toBeGreaterThan(0); // sanity: the bank actually has commerce-only questions to exclude
  expect(commerceOnlyQuestions).not.toContain(questionText);
});

test('score/points are never shown to the participant', async ({ page }) => {
  await startJourney(page);
  await fillValidRegistration(page);
  await page.locator('#registerNextBtn').click();
  await page.locator('#quizOptions label').first().click();
  const bodyText = await page.locator('#appShell').innerText();
  expect(bodyText).not.toMatch(/\bscore\b/i);
  expect(bodyText).not.toMatch(/\bpoints?\b/i);
  expect(bodyText).not.toMatch(/correct|incorrect/i);
});

// ===================== Phase 3: hero primary CTA still defaults to full =====================
test('hero primary CTA still creates a full-mode draft', async ({ page }) => {
  await startJourney(page);
  const mode = await page.evaluate(() => JSON.parse(localStorage.getItem('pedagogy-expo-draft')).mode);
  expect(mode).toBe('full');
});

// ===================== Round C item 3: mandatory selection on chip/radio steps =====================
test('destinations Continue is disabled until at least one destination is picked', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await expect(page.locator('#destNextBtn')).toBeDisabled();
  await expect(page.locator('#destValidationHint')).toBeVisible();
  await page.getByText('India', { exact: true }).click();
  await expect(page.locator('#destNextBtn')).toBeEnabled();
  await expect(page.locator('#destValidationHint')).toBeHidden();
});

test('exam-prep Continue is disabled until Yes/No is answered', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await page.getByText('India', { exact: true }).click();
  await page.locator('#destNextBtn').click();
  await expect(page.locator('#examPrepNextBtn')).toBeDisabled();
  await expect(page.locator('#examPrepValidationHint')).toBeVisible();
  await page.locator('input[name=examPrep][value=no]').check();
  await expect(page.locator('#examPrepNextBtn')).toBeEnabled();
  await expect(page.locator('#examPrepValidationHint')).toBeHidden();
});

test('exam list Continue is disabled until at least one exam chip is picked', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await page.getByText('India', { exact: true }).click();
  await page.locator('#destNextBtn').click();
  await page.locator('input[name=examPrep][value=yes]').check();
  await page.locator('#examPrepNextBtn').click();
  await expect(page.locator('#examListNextBtn')).toBeDisabled();
  await expect(page.locator('#examListValidationHint')).toBeVisible();
  await page.getByText('NEET-UG', { exact: true }).click();
  await expect(page.locator('#examListNextBtn')).toBeEnabled();
  await expect(page.locator('#examListValidationHint')).toBeHidden();
});

test('exam list free-text fallback ("Other" only destination) gates Continue on non-empty text', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await page.getByText('Other', { exact: true }).click();
  await page.locator('.modal-close').click();
  await page.locator('#destNextBtn').click();
  await page.locator('input[name=examPrep][value=yes]').check();
  await page.locator('#examPrepNextBtn').click();
  await expect(page.locator('#examListNextBtn')).toBeDisabled();
  await page.locator('#examFreeText').fill('TestAS');
  await expect(page.locator('#examListNextBtn')).toBeEnabled();
  await page.locator('#examFreeText').fill('   '); // whitespace-only doesn't count as an answer
  await expect(page.locator('#examListNextBtn')).toBeDisabled();
});

test('quiz question steps (q1-q4) gate Next on an actual answer or an explicit Skip — reported live 2026-09-21', async ({ page }) => {
  await startJourney(page);
  await fillValidRegistration(page);
  await page.locator('#registerNextBtn').click();
  // Next used to be enabled immediately with nothing selected. Equal-odds
  // draw regardless of quiz completion is unaffected either way (Skip is
  // still one tap away) — but silently letting a visitor click through an
  // unanswered academic question was the wrong default, so Next is now gated
  // the same as every chip/radio step, with Skip as the one explicit bypass.
  await expect(page.locator('#qNextBtn')).toBeDisabled();
  await expect(page.locator('#qValidationHint')).toBeVisible();
  await page.locator('#quizOptions label').first().click();
  await expect(page.locator('#qNextBtn')).toBeEnabled();
  await expect(page.locator('#qValidationHint')).toBeHidden();
});

test('quiz question steps: Skip is still a full bypass of the answer gate, without requiring a selection', async ({ page }) => {
  await startJourney(page);
  await fillValidRegistration(page);
  await page.locator('#registerNextBtn').click();
  await expect(page.locator('#qNextBtn')).toBeDisabled();
  await page.locator('#qSkipBtn').click();
  await page.locator('.modal-actions button:has-text("Skip anyway")').click();
  await expect(page.locator('#stepContent h2')).toHaveText('Where could your next chapter begin?');
});

// ===================== Phase 3: skip only on academic questions =====================
test('no skip button anywhere on data-collection/preference steps', async ({ page }) => {
  await startJourney(page);
  await expect(page.locator('#registerNextBtn')).toBeVisible();
  expect(await page.locator('button', { hasText: /^Skip$/ }).count()).toBe(0);
  await fillValidRegistration(page);
  await page.locator('#registerNextBtn').click();
  await expect(page.locator('#qSkipBtn')).toBeVisible(); // academic question: skip IS present
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click();
  await expect(page.locator('#stepContent h2')).toHaveText('Where could your next chapter begin?');
  expect(await page.locator('button', { hasText: /^Skip$/ }).count()).toBe(0);
});

// ===================== Final build: no dev/rehearsal scaffolding left visible =====================
test('no rehearsal banner, "fictional details" copy, or PLACEHOLDER text anywhere in the app shell', async ({ page }) => {
  await startJourney(page);
  await expect(page.locator('#rehearsalBanner')).toHaveCount(0);
  const registerText = await page.locator('#appShell').innerText();
  expect(registerText).not.toMatch(/fictional details/i);
  await fillValidRegistration(page);
  await page.locator('#registerNextBtn').click();
  const questionText = await page.locator('#appShell').innerText();
  expect(questionText).not.toMatch(/PLACEHOLDER/);
});

test('skipping an academic question shows the exact approved popup copy, then advances', async ({ page }) => {
  await startJourney(page);
  await fillValidRegistration(page);
  await page.locator('#registerNextBtn').click();
  await page.locator('#qSkipBtn').click();
  await expect(page.locator('.modal-title')).toHaveText('Skip this question?');
  await expect(page.locator('.modal-body')).toHaveText('Completing all questions makes your winning chance higher.');
  await page.locator('.modal-actions button', { hasText: 'Skip anyway' }).click();
  await expect(page.locator('#stepContent h2')).toHaveText('Where could your next chapter begin?');
});

// ===================== Phase 4: staff dashboard =====================

async function enterStaffDashboard(page) {
  await page.goto('/');
  await page.locator('#heroStartBtn').click();
  await expect(page.locator('#appShell')).toBeVisible();
  page.once('dialog', dialog => dialog.accept('2026'));
  const logo = page.locator('.brand-mark');
  const box = await logo.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1000);
  await page.mouse.up();
  await expect(page.locator('#view-staff')).toBeVisible();
}

function makeRecord(overrides) {
  return {
    schema: 'pedagogy.v11', mode: 'full', currentStepId: 'review', returnToReview: false,
    registration: {
      name: 'Aisha Rahman', dob: '2009-05-14',
      parentCountryCode: '+971', parentMobileLocal: '501234567', parentMobile: '+971501234567',
      studentCountryCode: '+971', studentMobileLocal: null, studentMobile: null,
      school: 'Delhi Private School Dubai', schoolKey: 'delhi-private-school-dubai', curriculum: 'Indian',
      grade: 'stage10', stream: null, section: null, subjects: [],
      tcsAccepted: true, tcsAcceptedAt: '2026-09-19T10:00:00.000Z',
      consentToContact: true, consentToContactAt: '2026-09-19T10:00:05.000Z',
      marketingOptIn: true, marketingOptInAt: '2026-09-19T10:00:07.000Z',
    },
    preferences: { destinations: ['India'], destinationsOther: [], competitiveExamPrep: 'no', competitiveExams: {} },
    quiz: { selectedQuestionIds: ['q1'], answers: [{ questionId: 'q1', selected: 'Newton', skipped: false, timedOut: false }], timerStartedAt: null, timerElapsedMs: 12000 },
    meta: { id: 'P-test-1', createdAt: '2026-09-19T10:00:10.000Z', deviceId: null, recordStatus: null, duplicateFlag: false, duplicateOfIds: [], duplicateReviewStatus: null },
    ...overrides,
  };
}

test('staff dashboard shows every field the standing decisions call out as visible to staff', async ({ page }) => {
  const record = makeRecord();
  await page.addInitScript(r => localStorage.setItem('pedagogy-expo-records', JSON.stringify([r])), record);
  await enterStaffDashboard(page);

  const card = page.locator('.staff-record').first();
  await expect(card).toContainText('Aisha Rahman');
  await expect(card).toContainText('2009-05-14'); // DOB
  await expect(card).toContainText('+971501234567'); // parent mobile
  await expect(card).toContainText('not given'); // student mobile
  await expect(card).toContainText('Delhi Private School Dubai');
  await expect(card).toContainText('Indian');
  await expect(card).toContainText('9/19/2026'); // T&Cs/consent/marketing-opt-in timestamps render via toLocaleString()
  await expect(card).toContainText('India'); // destinations
  await expect(card).toContainText('Marketing opt-in'); // round D item 1: back as a registration field
  // Round C item 8: follow-up channel/note are still gone — that step's data
  // collection was removed and the card no longer renders those fields
  // (marketing opt-in itself moved to Registration instead, see above).
  await expect(card).not.toContainText('Follow-up channel');
  await expect(card).not.toContainText('Note for counsellor');
  // Round C items 5/7: courses/activities rows are gone too.
  await expect(card).not.toContainText('Courses of interest');
  await expect(card).not.toContainText('Activities');
});

test('staff dashboard shows an empty state when there are no registrations yet', async ({ page }) => {
  await enterStaffDashboard(page);
  await expect(page.locator('#view-staff')).toContainText('No registrations yet.');
  // Round C item 9b's fix: Refresh is present even in the empty state.
  await expect(page.locator('#staffRefreshBtn')).toBeVisible();
});

// Added per PLAN.md Phase 6's "a way to reset devices between test runs"
// plus a repeated live request to clear leftover test/demo data — this used
// to only be possible via a devtools command handed to the user manually.
test('"Clear all local data" wipes every record and the in-progress draft after confirming', async ({ page }) => {
  const record = makeRecord();
  await page.addInitScript(r => localStorage.setItem('pedagogy-expo-records', JSON.stringify([r])), record);
  await enterStaffDashboard(page);
  await expect(page.locator('.staff-record')).toHaveCount(1);

  page.once('dialog', dialog => {
    expect(dialog.message()).toContain('1 registration record');
    dialog.accept();
  });
  await page.locator('#staffClearAllBtn').click();

  await expect(page.locator('#view-staff')).toContainText('No registrations yet.');
  const remaining = await page.evaluate(() => localStorage.getItem('pedagogy-expo-records'));
  expect(remaining).toBeNull();
});

test('"Clear all local data" does nothing if the confirmation is dismissed', async ({ page }) => {
  const record = makeRecord();
  await page.addInitScript(r => localStorage.setItem('pedagogy-expo-records', JSON.stringify([r])), record);
  await enterStaffDashboard(page);

  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#staffClearAllBtn').click();

  await expect(page.locator('.staff-record')).toHaveCount(1);
  const remaining = await page.evaluate(() => JSON.parse(localStorage.getItem('pedagogy-expo-records') || '[]').length);
  expect(remaining).toBe(1);
});

// Round E item 9d (codexreview.md finding): clearAllData() wiped localStorage
// but never touched app.js's own in-memory `draft` variable — only that
// closure holds it, so a visitor's in-progress registration sitting in memory
// when staff cleared data would get written straight back to localStorage by
// the existing autosave handlers on the very next backgrounding, silently
// undoing the clear. Fixed with resetInMemoryDraftAfterClear() (app.js),
// passed into js/staff.js as onDataCleared. Deliberately opens the staff
// dashboard WITHOUT reloading the page — the whole point of this bug is that
// the in-memory draft survives a same-page view switch, unlike a fresh
// page.goto(). Written to fail against the pre-fix code (which would
// resurrect "Aisha Rahman" here) and pass now.
test('"Clear all local data" also resets the in-memory draft, so autosave cannot resurrect it afterward', async ({ page }) => {
  await startJourney(page);
  await page.locator('#regName').fill('Aisha Rahman');
  await expect(page.locator('#regName')).toHaveValue('Aisha Rahman');

  page.once('dialog', dialog => dialog.accept('2026'));
  const logo = page.locator('.brand-mark');
  const box = await logo.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1000);
  await page.mouse.up();
  await expect(page.locator('#view-staff')).toBeVisible();

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#staffClearAllBtn').click();
  await expect(page.locator('#view-staff')).toContainText('No registrations yet.');

  // Simulate the exact resurrection vector: app.js's pagehide-autosave
  // listener (originally added for iPad Safari tab discards) unconditionally
  // saves whatever `draft` currently holds. Pre-fix, that was still the
  // stale in-memory draft carrying "Aisha Rahman"; post-fix, it's a genuinely
  // fresh one, same as every other reset path in this app (new-visitor,
  // post-submit).
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  const draftAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('pedagogy-expo-draft') || 'null'));
  expect(draftAfter).not.toBeNull();
  expect(draftAfter.registration.name).not.toBe('Aisha Rahman');
});

// ===================== Round C item 9b: staff dashboard refresh bug =====================
test('staff dashboard Refresh re-reads localStorage immediately, including the empty->populated transition', async ({ page }) => {
  await enterStaffDashboard(page);
  await expect(page.locator('#view-staff')).toContainText('No registrations yet.');

  // Root cause of the original bug: the empty-state branch never rendered a
  // Refresh button at all, so a dashboard opened before any registrations
  // existed had no way to pick up new submissions without fully closing and
  // re-entering the PIN. Confirm the control now exists in every state...
  await expect(page.locator('#staffRefreshBtn')).toBeVisible();

  // ...and that clicking it actually re-reads localStorage and re-renders.
  const record = makeRecord();
  await page.evaluate(r => localStorage.setItem('pedagogy-expo-records', JSON.stringify([r])), record);
  await page.locator('#staffRefreshBtn').click();
  await expect(page.locator('#view-staff')).toContainText('1 registration');
  await expect(page.locator('.staff-record')).toContainText('Aisha Rahman');

  // A second change + a second click must also work (not a one-shot fix).
  const second = makeRecord({ meta: { ...makeRecord().meta, id: 'P-test-2' }, registration: { ...makeRecord().registration, name: 'Second Visitor' } });
  await page.evaluate(([r1, r2]) => localStorage.setItem('pedagogy-expo-records', JSON.stringify([r1, r2])), [record, second]);
  await page.locator('#staffRefreshBtn').click();
  await expect(page.locator('#view-staff')).toContainText('2 registrations');
  await expect(page.locator('.staff-record')).toHaveCount(2);
  await expect(page.locator('#view-staff')).toContainText('Second Visitor');
});

test('finalizing a second registration that reasonably matches an existing one flags both as duplicates, bidirectionally', async ({ page }) => {
  const existing = makeRecord({ meta: { id: 'P-existing', createdAt: '2026-09-19T09:00:00.000Z', deviceId: null, recordStatus: null, duplicateFlag: false, duplicateOfIds: [], duplicateReviewStatus: null } });
  await page.addInitScript(r => localStorage.setItem('pedagogy-expo-records', JSON.stringify([r])), existing);
  await page.goto('/');

  // Same name + DOB + school as `existing`, submitted as a brand new registration.
  const draft = makeRecord({ currentStepId: 'review' });
  draft.meta = { id: null, createdAt: null, deviceId: null, recordStatus: null, duplicateFlag: false, duplicateOfIds: [], duplicateReviewStatus: null };
  const result = await page.evaluate(d => {
    // Round E item 9c: finalizeDraft() now returns {ok, record} instead of
    // the record directly, so a storage-write failure can be told apart from
    // success (see the dedicated regression test below).
    const { ok, record: finalized } = window.PED.state.finalizeDraft(d);
    const records = window.PED.state.loadRecords();
    return { ok, finalized, records };
  }, draft);

  expect(result.ok).toBe(true);
  expect(result.finalized.meta.duplicateFlag).toBe(true);
  expect(result.finalized.meta.duplicateOfIds).toContain('P-existing');
  expect(result.finalized.meta.duplicateReviewStatus).toBe('pending');
  const existingAfter = result.records.find(r => r.meta.id === 'P-existing');
  expect(existingAfter.meta.duplicateFlag).toBe(true);
  expect(existingAfter.meta.duplicateOfIds).toContain(result.finalized.meta.id);
  expect(existingAfter.meta.duplicateReviewStatus).toBe('pending');
});

// Round E item 9e (codexreview.md finding): resolving a duplicate used to
// update only the clicked record, leaving its linked pair still "pending" —
// staff would think they'd closed out a pair when only half of it moved.
// Written to fail against the pre-fix code (which would leave P-b pending)
// and pass now that resolveDuplicatePair() resolves the whole linked group.
test('staff dashboard surfaces a pending duplicate with review actions, and "Mark reviewed" resolves BOTH linked records', async ({ page }) => {
  const a = makeRecord({ meta: { id: 'P-a', createdAt: '2026-09-19T09:00:00.000Z', deviceId: null, recordStatus: null, duplicateFlag: true, duplicateOfIds: ['P-b'], duplicateReviewStatus: 'pending' } });
  const b = makeRecord({ meta: { id: 'P-b', createdAt: '2026-09-19T09:05:00.000Z', deviceId: null, recordStatus: null, duplicateFlag: true, duplicateOfIds: ['P-a'], duplicateReviewStatus: 'pending' } });
  await page.addInitScript(records => localStorage.setItem('pedagogy-expo-records', JSON.stringify(records)), [a, b]);
  await enterStaffDashboard(page);

  await expect(page.locator('.staff-record--flagged')).toHaveCount(2);
  await expect(page.locator('.badge--duplicate').first()).toHaveText('Pending review');

  await page.locator('[data-action="reviewed"][data-id="P-a"]').click();
  await expect(page.locator('[data-id="P-a"]')).toHaveCount(0); // action buttons gone once resolved
  const records = await page.evaluate(() => window.PED.state.loadRecords());
  const storedA = records.find(r => r.meta.id === 'P-a');
  const storedB = records.find(r => r.meta.id === 'P-b');
  expect(storedA.meta.duplicateReviewStatus).toBe('reviewed');
  expect(storedB.meta.duplicateReviewStatus).toBe('reviewed'); // the linked pair, not just the clicked record
});

// ===================== Phase 4: haptics =====================

test('a chip tap and a button tap both trigger the feature-detected haptic (stubbed navigator.vibrate)', async ({ page }) => {
  await page.addInitScript(() => {
    window.__vibrateCalls = [];
    Object.defineProperty(window.navigator, 'vibrate', {
      configurable: true,
      value: (...args) => { window.__vibrateCalls.push(args); return true; },
    });
  });
  await startJourney(page);
  await fillValidRegistration(page);
  await page.locator('#registerNextBtn').click();
  await expect(page.locator('#quizOptions')).toBeVisible();
  const afterButtonClick = await page.evaluate(() => window.__vibrateCalls.length);
  expect(afterButtonClick).toBeGreaterThan(0); // delegated button-click listener (app.js)

  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click();
  await expect(page.locator('#stepContent h2')).toHaveText('Where could your next chapter begin?');
  await page.getByText('India', { exact: true }).click();
  const afterChipClick = await page.evaluate(() => window.__vibrateCalls.length);
  expect(afterChipClick).toBeGreaterThan(afterButtonClick); // chips.js's explicit tap on selection
});
