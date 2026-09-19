// Plain Node check (not a Playwright test — no browser needed), wired into
// `npm test` ahead of Playwright. Fails loudly if js/generated/data.js is stale
// relative to data/*.json, i.e. someone edited a source JSON file and forgot to
// run `npm run build:data`. Without this, a stale generated file would silently
// ship old data with no error anywhere — exactly the kind of failure most
// likely to bite on a Monday-night rehearsal after a last-minute data edit.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const GENERATED_PATH = path.join(ROOT, 'js', 'generated', 'data.js');
const DATA_DIR = path.join(ROOT, 'data');

const SOURCE_FILES = {
  schools: 'schools.json',
  curriculum_subjects: 'curriculum_subjects.json',
  destination_exams: 'destination_exams.json',
  question_bank: 'question_bank.json',
};

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function loadGenerated() {
  const code = fs.readFileSync(GENERATED_PATH, 'utf8');
  const sandbox = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: GENERATED_PATH });
  return sandbox.window.PED && sandbox.window.PED.GENERATED;
}

function main() {
  const generated = loadGenerated();
  const failures = [];

  if (!generated) {
    console.error('[data-freshness] FAILED: js/generated/data.js did not set window.PED.GENERATED at all.');
    process.exit(1);
  }

  for (const [key, filename] of Object.entries(SOURCE_FILES)) {
    const raw = fs.readFileSync(path.join(DATA_DIR, filename), 'utf8');
    const currentHash = sha256(raw);
    const embeddedHash = generated.SOURCE_HASHES && generated.SOURCE_HASHES[key];
    if (!embeddedHash) {
      failures.push(`${key}: js/generated/data.js has no SOURCE_HASHES entry for it.`);
    } else if (embeddedHash !== currentHash) {
      failures.push(`${key}: data/${filename} has changed since js/generated/data.js was last built.`);
    }
  }

  if (failures.length) {
    console.error(
      '[data-freshness] FAILED — js/generated/data.js is stale:\n- ' +
      failures.join('\n- ') +
      '\n\nRun "npm run build:data" and commit the result.'
    );
    process.exit(1);
  }
  console.log('[data-freshness] OK — js/generated/data.js matches all data/*.json sources.');
}

main();
