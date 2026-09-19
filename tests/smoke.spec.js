const { test, expect } = require('@playwright/test');

test('index.html loads with no console errors and boots the state machine', async ({ page }) => {
  const errors = [];
  page.on('pageerror', err => errors.push(err.message));
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/');
  await expect(page).toHaveTitle(/Pedagogy/);
  await expect(page.locator('.brand-mark')).toBeVisible();

  await page.waitForFunction(() => {
    return [...document.querySelectorAll('main [data-view-panel]')].length > 0;
  });

  await page.getByRole('button', { name: 'Staff' }).click();
  await expect(page.locator('#view-staff')).toBeVisible();
  await expect(page.locator('#view-home')).toBeHidden();

  expect(errors, `console/page errors: ${errors.join('\n')}`).toEqual([]);
});
