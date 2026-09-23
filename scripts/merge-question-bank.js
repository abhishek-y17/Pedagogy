// One-off merge of the delivered question bank (data/question_bank_output/,
// gitignored — see CLAUDE.md/.gitignore) into data/question_bank.json.
// Run manually if the source bank changes: `node scripts/merge-question-bank.js`.
// See question_bank_output/README.md and MANIFEST.md for the source bank's own
// scope notes. Decisions here (what to pull, the UAE union) were given directly
// by Abhi, not re-derived — see the task instructions in session history.
//
// Round E, 2026-09-23: also merges a second, separate, already-validated
// delivery — data/additional_question_bank/ (gitignored, same pattern as
// question_bank_output/) — additively on top of the original merge. It exists
// specifically to fix a real content gap ("not enough 11th-standard PCM/PCB
// questions"): a full 60-easy/60-medium/60-hard PCMB core (Physics/Chemistry/
// Maths/Biology) per curriculum, plus a handful of 10-per-difficulty starter
// sets for a few humanities subjects (see additional_question_bank/MANIFEST.md).
// Its own MANIFEST states IDs start at 201 specifically to avoid colliding with
// the original bank's ranges — verified true against the live question_bank.json
// before wiring this in (every original id in these subject/curriculum
// combinations tops out well under 201; see RUN_LOG.md), and the duplicate-id
// check below still throws loudly if that ever stops being true rather than
// silently overwriting anything.
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'question_bank_output');
const ADDITIONAL_SRC = path.join(ROOT, 'data', 'additional_question_bank');
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

// Round E additive delivery: only the 6 curriculum folders it actually
// shipped (indian/ib/british/american/uae_moe/sabis — see its own README.md:
// "Minor curricula, aptitude and foreign education remain available in the
// original bank and are not duplicated here"). _audit/ holds provenance/
// planning data, not quiz content, and is deliberately not imported (its own
// README says so explicitly).
const ADDITIONAL_DIRS = ['indian', 'ib', 'british', 'american', 'uae_moe', 'sabis'];
function loadAdditionalDir(dirName) {
  const dir = path.join(ADDITIONAL_SRC, dirName);
  let out = [];
  for (const f of listJsonFiles(dir)) out = out.concat(readJson(f));
  return out;
}
const additionalQuestions = ADDITIONAL_DIRS.flatMap(loadAdditionalDir);

const questions = [
  ...loadDir('indian'),
  ...loadDir('ib'),
  ...loadDir('british'),
  ...loadDir('american'),
  ...loadDir('sabis'),
  ...loadDir('minor'),
  ...loadUaeUnion(),
  ...readJson(path.join(SRC, 'aptitude', 'aptitude.json')),
  ...additionalQuestions,
];

const seen = new Set();
for (const q of questions) {
  if (seen.has(q.id)) throw new Error(`duplicate question id after merge: ${q.id}`);
  seen.add(q.id);
}

const bank = {
  schema: 'pedagogy.question-bank.v1',
  purpose: 'Academic quiz question bank for the Sharjah Expo app. Real delivered bank (question_bank_output/, generated per Abhi\'s spec) merged 2026-09-20: 65 major subjects across Indian/IB/British/American/SABIS/UAE MoE, 12 minor-curriculum PCMB sets, and a shared 300-question Aptitude pool used for occasional substitution (see js/questions.js maybeSubstituteAptitude). UAE MoE is a union of the uae_moe/ and uae_moe_current/ exports (600 records, each already covering both stream taxonomies) — see scripts/merge-question-bank.js. Round E (2026-09-23) additively merged a second delivery, data/additional_question_bank/ (5,760 records, IDs starting at 201 to avoid colliding with this original bank, verified not just trusted): a full 60-easy/60-medium/60-hard PCMB core (Physics/Chemistry/Maths/Biology) per curriculum plus a few 10-per-difficulty humanities starters, specifically to fix thin 11th-standard PCM/PCB coverage. Every record has placeholder: false; reviewed_by is still null pending independent subject-teacher review, a separate decision for Abhi ahead of the live event. See data/QUESTION_BANK_SOURCES.md for both deliveries\' provenance notes (the CC BY-adapted subset from the original bank, plus the additive bank\'s own scope-reference sourcing). Regenerate via `node scripts/merge-question-bank.js`, edit nothing in this file by hand.',
  note_on_stream_ids: "eligible_stream_ids values must match an 'id' inside data/curriculum_subjects.json's curricula[curriculum].streams[].id / .groups[].id / .combination_clusters[].id / .ap_categories[].id, or a synthetic 'track-N' id for .external_exam_tracks (see js/questions.js's getStreamOptions, the single canonical derivation both the registration stream-picker and this validator use). An empty array means the question applies to every stream/group/cluster within that curriculum. Curricula with no stream/group structure (SABIS, Aptitude, and the 'Other' bucket) should always use an empty array here.",
  questions,
};

fs.writeFileSync(OUT, JSON.stringify(bank, null, 2) + '\n');
console.log(`Wrote ${questions.length} questions to ${OUT} (${additionalQuestions.length} from the round-E additive delivery)`);
