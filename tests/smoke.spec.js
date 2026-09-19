const { test, expect } = require('@playwright/test');

test('index.html loads with no console errors, datasets validate, state machine boots', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await expect(page).toHaveTitle(/Pedagogy/);
  await expect(page.locator('.brand-mark')).toBeVisible();

  await expect(page.locator('#stepIdLabel')).toHaveText('register');
  await expect(page.locator('#stepProgress')).toHaveText('Step 1 / 12');

  // Font stack is carried forward from reference/pedagogy-expo-v2.html as a
  // system-ui stack (no @font-face / CDN font, so there is no network fetch that
  // could silently fail) — confirm the declared stack is actually the one applied,
  // not some unrelated browser default.
  const fontFamily = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
  expect(fontFamily.toLowerCase()).toContain('system-ui');

  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});

test('step navigator moves forward and back through the full-path order', async ({ page }) => {
  await page.goto('/');
  const stepId = page.locator('#stepIdLabel');
  const back = page.locator('#stepBackBtn');
  const next = page.locator('#stepNextBtn');

  await expect(stepId).toHaveText('register');
  await expect(back).toBeDisabled();

  await next.click();
  await expect(stepId).toHaveText('q1');
  await next.click();
  await expect(stepId).toHaveText('destinations');
  await next.click();
  await expect(stepId).toHaveText('examPrep');
  // competitiveExamPrep is unanswered -> examList must be skipped
  await next.click();
  await expect(stepId).toHaveText('game1');

  await back.click();
  await expect(stepId).toHaveText('examPrep');
});

test('draft persists across a reload (survives a backgrounded-tab discard)', async ({ page }) => {
  await page.goto('/');
  await page.locator('#stepNextBtn').click();
  await expect(page.locator('#stepIdLabel')).toHaveText('q1');

  await page.reload();
  await expect(page.locator('#stepIdLabel')).toHaveText('q1');
});

test('staff dashboard has no visible nav entry and requires long-press + PIN', async ({ page }) => {
  await page.goto('/');
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

test('new visitor reset clears the draft back to the first step', async ({ page }) => {
  await page.goto('/');
  await page.locator('#stepNextBtn').click();
  await page.locator('#stepNextBtn').click();
  await expect(page.locator('#stepIdLabel')).toHaveText('destinations');

  page.once('dialog', dialog => dialog.accept());
  await page.locator('#newVisitorBtn').click();

  await expect(page.locator('#stepIdLabel')).toHaveText('register');
  await page.reload();
  await expect(page.locator('#stepIdLabel')).toHaveText('register');
});
