// Supabase sync layer (js/sync.js): outbox, retries, staff auth. Every network
// call is mocked with page.route — these tests never touch a real project (and
// playwright.config.js serves an EMPTY config unless a test injects one here).
const { test, expect } = require('@playwright/test');

const SB = 'https://test-project.supabase.co';
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
};

/** Serve a fake config so the app believes Supabase is configured. */
async function withBackend(page) {
  await page.route('**/js/generated/config.js', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.PED_CONFIG = ${JSON.stringify({ supabaseUrl: SB, supabaseAnonKey: 'anon-key-'.padEnd(40, 'x') })};`,
  }));
}

/** Mock the Supabase HTTP surface. `state` is mutable so a test can flip the
 * server "down"/"rejecting" mid-run; `calls` records every request. */
async function mockSupabase(page, state) {
  const calls = [];
  await page.route(`${SB}/**`, async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const url = new URL(req.url());
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    calls.push({ path: url.pathname, method: req.method(), headers: req.headers(), body, search: url.search });
    const json = (status, data) => route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(data) });

    if (url.pathname === '/rest/v1/rpc/submit_registration') {
      if (state.down) return route.abort('failed');
      if (state.serverError) return json(500, { message: 'boom' });
      if (state.reject) return json(400, { message: 'invalid_payload: bad id' });
      const id = body.payload.meta.id;
      return json(200, { id, duplicate_flag: !!state.duplicate, duplicate_of_ids: state.duplicate ? ['P-other-device'] : [], already_existed: false });
    }
    if (url.pathname === '/auth/v1/token') {
      if (body.password !== 'right-password') return json(400, { error_description: 'Invalid login credentials' });
      return json(200, { access_token: `jwt-for-${body.email}`, refresh_token: 'refresh', expires_in: 3600, user: { email: body.email } });
    }
    if (url.pathname === '/auth/v1/logout') return json(204, null);
    if (url.pathname === '/rest/v1/rpc/is_staff') return json(200, req.headers().authorization.includes('staff@'));
    if (url.pathname === '/rest/v1/registrations') return json(200, state.rows || []);
    if (url.pathname === '/rest/v1/rpc/resolve_duplicate') { state.resolved = body; return json(200, 2); }
    return json(404, { message: 'unmocked ' + url.pathname });
  });
  return calls;
}

async function submitGrade9(page, name) {
  await page.goto('/');
  await page.locator('#heroStartBtn').click();
  await expect(page.locator('#appShell')).toBeVisible();
  await page.locator('#regName').fill(name || 'Aisha Rahman');
  await page.locator('#regDob').fill('2009-05-14');
  await page.locator('#regParentMobile').fill('501234567');
  await page.locator('#regSchoolInput').fill('Delhi Private School');
  const firstSuggestion = page.locator('#schoolSuggestions li').first();
  if (await firstSuggestion.count()) await firstSuggestion.click();
  await page.locator('#regGrade').selectOption('stage9');
  await page.locator('#regTcs').check();
  await page.locator('#regConsent').check();
  await page.locator('#registerNextBtn').click();
  await expect(page.locator('.submitted-confirm')).toBeVisible();
}

const records = page => page.evaluate(() => window.PED.state.loadRecords());
const rpcCalls = calls => calls.filter(c => c.path === '/rest/v1/rpc/submit_registration');

test('submit saves locally at once and then syncs to Supabase with only the anon key', async ({ page }) => {
  await withBackend(page);
  const calls = await mockSupabase(page, {});
  await submitGrade9(page);
  await expect.poll(async () => (await records(page))[0].meta.synced).toBe(true);

  const [call] = rpcCalls(calls);
  expect(call.headers.apikey).toContain('anon-key-');
  expect(call.body.payload.registration.name).toBe('Aisha Rahman');
  expect(call.body.payload.registration.parentMobile).toBe('+971501234567');
  expect(call.body.payload.meta.id).toMatch(/^P-/);
  expect(call.body.payload.meta.deviceId).toMatch(/^D-/);
  // device-local bookkeeping never leaves the device
  expect(call.body.payload.meta).not.toHaveProperty('synced');
  expect(rpcCalls(calls)).toHaveLength(1);
});

test('offline submit still succeeds for the visitor; the outbox recovers when the network returns, without duplicates', async ({ page }) => {
  await withBackend(page);
  const state = { down: true };
  const calls = await mockSupabase(page, state);
  await submitGrade9(page);

  // Visitor saw success; record is safe locally but not synced.
  let [rec] = await records(page);
  expect(rec.meta.synced).toBe(false);
  expect(await page.evaluate(() => window.PED.sync.getStatus().unsynced)).toBe(1);

  // Still down: a manual flush keeps it queued.
  await page.evaluate(() => window.PED.sync.flushOutbox());
  expect((await records(page))[0].meta.synced).toBe(false);

  // Network back: the browser `online` event drains the outbox.
  state.down = false;
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect.poll(async () => (await records(page))[0].meta.synced).toBe(true);

  // Further flushes send nothing more for that record.
  const sent = rpcCalls(calls).length;
  await page.evaluate(() => window.PED.sync.flushOutbox());
  expect(rpcCalls(calls)).toHaveLength(sent);
});

test('a 5xx keeps the record queued for retry; a 4xx marks it rejected and stops retrying it', async ({ page }) => {
  await withBackend(page);
  const state = { serverError: true };
  const calls = await mockSupabase(page, state);
  await submitGrade9(page);
  await page.evaluate(() => window.PED.sync.flushOutbox());
  let [rec] = await records(page);
  expect(rec.meta.synced).toBe(false);
  expect(rec.meta.syncError).toBeNull();               // transient: still retryable

  state.serverError = false; state.reject = true;
  await page.evaluate(() => window.PED.sync.flushOutbox());
  [rec] = await records(page);
  expect(rec.meta.synced).toBe(false);
  expect(rec.meta.syncError).toContain('invalid_payload');

  const before = rpcCalls(calls).length;
  await page.evaluate(() => window.PED.sync.flushOutbox());
  expect(rpcCalls(calls)).toHaveLength(before);          // not hammered again
  const status = await page.evaluate(() => window.PED.sync.getStatus());
  expect(status).toMatchObject({ unsynced: 0, rejected: 1 });
});

test('the server\'s cross-device duplicate verdict is merged into the local record', async ({ page }) => {
  await withBackend(page);
  await mockSupabase(page, { duplicate: true });
  await submitGrade9(page);
  await expect.poll(async () => (await records(page))[0].meta.synced).toBe(true);
  const [rec] = await records(page);
  expect(rec.meta.duplicateFlag).toBe(true);
  expect(rec.meta.duplicateOfIds).toContain('P-other-device');
  expect(rec.meta.duplicateReviewStatus).toBe('pending');
});

test('legacy local records (no synced flag) are never auto-pushed', async ({ page }) => {
  await withBackend(page);
  const calls = await mockSupabase(page, {});
  await page.addInitScript(() => {
    localStorage.setItem('pedagogy-expo-records', JSON.stringify([{
      schema: 'pedagogy.v11', registration: { name: 'Old Rehearsal' }, preferences: {}, quiz: {},
      meta: { id: 'P-legacy-0001', createdAt: '2026-09-19T10:00:00.000Z' },
    }]));
  });
  await page.goto('/');
  await page.evaluate(() => window.PED.sync.flushOutbox());
  expect(rpcCalls(calls)).toHaveLength(0);
});

test('without config the app is local-only and makes no Supabase requests', async ({ page }) => {
  const hits = [];
  page.on('request', r => { if (r.url().includes('supabase.co')) hits.push(r.url()); });
  await submitGrade9(page);
  const [rec] = await records(page);
  expect(rec.meta.synced).toBe(false);
  expect(await page.evaluate(() => window.PED.sync.isEnabled())).toBe(false);
  expect(hits).toEqual([]);
});

// --- staff -----------------------------------------------------------------

async function longPressLogo(page) {
  await expect(page.locator('#appShell')).toBeVisible();
  const box = await page.locator('.brand-mark').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1000);
  await page.mouse.up();
}

function serverRow(id, name, extra) {
  return {
    id, created_at: '2026-10-11T08:00:00Z', submitted_at: '2026-10-11T08:00:00Z', device_id: 'D-aaaa1111',
    duplicate_flag: false, duplicate_of_ids: [], duplicate_review_status: null,
    raw: {
      mode: 'full',
      registration: { name, dob: '2009-05-14', parentMobile: '+971501234567', studentMobile: null, school: 'X School', curriculum: 'Indian', grade: 'stage11', stream: null, tcsAccepted: true, tcsAcceptedAt: '2026-10-11T08:00:00Z', consentToContact: true, consentToContactAt: '2026-10-11T08:00:00Z', marketingOptIn: true, marketingOptInAt: '2026-10-11T08:00:00Z' },
      preferences: { destinations: ['UK'], destinationsOther: [] },
      quiz: { selectedQuestionIds: ['q1'], answers: [] },
      meta: { id },
    },
    ...extra,
  };
}

test('staff sign-in uses Supabase Auth (no PIN), rejects bad/non-staff accounts, and reads every device\'s records', async ({ page }) => {
  await withBackend(page);
  const state = { rows: [serverRow('P-1', 'Remote Visitor One'), serverRow('P-2', 'Remote Visitor Two', { device_id: 'D-bbbb2222' })] };
  const calls = await mockSupabase(page, state);
  let promptSeen = false;
  page.on('dialog', d => { promptSeen = true; d.dismiss(); });

  await page.goto('/');
  await page.locator('#heroStartBtn').click();
  await longPressLogo(page);
  await expect(page.locator('#view-staff')).toBeVisible();
  await expect(page.locator('#staffLoginForm')).toBeVisible();

  await page.locator('#staffEmail').fill('staff@example.com');
  await page.locator('#staffPassword').fill('wrong');
  await page.locator('#staffLoginBtn').click();
  await expect(page.locator('#staffLoginError')).toContainText('Incorrect email or password');

  await page.locator('#staffEmail').fill('visitor@example.com');            // valid login, not on the allowlist
  await page.locator('#staffPassword').fill('right-password');
  await page.locator('#staffLoginBtn').click();
  await expect(page.locator('#staffLoginError')).toContainText('isn’t authorized');

  await page.locator('#staffEmail').fill('staff@example.com');
  await page.locator('#staffPassword').fill('right-password');
  await page.locator('#staffLoginBtn').click();
  await expect(page.locator('.staff-record')).toHaveCount(2);
  await expect(page.locator('#view-staff')).toContainText('Remote Visitor One');
  await expect(page.locator('#view-staff')).toContainText('D-bbbb2222');
  await expect(page.locator('.staff-stats .staff-stat').first().locator('strong')).toHaveText('2');
  expect(promptSeen).toBe(false);

  const read = calls.find(c => c.path === '/rest/v1/registrations');
  expect(read.headers.authorization).toBe('Bearer jwt-for-staff@example.com');   // staff JWT, not the anon key

  // Session lives in sessionStorage only.
  expect(await page.evaluate(() => localStorage.getItem('pedagogy-staff-session'))).toBeNull();
  expect(await page.evaluate(() => sessionStorage.getItem('pedagogy-staff-session'))).not.toBeNull();

  await page.locator('#staffSignOutBtn').click();
  await expect(page.locator('#staffLoginForm')).toBeVisible();
});

test('staff see flagged duplicates as information only, with no resolve actions', async ({ page }) => {
  await withBackend(page);
  const state = {
    rows: [serverRow('P-1', 'Dup Person', { duplicate_flag: true, duplicate_of_ids: ['P-2'], duplicate_review_status: 'pending' })],
  };
  const calls = await mockSupabase(page, state);
  await page.goto('/');
  await page.locator('#heroStartBtn').click();
  await longPressLogo(page);
  await page.locator('#staffEmail').fill('staff@example.com');
  await page.locator('#staffPassword').fill('right-password');
  await page.locator('#staffLoginBtn').click();
  await expect(page.locator('.staff-stat--attention')).toBeVisible();
  await expect(page.locator('.badge--duplicate')).toHaveText('Possible duplicate');
  await expect(page.locator('#view-staff')).toContainText('Possible duplicate of: P-2');
  await expect(page.locator('[data-action]')).toHaveCount(0);
  expect(calls.some(c => c.path === '/rest/v1/rpc/resolve_duplicate')).toBe(false);
});

test('header Sign out appears only while staff are signed in, and ends the session', async ({ page }) => {
  await withBackend(page);
  await mockSupabase(page, { rows: [serverRow('P-1', 'Remote Visitor One')] });
  await page.goto('/');
  await page.locator('#heroStartBtn').click();
  await expect(page.locator('#appShell')).toBeVisible();
  await expect(page.locator('#staffSignOutHeaderBtn')).toBeHidden();       // visitors never see it

  await longPressLogo(page);
  await page.locator('#staffEmail').fill('staff@example.com');
  await page.locator('#staffPassword').fill('right-password');
  await page.locator('#staffLoginBtn').click();
  await expect(page.locator('.staff-record')).toHaveCount(1);
  await expect(page.locator('#staffSignOutHeaderBtn')).toBeVisible();

  await page.locator('#staffSignOutHeaderBtn').click();
  await expect(page.locator('#staffSignOutHeaderBtn')).toBeHidden();
  await expect(page.locator('#view-staff')).toBeHidden();                  // back on the visitor screen
  await expect(page.locator('#view-staff .staff-record')).toHaveCount(0);  // no stale data left behind
  expect(await page.evaluate(() => sessionStorage.getItem('pedagogy-staff-session'))).toBeNull();
});
