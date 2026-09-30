// Destination pick order: the visitor's 1st / 2nd / 3rd choice is recorded across
// the chip grid AND the "Other" search overlay, survives removals, and reaches the
// finalized record (and, via js/sync.js, the Supabase destination_1..3 columns).
const { test, expect } = require('@playwright/test');

async function toDestinations(page) {
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
  await page.locator('#regTcs').check();
  await page.locator('#regConsent').check();
  await page.locator('#registerNextBtn').click();
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click();
  await expect(page.locator('#stepContent h2')).toHaveText('Where could your next chapter begin?');
}

const order = page => page.evaluate(() => JSON.parse(localStorage.getItem('pedagogy-expo-draft')).preferences.destinationOrder);

test('destination order follows pick order across chip grid and Other overlay, and survives removals', async ({ page }) => {
  await toDestinations(page);

  await page.getByText('United Kingdom', { exact: true }).click();                       // 1st: grid
  expect(await order(page)).toEqual(['United Kingdom']);

  await page.getByText('Other', { exact: true }).click();                    // 2nd: overlay
  await page.locator('#countrySearchInput').fill('Japan');
  await page.locator('#countrySearchResults li', { hasText: 'Japan' }).first().click();
  expect(await order(page)).toEqual(['United Kingdom', 'Japan']);

  await page.getByText('India', { exact: true }).click();                    // 3rd: grid again
  expect(await order(page)).toEqual(['United Kingdom', 'Japan', 'India']);               // NOT grid-first ['United Kingdom','India','Japan']

  // Remove the middle pick (overlay pill): order closes up, no gaps.
  await page.locator('.removable-pill-x').first().click();
  expect(await order(page)).toEqual(['United Kingdom', 'India']);

  // A new pick goes to the end; deselecting the first promotes the rest.
  await page.getByText('Germany', { exact: true }).click();
  expect(await order(page)).toEqual(['United Kingdom', 'India', 'Germany']);
  await page.getByText('United Kingdom', { exact: true }).click();
  expect(await order(page)).toEqual(['India', 'Germany']);
});

test('the finalized record carries destinationOrder (and it is what gets synced)', async ({ page }) => {
  await toDestinations(page);
  await page.getByText('India', { exact: true }).click();
  await page.getByText('United Kingdom', { exact: true }).click();
  await page.locator('#destNextBtn').click();
  await page.locator('input[name=examPrep][value=no]').check();
  await page.locator('#examPrepNextBtn').click();
  for (let i = 0; i < 3; i++) {
    await page.locator('#quizOptions label').first().click();
    await page.locator('#qNextBtn').click();
  }
  await page.locator('#reviewSubmitBtn').click();
  await expect(page.locator('.step-heading')).toHaveText('Thank you for participating!');
  const [rec] = await page.evaluate(() => window.PED.state.loadRecords());
  expect(rec.preferences.destinationOrder).toEqual(['India', 'United Kingdom']);
});

test('reconcileDestinationOrder handles drafts that predate the field (grid picks, then overlay picks)', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(() => {
    const prefs = { destinations: ['United Kingdom', 'Other', 'India'], destinationsOther: ['Japan'] };   // no destinationOrder
    return window.PED.state.reconcileDestinationOrder(prefs);
  });
  expect(result).toEqual(['United Kingdom', 'India', 'Japan']);
});
