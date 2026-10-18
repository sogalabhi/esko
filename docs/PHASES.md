# BriefForge — Phase plan with tests

The build order from `PLAN.md`, broken into tasks, tests and a checkpoint for each phase. A phase is done only when its checkpoint passes. Then we commit and tag, and move on.

## How testing works

| Layer | Tool | Where | Rules |
| --- | --- | --- | --- |
| Backend unit | pytest | `backend/tests/unit/` | Pure functions only. No files from disk, no network, under a second each |
| Backend integration | pytest | `backend/tests/integration/` | Real sample files from `samples/`. AI calls go through the **fake adapter**, which replays recorded responses from `backend/tests/fixtures/ai/` |
| Live AI | pytest, marked `live` | `backend/tests/live/` | Real Gemini calls. Never in the default run. Used to record fixtures and check model names |
| Frontend unit | Vitest + React Testing Library | `frontend/src/**/*.test.tsx` | Components and formatters, with mocked data |
| End to end | Playwright | `e2e/` | From Phase 4 on. The browser drives the real backend with recorded AI responses. One spec grows each phase |
| Static checks | pytest | `backend/tests/unit/test_no_market_leak.py` | From Phase 3 on. Fails if market-specific values (FDA, 21 CFR, oz, daily values, ₹…) appear in engine code outside `markets/` |

**The answer key:** `backend/tests/fixtures/answer_key.yaml` lists every known problem in Esko's samples (from the PLAN.md table): what it is, which files and locations prove it, and which check should catch it. It's written in Phase 1, before any detection code, and it's the target for every phase after that. The self-test in Phase 8 is this file plus planted breaks.

**Recording AI responses:** `npm run test:record` runs the live pipeline once and saves each AI response as a fixture. Integration tests replay them, so the tests are free and give the same result every run. If a prompt changes, re-record and review the diff.

**Commands (root `package.json`):**

| Command | Runs |
| --- | --- |
| `npm run dev` | Backend (uvicorn, reload) and frontend (Vite) together |
| `npm test` | Backend unit + integration, frontend unit |
| `npm run test:e2e` | Playwright |
| `npm run test:live` | Live AI tests (uses quota) |
| `npm run test:record` | Re-record AI fixtures |

## Who builds what (agents in `.claude/agents/`)

The main session (Opus 5.5) is the lead: it plans each phase, writes the answer key, owns the shared contracts (Pydantic models and `UI.md` §9), hands out work, integrates it and runs the gate. Each subagent starts with no memory of the conversation, so every hand-off is a precise brief: the phase, the files, the tests to make green.

| Agent | Model · effort | Owns | Why this level |
| --- | --- | --- | --- |
| `ui-builder` | Opus · high | Everything in `frontend/`: shell, components, screens, Pack Canvas (Konva), Rules map (React Flow) | The UI is half the demo score; polish and judgement matter most here |
| `pdf-geometry` | Opus · high | PDF reader (Phase 1) and pack geometry (Phase 6) | Hidden text, guide text, curved text and panel packing are the hardest algorithmic problems; wrong output poisons every later phase |
| `backend-engine` | Sonnet · high | FastAPI, models, Excel reader, units, conflicts, rule engine, nutrition math, barcode, questions, audit, storage | Well-specified logic with tests to hit; needs care, not invention |
| `ai-pipeline` | Sonnet · high | AI client, adapters, cache, prompts, schemas, fixture recording, bake-off | Prompt and schema design is fiddly but well bounded |
| `rules-author` | Sonnet · high, web access, no shell | `markets/us`, `markets/in`, `markets/company` YAML | Accuracy over speed; every record cites the official text and starts as "proposed" |
| `e2e-tester` | Sonnet · medium | Playwright specs in `e2e/` | Routine once the UI exists |
| `test-runner` | Haiku · low, read-only | Runs suites, summarises failures | Mechanical; cheapest model is enough |
| `gate-reviewer` | Opus · high, read-only | PASS/FAIL review at every checkpoint | An independent, careful second look before each commit |

**Parallel tracks.** Folders don't overlap, so these run side by side once the contracts exist:

| When | Track A (backend) | Track B (frontend) | Track C (data) |
| --- | --- | --- | --- |
| 15 Oct | Phase 0 setup (lead), then Phase 1: `pdf-geometry` (PDF) + `backend-engine` (Excel, models) | `ui-builder`: shell and shared components against `mocks/project.json` | Lead writes `answer_key.yaml`; `rules-author` drafts `markets/us` once the pack schema is fixed |
| 16 Oct | Phase 2 `ai-pipeline` + `backend-engine`; Phase 3 `backend-engine` | `ui-builder`: Evidence, Facts, Questions screens on mocks | `rules-author` finishes US; lead reviews and approves records |
| 17 Oct | Phase 5 brief and audit | Phase 4/5 wiring to the real API; `e2e-tester` | `rules-author` drafts `markets/in` |
| 17–18 Oct | Phase 5A finding locations (`pdf-geometry`) | Phase 5A red pen, sticky notes, track changes | — |
| 18–19 Oct | Phase 6 `pdf-geometry`; 6A readability and contrast math (`backend-engine`); Phase 7A fold geometry (`pdf-geometry`); Phase 8 `ai-pipeline` (bake-off) | Pack Canvas, shopper lenses, 3D Pack View, Rules map, Claims, Trust screens | India pack review |
| 21–27 Oct | 10A face detection and flattening (`pdf-geometry`), two-reader merge (`ai-pipeline`), live checklist (`backend-engine`); 10B red-pen panel images | Capture page, 3D twin, AR page (`ui-builder`) | Print and fold the carton props |

**Rules for using agents**
- The lead fixes the contract first (Pydantic models + `mocks/project.json`) so tracks can't drift.
- One agent per folder at a time; two agents never edit the same file in parallel.
- `test-runner` after every hand-off, `gate-reviewer` before every phase commit.
- A person approves rule records and the answer key; agents never mark their own work approved.

## The checkpoint gate (same for every phase)

1. `npm test` is green (and `npm run test:e2e` from Phase 4 on).
2. The phase's manual check is done by a person, in the browser or terminal.
3. The phase's "done when" from `PLAN.md` is true.
4. Commit `phase N: <summary>` and tag `phase-N`. A bad next phase is then one `git reset` away.

---

## Finish line (18–22 Oct) · submission 22 Oct, submit by afternoon

This section replaces the dates in Phases 6A–10. **In:** Rules map, Claims and Trust (US only, each framed as feeding the brief). **Cut until after submission:** 6A (shopper lenses), the India switch, Time Machine, the 8 bake-off, all of 10. **Hard feature freeze at the end of 20 Oct**; 21 Oct is for the video only.

**18 Oct — close Phase 5, hide loose ends**
- Commit the brief writer, the brief and ask routes, `Pack.tsx` and their tests. Make the flaky frontend tests (5 s timeouts) reliable. Tag `phase-4`, `phase-5`, `milestone-e2e`.
- Regenerate `backend/demo/snapshot.json` so "Load demo" reaches the brief (now `brief` and `trust` are null).
- Hide unbuilt controls: the India toggle and the launch-date slider. Keep `markets/in/` as data. It's the answer to "how do you add a country?". The Rules map, Claims and Trust links stay; they get built on 19–20 Oct.
- **Commit and tag before the day ends** (once the running agents report): review, full `npm test`, chunked commits, tags `phase-4`, `phase-5`, `milestone-e2e`.
- Declutter the 3D pins and the 2D red pen: findings in one region become one mark with a count (in progress).
- Pack screen: no fixture fallback (`SAMPLE_FINDINGS`, `SAMPLE_MISSING`) on a live project, which shows an empty state instead. Missing items go to their fit-engine slot, not one hard-coded spot.
- Wording: "can't lie" and "zero hallucination" become "every claim traces to its source" (PLAN.md, PRODUCT_OVERVIEW.md, UI copy).
- Lock the demo story (below).

**19 Oct — Problem 1 fit**
- Questions as planned in PLAN.md, Smart Questions: a window of 10, 3 slots for design, brand basics (target buyer, how the pack should feel, deadline, print method) from `markets/company/`, and waiting or unanswered questions sent to the brief. Tests: the Phase 3 list.
- Every finding feeds the brief: each resolved finding becomes one line in Keep / Change / Add / Remove, and each open one becomes a line in Open questions. Test: no finding on the samples is missing from the brief.
- Conflict answer options use the code template ("Keep: X. Remove: Y"), never a vague AI label like "Keep Certified Vegan claim".
- New-product mode (PLAN.md, Smart Questions, "Two modes"). Tests: `test_project_mode` (sheet only gives new product; sheet + dieline gives redesign; a pack photo gives redesign); `test_question_source_wording` (no "Printed" for a value that is only on the sheet); integration `test_sheet_only` (the Excel alone with recorded AI gives facts, the math conflicts, brand-basics questions that ask for things, a brief with "Must include" and no "Keep" lines); frontend: with no dieline, Pack, 3D and the markup screen show the empty state and no sample pins.
- UI: the 5 steps stay the main path. Rename Markup to "What to change on the old pack" and move it and the 3D view under "More tools". Each step ends with one next button ("Next: answer 3 questions").
- Facts table: a small "read by AI · checked by code" line per fact, and "AI-suggested · quote not found" when the check failed.
- **Claims** (UI.md 6.7, US only): each claim word in the pack copy and the sheet is underlined red (not allowed), amber (needs proof or a condition) or green (fine). Hover shows the rule, the reason and safer wording to discuss with legal. Verdicts come from `markets/us/claims.yaml` plus the rule engine (code). AI only judges meaning with a rule citation, and a verdict citing no rule is dropped. A person's keep or remove decision is logged and feeds the brief's "Allowed claims" section. Tests: No Added Sugar with honey is red; Certified Vegan with honey is red; GMO free is amber; USDA Organic is amber without a certificate on file; every verdict carries a rule ID; the brief's claims section matches the decisions.
- **Rules map** (UI.md 6.6, React Flow, US only, no market fade): Product facts → Rules → Required pack items, built from `project.facts`, `project.rules` and `project.requirements`. Node colour plus an icon and a word for each state. Clicking a rule opens its text, source link, dates and why it applies here. Answering a question turns the affected nodes green. Tests: every requirement node links to at least one rule and one fact; states match the requirements; nodes have accessible names.

**20 Oct — prove it isn't hard-coded, then ship**
- Trimmed Phase 8: changed copies of the samples (honey % changed, address removed, allergen deleted, net quantity changed, a "100%" claim added). Each run on recorded AI is caught. The result "caught X of Y" with every miss and its reason goes on a minimal Trust screen.
- **Trust** (UI.md 6.8, PLAN.md section 9): cards for evidence coverage (% of facts with a checked quote), AI-suggested still open, conflicts resolved by a person, and the self-test score. A "Run self-test" button shows planted problems as Caught or Missed, with the reason for each miss. Below that, the change log and the rules used (clause, link, approved or not).
- The Trust screen also has "AI was wrong, code caught it" (quotes downgraded, made-up fact IDs rejected, sentences the audit blocked) and "What we can't catch yet": a wrong sentence with no number, unit or claim word in it; a fact the AI never extracted; artwork text hidden in an image the vision model misread.
- Show a clear UI message and a retry button when the AI provider is rate-limited (the client already retries and falls back between models).
- Hand the files to someone non-technical and watch for 10 minutes without helping. Fix every place they get stuck, and remove jargon.
- Phase 9 ship: README in a few steps, sample files included, repo under 50 MB, a hosted link, and a fresh-clone test.

**21 Oct — the video and the write-up**
- Record the 4-minute story: the problem in Esko's own words (20 s) → drop the files, the hidden EU table caught (30 s) → honey 9% vs 1% with the source crop, and 480 g vs 16.9 oz *not* flagged (50 s) → ranked questions, answer one and watch the ripple, a logo question visible (50 s) → brief: type a wrong number, the violet underline locks Approve, fix it, approve (50 s) → export and checklist, 3D in under 15 s (25 s) → one-line close that names the limits (15 s).
- Write the voiceover, cut out loading waits, zoom in on what matters. Simplify the architecture diagram for judges.

**22 Oct — buffer.** Submit by afternoon.

**Campus round prep (10 min demo + 5 min Q&A):** "What if the AI misses a fact?" · "How do you add a new country?" (show `markets/in/`) · "Does it work on other files?" (the changed copies) · "Why Gemini?" · sources for the 45% recall and 33% budget figures.

---

## Phase 0 — Setup (15 Oct, morning)

**Build**
- Backend: `uv` project pinned to Python 3.12; FastAPI app with `GET /api/health`; settings loaded from `backend/.env`.
- AI client: `ai/client.py` takes a task name, a prompt version and a Pydantic schema. Adapters: `gemini.py` and `fake.py`. Cache keyed by file fingerprint + prompt version + model. Retry with a wait on rate limits. A `ping` task.
- Frontend: Vite + React + TypeScript + Tailwind, design tokens from `UI.md` §3, one page that calls `/api/health`.
- Root `package.json` with `dev` and `test` (via `concurrently`). `CLAUDE.md`, README stub.

**Unit tests**
- `test_health`: `GET /api/health` returns 200 and `{"status": "ok"}`.
- `test_settings`: the app starts without `LLM_API_KEY`; the AI client raises a clear "key missing" error only when called.
- `test_ai_cache`: the same key is a hit; changing the prompt version, model or file fingerprint is a miss.
- `test_ai_client`: the fake adapter returns schema-valid output; invalid JSON is retried once and then raises a clear error; a rate-limit error waits and retries (clock mocked).
- Frontend `App.test.tsx`: shows "Backend OK" when health succeeds and "Backend unreachable" when it fails.

**Live test**
- `test_live_ping`: Gemini returns JSON matching the ping schema with the model name in config.

**Checkpoint:** `npm run dev` opens a page that says "Backend OK"; `npm test` is green; `npm run test:live` passes once.

---

## Phase 1 — Read files with positions (15 Oct)

**Build**
- `SourcePiece` model: id, file id, text, location (page + bbox in mm + panel, or sheet + cell), layer, font size, status (`visible` / `ignored` / `hidden`) and a reason.
- Excel reader: columns A–C plus the notes columns. A note is attached to the value it describes. Formula cells are skipped (they're Excel 365 `LET` formulas with no stored values).
- PDF reader:
  - text lines with boxes;
  - letter-spaced text rebuilt ("1 5 g" → "15 g");
  - curved text rebuilt from single letters along an arc;
  - each piece mapped to a panel using the Artwork panel layer geometry.
- Guide text goes to an ignored list. First approach: read the layer for each text span (PyMuPDF's text trace and drawings report the layer). Fallback: font size plus a stop-list.
- Hidden text: a piece is hidden when an opaque fill drawn later covers its box. Drawing order comes from the text trace and drawing sequence numbers.
- `POST /api/files` (upload) and `GET /api/files/{id}/pieces`.
- A dump script: `uv run python -m app.readers.dump <file>` prints pieces grouped by panel or cell.
- **Write `answer_key.yaml` first.**

**Unit tests**
- `test_letterspacing`: "1 5 g" → "15 g"; "2 . 2 g" → "2.2 g"; "Ty p i c a l Va l u e s" → "Typical Values"; normal text like "Total Fat 15g" is left alone.
- `test_arc_text`: single-letter spans along an arc rebuild to "PACKED WITH GOODNESS".
- `test_guide_filter`: "Art orientation", "Copy free", "gl1" and "Principal Display Panel" are ignored with a reason; "INGREDIENTS:" is kept.
- `test_panel_mapping`: a point inside a panel's rectangle returns its name; a point outside returns none.
- `test_hidden_text`: a tiny PDF built in the test with text and then a white rectangle over it gives `hidden`; the same text uncovered gives `visible`.
- `test_xlsx_reader`: a tiny workbook built in the test; value and note pair up; formulas are skipped; merged cells are handled.

**Integration tests (real samples)**
- Carton:
  - "Honey (1%)" is visible on the Back panel;
  - "Nutrition Facts" and "Calories 166" are on the Left panel;
  - "480g" is on the Back panel;
  - "BERRY CRUNCH" is on the Front;
  - the ignored list contains "Art orientation" and "Copy free";
  - every piece of the EU "Typical Values per 100g" table is hidden;
  - no visible piece contains guide text.
- Sheet:
  - B26 contains "Honey (9%)";
  - B24's note mentions "May Contain";
  - E12 is "1 20000 00003 6";
  - no piece text starts with "=".
- API: uploading both files returns 200 and the piece counts.

**Checkpoint:** run the dump script on both samples and read the output by hand; nothing important is missing and no guide text is visible.

---

## Phase 2 — Facts and the quote check (15–16 Oct)

**Build**
- `Fact` model matching `UI.md` §9.
- Extraction tasks: one for the carton (each panel's text plus a rendered image of the panel) and one for the sheet. A vision task reads the image-only marks (Certified Vegan, USDA Organic, recycling).
- Quote check: a fuzzy match (rapidfuzz) against pieces at the stated location. A match confirms the fact; otherwise it's AI-suggested.
- Sheet notes containing "assumed" or "confirm" make the fact AI-suggested.
- Units: pint, covering g, kg, oz, mg, mcg/µg, kcal and kJ.
- Reconcile:
  - value conflicts, compared after unit conversion;
  - an ingredient list diff that normalises names and spots duplicates;
  - meaning conflicts as an AI task whose output must cite real fact IDs.
- `GET /api/project` returns files, facts and conflicts in the `UI.md` §9 shape. Record AI fixtures.

**Unit tests**
- `test_units`: 480 g vs 16.9 oz is no conflict; 0.2 kg equals 200 g; sodium 25 mg vs 23 mg is a conflict; "89mcg", "89 µg" and "15g" all parse; kJ converts to kcal.
- `test_quote_check`: an exact quote confirms; case, spacing and letter-spacing differences still confirm; a real quote at the wrong panel is AI-suggested; an invented quote is AI-suggested.
- `test_ingredient_diff`: carton vs sheet gives added walnuts, flax seeds, dried strawberries and pumpkin seeds, and a duplicate sunflower seeds; "Vegetable Oil (Rapeseed and Sunflower…)" matches "Vegetable Oils".
- `test_value_conflict`: honey 9% vs 1% is a conflict; "480g" vs "480 g" is not.
- `test_fact_state`: a value with a "confirm" note is AI-suggested.
- `test_meaning_conflict_guard`: AI output citing an unknown fact ID is rejected.

**Integration tests (fake adapter replaying fixtures)**
- The honey, carbohydrate, sodium and ingredient list conflicts are present, each with sources in both files.
- A Certified Vegan mark fact exists with a source on the Front panel.
- No conflict uses a value from the hidden EU table.
- Every fact has at least one source with a quote; every confirmed fact has a checked quote.
- The `/api/project` response validates against the schema.

**Checkpoint:** open `/api/project` and read the facts and conflicts against the answer key.

---

## Phase 3 — Market packs, rules, math, questions (16 Oct)

**Build**
- Market pack schema and loader (Pydantic, with clear errors).
- `markets/us/`:
  - `market.yaml`;
  - about 20 rule records in `rules/*.yaml`;
  - `daily_values.yaml`, `allergens.yaml`, `claims.yaml` and `pack_items.yaml`.
- `markets/company/`: USDA Organic and Certified Vegan conditions.
- Rule engine:
  - "applies if" conditions (all / any / not, fact present, contains ingredient, claim used, pack type);
  - the date filter (in force, coming, proposed, withdrawn);
  - check types (present, exact, range, size, word list).
- Nutrition math: daily values recomputed, calories from fat, carbs and protein (9/4/4) within a tolerance, and servings × serving size against net weight.
- Barcode check digit (UPC-A and EAN-13).
- Requirements with statuses. Questions:
  - turned from gaps and conflicts;
  - ranked by how many requirements they unlock;
  - capped at 10, with duplicates merged;
  - AI wording for the text and the "why".
- `POST /api/answers` applies an answer and recomputes everything.
- Design keep/change questions for brand assets found in the old design (logo, photo, colours, tagline, marks); answers feed keep / change / add / remove.

**Unit tests**
- `test_pack_loader`: the US pack loads; a broken record gives an error that names the file and field; proposed rules are never evaluated.
- `test_applies_if`: every operator, true and false cases.
- `test_date_filter`: the day before, the day of and the day after a start date; withdrawn rules drop out.
- `test_dv_math`: fat 15 g gives about 19%; vitamin D 89 mcg about 445%; sodium 23 mg about 1%; a correctly printed value passes.
- `test_calories`: 15 g fat, 66 g carbs and 34 g protein give about 535 kcal, so 166 is flagged; a consistent label passes.
- `test_serving_math`: 8 × 85 g ≠ 480 g is flagged; 8 × 60 g passes; a serving size with no unit is flagged.
- `test_barcode`: 120000000036 is valid; changing any digit makes it invalid; one EAN-13 example.
- `test_question_rank`: more unlocks ranks higher; at most `question_budget` (10) open; answering one removes the questions it settles and the next waiting one moves up; the waiting count is reported.
- `test_question_slots`: with 12 decisions and 5 design questions, 7 decisions and 3 design are open; with 1 design question, 9 decisions fill the rest; the budget and reserved slots are read from the company pack, not code.
- `test_brand_basics`: with no target buyer, feel or deadline in the files, each becomes a design question; when a file gives one, it isn't asked.
- `test_open_questions_in_brief`: open and waiting questions all appear in "Open questions for the agency", marked not confirmed.
- `test_no_market_leak` (static): no US values in `backend/app/`.

**Integration tests (samples + US pack)**
- These are flagged:
  - the "No Added Sugar" claim and the 0 g added sugars line;
  - the tree-nut "may contain" problem;
  - the wrong daily values;
  - the calories;
  - the serving math;
  - the missing address;
  - the missing oz on the front.
- The barcode passes.
- There are at most 10 open questions, at least one is a design question (the logo), and the honey/vegan question is in the top 3.
- Answering "keep honey, remove vegan claims" resolves the vegan conflicts and changes the expected requirements (the ripple).

**Checkpoint:** `uv run python scripts/score.py` (in `backend/`) prints the answer key coverage (caught / missed, with reasons). It's our first honest score; write it in the commit message.

---

## Phase 4 — Core UI flow (16–17 Oct)

**Build**
- First, against `frontend/src/mocks/project.json` (the Dancing Fish data from `UI.md` §6.2):
  - the shell (top bar, left rail, source drawer);
  - the shared components (SourceChip, StateBadge, ConflictCard, QuestionCard, RuleChip);
  - Evidence, Facts (table, filters, conflicts column, list diff) and Questions (stack, answer, undo).
- Then wire it to the API. TypeScript types are generated from the backend's OpenAPI, so the two sides can't drift.
- WebSocket progress events: `fact_found`, `conflict_found`, `file_done`.
- More inputs: Word reader (python-docx, paragraph locations), plain-PDF document reader (page + line, no panels), notes (pasted text or .txt, line numbers), JPG/PNG via vision (AI-suggested). Tests: one fixture per type parses with locations; a fact from each type shows a correct source chip.
- Source drawer: a PDF.js crop of the panel with a highlight box, and a sheet grid with the cell outlined.

**Unit tests (Vitest)**
- StateBadge: every state shows an icon and a word, not colour alone.
- SourceChip: labels read "Carton · Back" and "Sheet · B26"; a click opens the drawer.
- ConflictCard: both halves render; resolving collapses it to "Resolved by … · use sheet value".
- QuestionCard: suggested answers are buttons; keys 1–4 pick one; "Ask someone" produces a message to copy.
- Facts filters: "Conflicts" shows only rows with conflicts.
- Contract test (backend): `mocks/project.json` validates against the `Project` schema.

**E2E**
- Upload both samples, and the counter shows conflicts.
- Open the honey conflict; the drawer shows "Content sheet · B26" and the carton highlight.
- Resolve it, answer the top question, and see the Fact Sheet update.

**Checkpoint:** click through the flow by hand at 1280 px and at 1024 px.

---

## Phase 5 — Brief, audit, export (17 Oct) · milestone: end to end

**Build**
- Brief model. A writer AI task takes facts, requirements and decisions in, and returns sentences that carry fact IDs.
- Audit: pull every number with its unit, and every claim word, out of each sentence; each must match a fact (after unit conversion) or the sentence is rejected.
- Editor: violet underline on unproven text.
- Approve stamps the name and time.
- Export: PDF (print stylesheet) and checklist JSON built from the requirements. Change log.
- "Ask about this" side panel (closed by default): answers from facts with sources; a confirmed answer becomes a fact. Test: an answer citing no fact is refused.

**Unit tests**
- `test_audit`:
  - "Net weight 480 g (16.9 oz)" with the right fact IDs passes;
  - "12% honey" is rejected;
  - "vegan" is rejected after the decision to remove vegan claims;
  - a number with no fact ID is rejected.
- `test_checklist`: each requirement becomes one checklist item with its panel and what to look for.
- `test_approve`: Approve records the name and time; an edit after approval bumps the version and clears the approval.
- Frontend: a typed number that isn't a fact gets the violet underline; Approve is disabled while unproven text exists.

**Integration:** the full pipeline on the samples with recorded AI produces every section, zero unproven sentences after the audit, and a checklist JSON that validates.

**E2E:** upload → resolve → answer → brief → approve → both exports download.

**Checkpoint:** a full run in the browser, timed. Tag `milestone-e2e` as well as `phase-5`. **This is a valid entry even if nothing after it gets built.**

---

## Phase 5A — Reviewer lenses: red pen, sticky notes, track changes

*Outline only; tasks and tests are detailed when the phase starts. Spec: `PLAN.md`, "Lenses".*

**Build (outline):** the shared finding-location layer (file, panel, position in mm) used by every later lens; pins on the flat dieline; red-pen markup with self-drawing strokes and a Clean / Marked toggle; sticky notes by owner (Legal / R&D / Brand); track changes for ingredients, allergens and claims; A3 wall poster export.

**Tests to expect:** each finding maps to exactly one spot inside its panel; a mark for every open finding and none for resolved ones; the owner assigned to every conflict; the track-changes diff matches the ingredient diff from Phase 2; marks have an accessible name and text, not only a drawing (Vitest); e2e: toggle Marked, click the honey mark, the drawer opens both sources; the poster export is one page.

**Checkpoint:** every open finding on Esko's carton has a mark at its real spot.

---

## Phase 6 — Pack Canvas (18 Oct)

**Build**
- Panels in mm from the Cut, Crease and Artwork panel layers.
- Locked zones from the existing brand art boxes.
- Block sizes from the pack's minimum sizes and real text length.
- Packing (rectpack) around the locked zones, space meters, overflow and suggested fixes.
- Konva canvas and the "changes vs current pack" toggle.

**Unit tests**
- `test_dieline`: the sample gives five named panels whose sizes are within ±1 mm of values measured by hand (stored in a fixture).
- `test_block_size`: longer text makes a bigger block; the minimum font size is respected.
- `test_packing`: everything fits when there's room; extra blocks overflow; no block overlaps a locked zone.
- `test_fixes`: an overflow produces at least one fix, and applying it clears the overflow.
- Frontend: a meter over 100% shows the word "Over" as well as red.

**Integration:** the corrected US content fits on the sample carton; adding test items makes the back panel overflow.

**E2E:** the Pack screen shows the five panels and the meters.

**Checkpoint:** compare the canvas with the rendered PDF by eye; panels line up.

---

## Phase 6A — Shopper lenses: personas, shelf test, glance, accessibility

*Outline only; tasks and tests are detailed when the phase starts.*

**Build (outline):** shopper personas (nut allergy, vegan, watching sugar, low vision; India personas once that pack exists) as filters over findings plus one-line AI verdicts that pass the brief audit; the shelf-distance test (readability per required item from type height and distance); the 3-second glance heatmap; colour-blindness and contrast checks on the rendered artwork; the confidence glow; the before / after wipe.

**Tests to expect:** each persona shows only findings tagged for it; a verdict that mentions a fact not in the findings is rejected by the audit; readability math on hand-made cases (bigger text, readable further away); contrast ratio math on known colour pairs; every estimate screen carries the word "estimate" (Vitest); e2e: pick the nut-allergy persona and the "may contain" finding is highlighted.

**Checkpoint:** the nut-allergy verdict on Esko's carton is correct and sourced; the shelf test names the first unreadable required item with its numbers.

---

## Phase 7 — India pack, Claims Radar, Time Machine, Rules map (18–19 Oct)

**Build**
- `markets/in/` as data only.
- Market switch with the change banner.
- Claims Radar: word lists plus AI judgement with rule citations.
- Launch-date slider wired through every screen.
- React Flow rules map with animated state changes.

**Unit tests**
- `test_in_pack_loads` through the same loader.
- `test_no_market_branching` (static): no `if market == ...` anywhere in `backend/app/`.
- `test_market_switch`: the same facts under US vs India; India adds the veg mark, MRP, unit sale price, FSSAI licence and consumer care, and removes the oz quantity.
- `test_claims`:
  - "No Added Sugar" with honey is red in the US;
  - "GMO free" is amber;
  - "100% natural" is red in India with the advisory ID.
- `test_time_machine`: India on 30 June 2027 vs 1 July 2027 switches the amendment rules.
- Frontend: number and currency formats follow the selected market; map nodes show an icon and a word.

**Integration:** switching to India on the samples makes the back panel overflow.

**E2E:** switch the market and check the banner count; slide to July 2027 and the amendment appears.

**Checkpoint:** run demo moments 1–3 back to back without touching code.

---

## Phase 7A — 3D Pack View: fold the box, pin the problems

*Outline only; tasks and tests are detailed when the phase starts. Must be solid by feature freeze, or the 2D pins ship and 3D moves to Phase 10.*

**Build (outline):** panels and hinge lines from the Cut and Crease layers (tuck-end carton); the artwork rendered once and cropped into face textures; the fold animation; pins from the shared finding locations with camera fly-to and the source card; X-ray mode with ghost boxes for missing items; the market switch updating the box; 3D snapshots in the exported brief. Stretch: glTF export and AR via a QR code.

**Tests to expect:** the hinge graph from the sample dieline connects every panel and folds into a closed box (no overlapping faces at 90°); a point in PDF mm maps to the same spot on its 3D face and back again; every finding gets exactly one pin; X-ray ghost boxes exist for every missing required item; the 3D view renders without WebGL errors in Playwright; snapshots appear in the exported brief.

**Checkpoint:** Esko's carton folds into a closed box with the artwork on the right faces, and clicking the honey pin opens both sources.

---

## Phase 8 — Trust Console, self-test, bake-off (19 Oct) · feature freeze

**Build**
- Mutators make broken copies of the sample. The sheet is edited for real with openpyxl. The carton is broken at the extracted-pieces level, which we say openly in the README.
- The mutations:
  - delete an allergen;
  - change the net quantity;
  - add a "100%" claim;
  - change a barcode digit;
  - move the quantity off the front;
  - break a daily value.
- Runner and metrics: gap recall, conflict precision, wasted questions, citation accuracy, time to brief.
- Scoreboard screen and change log.
- Bake-off: the runner across 2–3 models (live, cached).

**Unit tests**
- Each mutator changes exactly one thing, and the same seed gives the same result.
- `test_metrics`: hand-made results give the right precision and recall, including the case where nothing was flagged.

**Integration:** the runner over the clean and broken copies (recorded AI) gives a score, and every miss has a reason.

**Checkpoint:** "caught X of Y" shows on screen; the bake-off table is in the README; the winning model is set in config. **Feature freeze: bug fixes only after this.**

---

## Phase 9 — Ship (20 Oct)

**Build:** README, architecture diagram, write-up, Dockerfile, hosted demo, reset button, cached demo data, the video.

**Tests**
- Fresh clone: clone into a temp folder, follow only the README, `npm run dev`, then `npm run test:e2e` passes.
- The Docker image builds and the health check passes inside it.
- The reset button restores the demo state (e2e).

**Checkpoint:** a person who has never seen it runs it from the README; every submission field is filled; submitted well before 11:59 PM.

---

## Phase 10 — Campus extras (21–27 Oct)

Any lens that missed feature freeze comes first, then Phases 10A and 10B. Then each extra (second product, English + Hindi in the India pack, AR "on your table", competitor snap, Check-back) ships with its own tests under the same gate. Prepare two printed and folded Esko cartons (rendered with guide layers off), the "Spot the mistakes" opener and a printed A3 poster. Three full rehearsals with the reset button.

---

## Phase 10A — Scan to brief

*Outline only; tasks and tests are detailed when the phase starts. Spec: `PLAN.md`, "Beyond files".*

**Build (outline):** the mobile capture page over HTTPS; box-face detection, sharpness score and auto-capture; perspective flattening with a manual corner fallback; the 3D twin filling in face by face; upload per panel while scanning; two readers per panel (local OCR + vision model) and the agreement rule; the live "what to scan next" checklist from the requirements engine; close-up requests; the bank-card scale; photo-crop source chips; then the normal pipeline.

**Tests to expect:** the flattening of a synthetic skewed panel photo recovers the straight-on rectangle; a blurred frame is rejected by the sharpness score; reader agreement gives Confirmed and disagreement gives AI-suggested; the checklist after a front-only scan names the address and Nutrition Facts as still missing; the card scale converts pixels to mm within a small tolerance; integration: photos of the printed carton (kept as fixtures) give the same answer-key findings as the PDF route, and none from the hidden EU table.

**Checkpoint:** "two routes, same answer" on the printed carton, live, on a real phone.

---

## Phase 10B — Live AR on the real box

*Outline only; tasks and tests are detailed when the phase starts.*

**Build (outline):** panel target images rendered from the PDF and compiled for MindAR.js; one transparent red-pen image per panel from the backend; the AR page over HTTPS with a QR code; a fallback anchor for weakly tracked panels. Stretch: "snap any pack" with competitor claims as brief context.

**Tests to expect:** each red-pen panel image has the same size as its target and the marks sit at the finding locations (pixel check against the 2D red pen); the AR page loads with no AI calls (network log in Playwright); manual matrix: two phones × normal and dim light × still and moving hand.

**Checkpoint:** a person who hasn't seen it scans the QR code and sees the marks stay on the box as they turn it.
