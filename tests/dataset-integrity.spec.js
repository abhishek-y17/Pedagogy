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
// guards that the union actually happened (600 records, full 4-stream coverage)
// rather than silently regressing to one export or the other.
test('UAE MoE question bank is a 600-record union, not 1,200 duplicated records, with full stream coverage', async ({ page }) => {
  await page.goto('/');
  const uae = await page.evaluate(() =>
    window.PED.GENERATED.QUESTION_BANK.questions.filter(q => q.curriculum === 'UAE MoE')
  );
  expect(uae.length).toBe(600);

  const allStreamIds = new Set(['general', 'advanced', 'professional', 'elite']);
  const fullUnionCount = uae.filter(q =>
    q.eligible_stream_ids.length === 4 && q.eligible_stream_ids.every(s => allStreamIds.has(s))
  ).length;
  // Every uae_moe/ record already carried all 4 streams before the union step
  // (uae_moe_current/'s general+advanced is a subset), so the union should
  // preserve that for every record.
  expect(fullUnionCount).toBe(600);

  const ids = new Set(uae.map(q => q.id));
  expect(ids.size).toBe(600); // no duplicate ids smuggled in from the alternate export
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
