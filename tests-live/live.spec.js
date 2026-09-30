// Real browser + REAL Supabase (see playwright.live.config.js). Every row it
// creates is named "ZZ TEST ..." — delete afterwards with:
//   delete from public.registrations where name like 'ZZ TEST%';
// Staff read-back needs STAFF_EMAIL / STAFF_PASSWORD env vars (never stored).
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { buildConfig, parseEnvFile } = require('../scripts/build-config.js');

const cfg = buildConfig(process.env, parseEnvFile(path.join(__dirname, '..', '.env.local')));
const { STAFF_EMAIL, STAFF_PASSWORD } = process.env;
// letters only: the app's name field (rightly) strips digits from names
const RUN = Date.now().toString(36).replace(/[0-9]/g, c => 'abcdefghij'[Number(c)]);
const bank = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'question_bank.json'), 'utf8')).questions;

async function sb(pathname, { method = 'GET', body, token } = {}) {
  const res = await fetch(cfg.supabaseUrl + pathname, {
    method,
    headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${token || cfg.supabaseAnonKey}`, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
async function staffToken() {
  test.skip(!STAFF_EMAIL || !STAFF_PASSWORD, 'STAFF_EMAIL / STAFF_PASSWORD not set');
  const r = await sb('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: STAFF_EMAIL, password: STAFF_PASSWORD } });
  expect(r.status, 'staff login').toBe(200);
  return r.json.access_token;
}

async function register(page, { name, grade, parentLocal }) {
  await page.goto('/');
  await page.locator('#heroStartBtn').click();
  await expect(page.locator('#appShell')).toBeVisible();
  await page.locator('#regName').fill(name);
  await page.locator('#regDob').fill('2008-05-14');
  await page.locator('#regParentMobile').fill(parentLocal);
  await page.locator('#regSchoolInput').fill('Delhi Private School');
  const first = page.locator('#schoolSuggestions li').first();
  if (await first.count()) await first.click();
  await page.locator('#regGrade').selectOption(grade);
  await page.locator('#regTcs').check();
  await page.locator('#regConsent').check();
}

const localRecords = page => page.evaluate(() => window.PED.state.loadRecords());
const uniquePhone = () => `50${String(Date.now()).slice(-7)}`;

test('config sanity: the built app really points at the live project', async ({ page }) => {
  expect(cfg.supabaseUrl).toMatch(/supabase\.co$/);
  await page.goto('/');
  expect(await page.evaluate(() => window.PED.sync.isEnabled())).toBe(true);
});

test('full 11th/12th path in a real browser lands in Supabase with every field and every quiz answer', async ({ page }) => {
  const token = await staffToken();
  const name = `ZZ TEST Browser ${RUN}`;
  const phone = uniquePhone();
  await register(page, { name, grade: 'stage12', parentLocal: phone });
  await page.locator('#registerNextBtn').click();

  // q1: answer, q2: skip, q3/q4: answer
  await page.locator('#quizOptions label').first().click();
  await page.locator('#qNextBtn').click();
  await expect(page.locator('#stepContent h2')).toHaveText('Where could your next chapter begin?');
  // pick order: UK first, then Japan via the Other search overlay, then India
  await page.getByText('United Kingdom', { exact: true }).click();
  await page.getByText('Other', { exact: true }).click();
  await page.locator('#countrySearchInput').fill('Japan');
  await page.locator('#countrySearchResults li', { hasText: 'Japan' }).first().click();
  await page.getByText('India', { exact: true }).click();
  await page.locator('#destNextBtn').click();
  await page.locator('input[name=examPrep][value=yes]').check();
  await page.locator('#examPrepNextBtn').click();
  await page.locator('#stepContent .chips label').first().click();
  await page.locator('#examListNextBtn').click();

  await expect(page.locator('#quizOptions')).toBeVisible();      // q2 -> skip
  await page.locator('#qSkipBtn').click();
  await page.locator('.modal-actions button', { hasText: 'Skip anyway' }).click();
  await expect(page.locator('#quizOptions')).toBeVisible();      // q3
  await page.locator('#quizOptions label').nth(1).click();
  await page.locator('#qNextBtn').click();
  await expect(page.locator('#quizOptions')).toBeVisible();      // q4
  await page.locator('#quizOptions label').nth(2).click();
  await page.locator('#qNextBtn').click();

  await expect(page.locator('#stepContent h2')).toHaveText('Review everything before you submit.');
  await page.locator('#reviewSubmitBtn').click();
  await expect(page.locator('.step-heading')).toHaveText('Thank you for participating!');

  // Visitor saw success immediately; background sync must then mark it synced.
  await expect.poll(async () => (await localRecords(page))[0].meta.synced, { timeout: 20000 }).toBe(true);
  const [local] = await localRecords(page);

  const rows = (await sb(`/rest/v1/registrations?select=*&id=eq.${local.meta.id}`, { token })).json;
  expect(rows).toHaveLength(1);
  const row = rows[0];
  const r = local.registration, p = local.preferences;

  expect(row.name).toBe(name);
  expect(row.dob).toBe('2008-05-14');
  expect(row.parent_mobile).toBe(r.parentMobile);
  expect(row.parent_mobile).toBe(`+971${phone}`);
  expect(row.school).toBe(r.school);
  expect(row.school_key).toBe(r.schoolKey);
  expect(row.curriculum).toBe(r.curriculum);
  expect(row.grade).toBe('stage12');
  expect(row.mode).toBe('full');
  expect(row.device_id).toBe(local.meta.deviceId);
  expect(row.tcs_accepted && row.consent_to_contact && row.marketing_opt_in).toBe(true);
  expect(new Date(row.tcs_accepted_at).toISOString()).toBe(r.tcsAcceptedAt);
  expect(new Date(row.consent_to_contact_at).toISOString()).toBe(r.consentToContactAt);
  expect(row.destinations).toEqual(p.destinations);
  expect(row.competitive_exam_prep).toBe('yes');
  expect(row.competitive_exams).toEqual(p.competitiveExams);
  expect(Object.keys(row.competitive_exams).length).toBeGreaterThan(0);
  expect([row.destination_1, row.destination_2, row.destination_3]).toEqual(['United Kingdom', 'Japan', 'India']);
  expect(row.destination_order).toEqual(['United Kingdom', 'Japan', 'India']);
  expect(row.quiz.selectedQuestionIds).toEqual(local.quiz.selectedQuestionIds);
  expect(row.quiz.selectedQuestionIds).toHaveLength(4);
  expect(row.quiz.answers).toEqual(local.quiz.answers);
  expect(row.raw.meta.id).toBe(local.meta.id);

  // Answers as rows: what was asked, what was picked, correctness, status.
  const ans = (await sb(`/rest/v1/registration_answers?select=*&registration_id=eq.${local.meta.id}&order=position.asc`, { token })).json;
  expect(Array.isArray(ans), 'registration_answers table exists (run migration 0002)').toBe(true);
  expect(ans).toHaveLength(4);
  ans.forEach((a, i) => {
    const q = bank.find(x => x.id === local.quiz.selectedQuestionIds[i]);
    const given = local.quiz.answers.find(x => x.questionId === q.id);
    expect(a.question_id).toBe(q.id);
    expect(a.question).toBe(q.q);
    expect(a.options).toEqual(q.options);
    expect(a.correct_answer).toBe(q.answer);
    expect(a.subject).toBe(q.subject);
    expect(a.difficulty).toBe(q.difficulty);
    expect(a.curriculum).toBe(q.curriculum);
    expect(a.selected).toBe(given.selected);
    expect(a.is_correct).toBe(given.selected == null ? null : given.selected === q.answer);
    expect(a.status).toBe(given.selected != null ? 'answered' : (given.skipped ? 'skipped' : 'unanswered'));
  });
  expect(ans.map(a => a.status)).toContain('skipped');
  expect(ans.filter(a => a.status === 'answered').length).toBeGreaterThanOrEqual(3);
});

test('grade 9 direct-submit path syncs too', async ({ page }) => {
  const token = await staffToken();
  const name = `ZZ TEST Grade9 ${RUN}`;
  await register(page, { name, grade: 'stage9', parentLocal: uniquePhone() });
  await page.locator('#registerNextBtn').click();
  await expect(page.locator('.submitted-confirm')).toBeVisible();
  await expect.poll(async () => (await localRecords(page))[0].meta.synced, { timeout: 20000 }).toBe(true);
  const [local] = await localRecords(page);
  const rows = (await sb(`/rest/v1/registrations?select=id,name,grade,quiz&id=eq.${local.meta.id}`, { token })).json;
  expect(rows[0]).toMatchObject({ name, grade: 'stage9' });
  expect(rows[0].quiz.selectedQuestionIds).toEqual([]);
});

test('submitting while the network is OFF succeeds locally, then syncs when it returns (real backend)', async ({ page, context }) => {
  const token = await staffToken();
  const name = `ZZ TEST Offline ${RUN}`;
  await register(page, { name, grade: 'stage10', parentLocal: uniquePhone() });
  await context.setOffline(true);
  await page.locator('#registerNextBtn').click();
  await expect(page.locator('.submitted-confirm')).toBeVisible();      // visitor is never blocked
  let [local] = await localRecords(page);
  expect(local.meta.synced).toBe(false);
  await page.waitForTimeout(1500);
  expect((await localRecords(page))[0].meta.synced).toBe(false);       // still queued while offline

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await localRecords(page))[0].meta.synced, { timeout: 20000 }).toBe(true);
  const rows = (await sb(`/rest/v1/registrations?select=id&id=eq.${local.meta.id}`, { token })).json;
  expect(rows).toHaveLength(1);                                         // exactly once
});

test('staff dashboard in the real UI: sign-in, sees test records from every device, sign-out', async ({ page }) => {
  await staffToken();
  await page.goto('/');
  await page.locator('#heroStartBtn').click();
  await expect(page.locator('#appShell')).toBeVisible();
  const box = await page.locator('.brand-mark').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1000);
  await page.mouse.up();

  await page.locator('#staffEmail').fill(STAFF_EMAIL);
  await page.locator('#staffPassword').fill('definitely-wrong');
  await page.locator('#staffLoginBtn').click();
  await expect(page.locator('#staffLoginError')).toContainText('Incorrect email or password');

  await page.locator('#staffPassword').fill(STAFF_PASSWORD);
  await page.locator('#staffLoginBtn').click();
  await expect(page.locator('.staff-record').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('#view-staff')).toContainText(`ZZ TEST Browser ${RUN}`);    // submitted from a different browser context
  await page.locator('#staffSignOutBtn').click();
  await expect(page.locator('#staffLoginForm')).toBeVisible();
});
