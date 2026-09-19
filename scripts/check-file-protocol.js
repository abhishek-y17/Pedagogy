// One-off empirical check (not part of the app or the committed test suite):
// does index.html work when opened directly via file://, as decision 4a claimed?
// Run manually: node scripts/check-file-protocol.js
'use strict';
const { chromium } = require('@playwright/test');
const path = require('path');

const fileUrl = 'file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');

async function checkWith(channel) {
  console.log(`\n=== ${channel} @ ${fileUrl} ===`);
  let browser;
  try {
    browser = await chromium.launch({ channel });
  } catch (e) {
    console.log(`(could not launch channel "${channel}": ${e.message})`);
    return;
  }
  const page = await browser.newPage();
  const logs = [];
  page.on('console', msg => logs.push(`[console.${msg.type()}] ${msg.text()}`));
  page.on('pageerror', err => logs.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', req => logs.push(`[requestfailed] ${req.url()} -> ${req.failure()?.errorText}`));
  await page.goto(fileUrl);
  await page.waitForTimeout(1500);
  const stepIdText = await page.locator('#stepIdLabel').textContent().catch(() => '(locator failed)');
  logs.forEach(l => console.log(l));
  console.log(`#stepIdLabel text content: "${stepIdText}"`);
  await browser.close();
}

(async () => {
  await checkWith('chrome');
  await checkWith('msedge');
})();
