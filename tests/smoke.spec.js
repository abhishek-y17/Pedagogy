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
  await page.locator('#regTcs').check();
  await page.locator('#regConsent').check();
}

/** Round C item 3: solves game 1 (Number Trail) by reading each tile's real
 * random value off the DOM and tapping them smallest-to-largest, then clicks
 * the now-enabled Continue button. Works regardless of which 5 numbers were
 * randomly dealt this round. */
async function playGame1(page) {
  await expect(page.locator('#trailTiles')).toBeVisible();
  await expect(page.locator('#gameNextBtn')).toBeDisabled();
  const nums = await page.locator('#trailTiles [data-n]').evaluateAll(els => els.map(e => Number(e.dataset.n)).sort((a, b) => a - b));
  for (const n of nums) {
    await page.locator(`#trailTiles [data-n="${n}"]`).click();
  }
  await expect(page.locator('#gameNextBtn')).toBeEnabled();
  await page.locator('#gameNextBtn').click();
}

/** Solves game 2 (Pattern Recall) by reading the shape target sequence off
 * the DOM before it's hidden, then tapping it back, then clicks the
 * now-enabled Continue button. Works regardless of which shapes/order were
 * randomly dealt this round. */
async function playGame2(page) {
  await expect(page.locator('#patternDisplay')).toBeVisible();
  await expect(page.locator('#gameNextBtn')).toBeDisabled();
  const sequenceText = await page.locator('#patternDisplay').textContent();
  const symbols = sequenceText.trim().split(/\s+/);
  await page.locator('#patternReadyBtn').click();
  await expect(page.locator('#patternKeys')).toBeVisible();
  for (const symbol of symbols) {
    await page.locator(`#patternKeys [data-symbol="${symbol}"]`).click();
  }
  await expect(page.locator('#gameNextBtn')).toBeEnabled();
  await page.locator('#gameNextBtn').click();
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
  // (examList hidden until "Yes"), game1, q2, q3, game2, q4, q5, review = 11
  // visible steps — courses/activities/request are gone entirely (round C
  // items 5/7/8), so this is 11, not the old 14.
  await expect(page.locator('#stepProgress')).toHaveText('Step 1 / 11');
});

test('prize banner tap also opens the app (not just the CTA button)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#prizeBanner').click();
  await expect(page.locator('#appShell')).toBeVisible();
});

test('registration requires a parent number and explains why instead of blocking silently', async ({ page }) => {
  await startJourney(page);
  await fillValidRegistration(page, { parentMobile: '' });
  await page.locator('#registerNextBtn').click();
  await expect(page.locator('.modal-title')).toHaveText('A parent/guardian number is needed');
  await expect(page.locator('.modal-body')).toContainText('handed over through a parent');
  await page.locator('.modal-close').click();
  await expect(page.locator('.modal-overlay')).toBeHidden();
});

// ===================== Round C item 8: WhatsApp note replaces the request step =====================
test('registration mobile fields carry a WhatsApp-reachability note, replacing the removed follow-up step', async ({ page }) => {
  await startJourney(page);
  const hints = await page.locator('.contact-card .field-hint--soft').allTextContents();
  const whatsappHints = hints.filter(t => /WhatsApp/i.test(t));
  expect(whatsappHints.length).toBe(2); // parent card + student card
  expect(whatsappHints[0]).toContain('active on WhatsApp');
});

test('the removed courses/activities/request steps no longer exist on either path', async ({ page }) => {
  await startJourney(page);
  const stepIds = await page.evaluate(() =>
    window.PED.steps.FULL_PATH_STEPS.map(s => s.id).concat(window.PED.steps.EXPRESS_PATH_STEPS.map(s => s.id))
  );
  expect(stepIds).not.toContain('courses');
  expect(stepIds).not.toContain('activities');
  expect(stepIds).not.toContain('request');
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
    name: "Mary-Jane O'Brien", dob: '2009-05-14', tcsAccepted: true, consentToContact: true, parentCountryCode: '+971', parentMobileLocal: '501234567',
  }));
  expect(result.ok).toBe(true); // hyphen/apostrophe names are explicitly allowed

  const rejected = await page.evaluate(() => window.PED.registration.validateRegistrationForSubmit({
    name: 'not@aname', dob: '2009-05-14', tcsAccepted: true, consentToContact: true, parentCountryCode: '+971', parentMobileLocal: '501234567',
  }));
  expect(rejected.ok).toBe(false);
  expect(rejected.message).toContain('numbers or symbols');
});

test('a date of birth implying an implausible age (~40) is rejected', async ({ page }) => {
  await startJourney(page);
  const tooOldDob = `${new Date().getFullYear() - 40}-05-14`;
  await fillValidRegistration(page, { dob: tooOldDob });
  await page.locator('#registerNextBtn').click();
  await expect(page.locator('.modal-body')).toContainText("doesn't look right for a Class 10–12 student");
});

test('a future date of birth is rejected', async ({ page }) => {
  await startJourney(page);
  const futureDob = `${new Date().getFullYear() + 1}-01-01`;
  await fillValidRegistration(page, { dob: futureDob });
  await page.locator('#registerNextBtn').click();
  await expect(page.locator('.modal-body')).toContainText('in the future');
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
 * off), clicks/plays through every remaining full-path step to reach review:
 * pick a destination, answer exam-prep "No" (skips the conditional examList
 * step, keeping this walker generic), then game1 -> q2 -> q3 -> game2 -> q4 ->
 * q5 -> review. Both games are actually solved now (round C item 3 removed
 * the free "Skip puzzle" — Continue is gated on completion), via the
 * playGame1/playGame2 helpers above. */
async function walkDestinationsToReview(page) {
  await page.getByText('India', { exact: true }).click();
  await page.locator('#destNextBtn').click();
  await expect(page.locator('#stepContent h2')).toHaveText('Are you preparing for any competitive exam?');
  await page.locator('input[name=examPrep][value=no]').check();
  await page.locator('#examPrepNextBtn').click();

  await playGame1(page);
  await expect(page.locator('#quizOptions')).toBeVisible(); // q2
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click();
  await expect(page.locator('#quizOptions')).toBeVisible(); // q3
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click();

  await playGame2(page);
  await expect(page.locator('#quizOptions')).toBeVisible(); // q4
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click();
  await expect(page.locator('#quizOptions')).toBeVisible(); // q5
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
  await expect(page.locator('.review-quiz-item').first()).toContainText('Question 1 of 5');
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
    schema: 'pedagogy.v10', mode: 'full', currentStepId: 'review',
    registration: {
      name: 'Aisha Rahman', dob: '2009-05-14',
      parentCountryCode: '+971', parentMobileLocal: '', parentMobile: '',
      studentCountryCode: '+971', studentMobileLocal: null, studentMobile: null,
      school: 'Delhi Private School Dubai', schoolKey: null, curriculum: 'Indian',
      grade: 'stage10', stream: null, section: null, subjects: [],
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
  expect(remainingText).toMatch(/2:5\d|2:4\d/); // still close to the ~3:00 start, not reset to 3:00 flat nor near zero
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

// ===================== Mini-games (round C items 3, 4, 6) =====================
async function reachGame1(page) {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await page.getByText('India', { exact: true }).click(); // mandatory (round C item 3)
  await page.locator('#destNextBtn').click();
  await page.locator('input[name=examPrep][value=no]').check(); // mandatory (round C item 3)
  await page.locator('#examPrepNextBtn').click();
  await expect(page.locator('#trailTiles')).toBeVisible();
}

test('game 1 (number trail): 5 fresh random 3-digit numbers every round, tapped smallest to largest', async ({ page }) => {
  await reachGame1(page);
  const nums = await page.locator('#trailTiles [data-n]').evaluateAll(els => els.map(e => Number(e.dataset.n)));
  expect(nums.length).toBe(5); // round C item 4: exactly 5 tiles, not 12
  const unique = new Set(nums);
  expect(unique.size).toBe(5); // no duplicate values
  for (const n of nums) {
    expect(n).toBeGreaterThanOrEqual(200);
    expect(n).toBeLessThanOrEqual(999);
  }

  await playGame1(page);
  await expect(page.locator('#quizOptions')).toBeVisible(); // q2, the next real step after game1
});

test('game 1: numbers stay the same across Back/Next re-entry (reported bug: used to re-shuffle and lose progress)', async ({ page }) => {
  await reachGame1(page);
  const first = await page.locator('#trailTiles [data-n]').evaluateAll(els => els.map(e => Number(e.dataset.n)).sort());
  await page.locator('#gameBackBtn').click();
  await page.locator('#examPrepNextBtn').click(); // re-enter game1 (examPrep's answer already persisted)
  await expect(page.locator('#trailTiles')).toBeVisible();
  const second = await page.locator('#trailTiles [data-n]').evaluateAll(els => els.map(e => Number(e.dataset.n)).sort());
  expect(second).toEqual(first);
});

test('game 1: tapped-so-far progress survives a Back + re-entry, not just the tile set', async ({ page }) => {
  await reachGame1(page);
  const nums = await page.locator('#trailTiles [data-n]').evaluateAll(els => els.map(e => Number(e.dataset.n)));
  const first = nums[0];
  await page.locator(`#trailTiles [data-n="${first}"]`).click();
  await expect(page.locator(`#trailTiles [data-n="${first}"]`)).toHaveClass(/tile--selected/);

  await page.locator('#gameBackBtn').click();
  await page.locator('#examPrepNextBtn').click(); // re-enter game1
  await expect(page.locator('#trailTiles')).toBeVisible();
  await expect(page.locator(`#trailTiles [data-n="${first}"]`)).toHaveClass(/tile--selected/);
  await expect(page.locator(`#trailTiles [data-n="${first}"]`).locator('.tile-order-badge')).toHaveText('1');
});

test('game 1: numbers are freshly re-shuffled for a genuinely new visitor', async ({ page }) => {
  await reachGame1(page);
  const first = await page.locator('#trailTiles [data-n]').evaluateAll(els => els.map(e => Number(e.dataset.n)).sort());
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#newVisitorBtn').click();
  await expect(page.locator('#stepContent h2')).toHaveText('First, make it yours.');
  await reachGame1(page);
  const second = await page.locator('#trailTiles [data-n]').evaluateAll(els => els.map(e => Number(e.dataset.n)).sort());
  // Not a hard guarantee (two random 5-of-800 draws could theoretically
  // collide), but overwhelmingly likely to differ — confirms a new visitor
  // gets a real fresh puzzle, not the previous visitor's leftover state.
  expect(second).not.toEqual(first);
});

test('game 1: no answer is given away in the status line, and a wrong final order stays editable instead of auto-resetting', async ({ page }) => {
  await reachGame1(page);
  const nums = await page.locator('#trailTiles [data-n]').evaluateAll(els => els.map(e => Number(e.dataset.n)));
  const ascending = [...nums].sort((a, b) => a - b);
  const descendingGuess = [...ascending].reverse(); // guaranteed wrong unless already sorted (5 distinct values, never happens)

  // Tap one tile: the status line (the only place a "next answer" hint used
  // to live — the tiles themselves always show all 5 numbers regardless) must
  // not reveal which number comes next, just a neutral progress count.
  await page.locator(`#trailTiles [data-n="${nums[0]}"]`).click();
  await expect(page.locator('#gameStatus')).toHaveText('1 of 5 placed — tap a number again to remove it.');
  const statusText = await page.locator('#gameStatus').innerText();
  expect(statusText).not.toMatch(/next|start with/i);
  await expect(page.locator('#gameNextBtn')).toBeDisabled();

  // Tap the other 4 in the wrong (descending) order to reach a full, incorrect guess.
  for (const n of descendingGuess.filter(n => n !== nums[0])) {
    await page.locator(`#trailTiles [data-n="${n}"]`).click();
  }
  const bodyText = await page.locator('#appShell').innerText();
  expect(bodyText).not.toMatch(/\berror(s)?\b/i);
  await expect(page.locator('#gameStatus')).toHaveText('Not quite that order — tap a number to remove it and try again.');
  await expect(page.locator('#gameNextBtn')).toBeDisabled();

  // Fix it by unclicking and re-tapping in the correct order — no page reload/reset needed.
  for (const n of descendingGuess) {
    await page.locator(`#trailTiles [data-n="${n}"]`).click(); // unclick everything
  }
  for (const n of ascending) {
    await page.locator(`#trailTiles [data-n="${n}"]`).click();
  }
  await expect(page.locator('#gameNextBtn')).toBeEnabled();
});

// ===================== Round C item 3: mandatory selection (games are no longer skippable) =====================
test('game 1: Continue stays disabled — no free "Skip puzzle" anymore, even across Back + re-entry', async ({ page }) => {
  await reachGame1(page);
  await expect(page.locator('#gameNextBtn')).toBeDisabled();
  await page.locator('#gameBackBtn').click();
  await expect(page.locator('#stepContent h2')).toHaveText('Are you preparing for any competitive exam?');
  await page.locator('#examPrepNextBtn').click();
  await expect(page.locator('#trailTiles')).toBeVisible(); // re-entering resumes the same puzzle, no crash
  await expect(page.locator('#gameNextBtn')).toBeDisabled(); // still gated, no way around it
});

// Reported live 2026-09-21: unbounded retries on a wrong order weren't the
// ask — a capped number of chances, then a real Skip, is.
test('game 1: after 2 wrong full orders, tiles lock and a Skip button appears', async ({ page }) => {
  await reachGame1(page);
  const nums = await page.locator('#trailTiles [data-n]').evaluateAll(els => els.map(e => Number(e.dataset.n)));
  const ascending = [...nums].sort((a, b) => a - b);
  const wrongOrder = [...ascending].reverse();

  await expect(page.locator('#gameSkipBtn')).toBeHidden();
  for (let attempt = 0; attempt < 2; attempt++) {
    for (const n of wrongOrder) await page.locator(`#trailTiles [data-n="${n}"]`).click();
    if (attempt === 0) {
      await expect(page.locator('#gameStatus')).toHaveText('Not quite that order — tap a number to remove it and try again.');
      await expect(page.locator('#gameSkipBtn')).toBeHidden();
      for (const n of wrongOrder) await page.locator(`#trailTiles [data-n="${n}"]`).click(); // unclick everything for the 2nd attempt
    }
  }

  await expect(page.locator('#gameStatus')).toContainText('No more tries left');
  await expect(page.locator('#gameSkipBtn')).toBeVisible();
  await expect(page.locator(`#trailTiles [data-n="${nums[0]}"]`)).toBeDisabled(); // locked, only Skip remains
  await page.locator('#gameSkipBtn').click();
  await expect(page.locator('#quizOptions')).toBeVisible(); // advanced to q2 despite not solving it
});

test('game 2 (pattern recall): geometry shapes (reverted from Greek letters, round D), studying/hiding/tapping the sequence back completes it', async ({ page }) => {
  await reachGame1(page);
  await playGame1(page);
  await expect(page.locator('#quizOptions')).toBeVisible(); // q2
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click(); // q2 -> q3
  await expect(page.locator('#quizOptions')).toBeVisible(); // q3
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click(); // q3 -> game2

  await expect(page.locator('#patternDisplay')).toBeVisible();
  const sequenceText = await page.locator('#patternDisplay').textContent();
  const symbols = sequenceText.trim().split(/\s+/);
  expect(symbols.length).toBe(5);
  const SHAPES = ['●', '▲', '■', '★'];
  symbols.forEach(s => expect(SHAPES).toContain(s));

  await page.locator('#patternReadyBtn').click();
  await expect(page.locator('#patternKeys')).toBeVisible();
  const keyCount = await page.locator('#patternKeys [data-symbol]').count();
  expect(keyCount).toBe(4); // the fixed 4-shape key panel, not one button per sequence slot
  for (const symbol of symbols) {
    await page.locator(`#patternKeys [data-symbol="${symbol}"]`).click();
  }
  await expect(page.locator('#gameStatus')).toHaveText('Sequence complete — nicely done!');
  await expect(page.locator('#gameNextBtn')).toBeEnabled();
});

// Reported live 2026-09-21: a wrong tap used to silently wipe all recall
// progress back to zero and force a full re-study before trying again.
test('game 2: a wrong tap does not reset progress — the visitor can just tap again', async ({ page }) => {
  await reachGame1(page);
  await playGame1(page);
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click(); // q2 -> q3
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click(); // q3 -> game2

  const symbols = (await page.locator('#patternDisplay').textContent()).trim().split(/\s+/);
  await page.locator('#patternReadyBtn').click();

  // Get the first symbol right, building real progress...
  await page.locator(`#patternKeys [data-symbol="${symbols[0]}"]`).click();
  await expect(page.locator('#patternDisplay')).toHaveText(new RegExp('^' + symbols[0]));

  // ...then tap a wrong one.
  const SHAPES = ['●', '▲', '■', '★'];
  const wrongSymbol = SHAPES.find(s => s !== symbols[1]);
  await page.locator(`#patternKeys [data-symbol="${wrongSymbol}"]`).click();
  await expect(page.locator('#gameStatus')).toContainText('Not quite');

  // Progress from the first correct tap must still be there — not reset to zero.
  await expect(page.locator('#patternDisplay')).toHaveText(new RegExp('^' + symbols[0]));
  await expect(page.locator('#patternKeys')).toBeVisible(); // still in recall, no forced re-study

  // Recover by tapping the actually-correct next symbol.
  await page.locator(`#patternKeys [data-symbol="${symbols[1]}"]`).click();
  await expect(page.locator('#patternDisplay')).toHaveText(new RegExp('^' + symbols[0] + ' ' + symbols[1]));
});

test('game 2: "Look again" re-shows the pattern mid-recall without losing progress', async ({ page }) => {
  await reachGame1(page);
  await playGame1(page);
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click(); // q2 -> q3
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click(); // q3 -> game2

  const symbols = (await page.locator('#patternDisplay').textContent()).trim().split(/\s+/);
  await page.locator('#patternReadyBtn').click();
  await page.locator(`#patternKeys [data-symbol="${symbols[0]}"]`).click();

  await page.locator('#patternLookAgainBtn').click();
  await expect(page.locator('#patternDisplay')).toHaveText(symbols.join(' '));
  await expect(page.locator('#patternKeys')).toBeHidden();

  await page.locator('#patternReadyBtn').click(); // "Back to recall"
  await expect(page.locator('#patternKeys')).toBeVisible();
  // Progress survived the look-again round trip.
  await expect(page.locator('#patternDisplay')).toHaveText(new RegExp('^' + symbols[0]));
});

// Reported live 2026-09-21: "Look again" was an infinitely-repeatable
// loophole that defeated the memory puzzle entirely. Wrong taps and
// Look-again uses now draw from the same capped pool of chances.
test('game 2: after the chance cap is used up (wrong taps + Look-again combined), Look again and the keys lock and Skip appears', async ({ page }) => {
  await reachGame1(page);
  await playGame1(page);
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click(); // q2 -> q3
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click(); // q3 -> game2

  const SHAPES = ['●', '▲', '■', '★'];
  const symbols = (await page.locator('#patternDisplay').textContent()).trim().split(/\s+/);
  const wrongSymbol = SHAPES.find(s => s !== symbols[0]);
  await page.locator('#patternReadyBtn').click();

  await expect(page.locator('#gameSkipBtn')).toBeHidden();
  // Chance 1: a wrong tap.
  await page.locator(`#patternKeys [data-symbol="${wrongSymbol}"]`).click();
  await expect(page.locator('#patternLookAgainBtn')).toBeVisible();
  // Chance 2: a Look-again use — this is the second and last chance.
  await page.locator('#patternLookAgainBtn').click();
  await page.locator('#patternReadyBtn').click(); // back to recall

  await expect(page.locator('#gameStatus')).toContainText('No more tries left');
  await expect(page.locator('#patternLookAgainBtn')).toBeHidden();
  await expect(page.locator('#gameSkipBtn')).toBeVisible();
  await expect(page.locator(`#patternKeys [data-symbol="${symbols[0]}"]`)).toBeDisabled();

  await page.locator('#gameSkipBtn').click();
  await expect(page.locator('#quizOptions')).toBeVisible(); // advanced to q4 despite not solving it
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

test('quiz question steps (q1-q5) gate Next on an actual answer or an explicit Skip — reported live 2026-09-21', async ({ page }) => {
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
  expect(await page.locator('button', { hasText: /Skip puzzle/ }).count()).toBe(0); // round C item 3: games lost their free-skip wording too
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
    schema: 'pedagogy.v10', mode: 'full', currentStepId: 'review',
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
    const finalized = window.PED.state.finalizeDraft(d);
    const records = window.PED.state.loadRecords();
    return { finalized, records };
  }, draft);

  expect(result.finalized.meta.duplicateFlag).toBe(true);
  expect(result.finalized.meta.duplicateOfIds).toContain('P-existing');
  expect(result.finalized.meta.duplicateReviewStatus).toBe('pending');
  const existingAfter = result.records.find(r => r.meta.id === 'P-existing');
  expect(existingAfter.meta.duplicateFlag).toBe(true);
  expect(existingAfter.meta.duplicateOfIds).toContain(result.finalized.meta.id);
  expect(existingAfter.meta.duplicateReviewStatus).toBe('pending');
});

test('staff dashboard surfaces a pending duplicate with review actions, and "Mark reviewed" resolves it', async ({ page }) => {
  const a = makeRecord({ meta: { id: 'P-a', createdAt: '2026-09-19T09:00:00.000Z', deviceId: null, recordStatus: null, duplicateFlag: true, duplicateOfIds: ['P-b'], duplicateReviewStatus: 'pending' } });
  const b = makeRecord({ meta: { id: 'P-b', createdAt: '2026-09-19T09:05:00.000Z', deviceId: null, recordStatus: null, duplicateFlag: true, duplicateOfIds: ['P-a'], duplicateReviewStatus: 'pending' } });
  await page.addInitScript(records => localStorage.setItem('pedagogy-expo-records', JSON.stringify(records)), [a, b]);
  await enterStaffDashboard(page);

  await expect(page.locator('.staff-record--flagged')).toHaveCount(2);
  await expect(page.locator('.badge--duplicate').first()).toHaveText('Pending review');

  await page.locator('[data-action="reviewed"][data-id="P-a"]').click();
  await expect(page.locator('[data-id="P-a"]')).toHaveCount(0); // action buttons gone once resolved
  const storedA = await page.evaluate(() => window.PED.state.loadRecords().find(r => r.meta.id === 'P-a'));
  expect(storedA.meta.duplicateReviewStatus).toBe('reviewed');
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
