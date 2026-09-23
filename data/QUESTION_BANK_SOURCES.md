# Reused educational sources

Carried forward verbatim from `question_bank_output/SOURCE_ATTRIBUTION.md` (the
delivered question-bank folder, gitignored — see `.gitignore` and
`scripts/merge-question-bank.js`) so this licensing record travels with the
app in git instead of living only outside the repo. The `_authoring/` files it
references below are private working material in that gitignored folder, not
part of this repo.

## Psychology 2e

The Indian Psychology, IB Psychology and American AP Psychology files adapt questions and concepts from **Psychology 2e**, by **OpenStax, Rice University**, using the repository snapshot `febbf062dc10089a5dc282f06615afa7e9f2e333` available before 1 January 2024.

- [Source edition and attribution](https://github.com/openstax/osbooks-psychology/tree/febbf062dc10089a5dc282f06615afa7e9f2e333)
- [Licence attached to that edition](https://github.com/openstax/osbooks-psychology/blob/febbf062dc10089a5dc282f06615afa7e9f2e333/LICENSE): [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)
- Changes: shorter conceptual scenarios, revised answer choices and explanations, and editorial difficulty/curriculum labels. No endorsement by OpenStax is implied.
- Exact source exercise IDs and source links are mapped to output IDs in `_authoring/provenance/openstax_adaptations.json`. Copies of the source edition's licence and source text are retained in the private research directory.

Each file has 20 easy, 20 medium and 20 hard questions. Shared questions are intentionally reused across these curricula. The 180 curriculum records are 60 shared adapted prompts, not 180 globally unique questions. Content emphasises research methods, cognition, learning, biological processes, development and individual differences; it is not exhaustive coverage of every prescribed chapter or named study.

These adaptations use a verified older CC BY snapshot. Do not substitute newer OpenStax material without checking the licence attached to that material. Editorial labels are not official examination difficulty ratings, and source answer keys were treated as evidence to check rather than automatically accepted.

## American Government 3e

Indian Political Science, IB Global Politics, British Politics and American AP US Government & Politics use 60 shared conceptual adaptations from **American Government 3e**, **OpenStax, Rice University**, repository snapshot `5f93f919050d8445ca9dec6560be1f1120f1235f` available before 1 January 2024.

- [Source edition](https://github.com/openstax/osbooks-american-government/tree/5f93f919050d8445ca9dec6560be1f1120f1235f)
- [Licence attached to the edition](https://github.com/openstax/osbooks-american-government/blob/5f93f919050d8445ca9dec6560be1f1120f1235f/LICENSE): [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- Changes: comparative or explicitly specified institutional scenarios, revised wording, choices and explanations, and curriculum/difficulty labels. Dated court holdings and unsupported current-polling claims were excluded. No OpenStax endorsement is implied.

The 240 curriculum records share 60 prompts on representation, rights, power, institutions, participation, media and policy evidence. Country-specific rules are not asserted to be identical. This compact selection does not cover every constitutional case, political thinker, national historical episode or IB international-relations theme. The British source is Issue 4 for teaching from September 2026, with first assessment in 2028; shared foundations also apply to earlier cohorts. The IB profile uses first assessment 2026.

Every adapted output ID has source edition, exercise ID and change information in the separate provenance map. Each subject's Markdown file also carries attribution.

## Round E additive delivery (2026-09-23) — data/additional_question_bank/

Carried forward the same way, from `additional_question_bank/README.md`,
`MANIFEST.md`, `VALIDATION.md` and `STARTER_NOTES.md` (that folder, gitignored
like `question_bank_output/` — see `.gitignore` and
`scripts/merge-question-bank.js`), so this second delivery's own provenance
notes travel with the app in git instead of living only outside the repo.

This delivery is separate content, not a continuation of the OpenStax
adaptations above: **5,760 new records across 37 files**, additively merged
(concatenated, nothing overwritten or duplicated) into `data/question_bank.json`
— a full 60-easy/60-medium/60-hard PCMB core (Physics/Chemistry/Mathematics/
Biology, or each curriculum's equivalent — e.g. Analysis & Approaches /
Applications & Interpretation for IB's Maths groups, AP Calculus/Precalculus/
Statistics for American) across Indian/IB/British/American/UAE MoE/SABIS, plus
six smaller 10-per-difficulty starter sets (Indian English/History/Geography,
British English Literature, IB Design Technology/Environmental Systems &
Societies). IDs begin at 201 per subject/curriculum to avoid colliding with
the original bank's own ranges — verified against the live `question_bank.json`
before merging (every matching id-prefix in the original bank tops out well
under 201), not just trusted from the manifest's own claim; zero collisions
found.

**Unlike the OpenStax adaptations above, this delivery carries no reused
licensed text.** Its own `STARTER_NOTES.md` is explicit: official curriculum
specifications (CBSE 2026-27 syllabi, the Cambridge 9695 A-Level syllabus,
etc. — see that file for the full per-subject list of scope references) were
used only to scope what topics/concepts a question could reasonably cover,
never as a source of question wording to copy — "sources are scope
references, not sources of copied question wording." Two starter files
(Indian English, IB Environmental Systems & Societies) do restore previously
authored questions from an earlier archived batch that never shipped in the
original bank — new delivery files, not newly composed prompts, but originally
written by the same authoring process as the rest of this project's own
question banks, not reused from a third party.

As with the original bank, every record has `reviewed_by: null` — no
independent subject-teacher review, and no empirical difficulty calibration —
which is a separate pre-event decision for Abhi, not a build blocker.
