const { test, expect } = require('@playwright/test');

async function startJourney(page) {
  await page.goto('/');
  await page.locator('#heroStartBtn').click();
  await expect(page.locator('#appShell')).toBeVisible();
}

async function completeRegistrationToDestinations(page, overrides) {
  await fillValidRegistration(page, overrides);
  await page.locator('#registerNextBtn').click();
  // 'q1' is a Phase 2+ placeholder between register and destinations in the
  // real step order — click through it like a real visitor would.
  await expect(page.locator('#stepContent h2')).toHaveText('q1');
  await page.locator('#placeholderNextBtn').click();
  await expect(page.locator('#stepContent h2')).toHaveText('Where could your next chapter begin?');
}

async function fillValidRegistration(page, overrides) {
  overrides = overrides || {};
  await page.locator('#regName').fill(overrides.name || 'Aisha Rahman');
  await page.locator('#regDob').fill(overrides.dob || '2009-05-14');
  await page.locator('#regParentMobile').fill(overrides.parentMobile !== undefined ? overrides.parentMobile : '+971501234567');
  if (overrides.school !== false) {
    await page.locator('#regSchoolInput').fill(overrides.school || 'Delhi Private School');
    const firstSuggestion = page.locator('#schoolSuggestions li').first();
    if (await firstSuggestion.count()) await firstSuggestion.click();
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
  await expect(page.locator('#stepProgress')).toHaveText('Step 1 / 14');
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

test('destinations "Other" search overlay finds and adds a specific country', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await page.getByText('Other', { exact: true }).click();
  await page.locator('#countrySearchInput').fill('Japan');
  await page.locator('#countrySearchResults li', { hasText: 'Japan' }).click();
  await expect(page.locator('#otherPicksWrap')).toContainText('Japan');
});

test('draft persists across a reload (survives a backgrounded-tab discard)', async ({ page }) => {
  await startJourney(page);
  await completeRegistrationToDestinations(page);

  await page.reload();
  await expect(page.locator('#appShell')).toBeVisible();
  await expect(page.locator('#stepContent h2')).toHaveText('Where could your next chapter begin?');
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
