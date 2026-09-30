// NEET/JEE guarantee: an Indian PCMB visitor, or anyone who picks NEET and/or JEE in
// the competitive-exam step, always gets at least one NEET- or JEE-style question.
// (NEET = the bank's "NEET-style:" topic prefix; JEE has no tagged questions yet, so
// hard-tier Indian Physics/Chemistry/Mathematics stand in until some exist.)
const { test, expect } = require('@playwright/test');

/** Runs `fn(PED, questions)` in the page with the real, validated question bank. */
const inApp = (page, fn, arg) => page.evaluate(([src, a]) => {
  const ds = window.PED.data.loadDatasets();
  const qs = window.PED.questions.loadQuestionBank(ds.questionBank, ds.curriculumSubjects);
  return (new Function('PED', 'questions', 'arg', `return (${src})(PED, questions, arg);`))(window.PED, qs, a);
}, [fn.toString(), arg]);

test('examNeed: who the guarantee applies to', async ({ page }) => {
  await page.goto('/');
  const r = await inApp(page, (PED) => {
    const d = (curriculum, stream, india) => ({ registration: { curriculum, stream }, preferences: { competitiveExams: india ? { India: india } : {} } });
    return {
      pcmb: PED.questions.examNeed(d('Indian', 'science-pcmb')),
      pcbOnly: PED.questions.examNeed(d('Indian', 'science-pcb')),
      pcmOnly: PED.questions.examNeed(d('Indian', 'science-pcm')),
      commerce: PED.questions.examNeed(d('Indian', 'commerce-with-maths')),
      pcbNeet: PED.questions.examNeed(d('Indian', 'science-pcb', ['NEET-UG'])),
      pcmJee: PED.questions.examNeed(d('Indian', 'science-pcm', ['JEE Main'])),
      jeeAdv: PED.questions.examNeed(d('Indian', null, ['JEE Advanced'])),
      both: PED.questions.examNeed(d('Indian', 'science-pcm', ['NEET-UG', 'JEE Main'])),
      commerceClat: PED.questions.examNeed(d('Indian', 'commerce-with-maths', ['CLAT'])),
      britishPcmb: PED.questions.examNeed(d('British', 'science-pcmb', ['NEET-UG'])),
    };
  });
  expect(r).toEqual({ pcmb: 'either', pcbOnly: null, pcmOnly: null, commerce: null, pcbNeet: 'NEET', pcmJee: 'JEE', jeeAdv: 'JEE', both: 'either', commerceClat: null, britishPcmb: null });
});

test('every simulated quiz for a PCMB visitor contains a NEET or JEE-style question, even after the aptitude swap', async ({ page }) => {
  await page.goto('/');
  const r = await inApp(page, (PED, questions) => {
    let missing = 0, dupes = 0, wrongLength = 0;
    const kinds = { neet: 0, jee: 0 };
    for (let i = 0; i < 3000; i++) {
      let picked = PED.questions.selectQuizQuestions(questions, 4, { curriculum: 'Indian', streamId: 'science-pcmb' });
      picked = PED.questions.maybeSubstituteAptitude(picked, questions);
      let ids = picked.map(q => q.id);
      ids = PED.questions.enforceExamQuestion(ids, questions, 'either', { curriculum: 'Indian', streamId: 'science-pcmb', lockedThrough: -1, answeredIds: [] });
      const qs = ids.map(id => questions.find(q => q.id === id));
      const hasNeet = qs.some(PED.questions.isNeetStyle);
      const hasJee = qs.some(PED.questions.isJeeFallback);
      if (!hasNeet && !hasJee) missing++;
      if (hasNeet) kinds.neet++;
      if (hasJee) kinds.jee++;
      if (new Set(ids).size !== ids.length) dupes++;
      if (ids.length !== 4) wrongLength++;
    }
    return { missing, dupes, wrongLength, kinds };
  });
  expect(r.missing).toBe(0);
  expect(r.dupes).toBe(0);
  expect(r.wrongLength).toBe(0);
  expect(r.kinds.neet + r.kinds.jee).toBeGreaterThan(2999);
});

test('NEET pick after question 1: earlier questions are never changed, and a stream-eligible NEET-style one is added to the remaining slots', async ({ page }) => {
  await page.goto('/');
  const r = await inApp(page, (PED, questions) => {
    let changedLocked = 0, missing = 0, ineligible = 0;
    for (let i = 0; i < 1000; i++) {
      // A PCB visitor whose quiz was built before they picked NEET, q1 already answered.
      const start = PED.questions.selectQuizQuestions(questions, 8, { curriculum: 'Indian', streamId: 'science-pcb' })
        .filter(q => !PED.questions.isNeetStyle(q)).slice(0, 4).map(q => q.id);
      const out = PED.questions.enforceExamQuestion(start, questions, 'NEET', { curriculum: 'Indian', streamId: 'science-pcb', lockedThrough: 0, answeredIds: [start[0]] });
      if (out[0] !== start[0]) changedLocked++;
      const qs = out.map(id => questions.find(q => q.id === id));
      if (!qs.some(PED.questions.isNeetStyle)) missing++;
      qs.filter(PED.questions.isNeetStyle).forEach(q => { if (!q.eligible_stream_ids.includes('science-pcb')) ineligible++; });
    }
    return { changedLocked, missing, ineligible };
  });
  expect(r).toEqual({ changedLocked: 0, missing: 0, ineligible: 0 });
});

test('a quiz that already satisfies the guarantee is left untouched; all-locked quizzes are never swapped', async ({ page }) => {
  await page.goto('/');
  const r = await inApp(page, (PED, questions) => {
    const neet = questions.find(PED.questions.isNeetStyle);
    const plain = questions.filter(q => q.curriculum === 'Indian' && !PED.questions.isNeetStyle(q) && !PED.questions.isJeeFallback(q)).slice(0, 3).map(q => q.id);
    const has = [neet.id, ...plain];
    const same = PED.questions.enforceExamQuestion(has, questions, 'NEET', { curriculum: 'Indian', streamId: null, lockedThrough: -1, answeredIds: [] });
    const locked = PED.questions.enforceExamQuestion(plain, questions, 'NEET', { curriculum: 'Indian', streamId: null, lockedThrough: 2, answeredIds: [] });
    const none = PED.questions.enforceExamQuestion(plain, questions, null, { curriculum: 'Indian' });
    return { untouched: same === has, lockedUnchanged: locked === plain, noNeedUnchanged: none === plain };
  });
  expect(r).toEqual({ untouched: true, lockedUnchanged: true, noNeedUnchanged: true });
});

test('JEE stand-in is hard-tier Indian Physics/Chemistry/Mathematics until real JEE-style questions exist', async ({ page }) => {
  await page.goto('/');
  const r = await inApp(page, (PED, questions) => {
    const taggedJee = questions.filter(PED.questions.isJeeStyle).length;
    let ok = 0;
    for (let i = 0; i < 500; i++) {
      const start = PED.questions.selectQuizQuestions(questions, 4, { curriculum: 'Indian', streamId: 'science-pcm' }).map(q => q.id);
      const ids = PED.questions.enforceExamQuestion(start, questions, 'JEE', { curriculum: 'Indian', streamId: 'science-pcm', lockedThrough: -1, answeredIds: [] });
      if (ids.map(id => questions.find(q => q.id === id)).some(PED.questions.isJeeFallback)) ok++;
    }
    return { taggedJee, ok };
  });
  expect(r.ok).toBe(500);
  expect(r.taggedJee).toBe(0);      // if this starts failing, real JEE-style questions have arrived: update the stand-in note
});

test('end to end: a visitor who picks NEET-UG gets a NEET-style question in the quiz they actually see', async ({ page }) => {
  await page.goto('/');
  await page.locator('#heroStartBtn').click();
  await expect(page.locator('#appShell')).toBeVisible();
  await page.locator('#regName').fill('Aisha Rahman');
  await page.locator('#regDob').fill('2008-05-14');
  await page.locator('#regParentMobile').fill('501234567');
  await page.locator('#regSchoolInput').fill('Delhi Private School');
  const first = page.locator('#schoolSuggestions li').first();
  if (await first.count()) await first.click();
  await page.locator('#regGrade').selectOption('stage12');
  await page.locator('#regStream').selectOption('science-pcb');
  await page.locator('#regTcs').check();
  await page.locator('#regConsent').check();
  await page.locator('#registerNextBtn').click();

  await page.locator('#quizOptions label').first().click();          // q1
  await page.locator('#qNextBtn').click();
  await page.getByText('India', { exact: true }).click();
  await page.locator('#destNextBtn').click();
  await page.locator('input[name=examPrep][value=yes]').check();
  await page.locator('#examPrepNextBtn').click();
  await page.getByText('NEET-UG', { exact: false }).first().click();
  await page.locator('#examListNextBtn').click();
  for (let i = 0; i < 3; i++) {                                         // q2..q4
    await page.locator('#quizOptions label').first().click();
    await page.locator('#qNextBtn').click();
  }
  await page.locator('#reviewSubmitBtn').click();
  await expect(page.locator('.step-heading')).toHaveText('Thank you for participating!');

  const rec = (await page.evaluate(() => window.PED.state.loadRecords()))[0];
  expect(rec.quiz.examFocus).toBe('NEET');
  const topics = rec.quiz.answers.map(a => a.topic || '');
  expect(topics.some(t => /^NEET-style/i.test(t))).toBe(true);           // recorded with the answer snapshot too
  expect(rec.quiz.selectedQuestionIds).toHaveLength(4);
});
