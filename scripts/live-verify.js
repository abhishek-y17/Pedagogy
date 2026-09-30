// Live end-to-end check against the REAL Supabase project (manual, never part of
// `npm test`). Submits synthetic records through the same RPC the app uses, then
// signs in as staff and reads everything back, comparing every stored column.
//
//   STAFF_EMAIL=... STAFF_PASSWORD=... node scripts/live-verify.js
//
// Credentials come only from the environment (never files). Test rows are named
// "ZZ TEST ..." so they can be removed afterwards:
//   delete from public.registrations where name like 'ZZ TEST%';   (answers cascade)
const fs = require('fs');
const path = require('path');
const { buildConfig, parseEnvFile } = require('./build-config.js');

const root = path.join(__dirname, '..');
const cfg = buildConfig(process.env, parseEnvFile(path.join(root, '.env.local')));
if (!cfg.supabaseUrl) { console.error('No SUPABASE_URL / SUPABASE_ANON_KEY (.env.local or env).'); process.exit(2); }
const { STAFF_EMAIL, STAFF_PASSWORD } = process.env;
if (!STAFF_EMAIL || !STAFF_PASSWORD) { console.error('Set STAFF_EMAIL and STAFF_PASSWORD env vars.'); process.exit(2); }

const bank = JSON.parse(fs.readFileSync(path.join(root, 'data', 'question_bank.json'), 'utf8')).questions;
const RUN = Date.now().toString(36);
const uniq = n => `+9715${(String(Date.now()).slice(-6) + String(n)).padStart(8, '0').slice(-8)}`;   // unique per run, so old test rows never collide
let pass = 0, fail = 0;
// jsonb does not preserve object key order, so compare canonically (sorted keys).
const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x));
const check = (name, cond, extra) => { if (cond) { pass++; console.log('  PASS', name); } else { fail++; console.log('  FAIL', name, extra !== undefined ? '-> ' + JSON.stringify(extra) : ''); } };

async function call(pathname, { method = 'GET', body, token } = {}) {
  const res = await fetch(cfg.supabaseUrl + pathname, {
    method,
    headers: { apikey: cfg.supabaseAnonKey, Authorization: `Bearer ${token || cfg.supabaseAnonKey}`, 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { /* ignore */ }
  return { status: res.status, json, text };
}
const submit = payload => call('/rest/v1/rpc/submit_registration', { method: 'POST', body: { payload } });

function makeQuestions(n) {
  // Deterministic spread over real bank entries so metadata is genuinely real.
  const picked = [];
  for (let i = 0; picked.length < n; i += Math.floor(bank.length / (n + 1))) picked.push(bank[i + 7]);
  return picked;
}

function makeRecord(tag, over) {
  over = over || {};
  const qs = makeQuestions(4);
  const answers = [
    { questionId: qs[0].id, selected: qs[0].answer, skipped: false, timedOut: false, correct: true },
    { questionId: qs[1].id, selected: qs[1].options.find(o => o !== qs[1].answer), skipped: false, timedOut: false, correct: false },
    { questionId: qs[2].id, selected: null, skipped: true, timedOut: false, correct: null },
    // qs[3] deliberately has no answer entry -> must land as 'unanswered'
  ].map((a, i) => {
    const q = qs[i];
    return { ...a, curriculum: q.curriculum, subject: q.subject, difficulty: q.difficulty, topic: q.topic || null, question: q.q, options: q.options, correctAnswer: q.answer };
  });
  const id = `P-live-${RUN}-${tag}`;
  return {
    schema: 'pedagogy.v11', mode: 'full', currentStepId: 'review', returnToReview: false,
    registration: {
      name: `ZZ TEST ${tag} ${RUN}`, dob: '2008-03-09',
      parentCountryCode: '+971', parentMobileLocal: '501110000', parentMobile: uniq(0),
      studentCountryCode: '+971', studentMobileLocal: '502220000', studentMobile: '+971502220000',
      school: 'ZZ TEST School Sharjah', schoolKey: `zz-test-school-${RUN}`, curriculum: 'Indian', grade: 'stage12', stream: 'science-pcm', section: null, subjects: ['Physics', 'Chemistry', 'Mathematics'],
      tcsAccepted: true, tcsAcceptedAt: '2026-10-11T09:00:00.000Z',
      consentToContact: true, consentToContactAt: '2026-10-11T09:00:05.000Z',
      marketingOptIn: true, marketingOptInAt: '2026-10-11T09:00:07.000Z',
    },
    preferences: {
      destinations: ['India', 'UK', 'Other'], destinationsOther: ['Japan', 'Norway'],
      competitiveExamPrep: 'yes', competitiveExams: { India: ['JEE', 'NEET'], UK: ['UCAT'] },
    },
    quiz: { selectedQuestionIds: qs.map(q => q.id), answers, timerStartedAt: null, timerElapsedMs: 41234 },
    meta: { id, createdAt: '2026-10-11T09:01:00.000Z', deviceId: 'D-livetest', recordStatus: null, duplicateFlag: false, duplicateOfIds: [], duplicateReviewStatus: null },
    ...over,
  };
}
const withReg = (rec, patch) => ({ ...rec, registration: { ...rec.registration, ...patch } });
const withMeta = (rec, patch) => ({ ...rec, meta: { ...rec.meta, ...patch } });

(async () => {
  console.log(`Project: ${cfg.supabaseUrl}   run tag: ${RUN}`);

  console.log('\n[1] Anon lockdown');
  for (const t of ['registrations', 'registration_answers', 'staff_allowlist']) {
    const r = await call(`/rest/v1/${t}?select=*&limit=1`);
    check(`anon cannot read ${t}`, r.status === 401 || r.status === 403, r.status);
  }
  const ins = await call('/rest/v1/registrations', { method: 'POST', body: { id: 'P-hack-00000000', name: 'x', parent_mobile: '+971500000000', raw: {} } });
  check('anon cannot insert directly', ins.status === 401 || ins.status === 403, ins.status);
  const rd = await call('/rest/v1/rpc/resolve_duplicate', { method: 'POST', body: { p_id: 'x', p_status: 'reviewed' } });
  check('anon cannot call resolve_duplicate', rd.status === 401 || rd.status === 403, rd.status);

  console.log('\n[2] Validation (public endpoint must reject junk, and insert nothing)');
  const base = makeRecord('val');
  const bad = async (label, rec, expect) => { const r = await submit(rec); check(`rejects ${label}`, r.status === 400 && r.text.includes(expect || 'invalid_payload'), [r.status, r.text.slice(0, 120)]); };
  await bad('missing id', withMeta(base, { id: null }));
  await bad('id with bad characters', withMeta(base, { id: 'P-ab cd;drop table' }));
  await bad('id not starting with P-', withMeta(base, { id: 'X-12345678' }));
  await bad('empty name', withReg(base, { name: '   ' }));
  await bad('missing parent mobile', withReg(base, { parentMobile: null }));
  await bad('non-numeric parent mobile', withReg(base, { parentMobile: 'not-a-phone' }));
  await bad('parent mobile without +', withReg(base, { parentMobile: '971501234567' }));
  await bad('non-object payload', 'just a string');
  await bad('oversize payload', { ...base, junk: 'x'.repeat(70000) });
  const badDob = await submit(withReg(makeRecord('baddob'), { dob: 'not-a-date' }));
  check('rejects invalid date of birth (400, no 500)', badDob.status >= 400 && badDob.status < 500, [badDob.status, badDob.text.slice(0, 100)]);

  console.log('\n[3] Happy path: submit a full record');
  const A = makeRecord('A');
  const rA = await submit(A);
  check('submit returns 200', rA.status === 200, [rA.status, rA.text.slice(0, 200)]);
  check('not flagged duplicate', rA.json && rA.json.duplicate_flag === false, rA.json);

  console.log('\n[4] Idempotency (the outbox resends after a lost response)');
  const rA2 = await submit(A);
  check('resend returns 200 with same id', rA2.status === 200 && rA2.json.id === A.meta.id, rA2.json);
  check('resend flagged already_existed', rA2.json && rA2.json.already_existed === true, rA2.json);

  console.log('\n[5] Duplicate detection across "devices"');
  const B = withMeta(withReg(makeRecord('B'), { parentMobile: A.registration.parentMobile, name: `ZZ TEST B-dupphone ${RUN}` }), { deviceId: 'D-other' });
  const rB = await submit(B);
  check('same parent mobile -> flagged duplicate of A', rB.json && rB.json.duplicate_flag === true && rB.json.duplicate_of_ids.includes(A.meta.id), rB.json);
  const C = withMeta(withReg(makeRecord('C'), { name: `  ${A.registration.name.toUpperCase()} `, dob: A.registration.dob, parentMobile: uniq(1), schoolKey: A.registration.schoolKey }), {});
  const rC = await submit(C);
  check('same name (case/space-insensitive) + DOB + school -> flagged', rC.json && rC.json.duplicate_flag === true, rC.json);
  const D = withReg(makeRecord('D'), { name: `ZZ TEST unrelated ${RUN}`, dob: '2007-01-01', parentMobile: uniq(2), schoolKey: 'zz-other-school' });
  const rD = await submit(D);
  check('unrelated record NOT flagged', rD.json && rD.json.duplicate_flag === false, rD.json);

  console.log('\n[6] Staff sign-in and read-back');
  const login = await call('/auth/v1/token?grant_type=password', { method: 'POST', body: { email: STAFF_EMAIL, password: STAFF_PASSWORD } });
  check('staff login succeeds', login.status === 200 && login.json && login.json.access_token, [login.status, login.text.slice(0, 120)]);
  if (!login.json || !login.json.access_token) { finish(); return; }
  const token = login.json.access_token;
  const isStaff = await call('/rest/v1/rpc/is_staff', { method: 'POST', body: {}, token });
  check('account is on staff_allowlist (is_staff = true)', isStaff.json === true, isStaff.json);
  if (isStaff.json !== true) { console.log('  -> add this email to public.staff_allowlist (see supabase/README.md)'); finish(); return; }

  const rows = (await call(`/rest/v1/registrations?select=*&id=like.P-live-${RUN}-*&order=created_at.asc`, { token })).json || [];
  const byId = Object.fromEntries(rows.map(r => [r.id, r]));
  check('all 4 valid submissions stored, invalid ones stored nothing', rows.length === 4 && !rows.some(r => r.id.endsWith('-val') || r.id.endsWith('-baddob')), rows.map(r => r.id));

  console.log('\n[7] Every column of record A matches what was sent');
  const a = byId[A.meta.id] || {};
  const r = A.registration, p = A.preferences;
  const eq = (name, got, want) => check(`column ${name}`, canon(got) === canon(want), { got, want });
  eq('name', a.name, r.name); eq('dob', a.dob, r.dob); eq('parent_mobile', a.parent_mobile, r.parentMobile);
  eq('student_mobile', a.student_mobile, r.studentMobile); eq('school', a.school, r.school); eq('school_key', a.school_key, r.schoolKey);
  eq('curriculum', a.curriculum, r.curriculum); eq('grade', a.grade, r.grade); eq('stream', a.stream, r.stream);
  eq('subjects', a.subjects, r.subjects); eq('mode', a.mode, 'full'); eq('schema_version', a.schema_version, 'pedagogy.v11');
  eq('device_id', a.device_id, 'D-livetest');
  eq('submitted_at', new Date(a.submitted_at).toISOString(), A.meta.createdAt);
  eq('tcs_accepted', a.tcs_accepted, true); eq('tcs_accepted_at', new Date(a.tcs_accepted_at).toISOString(), r.tcsAcceptedAt);
  eq('consent_to_contact', a.consent_to_contact, true); eq('consent_to_contact_at', new Date(a.consent_to_contact_at).toISOString(), r.consentToContactAt);
  eq('marketing_opt_in', a.marketing_opt_in, true); eq('marketing_opt_in_at', new Date(a.marketing_opt_in_at).toISOString(), r.marketingOptInAt);
  eq('destinations', a.destinations, p.destinations); eq('destinations_other', a.destinations_other, p.destinationsOther);
  eq('competitive_exam_prep', a.competitive_exam_prep, 'yes'); eq('competitive_exams', a.competitive_exams, p.competitiveExams);
  eq('quiz.selectedQuestionIds', a.quiz && a.quiz.selectedQuestionIds, A.quiz.selectedQuestionIds);
  eq('quiz.timerElapsedMs', a.quiz && a.quiz.timerElapsedMs, 41234);
  eq('quiz.answers (full, incl. question snapshot)', a.quiz && a.quiz.answers, A.quiz.answers);
  eq('raw is the complete record', a.raw && a.raw.registration && a.raw.registration.name, r.name);
  check('server created_at set', !!a.created_at);
  check('generated name_norm', a.name_norm === r.name.toLowerCase(), a.name_norm);

  console.log('\n[8] Quiz answers table (one row per question served)');
  const ans = (await call(`/rest/v1/registration_answers?select=*&registration_id=eq.${A.meta.id}&order=position.asc`, { token })).json;
  if (!Array.isArray(ans)) { check('registration_answers readable (run supabase/migrations/0002_quiz_answers.sql)', false, ans); }
  else {
    check('4 answer rows (3 answered/skipped + 1 unanswered)', ans.length === 4, ans.length);
    const qs = A.quiz.selectedQuestionIds.map(id => bank.find(q => q.id === id));
    check('positions 1..4 follow served order', ans.every((x, i) => x.position === i + 1 && x.question_id === qs[i].id), ans.map(x => x.question_id));
    check('Q1 answered + correct', ans[0].status === 'answered' && ans[0].is_correct === true && ans[0].selected === qs[0].answer, ans[0]);
    check('Q2 answered + wrong', ans[1].status === 'answered' && ans[1].is_correct === false, ans[1]);
    check('Q3 skipped, no selection', ans[2].status === 'skipped' && ans[2].selected === null && ans[2].is_correct === null, ans[2]);
    check('Q4 unanswered (never reached)', ans[3].status === 'unanswered' && ans[3].selected === null, ans[3]);
    check('question text, options, correct answer archived', ans.slice(0, 3).every((x, i) => x.question === qs[i].q && canon(x.options) === canon(qs[i].options) && x.correct_answer === qs[i].answer));
    check('subject/difficulty/curriculum archived', ans.slice(0, 3).every((x, i) => x.subject === qs[i].subject && x.difficulty === qs[i].difficulty && x.curriculum === qs[i].curriculum));
    const resendCount = (await call(`/rest/v1/registration_answers?select=position&registration_id=eq.${A.meta.id}`, { token })).json.length;
    check('idempotent resend did not duplicate answer rows', resendCount === 4, resendCount);
  }

  console.log('\n[9] Duplicate bookkeeping on the server');
  const a2 = byId[A.meta.id], b2 = byId[B.meta.id], c2 = byId[C.meta.id], d2 = byId[D.meta.id];
  check('A re-opened as pending and lists B and C', a2.duplicate_flag && a2.duplicate_review_status === 'pending' && a2.duplicate_of_ids.includes(B.meta.id) && a2.duplicate_of_ids.includes(C.meta.id), a2.duplicate_of_ids);
  check('B stored as flagged/pending', b2.duplicate_flag && b2.duplicate_review_status === 'pending' && b2.duplicate_of_ids.includes(A.meta.id));
  check('C stored as flagged/pending', c2.duplicate_flag && c2.duplicate_review_status === 'pending');
  check('D untouched', !d2.duplicate_flag && d2.duplicate_review_status === null && d2.duplicate_of_ids.length === 0);

  console.log('\n[10] Staff resolve_duplicate moves the whole linked group');
  const res = await call('/rest/v1/rpc/resolve_duplicate', { method: 'POST', body: { p_id: B.meta.id, p_status: 'reviewed' }, token });
  check('resolve_duplicate returns count of rows updated (B + A)', res.status === 200 && res.json === 2, [res.status, res.text]);
  const after = (await call(`/rest/v1/registrations?select=id,duplicate_review_status,reviewed_by,reviewed_at&id=in.(${[A, B, C].map(x => x.meta.id).join(',')})`, { token })).json;
  const st = Object.fromEntries(after.map(x => [x.id, x]));
  check('A and B reviewed, reviewer recorded', st[A.meta.id].duplicate_review_status === 'reviewed' && st[B.meta.id].duplicate_review_status === 'reviewed' && st[B.meta.id].reviewed_by === STAFF_EMAIL.toLowerCase() && !!st[B.meta.id].reviewed_at, st);
  check('C (not linked to B) still pending', st[C.meta.id].duplicate_review_status === 'pending');
  const badStatus = await call('/rest/v1/rpc/resolve_duplicate', { method: 'POST', body: { p_id: B.meta.id, p_status: 'bogus' }, token });
  check('invalid status rejected', badStatus.status === 400 || badStatus.status === 422, badStatus.status);

  finish();
})().catch(e => { console.error('Script error:', e); process.exit(1); });

function finish() {
  console.log(`\n${pass} passed, ${fail} failed.  Clean up test rows in SQL Editor:\n  delete from public.registrations where name like 'ZZ TEST%';`);
  process.exit(fail ? 1 : 0);
}
