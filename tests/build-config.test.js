// Plain Node test (run by `npm test` before Playwright): scripts/build-config.js
// turns env vars into the public client config, and never leaks anything else.
const assert = require('assert');
const { buildConfig, render, parseEnvFile, DEFAULT_SITE_URL } = require('../scripts/build-config.js');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL_OK = 'https://abcdefghij.supabase.co';
const KEY_OK = 'x'.repeat(40);
const SITE = 'https://expo.pedagogyedn.ae';

assert.deepStrictEqual(buildConfig({ SUPABASE_URL: URL_OK + '/', SUPABASE_ANON_KEY: KEY_OK }, {}),
  { supabaseUrl: URL_OK, supabaseAnonKey: KEY_OK, siteUrl: SITE }, 'env vars win, trailing slash trimmed');
assert.deepStrictEqual(buildConfig({}, { SUPABASE_URL: URL_OK, SUPABASE_ANON_KEY: KEY_OK }),
  { supabaseUrl: URL_OK, supabaseAnonKey: KEY_OK, siteUrl: SITE }, 'falls back to .env.local values');
assert.deepStrictEqual(buildConfig({}, {}), { supabaseUrl: '', supabaseAnonKey: '', siteUrl: SITE }, 'missing env -> empty local-only config');
assert.deepStrictEqual(buildConfig({ SUPABASE_URL: 'http://evil.example', SUPABASE_ANON_KEY: KEY_OK }, {}),
  { supabaseUrl: '', supabaseAnonKey: '', siteUrl: SITE }, 'non-supabase / non-https URL rejected');

assert.strictEqual(DEFAULT_SITE_URL, SITE, 'default site URL is the expo subdomain');
assert.strictEqual(buildConfig({ SITE_URL: 'https://preview.example.vercel.app/' }, {}).siteUrl, 'https://preview.example.vercel.app', 'SITE_URL override, trailing slash trimmed');
assert.strictEqual(buildConfig({ SITE_URL: 'http://insecure.example' }, {}).siteUrl, SITE, 'non-https SITE_URL ignored');

const out = render(buildConfig({ SUPABASE_URL: URL_OK, SUPABASE_ANON_KEY: KEY_OK, SUPABASE_SERVICE_ROLE_KEY: 'SECRET', DB_PASSWORD: 'SECRET' }, {}));
assert(!/SECRET|service_role/i.test(out), 'only the two public values are ever emitted');
assert(/window\.PED_CONFIG = /.test(out));

const tmp = path.join(os.tmpdir(), 'ped-env-test');
fs.writeFileSync(tmp, '# comment\nSUPABASE_URL="' + URL_OK + '"\nSUPABASE_ANON_KEY=' + KEY_OK + '\n');
assert.deepStrictEqual(parseEnvFile(tmp), { SUPABASE_URL: URL_OK, SUPABASE_ANON_KEY: KEY_OK }, '.env parsing handles quotes/comments');
fs.unlinkSync(tmp);

console.log('build-config tests passed');
