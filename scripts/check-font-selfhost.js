// One-off empirical check (not part of the app or the committed test suite,
// same pattern as check-file-protocol.js): does the hero headline's Anton
// display face actually render from the self-hosted assets/fonts/ file, with
// zero dependency on Google Fonts or any other network font host? Blocks
// every request to a font-CDN-shaped domain and opens the page over file://
// (worst case for a stall device with no venue network) in real installed
// Chrome and Edge, then reads the hero title's *actually resolved* font
// family from the browser itself rather than trusting the CSS declaration.
// Run manually: node scripts/check-font-selfhost.js
'use strict';
const { chromium } = require('@playwright/test');
const path = require('path');

const fileUrl = 'file://' + path.join(__dirname, '..', 'index.html').replace(/\\/g, '/');
const BLOCKED_HOST_PATTERNS = [/fonts\.googleapis\.com/, /fonts\.gstatic\.com/, /googletagmanager/, /google-analytics/];

async function checkWith(channel) {
  console.log(`\n=== ${channel} @ ${fileUrl} (external font/network hosts blocked) ===`);
  let browser;
  try {
    browser = await chromium.launch({ channel });
  } catch (e) {
    console.log(`(could not launch channel "${channel}": ${e.message})`);
    return;
  }
  const page = await browser.newPage();
  const blockedAttempts = [];
  await page.route('**/*', route => {
    const url = route.request().url();
    if (BLOCKED_HOST_PATTERNS.some(re => re.test(url))) {
      blockedAttempts.push(url);
      return route.abort();
    }
    return route.continue();
  });
  const errors = [];
  page.on('pageerror', err => errors.push(`[pageerror] ${err.message}`));
  page.on('console', msg => { if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`); });

  await page.goto(fileUrl);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);

  const resolvedFont = await page.evaluate(() => {
    const el = document.querySelector('.hero-title');
    return el ? getComputedStyle(el).fontFamily : '(no .hero-title found)';
  });
  const fontLoaded = await page.evaluate(() => Array.from(document.fonts).some(f => f.family === 'Anton' && f.status === 'loaded'));

  console.log(`Resolved .hero-title font-family: ${resolvedFont}`);
  console.log(`"Anton" reports status "loaded" in document.fonts: ${fontLoaded}`);
  console.log(`Requests to a blocked font/analytics host attempted: ${blockedAttempts.length}`);
  blockedAttempts.forEach(u => console.log(`  -> ${u}`));
  errors.forEach(e => console.log(e));
  console.log(errors.length === 0 && blockedAttempts.length === 0 && fontLoaded ? 'PASS' : 'CHECK OUTPUT ABOVE');

  await browser.close();
}

(async () => {
  await checkWith('chrome');
  await checkWith('msedge');
})();
