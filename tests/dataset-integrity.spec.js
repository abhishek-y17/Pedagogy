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
