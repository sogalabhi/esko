# Parallel build plan (P2 Phases 1–9)

How to finish the Problem 2 checker with several agents at once. The phase content is in `docs/PHASES.md`, "Problem 2 pivot". This file says **who runs what, in which order, on which files**, so agents never wait on each other or edit the same file.

Deadline: 22 Oct, 11:59 PM IST. Aim: features done by the end of 21 Oct, 22 Oct for hardening and the video.

## How it works

1. **The lead freezes the contract first** (Step 0, about 45 min): the data shapes every track depends on. After that, the backend and frontend build at the same time: the frontend against a mock, the backend against tests.
2. **Each agent owns its own files** (table below). Two agents never edit the same file. A file outside an agent's list means stop and report.
3. **Agents don't commit.** Each reports back. The lead runs `test-runner`, integrates, runs `gate-reviewer` per phase, then commits `phase N: …` and tags `p2-phase-N`.
4. **Same working tree, disjoint files.** If a track breaks shared tests mid-way, it runs only its own tests until it hands back (`uv run pytest tests/unit/test_x.py`, `npm test --prefix frontend -- src/screens/Checks`). Use `isolation: worktree` only for a track that has to touch a shared file.
5. **Recorded AI only.** No agent runs `test:live` or `test:record` except `ai-pipeline`, and only in its recording step (uses Gemini quota).

## Step 0 — contract freeze (lead, before any agent starts)

The lead writes these. Every agent brief points at them.

**Backend models** (`backend/app/models/project.py`, camelCase over the API like the existing models):

```
Finding
  id: str                      # stable: "f-<check>-<subject>"
  verdict: "fail" | "review" | "pass"
  kind: "missing" | "mismatch" | "math" | "rule" | "claim" | "format" | "hidden" | "text_size" | "approval"
  title: str                   # one line, plain words
  whyItMatters: str            # one sentence
  ruleIds: list[str]           # market rule ids or rulebook ids ("DF-04")
  expected: str | None
  found: str | None
  proof: str | None            # the code's working: "15 g ÷ 78 g = 19.2%, printed 2.2%"
  basis: "code" | "ai"         # "ai" can never be verdict "fail"
  evidence: list[Source]       # existing Source (file, where, quote, quoteChecked)
  locations: list[ConflictLocation]   # existing; drives marks on the artwork
  factIds, conflictIds, requirementIds: list[str]
  decision: FindingDecision | None    # set when a person decides a review item

FindingDecision
  verdict: "pass" | "fail"     # "It's fine" / "It's a problem"
  by: str
  at: str                      # ISO time
  note: str | None

Cleared                        # "Not flagged, and why" (P2 Phase 4)
  id: str
  title: str                   # "480 g matches 16.9 oz"
  proof: str                   # "480 g = 16.93 oz, rounds to 16.9 oz"
  evidence: list[Source]

RulebookRule                   # one rule read from an uploaded rulebook (P2 Phase 3)
  id: str                      # as printed ("DF-04")
  title: str
  status: "in_force" | "proposed"
  text: str                    # the rule sentence
  source: Source               # quote + where in the rulebook; quoteChecked decided by code
  checkType: "present" | "absent" | "exact" | "size" | "word_list" | "evidence_on_file" | "unsupported"
  findingIds: list[str]
```

**Project payload adds:** `findings: Finding[]`, `cleared: Cleared[]`, `rulebook: {fileId, name, rules: RulebookRule[]} | null`, and `role: "artwork" | "approved_info" | "rulebook" | "other"` on each file.

**Routes:**

| Route | Returns | Phase |
| --- | --- | --- |
| `GET /api/checks` | `{summary: {fail, review, pass, cleared}, findings, cleared}` | 1 |
| `POST /api/findings/{id}/decision` body `{verdict, by, note?}` | project | 1 |
| `POST /api/rulebook` (multipart file) | project | 3 |
| `DELETE /api/rulebook` | project | 3 |
| `POST /api/ask` gains optional `findingId` | existing ask answer | 5 |

**Frontend:** the same shapes in `frontend/src/types/project.ts`, and `frontend/src/mocks/project.json` extended with 9 findings (4 fail, 3 review with one decided and one AI-based, 2 pass), 3 cleared items and an 11-rule rulebook (one unverified, one proposed) using the real rule wording. `backend/tests/integration/test_p2_contract.py` validates the mock against the backend models, so neither side can drift. The mock is what `ui-builder` builds against until the API is ready.

**Done when:** `npm test` green with the new types and mock; the contract is committed (`contract: P2 findings, cleared, rulebook`). Then Wave 1 starts.

## File ownership

| Agent | Owns (may edit) | Never touches |
| --- | --- | --- |
| lead | `models/project.py`, `types/project.ts`, `mocks/project.json`, `docs/`, `CLAUDE.md`, `backend/app/demo.py`, `backend/demo/`, README | — |
| `backend-engine` | new `backend/app/checks/verdicts.py`, `checks/cleared.py`, `checks/rulebook_apply.py`; `routers/checks.py`, `routers/rulebook.py` (apply part); `analysis.py`; `questions/build.py`; their tests | `ai/`, `readers/`, `frontend/` |
| `ai-pipeline` | `backend/app/ai/` (new prompt `extract_rulebook.v1.md`, schema in `ai/tasks.py`), new `backend/app/extraction/rulebook.py`, `backend/tests/fixtures/ai/extract_rulebook*.json`, their tests | `checks/`, `models/project.py`, `frontend/` |
| `pdf-geometry` | `backend/app/readers/pdf_document.py` and its tests | everything else |
| `ui-builder` | `frontend/src/screens/` (new `Checks.tsx`, `Review.tsx`, `Rules.tsx`, `Report.tsx`), `frontend/src/components/` (new `FindingCard`, `VerdictBadge`, `ProofLine`), `App.tsx`, `shell/` | `types/project.ts`, `mocks/`, `backend/` |
| `rules-author` | `rulebooks/dancing_fish_us_label_rulebook.yaml` (citations only), `markets/` | code; `rulebook_key.yaml` verdicts |
| `e2e-tester` | `e2e/` | app code |
| `test-runner`, `gate-reviewer` | read-only | — |

## The waves

```
Step 0  lead: contract ───────────────────────────────────────────────┐
                                                                      │
Wave 1  (all in parallel, 20 Oct evening → 21 Oct morning)            ▼
  A backend-engine : P1 verdicts + /api/checks + decisions + no design questions
  B ui-builder     : P2 Checks screen + Review queue + new rail (on the mock)
  C ai-pipeline    : P3a rulebook extraction + quote check + recorded fixture
  D pdf-geometry   : P3 paragraph merge for plain PDFs
  E rules-author   : rulebook citations checked against eCFR
                                                                      │
  lead: integrate A+B (UI on the real API) → gate → phase 1, phase 2  │
                                                                      ▼
Wave 2  (21 Oct)
  A backend-engine : P3b apply rulebook rules (needs C) + P4 cleared list
  B ui-builder     : P3 Rules screen + P4 cleared panel + P5 Report (on the mock)
  C ai-pipeline    : P5 Ask with a finding as context
  F e2e-tester     : new flow spec: Load demo → Checks → honey Fail → crops → mark → report
                                                                      │
  lead: integrate → gate → phase 3, 4, 5                              │
                                                                      ▼
Wave 3  (21 Oct night → 22 Oct morning)
  lead           : demo snapshot, README, wording sweep, hosted link, fresh clone (P8)
  ui-builder     : rate-limit message + retry; fixes from the 10-minute user test
  backend-engine : stretch P6 India run, if Wave 2 closed on time
  e2e-tester     : final spec green on the snapshot
  gate-reviewer  : final review → phase 8
                                                                      ▼
22 Oct afternoon: P9 video and submit (lead + you)
```

## Agent briefs

Each brief names the phase, the files, the tests to make green and the done-when. The lead sends them as written, adding the contract commit hash.

### Wave 1

**A · `backend-engine` — P2 Phase 1: verdicts**
- Build `checks/verdicts.py`: turn the existing outputs (requirements, conflicts, math findings, rule findings, fact states) into `Finding`s. Triage in code: Fail = rule + code-checked evidence + a deterministic check; Needs review = AI meaning, AI-suggested fact, claim needing proof, rule for a person; Pass = requirement met, with where. Add `proof` for every math and unit finding.
- `GET /api/checks`; `POST /api/findings/{id}/decision` (logged in the existing decision log; a decided item keeps `verdict: review` and gains `decision`).
- In checker mode no design or brand-basics questions: a pack setting in `markets/company/market.yaml`, not an `if`.
- Tests: `test_verdicts.py` (one per triage rule; `basis: ai` never Fail); integration `test_checks_samples.py` (every `answer_key.yaml` item maps to exactly one finding with the right verdict; `flag: false` items never Fail; every Fail has a rule id and a checked source; no finding without evidence); `test_finding_decision.py`; `test_no_market_leak` green.
- Done when: `uv run pytest` green; the samples give the counts the tests expect.

**B · `ui-builder` — P2 Phase 2: Checks screen (on the mock)**
- Rail: 1 Files (Evidence) → 2 What we read (Facts) → 3 Checks → 4 Marked-up artwork (Markup) → 5 Report (placeholder until Wave 2); More tools: 3D pack. Remove Questions from the rail (code kept).
- `Checks.tsx`: Fail / Needs review / Pass groups with counts and a filter; `FindingCard` with title, why it matters, `RuleChip`s, evidence crops side by side (existing `SourceChip`/`PdfCrop`), expected vs found, `ProofLine` ("checked by code" or "AI judgement"), "Show on artwork" link to Markup.
- `Review.tsx` (or a tab on Checks): review items with "It's fine" / "It's a problem" / "Ask someone", the name field reused from the existing approver name; decided items show who and when.
- Top bar: "Not ready to print: N fail · M review" or "Ready to print".
- Tests: FindingCard shows rule, evidence and proof; verdict badge has an icon and a word; filters; a decision calls the API and moves the item; rail order; accessible names. `npm test --prefix frontend` green.
- Done when: the mock shows all three groups and a decision round-trip works against a stubbed fetch.

**C · `ai-pipeline` — P2 Phase 3a: read a rulebook**
- Prompt `extract_rulebook.v1.md` + schema: from a document's pieces, return rules with id, title, status, rule sentence, the cited piece ids and an exact quote, and a `checkType` guess from the contract list (`unsupported` when none fits).
- `extraction/rulebook.py`: run the task, then **code** quote-checks every rule against the cited pieces (reuse `quote_check`). Unverified → `quoteChecked: false`. Proposed rules kept but marked.
- Record one live run on `rulebooks/Dancing_Fish_US_Label_Rulebook.docx` into `tests/fixtures/ai/extract_rulebook_docx.json` (the only quota use).
- Tests: on the fixture, 21 rules, ids DF-01…DF-21, DF-21 proposed, all quotes checked; a doctored fixture with an invented rule gives `quoteChecked: false`; schema validation errors are reported, not swallowed.
- Done when: `uv run pytest` green; returns `RulebookRule` objects ready for A to apply.

**D · `pdf-geometry` — paragraph merge**
- In `readers/pdf_document.py`, merge consecutive lines of one text block into a paragraph piece (same column, line gap under 1.5× line height, no heading in between). Dieline reading (`pdf_reader.py`) is untouched.
- Tests: synthetic PDF with a wrapped paragraph gives one piece; on the rulebook PDF every rule sentence in `dancing_fish_us_label_rulebook.yaml` is inside a single piece; existing reader tests green.

**E · `rules-author` — citations**
- Check every legal citation in `rulebooks/dancing_fish_us_label_rulebook.yaml` against the official text (eCFR, FDA, USDA). Fix clause numbers or wording in the `why` notes only; never change a rule's meaning or `rulebook_key.yaml`. Report each citation as confirmed, fixed (old → new, with source) or unconfirmed.
- The lead rebuilds the .docx and .pdf afterwards.

### Wave 2

**A · `backend-engine` — P2 Phases 3b and 4**
- `checks/rulebook_apply.py`: apply `RulebookRule`s by `checkType` (present, absent / banned words, exact against the content sheet, size via piece font sizes, word_list, evidence_on_file → review, unsupported → review "no automatic check"). Unverified rules → review, never Fail. Proposed → no finding. `POST /api/rulebook`, `DELETE /api/rulebook`.
- `checks/cleared.py`: the cleared list with proofs (unit equivalence, UPC check digit, guide text ignored); hidden text becomes a `hidden` finding (Fail when a rule bans it, else review), never a fact.
- Tests: the sample rulebook gives exactly `rulebook_key.yaml` (12 / 3 / 5 / 1); every `flag: false` answer-key item is in `cleared` with a proof; hidden text never produces a fact.

**B · `ui-builder` — P2 Phases 3, 4 and 5 screens (on the mock)**
- `Rules.tsx`: upload a rulebook, each rule with its quote, verified or not, status, and the findings it produced.
- Cleared panel on Checks: "Checked and fine, not flagged", each with its proof.
- `Report.tsx`: print approval report (verdict line, every Fail and review item with rule and crop, the marked-up artwork poster reused from Markup, decisions log, rules used, sign-off line); print CSS, one click to print.
- "Ask about this finding" on each card opens the existing AskPanel with the finding as context.
- Tests: unverified rule shows a warning and no Fail; the report lists every Fail and review item and nothing without evidence; print view renders.

**C · `ai-pipeline` — P2 Phase 5: Ask a finding**
- `/api/ask` accepts `findingId`; the prompt gets the finding, its rule text and evidence quotes; the answer cites only those. Bump the ask prompt version; record one fixture.
- Tests: an answer that cites a fact or rule not in the finding is rejected.

**F · `e2e-tester` — new flow**
- Replace the demo-flow spec: Load demo → Checks shows the counts → open the honey Fail → both crops → "Show on artwork" → a review decision → Report print view. Add a rulebook upload step once Wave 2 A lands.

### Wave 3 (lead-led)
- Demo snapshot with findings, cleared and the rulebook (`scripts/make_demo.py`), so Load demo uses zero AI calls.
- Rate-limit message with retry (`ui-builder`).
- Wording sweep: no "brief" in UI, README, docs; README for Problem 2 with `npm install --prefix frontend`.
- Fresh clone test, repo size, hosted link; 10-minute test with a non-technical person, fixes.
- Stretch, only if Wave 2 closed on time: P6 India run (`backend-engine` + `ui-builder` switch), P7 self-test (changed copies; needs quota).

## Timeline

| When | Lead | In parallel |
| --- | --- | --- |
| 20 Oct evening | Step 0 contract, commit | — |
| 20 Oct night → 21 Oct morning | Integrate A + B, gates P1 and P2 | Wave 1: A, B, C, D, E |
| 21 Oct day | Integrate, gates P3, P4, P5 | Wave 2: A, B, C, F |
| 21 Oct night | Snapshot, README, wording | Wave 3 fixes |
| 22 Oct morning | Hosted link, fresh clone, user test, final gate | `e2e-tester`, `ui-builder` fixes |
| 22 Oct afternoon | Video, submit | — |

## Risks and fallbacks

- **The contract is wrong.** Only the lead changes it; a change goes to every running agent at once.
- **Quota runs out while recording.** The rulebook fixture is the one call that matters; record it first in Wave 1. Ask (Wave 2 C) can ship on its existing fixture.
- **Wave 2 A slips.** The Rules screen shows extracted rules without findings; the demo uses the market-pack findings only.
- **Integration breaks the UI.** The frontend keeps working on the mock; Load demo (snapshot) is the demo path, live upload is a bonus.
