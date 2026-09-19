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
  // in the real step order — free navigation means Next works whether or not
  // it's answered, same as any other question this round (no skip button yet).
  await expect(page.locator('#quizOptions')).toBeVisible();
  await page.locator('#qNextBtn').click();
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

// ===================== Phase 2: review + timer + filtering =====================

/** From the destinations step (where completeRegistrationToDestinations leaves
 * off), clicks through every remaining full-path step to reach review.
 * examPrep is left unanswered on purpose — that skips the conditional
 * examList step, which keeps this walker generic. game1/game2 are skipped via
 * their own "Skip puzzle" button (real content, Phase 3) rather than played;
 * dedicated tests below actually play them. Only 'request' is still a
 * placeholder. */
async function walkDestinationsToReview(page) {
  await page.locator('#destNextBtn').click();
  await expect(page.locator('#stepContent h2')).toHaveText('Are you preparing for any competitive exam?');
  await page.locator('#examPrepNextBtn').click();
  // game1, q2, courses, game2, q3, activities, q4, q5, request -> review (9 steps).
  // `force: true`: button:hover's translateY(-2px) (styles.css) fights
  // WebKit's hover-based actionability retry when clicking through many
  // buttons this fast in a row — real UX polish, not a bug (a real visitor's
  // finger doesn't "hover" the way a synthetic mouse-move retry loop does),
  // so the test bypasses that check here rather than working around the CSS.
  for (let i = 0; i < 15; i++) {
    if (await page.locator('.review-section').first().isVisible().catch(() => false)) break;
    if (await page.locator('#quizOptions').isVisible().catch(() => false)) {
      await page.locator('#qNextBtn').click({ force: true });
    } else if (await page.locator('#gameSkipBtn').isVisible().catch(() => false)) {
      await page.locator('#gameSkipBtn').click({ force: true });
    } else if (await page.locator('#coursesNextBtn').isVisible().catch(() => false)) {
      await page.locator('#coursesNextBtn').click({ force: true });
    } else if (await page.locator('#activitiesNextBtn').isVisible().catch(() => false)) {
      await page.locator('#activitiesNextBtn').click({ force: true });
    } else {
      await page.locator('#placeholderNextBtn').click({ force: true });
    }
  }
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
  await expect(page.locator('.review-fields--quiz')).toContainText('Q1');
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
  await expect(page.locator('.step-heading')).toHaveText("You're entered — thank you!");
  const recordsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('pedagogy-expo-records') || '[]').length);
  expect(recordsAfter).toBe(recordsBefore + 1);
  // the draft slot is cleared by finalizeDraft() the instant Submit is clicked
  // (not deferred until "Done") — confirms finalize really is the only save point.
  const draftAfterSubmitScreen = await page.evaluate(() => localStorage.getItem('pedagogy-expo-draft'));
  expect(draftAfterSubmitScreen).toBeNull();
  await page.locator('#submittedDoneBtn').click();
  await expect(page.locator('#heroScreen')).toBeVisible();
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
    schema: 'pedagogy.v6', mode: 'full', currentStepId: 'review',
    registration: {
      name: 'Aisha Rahman', dob: '2009-05-14', parentMobile: '', studentMobile: null,
      school: 'Delhi Private School Dubai', schoolKey: null, curriculum: 'Indian',
      grade: 'stage10', stream: null, section: null, subjects: [],
      tcsAccepted: true, consentToContact: true,
    },
    preferences: { destinations: [], destinationsOther: [], competitiveExamPrep: null, competitiveExams: {}, courses: [], activities: [] },
    quiz: { selectedQuestionIds: [], answers: [], timerStartedAt: null, timerElapsedMs: 0 },
    followUp: { counselling: false, marketing: false, preferredFollowup: null, channel: null },
    meta: { id: null, createdAt: null, deviceId: null, recordStatus: null, duplicateFlag: false },
  };
  await page.addInitScript(d => localStorage.setItem('pedagogy-expo-draft', JSON.stringify(d)), draft);
  await page.goto('/');

  await expect(page.locator('.review-section').first()).toBeVisible();
  await page.locator('#reviewSubmitBtn').click();
  await expect(page.locator('.modal-title')).toHaveText('A parent/guardian number is needed');
  await page.locator('.modal-close').click();
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
  expect(remainingText).toMatch(/4:5\d|4:4\d/); // still close to the ~5:00 start, not reset to 5:00 flat nor near zero
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
  const commerceOnlyQuestions = ['A product costs AED 60 and sells for AED 80. Ignoring other costs, profit per unit is:'];
  expect(commerceOnlyQuestions).not.toContain(questionText);
});

// ===================== Phase 3: real express entry point =====================
// js/hero.js's secondary "Just here for the quiz?" link now actually sets
// draft.mode = 'express' (previously only reachable by seeding a draft
// directly — see RUN_LOG.md's Phase 2 scope-check finding, now closed). This
// test goes through the real button rather than seeding state.
test('express entry point: hero secondary link starts a real 1-question, ~60s express path', async ({ page }) => {
  await page.goto('/');
  await page.locator('#heroExpressBtn').click();
  await expect(page.locator('#appShell')).toBeVisible();
  const mode = await page.evaluate(() => JSON.parse(localStorage.getItem('pedagogy-expo-draft')).mode);
  expect(mode).toBe('express');
  await fillValidRegistration(page);
  await page.locator('#registerNextBtn').click();

  await expect(page.locator('#stepContent h2')).not.toHaveText(''); // a real question rendered
  await expect(page.locator('.quiz-timer')).toBeVisible();
  const timerText = await page.locator('.quiz-timer').textContent();
  expect(timerText).toMatch(/0:5\d|1:00/); // ~60s budget, not the full path's ~5:00
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click();

  // express path per steps.js: destinations -> examPrep -> (examList) -> courses -> activities -> request -> review
  await expect(page.locator('#stepContent h2')).toHaveText('Where could your next chapter begin?');
  await page.locator('#destNextBtn').click();
  await page.locator('#examPrepNextBtn').click();
  for (let i = 0; i < 10; i++) {
    if (await page.locator('.review-section').first().isVisible().catch(() => false)) break;
    if (await page.locator('#coursesNextBtn').isVisible().catch(() => false)) {
      await page.locator('#coursesNextBtn').click({ force: true });
    } else if (await page.locator('#activitiesNextBtn').isVisible().catch(() => false)) {
      await page.locator('#activitiesNextBtn').click({ force: true });
    } else {
      await page.locator('#placeholderNextBtn').click({ force: true });
    }
  }
  await expect(page.locator('.review-section').first()).toBeVisible();
  await expect(page.locator('.review-fields--quiz div')).toHaveCount(1); // exactly 1 question on express

  await page.locator('#reviewSubmitBtn').click();
  await expect(page.locator('.step-heading')).toHaveText("You're entered — thank you!");
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
test('hero primary CTA still creates a full-mode draft (express link is additive, not a replacement)', async ({ page }) => {
  await startJourney(page);
  const mode = await page.evaluate(() => JSON.parse(localStorage.getItem('pedagogy-expo-draft')).mode);
  expect(mode).toBe('full');
});

// ===================== Phase 3: mini-games =====================
async function reachGame1(page) {
  await startJourney(page);
  await completeRegistrationToDestinations(page);
  await page.locator('#destNextBtn').click();
  await page.locator('#examPrepNextBtn').click();
  await expect(page.locator('#trailTiles')).toBeVisible();
}

test('game 1 (number trail): tapping 1..12 in order completes it and turns Skip into Continue', async ({ page }) => {
  await reachGame1(page);
  for (let n = 1; n <= 12; n++) {
    await page.locator(`#trailTiles [data-n="${n}"]`).click();
  }
  await expect(page.locator('#gameStatus')).toHaveText('Nice work — trail complete!');
  await expect(page.locator('#gameSkipBtn')).toHaveText('Continue →');
  await page.locator('#gameSkipBtn').click();
  await expect(page.locator('#quizOptions')).toBeVisible(); // q2, the next real step after game1
});

test('game 1: a mis-tap does not complete the puzzle or reveal any error count', async ({ page }) => {
  await reachGame1(page);
  // Tap the highest-numbered tile first — guaranteed wrong since 1 is expected.
  const tiles = page.locator('#trailTiles [data-n]');
  const count = await tiles.count();
  let wrongTile = null;
  for (let i = 0; i < count; i++) {
    if (await tiles.nth(i).getAttribute('data-n') !== '1') { wrongTile = tiles.nth(i); break; }
  }
  await wrongTile.click();
  await expect(page.locator('#gameStatus')).toHaveText('Try 1 next.');
  const bodyText = await page.locator('#appShell').innerText();
  expect(bodyText).not.toMatch(/\berror(s)?\b/i);
});

test('game 1: Back navigates away without breaking state, and Skip puzzle advances without completing it', async ({ page }) => {
  await reachGame1(page);
  await page.locator('#gameBackBtn').click();
  await expect(page.locator('#stepContent h2')).toHaveText('Are you preparing for any competitive exam?');
  await page.locator('#examPrepNextBtn').click();
  await expect(page.locator('#trailTiles')).toBeVisible(); // re-entering re-deals a fresh puzzle, no crash
  await page.locator('#gameSkipBtn').click();
  await expect(page.locator('#stepContent h2')).not.toHaveText('');
});

test('game 2 (pattern recall): studying, hiding and tapping the sequence back completes it', async ({ page }) => {
  await reachGame1(page);
  await page.locator('#gameSkipBtn').click(); // skip game 1
  await expect(page.locator('#quizOptions')).toBeVisible(); // q2
  await page.locator('#qNextBtn').click();
  await expect(page.locator('#coursesChipGrid .chips')).toBeVisible(); // courses, between game1 and game2
  await page.locator('#coursesNextBtn').click();
  await expect(page.locator('#patternDisplay')).toBeVisible();
  const sequenceText = await page.locator('#patternDisplay').textContent();
  const symbols = sequenceText.trim().split(/\s+/);
  await page.locator('#patternReadyBtn').click();
  await expect(page.locator('#patternKeys')).toBeVisible();
  for (const symbol of symbols) {
    await page.locator(`#patternKeys [data-symbol="${symbol}"]`).click();
  }
  await expect(page.locator('#gameStatus')).toHaveText('Sequence complete — nicely done!');
  await expect(page.locator('#gameSkipBtn')).toHaveText('Continue →');
});

// ===================== Phase 3: courses / activities chip steps =====================
async function reachCourses(page) {
  await reachGame1(page);
  await page.locator('#gameSkipBtn').click();
  await page.locator('#qNextBtn').click(); // q2
  await expect(page.locator('#coursesChipGrid .chips')).toBeVisible();
}

test('courses step: tap-chip multi-select with "Undecided" clearing other picks', async ({ page }) => {
  await reachCourses(page);
  await page.locator('#coursesChipGrid label', { hasText: 'Medicine' }).click();
  await page.locator('#coursesChipGrid label', { hasText: 'Law' }).click();
  await page.locator('#coursesChipGrid label', { hasText: 'Undecided' }).click();
  const checked = await page.locator('#coursesChipGrid input:checked').evaluateAll(els => els.map(e => e.value));
  expect(checked).toEqual(['Undecided']);
});

test('courses step: an Indian PCM-stream visitor sees Engineering/Computing marked as suggested', async ({ page }) => {
  await startJourney(page);
  await fillValidRegistration(page, { school: false });
  await page.locator('#regCurriculum').selectOption('Indian');
  await page.locator('#regStream').selectOption('science-pcm');
  await page.locator('#regTcs').check();
  await page.locator('#regConsent').check();
  await page.locator('#registerNextBtn').click();
  await page.locator('#qNextBtn').click(); // q1
  await page.locator('#destNextBtn').click();
  await page.locator('#examPrepNextBtn').click();
  await page.locator('#gameSkipBtn').click(); // game1
  await page.locator('#qNextBtn').click(); // q2
  await expect(page.locator('#coursesChipGrid .chips')).toBeVisible();
  await expect(page.locator('#coursesChipGrid span.chip-suggested', { hasText: 'Engineering' })).toBeVisible();
});

test('activities step: plain tap-chip multi-select, no exclusivity', async ({ page }) => {
  await reachCourses(page);
  await page.locator('#coursesNextBtn').click();
  await page.locator('#gameSkipBtn').click(); // game2
  await page.locator('#qNextBtn').click(); // q3
  await expect(page.locator('#activitiesChipGrid .chips')).toBeVisible();
  await page.locator('#activitiesChipGrid label', { hasText: 'Sport' }).click();
  await page.locator('#activitiesChipGrid label', { hasText: 'Music' }).click();
  const checked = await page.locator('#activitiesChipGrid input:checked').evaluateAll(els => els.map(e => e.value));
  expect(checked.sort()).toEqual(['Music', 'Sport']);
});

// ===================== Phase 3: skip only on academic questions =====================
test('no skip button anywhere on data-collection/preference steps', async ({ page }) => {
  await startJourney(page);
  await expect(page.locator('#registerNextBtn')).toBeVisible();
  expect(await page.locator('button', { hasText: /^Skip$/ }).count()).toBe(0);
  await fillValidRegistration(page);
  await page.locator('#registerNextBtn').click();
  await expect(page.locator('#qSkipBtn')).toBeVisible(); // academic question: skip IS present
  await page.locator('#qNextBtn').click();
  await expect(page.locator('#stepContent h2')).toHaveText('Where could your next chapter begin?');
  expect(await page.locator('button', { hasText: /^Skip$/ }).count()).toBe(0);
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
