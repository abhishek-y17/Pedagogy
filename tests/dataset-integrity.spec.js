// Committed permanently (an earlier ad-hoc version of this check was run once
// and deleted — that was a mistake; this is the guard against the failure mode
// most likely to bite on a Monday-night rehearsal: a dataset silently ending up
// empty and the app limping along with e.g. no schools in the autocomplete).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('an empty dataset throws loudly instead of letting the app silently boot', async ({ page }) => {
  const realPath = path.join(__dirname, '..', 'js', 'generated', 'data.js');
  const real = fs.readFileSync(realPath, 'utf8');
  const broken = real.replace(/QUESTION_BANK: \{.*?\},\n/s, 'QUESTION_BANK: {"questions":[]},\n');
  expect(broken, 'test setup: the QUESTION_BANK replace did not match — update this test\'s regex').not.toEqual(real);

  await page.route('**/js/generated/data.js', route => {
    route.fulfill({ contentType: 'application/javascript', body: broken });
  });

  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  await page.goto('/');
  await page.locator('#heroStartBtn').click();
  await page.waitForTimeout(500);

  const fatal = errors.find(e => e.includes('FATAL') && e.includes('question_bank'));
  expect(fatal, `expected a FATAL question_bank error, got: ${JSON.stringify(errors)}`).toBeTruthy();

  // and the app must NOT have silently rendered a step as if nothing were wrong
  await expect(page.locator('#stepContent h2')).toHaveCount(0);
});

// Added with the real question-bank merge (scripts/merge-question-bank.js):
// uae_moe/ and uae_moe_current/ are the same 60 questions per subject, unioned
// on eligible_stream_ids rather than kept as 1,200 duplicate records — this
// guards that the union actually happened (600 original records, full
// 4-stream coverage) rather than silently regressing to one export or the
// other. Round E, 2026-09-23: the additive question-bank delivery (item 7)
// added its own 720 UAE MoE PCMB-core records (Physics/Chemistry/Maths/
// Biology, 180 each) on top, also with full 4-stream coverage — so the live
// total is 600 + 720 = 1,320, not 600.
test('UAE MoE question bank is the 600-record union plus the round-E additive 720, with full stream coverage throughout', async ({ page }) => {
  await page.goto('/');
  const uae = await page.evaluate(() =>
    window.PED.GENERATED.QUESTION_BANK.questions.filter(q => q.curriculum === 'UAE MoE')
  );
  expect(uae.length).toBe(1320);

  const allStreamIds = new Set(['general', 'advanced', 'professional', 'elite']);
  const fullUnionCount = uae.filter(q =>
    q.eligible_stream_ids.length === 4 && q.eligible_stream_ids.every(s => allStreamIds.has(s))
  ).length;
  // Every uae_moe/ record already carried all 4 streams before the union step
  // (uae_moe_current/'s general+advanced is a subset), and the additive
  // delivery's own UAE MoE records do too — so the union/merge should
  // preserve that for every one of the 1,320.
  expect(fullUnionCount).toBe(1320);

  const ids = new Set(uae.map(q => q.id));
  expect(ids.size).toBe(1320); // no duplicate ids smuggled in from either export
});

// Round E item 7: a second, separate delivery (data/additional_question_bank/,
// merged additively by scripts/merge-question-bank.js) landed on top of the
// original 4,320-question bank specifically to fix thin 11th-standard PCM/PCB
// coverage. This guards the merge actually happened as an addition (10,080
// total = 4,320 original + 5,760 new) rather than silently regressing to one
// delivery or the other, and that no id collided (the additive bank's IDs
// start at 201 specifically to avoid the original bank's ranges — verified,
// not just trusted, during the merge; see RUN_LOG.md).
test('the round-E additive question-bank merge landed the full 5,760 new records with zero id collisions', async ({ page }) => {
  await page.goto('/');
  const questions = await page.evaluate(() => window.PED.GENERATED.QUESTION_BANK.questions);
  expect(questions.length).toBe(10080);
  const ids = new Set(questions.map(q => q.id));
  expect(ids.size).toBe(10080); // no id collided between the two deliveries

  const pcmbCore = questions.filter(q =>
    ['Indian', 'IB', 'British', 'American', 'UAE MoE', 'SABIS'].includes(q.curriculum) &&
    /physics|chemistry|biology|math|calculus|precalculus|statistics|analysis|applications/i.test(q.subject)
  );
  // Sanity floor, not an exact count (the original bank also has PCMB-core
  // questions) — just confirms the additive 60/60/60-per-subject core is
  // really in there, not merely present in the source folder.
  expect(pcmbCore.length).toBeGreaterThan(4000);
});

// Round E item 9b (codexreview.md finding, re-checked after the item 7
// merge): even after that merge, a handful of real streams still have zero
// eligible questions of their own (IB groups 1/2/6 and American's Capstone/
// Arts/English/World Languages — none of the delivered banks cover language/
// literature/arts subjects). Before this fix, those visitors silently got
// questions from a DIFFERENT, irrelevant subject in the same curriculum
// (e.g. an IB Arts-group visitor served a Biology question) — this proves
// the fix instead: an empty stream now gets curriculum-neutral Aptitude
// questions, never a wrong-subject one.
test('a stream with zero eligible questions of its own gets Aptitude-pool questions, never a different, irrelevant subject in the same curriculum', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(() => {
    const curriculumSubjects = window.PED.GENERATED.CURRICULUM_SUBJECTS;
    const questions = window.PED.questions.loadQuestionBank(window.PED.GENERATED.QUESTION_BANK, curriculumSubjects);
    // IB group6 (The Arts) has no eligible questions in either delivered bank.
    const eligibleForGroup6 = window.PED.questions.getEligibleQuestions(questions, { curriculum: 'IB', streamId: 'group6' });
    const selected = window.PED.questions.selectQuizQuestions(questions, 4, { curriculum: 'IB', streamId: 'group6' });
    return { eligibleForGroup6Count: eligibleForGroup6.length, curricula: selected.map(q => q.curriculum) };
  });
  expect(result.eligibleForGroup6Count).toBe(0); // confirms this really is the known-empty case being tested
  expect(result.curricula.every(c => c === 'Aptitude')).toBe(true);
});

test('maybeSubstituteAptitude swaps exactly one slot into the Aptitude pool when the roll succeeds, and never changes count', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(() => {
    const bank = window.PED.GENERATED.QUESTION_BANK.questions;
    const curriculumSubjects = window.PED.GENERATED.CURRICULUM_SUBJECTS;
    const questions = window.PED.questions.loadQuestionBank(window.PED.GENERATED.QUESTION_BANK, curriculumSubjects);
    const selected = window.PED.questions.selectQuizQuestions(questions, 5, { curriculum: 'Indian', streamId: 'science-pcm' });
    const originalIds = selected.map(q => q.id);

    // Forced roll: first rng() call < 1/3 fires the substitution; subsequent
    // calls pick slot 0 and a fixed pool index deterministically.
    let call = 0;
    const seededRng = () => {
      call++;
      if (call === 1) return 0; // fires the 1-in-3 coin flip
      if (call === 2) return 0; // slot 0
      return 0; // first Aptitude question in the pool
    };
    const swapped = window.PED.questions.maybeSubstituteAptitude(selected, questions, seededRng);

    // Unforced roll: rng always returns just-under-1 so the coin flip never fires.
    const untouched = window.PED.questions.maybeSubstituteAptitude(selected, questions, () => 0.999);

    return {
      originalIds,
      swappedIds: swapped.map(q => q.id),
      swappedCurricula: swapped.map(q => q.curriculum),
      untouchedIds: untouched.map(q => q.id),
    };
  });

  expect(result.swappedIds.length).toBe(5);
  expect(result.untouchedIds).toEqual(result.originalIds); // no-fire path leaves selection untouched
  expect(result.swappedCurricula.filter(c => c === 'Aptitude').length).toBe(1); // exactly one slot substituted
  expect(result.swappedIds[0]).not.toBe(result.originalIds[0]); // slot 0 was the one replaced
});
