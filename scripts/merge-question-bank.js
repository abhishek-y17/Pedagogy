// One-off merge of the delivered question bank (data/question_bank_output/,
// gitignored — see CLAUDE.md/.gitignore) into data/question_bank.json.
// Run manually if the source bank changes: `node scripts/merge-question-bank.js`.
// See question_bank_output/README.md and MANIFEST.md for the source bank's own
// scope notes. Decisions here (what to pull, the UAE union) were given directly
// by Abhi, not re-derived — see the task instructions in session history.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'question_bank_output');
const OUT = path.join(ROOT, 'data', 'question_bank.json');

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function listJsonFiles(dir) {
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => path.join(dir, f));
}

function loadDir(dirName) {
  const dir = path.join(SRC, dirName);
  let out = [];
  for (const f of listJsonFiles(dir)) out = out.concat(readJson(f));
  return out;
}

// --- UAE union: uae_moe/ and uae_moe_current/ hold the same 60 questions per
// subject (identical `q` text), uae_moe_current/'s eligible_stream_ids being a
// subset of uae_moe/'s. Match by exact `q` text, take the uae_moe/ record as
// base, and set eligible_stream_ids to the sorted/deduped union of both.
function loadUaeUnion() {
  const baseDir = path.join(SRC, 'uae_moe');
  const currentDir = path.join(SRC, 'uae_moe_current');
  const files = fs.readdirSync(baseDir).filter(f => f.endsWith('.json'));
  let out = [];
  for (const f of files) {
    const base = readJson(path.join(baseDir, f));
    const currentPath = path.join(currentDir, f);
    const current = fs.existsSync(currentPath) ? readJson(currentPath) : [];
    const currentByQ = new Map(current.map(q => [q.q, q]));
    for (const q of base) {
      const match = currentByQ.get(q.q);
      if (!match) {
        console.warn(`[merge-question-bank] no uae_moe_current match for uae_moe/${f} question "${q.id}" — keeping as-is.`);
        out.push(q);
        continue;
      }
      const union = Array.from(new Set([...q.eligible_stream_ids, ...match.eligible_stream_ids])).sort();
      out.push({ ...q, eligible_stream_ids: union });
    }
  }
  return out;
}

const questions = [
  ...loadDir('indian'),
  ...loadDir('ib'),
  ...loadDir('british'),
  ...loadDir('american'),
  ...loadDir('sabis'),
  ...loadDir('minor'),
  ...loadUaeUnion(),
  ...readJson(path.join(SRC, 'aptitude', 'aptitude.json')),
];

const seen = new Set();
for (const q of questions) {
  if (seen.has(q.id)) throw new Error(`duplicate question id after merge: ${q.id}`);
  seen.add(q.id);
}

const bank = {
  schema: 'pedagogy.question-bank.v1',
  purpose: 'Academic quiz question bank for the Sharjah Expo app. Real delivered bank (question_bank_output/, generated per Abhi\'s spec) merged 2026-09-20: 65 major subjects across Indian/IB/British/American/SABIS/UAE MoE, 12 minor-curriculum PCMB sets, and a shared 300-question Aptitude pool used for occasional substitution (see js/questions.js maybeSubstituteAptitude). UAE MoE is a union of the uae_moe/ and uae_moe_current/ exports (600 records, each already covering both stream taxonomies) — see scripts/merge-question-bank.js. Every record has placeholder: false; reviewed_by is still null pending independent subject-teacher review, a separate decision for Abhi ahead of the live event. See data/QUESTION_BANK_SOURCES.md for the CC BY-adapted subset (Psychology, Political Science/Government). Regenerate via `node scripts/merge-question-bank.js`, edit nothing in this file by hand.',
  note_on_stream_ids: "eligible_stream_ids values must match an 'id' inside data/curriculum_subjects.json's curricula[curriculum].streams[].id / .groups[].id / .combination_clusters[].id / .ap_categories[].id, or a synthetic 'track-N' id for .external_exam_tracks (see js/questions.js's getStreamOptions, the single canonical derivation both the registration stream-picker and this validator use). An empty array means the question applies to every stream/group/cluster within that curriculum. Curricula with no stream/group structure (SABIS, Aptitude, and the 'Other' bucket) should always use an empty array here.",
  questions,
};

fs.writeFileSync(OUT, JSON.stringify(bank, null, 2) + '\n');
console.log(`Wrote ${questions.length} questions to ${OUT}`);
