# BriefForge: presentation study guide

For a 10-minute presentation. Read parts 1–3 first (the story and the numbers), then 4–6 (how it works), then 8 (questions you will get). Part 7 is the run sheet for the talk itself.

Facts here come from the code, `README.md`, `docs/PLAN.md`, `docs/PHASES.md` and `docs/VIDEO_SCRIPT.md`. Anything I could not confirm from the repo is marked **(check)**.

---

## 1. The one-minute version

**Say this if you remember nothing else:**

> BriefForge checks finished packaging artwork against the approved product information and a rulebook, and tells you what is wrong, what needs a person, and what is correct, with the evidence for each. The AI reads, the code proves, a person decides.

- **Event:** Esko AIForge hackathon, **Problem 2: "Is this packaging artwork ready to launch?"**
- **Inputs:** finished artwork (a dieline PDF), approved product information (an Excel content sheet), and a rulebook (official regulations plus the company's own rules, as a Word/PDF/text file).
- **Output:** a verdict of **Fail / Needs review / Pass** on every check, each with evidence, plus a print-approval report with a sign-off line.
- **Demo data:** Esko's own sample files, the Dancing Fish Granola Berry Crunch US carton and its content sheet. Esko planted a dozen or more real mistakes in them.

---

## 2. The problem and the business case

### The problem
Before a pack goes to print, someone checks the artwork line by line:
- Is every required statement there (net quantity, allergens, maker's address)?
- Does the text match the approved product information?
- Are the numbers right (% Daily Values, calories, serving size)?
- Does it follow the rules for the country and the company?

This is slow and manual. One missed line means a reprint, a recall, or a regulatory problem.

### The numbers to quote (with sources)
Two independent sources agree that labels, not pathogens, are the biggest recall driver:

- **Loftware analysis of FDA Enforcement Report data, 2024** (LinkedIn post, from the link you shared): **192 label-error recall events, about $1.92 billion estimated direct cost to the industry, 45% of all 2024 US food recalls.** Listeria was next at 15%. These are almost always preventable: wrong allergen statement, missing ingredient, outdated nutrition panel, translation error.
- **Esko, "FDA food and beverage recalls 2025"** (esko.com blog, FDA records Jan–Dec 2025): **251 recall events; 115 (45.8%) were allergen mislabeling**; foodborne illness was 94 (37.5%), with Listeria 42 and Salmonella 35. Esko's wording: "Nearly half of all recalls trace back to a label that was missing something it should have said."
- **Esko on the cause:** a formulation change is recorded in the specification document but the label artwork is not updated, so the link between spec and label depends on someone remembering to check. It also names market-specific allergen rules as a gap: a label approved for one market may not meet another's.

How to say it: *"In 2024 and again in 2025, close to half of US food recalls were label errors, not contamination. Esko's own analysis says why: the spec changes and the label doesn't. That drift between what was approved and what was printed is exactly what this tool checks."*

Be careful with the figures:
- The 45% (2024, Loftware) and the 45.8% (2025, Esko, allergen mislabeling only) are **different studies and years**. Don't blend them into one number; name the source and year each time.
- Esko says its figures are "directionally accurate rather than definitive" and gives no recall cost figure. The $1.92 billion is Loftware's estimate.
- I read the Esko page directly. The Loftware figures are from the post text you pasted; I did not open the LinkedIn page itself.

### Who uses it
| Person | Pain today | What they get |
| --- | --- | --- |
| Regulatory / QA reviewer | Checks the same items on every pack, late in the process | A first pass done by machine, with evidence; only judgement calls reach them |
| Brand manager | Doesn't know what is wrong until print or recall | A single verdict ("Not ready to print: N fail, M review") before approval |
| Agency designer | Gets vague corrections | Each problem marked on the real carton with the rule behind it |
| Approver | Needs a record | A sign-off report with every decision, who made it, and when |

### Why it is more than "ask an AI to look at the PDF"
1. **Trust.** A regulatory team cannot act on "the AI thinks this is wrong". Every Fail here cites a rule and shows evidence that code has checked.
2. **Few false alarms.** A checker that cries wolf gets ignored. It has a "checked and fine" list (valid barcode, ignored guide text) so a person sees what was cleared and why.
3. **Auditable.** Decisions are logged with a name. Nothing is resolved silently.
4. **Scales across countries.** A new market is a folder of YAML rules, not new code (see part 5).
5. **Company rules count.** The checker applies the company's own rulebook, not just the law, and rejects rules the AI invented.

---

## 3. What it finds on the demo files

**Counts.** `docs/VIDEO_SCRIPT.md` says the demo shows **29 fail · 11 review · 7 pass · 2 checked and fine** with the 21-rule rulebook loaded. The automated tests assert **23 fail · 10 review · 4 pass · 2 cleared** on the files alone, with no rulebook. Different runs, different numbers. **Open the app and read the real numbers off the top bar before you present**, and say those.

### The planted mistakes (examples to quote)
| What | Approved sheet says | Carton says | How it is caught |
| --- | --- | --- | --- |
| Honey | 9% | 1% | Value mismatch between the two files |
| Ingredient list | No walnuts/flax/strawberries/pumpkin seeds; "Sunflower Seeds" twice | Includes them | Item-by-item list comparison |
| % Daily Value, total fat | 15 g = 2.2% | Same | Code: 15 g ÷ 78 g = 19%, printed 2.2% |
| Vitamin D | 89 mcg = 12% | Same | Code: about 445% |
| Calories | 166 kcal | Same | Code: fat, carbs and protein don't add up |
| Serving size | "not clearly legible" | "85" with no unit; 8 servings in 480 g | Code: 480 ÷ 8 = 60 g, not 85 |
| Allergens | Almonds and pecans are ingredients, yet the box says "may contain" | Same | Rule: an ingredient can't be only "may contain" |
| "No added sugar" | Honey and coconut sugar are ingredients | Same | Claim vs ingredients; FDA counts them as added sugar. **Needs review** (AI reading) |
| Vegan | "Certified Vegan" | Honey is an ingredient; 45 mg cholesterol | Meaning conflict, found by AI, so **Needs review** |
| Net quantity | 480g | "480g" on the back only | US rule needs oz and g, on the front |
| Maker's address | — | No street/city/state/ZIP | US rule needs a full address |
| EU content on a US pack | — | EU icons and "Cereals Containing Gluten" | US format rules |
| **Hidden EU nutrition table** | — | Sits under the US panel, covered by a white fill | Visibility check; reported as hidden, never read as facts |
| Barcode | 1 20000 00003 6 | Same | Check digit valid → **Pass** / cleared |

### Company-rulebook findings
- **DF-16** bans "GMO free": found twice on the carton.
- **DF-18** minimum text size is 6 pt: the storage instructions are 5.8 pt (read from the PDF's font sizes).
- **DF-19** no hidden content: the hidden EU table is a Fail.
- **DF-21** is a *Proposed* rule, so it is **never applied** (a good proof point that rule status matters).

The rulebook has 21 rules (DF-01 to DF-21); the expected result for each is in `backend/tests/fixtures/rulebook_key.yaml` (12 fail, 3 pass, 5 review, 1 not applied).

---

## 4. How it works (tech, end to end)

```
 PDF / Excel / Word / image ─► READERS ─► pieces (text + panel + position in mm + visible/hidden/ignored)
                                              │
                     AI (Gemini) reads pieces ─► FACTS, each with a QUOTE
                                              │
                         CODE quote check ─► "checked by code" or "AI-suggested"
                                              │
        market pack (YAML) + company pack + uploaded rulebook ─► RULE ENGINE + math
                                              │
                          TRIAGE (code only) ─► Fail / Needs review / Pass  (+ cleared list)
                                              │
        Checks screen · marked-up artwork · decisions log · print-approval report
```

### 4.1 Readers (`backend/app/readers/`, `backend/app/pack/`)
- **PDF** (PyMuPDF): every text piece keeps its page, **panel** (Front, Back, Left, Right, Bottom) and **bounding box in mm**.
- **Guide text** (dieline labels like "Art orientation", "Copy free") is detected by layer and size and **ignored**, with a visible list. Note from `CLAUDE.md`: switching layers off in the PDF library does **not** remove guide text, so the reader tags it instead.
- **Hidden text** is detected by checking what is covered by an opaque fill. That is how the EU table under the US panel is found.
- **Letter-spaced text** ("1 5 g") and **curved text** are rebuilt in code.
- **Images** (certification marks like Certified Vegan, USDA Organic) are read by the vision model, so they are lower trust and only ever Needs review.
- **Excel** keeps the cell address (e.g. B26) and the cell's note. **Word/text** are supported too (the rulebook is a .docx).

### 4.2 Extraction and the quote check (`backend/app/extraction/`)
- The AI turns pieces into **facts** (honey = 9%, net quantity = 480 g…), each with a **quote** and the pieces it cites.
- **`quote_check.py`: code, not the model, decides whether the quote really is in the file.**
  - Case, spacing and letter spacing are ignored.
  - Short quotes (under 12 characters) must match exactly; longer ones may match fuzzily (score 92).
  - **Digits are never fuzzy**: every number in the quote must appear in the source. So "1%" can never be confirmed against "9%".
- Result: the fact is **"checked by code"** or **"AI-suggested"**. An AI-suggested fact **can never cause a Fail**.
- The same check applies to **rules the AI reads from a user's rulebook**. A rule whose wording is not in the document is rejected (the made-up rule demo).

### 4.3 Rules are data (`markets/`, `backend/app/markets/`, `backend/app/rules/`)
- A market pack is a folder of YAML: rule records, daily values, allergens, claim words, required pack items.
- Each rule record has a **regulation, clause, URL and an exact quote** from the official text, a plain summary, and a `status` (`in_force` or `proposed`).
- Packs: `markets/us/` (FDA), `markets/in/` (FSSAI and Legal Metrology), `markets/company/` (company-wide rules such as vegan).
- **No market-specific code.** There are no FDA values, units, currencies or `if market == ...` in `backend/app/`. A test enforces this ("market-leak check").
- Adding a country = adding a folder. That is the answer to "How do you add a country?"

### 4.4 Code does maths, AI does meaning
| Code (deterministic, provable) | AI (reading and meaning) |
| --- | --- |
| % Daily Values, calories, serving maths | Reading messy files into facts |
| Units and conversion (480 g = 16.93 oz) | Meaning conflicts ("Vegan" vs honey) |
| UPC check digit | Reading images and certification marks |
| Rule logic, required items, banned wording, text size | Turning rulebook prose into rule records |
| Geometry (panel, position, hidden text) | Wording of questions and answers |
| The quote check and the triage | — |

### 4.4b Exactly who does what: AI, code, or a person

**First, what "pieces to facts" means, with one real example.**
1. **Code** reads the carton PDF and cuts it into *pieces*: each piece is one line of text with an id, its panel, its page and its box in mm. For example `P12 · Back panel · "Honey (1%)" · x, y, w, h`. In the spreadsheet a piece is a cell, such as `B26 · "Honey (9%)"`.
2. **AI** is given those numbered pieces (plus a picture of each main panel) and returns a list of *facts* in a fixed format: group, field, value, unit, **a quote copied from the piece**, and **the ids of the pieces it came from**. Example: `{field: "Honey", value: "1", unit: "%", quote: "Honey (1%)", piece_ids: ["P12"], panel: "Back"}`. The prompt forbids inventing, inferring, calculating or correcting; it only copies what is printed into a tidy structure.
3. **Code** then checks the fact. Does the quote really appear in piece P12 (and the piece right after it, for wrapped lines)? Does every number in the quote appear in that text? If yes: **checked by code**. If no, or if a sheet note says "assumed / confirm": **AI-suggested**. Facts read from an image (certification marks) have nothing to check a quote against, so they stay AI-suggested unless another file says the same.
4. From here on, everything uses only the facts and their sources. The AI is not asked again who is right.

The point to make out loud: *the AI is a very good typist who must show its source. The code is the proofreader.*

**Where AI is used (every call is a schema-checked task with a versioned prompt, in `backend/app/ai/prompts/`):**
| What the AI does | Why it is AI | What code does with the answer |
| --- | --- | --- |
| Reads the content sheet into facts (`extract_sheet`) | Free-form cells and notes | Quote check; state = checked or AI-suggested |
| Reads the carton text and panel images into facts (`extract_carton`, `extract_image`) | Messy label text; marks like "Certified Vegan" exist only as images | Quote check; image facts stay AI-suggested |
| Reads other documents and images (`extract_document`, `extract_image`) | Same | Same |
| Finds contradictions in meaning (`meaning_conflicts`), e.g. "Vegan" claim vs honey in the ingredients | Needs understanding, not arithmetic | Must cite real fact ids (invented ids are dropped). The result is **Needs review, never Fail** |
| Reads the rulebook into rule records (`extract_rulebook`): id, title, status, the rule text, a quote, and a guess of how it could be checked | Rulebooks are prose | Every rule's quote is checked against the document. Unverified rules are never applied as a Fail; "proposed" rules produce nothing |
| Answers "Ask about this finding" (`ask`) | Plain-language explanation | Shown only if it cites that finding's own facts, rules and quotes, and every number in it appears in them. Otherwise it is refused |
| Optionally words a question more nicely (`question_wording`) | Wording | Falls back to the code's own wording if the answer is invalid or there is no AI |

That is the whole list. The AI never produces a verdict and never does maths.

**Where code is used, and nothing else:**
- Reading the files: PDF text with panel and position in mm, guide text removal, hidden text under a fill, letter-spaced and curved text, Excel cells, Word paragraphs.
- The quote check (digits never fuzzy).
- Comparing the two files: a value that differs, a different ingredient list, a name repeated in a list, units (480 g = 16.93 oz is not a conflict).
- Maths: % Daily Values, calories from fat, carbohydrate and protein, serving size against pack weight, sugars above carbohydrate.
- The UPC check digit.
- Rules: required items present, banned wording, minimum font size, hidden content, claim conditions. For an uploaded rulebook, what a rule looks for is read from the rule's own sentence by plain code, not from word lists in the engine.
- **The triage (Fail / Needs review / Pass)** and the "checked and fine" list.
- Marking up the artwork, the decisions log, the report.

**Where neither AI nor code decides, a person does:**
- Every **Needs review** item: "It's fine", "It's a problem", or "Ask someone", with a name, logged.
- Whether an AI-suggested fact is true.
- The content of the **rules themselves**: the market packs are written (with exact quotes from the regulation) by us as data, and most are marked `approved: false`, so a regulatory person should confirm them before real use. The company rulebook is the customer's own document.
- The **approved information** (the content sheet) is assumed to be the truth. If it is wrong, the tool compares against a wrong truth.
- The final sign-off.

**What nothing in the system does (say this before you are asked):**
- It does not judge design quality, colour, or whether a layout is attractive.
- It does not read text that has been converted to outlines or sits inside an image, except through the vision model (lower trust, always Needs review).
- It does not check evidence outside the artwork (a certificate on file, a clear area for a date code).
- It does not catch a wrong sentence with no number, unit or claim word in it, or a fact the AI never extracted.

**One-line answer for the room:** *AI turns messy text into structured facts and proposes meaning-level doubts. Code proves everything that can be proved, and is the only thing that can say Fail. People decide the rest.*

### 4.5 Triage: the only place a verdict is decided (`backend/app/checks/verdicts.py`)
```python
def triage(*, deterministic, basis, rule_ids, evidence):
    # Fail only if: a deterministic CODE check + a rule ID + every quote passed the quote check
    ...  # anything else -> "review"
```
- **Fail** = a rule is cited + the check is deterministic (math, mismatch, missing required item, banned word) + all evidence quotes passed the code check.
- **Needs review** = rests on AI meaning, an AI-suggested fact, a claim that needs proof, evidence the artwork can't show (a certificate), or a rule marked for a person.
- **Pass** = a requirement is met, with where it was found.
- A final `guard()` demotes any Fail that doesn't meet the bar to Needs review. **A candidate with no evidence at all is dropped.**
- Triage is never done by the AI.

### 4.6 The cleared list ("Not flagged, and why") (`backend/app/checks/cleared.py`)
Code-proven non-findings, each with its proof:
- a barcode with a valid check digit (digits give check digit X; printed X),
- the same amount printed in two units that agree (e.g. 480 g and its oz equivalent; this code exists but the sample carton prints only "480g", so it does not appear in the demo),
- the dieline guide text that was ignored (count, layer, examples).

### 4.7 AI layer (`backend/app/ai/`)
- **Provider:** Google Gemini by default, behind an **adapter interface** (`adapters/gemini.py`, `adapters/fake.py`). Model list is a fallback order in `settings.py` (the next model is tried when one is overloaded). **Check the exact model names in `backend/app/settings.py` before you say them.**
- **Versioned prompts** in `ai/prompts/` (`extract_sheet.v1.md`, `extract_carton.v1.md`, `extract_rulebook.v1.md`, `meaning_conflicts.v1.md`, `ask.v2.md`…). Changing a prompt means bumping its version.
- **Structured output:** every AI response is validated against a **Pydantic schema**; invalid output is rejected.
- **Cache key = file fingerprint + prompt version + model**, so the same file isn't paid for twice.
- **Tests never call the network.** They replay recorded responses from `backend/tests/fixtures/ai/` through the fake adapter. `npm run test:record` re-records (uses quota).
- The UI shows an "AI is busy" message with a Retry when the provider is rate-limited.

### 4.8 Backend and frontend
- **Backend:** FastAPI, Python 3.12 via uv, Pydantic models. Key routes: files, project/run, checks, rulebook, decisions, ask, demo. State is **in-memory** (`store.py`; a database is a later step). The decision log is replayed over the base run, so the project is always `replay(base, log)`.
- **Frontend:** React 19 + TypeScript, Vite, Tailwind 4, React Router, pdf.js for crops, three.js / react-three-fiber for the 3D pack view.
- **Screens (the main path):** 1 Files → 2 What we read → 3 Checks → 4 Marked-up artwork → 5 Report. "More tools": 3D pack.
- **Load demo** shows precomputed results with **zero AI calls**. Reading new files needs an API key in `backend/.env` (gitignored; never print it).
- **Deploy:** scripts in `deploy/` (VM setup, systemd unit, nginx site, a no-sudo shared-host script using a Cloudflare tunnel). **(check which URL is live before you give a link)**

---

## 5. The design rules that make it trustworthy

These are the project's non-negotiables (`CLAUDE.md`). They are your strongest talking points:

1. **Every fact has a source and a quote checked by code.** Unchecked means AI-suggested, never confirmed.
2. **No finding without evidence.** A Fail cites a rule and code-checked evidence. Anything resting on AI judgement is Needs review, never Fail.
3. **Rules are data**, never hard-coded; nothing market-specific in engine code.
4. **Conflicts are never resolved silently.** A person decides and it is logged.
5. **Code does math, units, rules, geometry. AI does reading, meaning, wording.** AI output is schema-validated.
6. **No chat-first screens.** Chat exists only as "Ask about this finding", and its answer may only use that finding's own rule and evidence.

---

## 6. How we know it is right (testing)

- **Two answer keys** written *before* the code, like an exam:
  - `backend/tests/fixtures/answer_key.yaml`: every known problem in Esko's files.
  - `backend/tests/fixtures/rulebook_key.yaml`: the expected verdict of every rulebook rule.
- Tests assert: every flagged key item maps to exactly one finding with the expected verdict; `flag: false` items never produce a Fail; every Fail has a rule ID and code-checked evidence; the AI-suggested items are reviews; no market leak in engine code.
- **Numbers from this session (27 Oct):** backend 523 passed, frontend 402 passed (42 files), Playwright e2e 7 passed. No network calls in any of them.
- Honest gap: the "self-test with changed copies" idea (catch X of Y, 0 false alarms) was a stretch phase and is **not built**.

---

## 7. The 10-minute run sheet

Rehearse it once with a timer. Do the demo on **Load demo** (no AI calls, no key needed, no network risk).

| Time | What you say / show | Screen |
| --- | --- | --- |
| 0:00–0:45 | **Problem.** Checking artwork before print is manual; one missed line means a reprint or recall. Errors start when the approved spec and the label drift apart. | Carton PDF |
| 0:45–1:30 | **Solution in one line.** "The AI reads, the code proves, a person decides." Three inputs: artwork, approved information, rulebook. | Files screen |
| 1:30–2:30 | **How it reads.** Panel and position in mm; guide text ignored; hidden table detected. | "What we read" |
| 2:30–3:15 | **The answer.** Read the top bar aloud: "Not ready to print: N fail · M review." Explain the three verdicts. | Checks |
| 3:15–4:45 | **A Fail you can trust.** Honey 9% vs 1%: both crops side by side. Then Total Fat: 15 g ÷ 78 g = 19%, printed 2.2%. "The code did that sum, not the AI." | Checks cards |
| 4:45–6:00 | **The company rulebook.** A Word file; the AI reads it into rules; code quote-checks each one; DF-21 is proposed so it is never applied. Show DF-16 "GMO free" and DF-18 5.8 pt. | Rules, then Checks |
| 6:00–6:45 | **Avoiding false alarms.** Checked-and-fine list; the hidden table as a finding, not facts. | Cleared + Marked-up artwork |
| 6:45–7:30 | **A person decides.** Open a Needs review item (HIGH-GRAIN), type a name, choose "It's a problem"; the top bar updates and the decision is logged. | Checks |
| 7:30–8:15 | **The report.** Verdict, every Fail with crops, marked-up carton, rules used, decisions log, sign-off line. | Report |
| 8:15–9:00 | **Scaling.** A country is a folder of YAML (`markets/in/` = FSSAI, already written as data). The engine has no market code, and a test enforces it. **Say the market switch is not in the UI yet.** | Slide or folder |
| 9:00–9:45 | **Limits, honestly.** (see part 8) | — |
| 9:45–10:00 | **Close.** Repeat the one-line promise. | Marked-up artwork |

**If you run long, cut in this order:** the Ask panel, then the scaling section, then the second Fail example.
**If the demo breaks:** go to the screenshots, or the Report screen, which is static once loaded. Have the PDF of the rulebook open as a backup.

---

## 8. Questions you will probably get

**"What if the AI misses something?"**
Then it isn't caught, and we say so. Checks run on facts the AI extracted, so a fact it never extracted is not checked. A wrong sentence with no number, unit or claim word in it is also not caught. What we guarantee is the other direction: nothing is *reported as a Fail* unless code verified it.

**"How do you avoid false alarms?"**
Three ways: (1) the quote check, with digits never fuzzy; (2) the cleared list, which shows what was checked and fine; (3) anything resting on AI judgement can only be Needs review, so a person sees it instead of a false Fail landing on the agency.

**"How do you add a country?"**
Add a folder under `markets/` with rule records (regulation, clause, URL, exact quote), daily values, allergens, claim words and required items. India (FSSAI, Legal Metrology) exists as data. No engine code changes; a test fails if market-specific values leak into the engine. *Limit: the in-app market switch is not built yet.*

**"Does it work on other files?"**
It is built on Esko's samples, which is what we tested against. The readers handle PDF, Excel, Word, text and images. Be honest: we have tested against one product and one carton, and the self-test with changed copies was not built.

**"Why Gemini?"**
It reads PDFs and images and has a free tier for the hackathon. The AI sits behind an adapter interface, so it can be swapped; tests use a fake adapter. **(Don't claim it was benchmarked against others, because there was no bake-off; it was cut.)**

**"Why can't the AI just do all of it?"**
Arithmetic, unit conversion and rule logic are things code does exactly and can show its working for. A regulator can accept "15 ÷ 78 = 19.2%". They cannot accept "the model thinks so".

**"Why don't you use RAG for the rulebook?"**
Because for this job it adds risk and no benefit. The demo rulebook has 21 rules and fits in one AI call, so there is nothing to retrieve from. We read it once into structured rule records (id, status, rule text, a quote) and code applies them the same way every run. RAG would put the AI in the verdict path, deciding which clause matters and whether the artwork complies, and our rule is that AI judgement can only produce Needs review. We also quote-check every rule against the *whole* document, which is a stronger guarantee than "it was in the chunk I was shown". The market rules are curated YAML with exact quotes and clauses, which is better than searching raw regulation text.
*Honest limit:* the rulebook is read in one call, so a very long one (hundreds of pages) could exceed the model's context, and there is no chunking yet. *Next step:* a hybrid. Retrieval finds candidate clauses, the AI only proposes rule records, and the quote check and the code triage stay exactly as they are.

**"What about text inside images / certification marks?"**
Read by the vision model, so lower trust, and findings about them are always Needs review. Certificates on file or a clear area for a date code can't be proven from the artwork at all, so they stay Needs review.

**"Is the rulebook reading safe?"**
Each rule the AI extracts must have a quote that code finds in the document. An unverified rule is never applied as a Fail; it goes to Needs review. Proposed rules (like DF-21) never produce findings. The UI labels them "unverified, not applied".

**"What happens to the data?"**
The store is in-memory, and uploaded files are processed locally on the backend; only extracted text goes to the AI provider. **(check your actual data-handling story before saying more; I did not review it)**

**"What would you do next?"**
In priority order: the market switch in the UI (India re-check on the same artwork with zero code changes); the self-test with changed copies ("caught X of Y, 0 false alarms"); a database in place of the in-memory store; more packs and more artwork types.

---

## 9. Limits to state yourself (better than being asked)

- Built and demonstrated on **one product** (Dancing Fish Granola) and **US first**. India is data, not yet a UI switch.
- **Text in images is lower trust**, so those findings are Needs review.
- **Evidence from outside the artwork** (certificates, a clear area for a date code) stays Needs review.
- Some mistakes can't be caught: a wrong sentence with no number, unit or claim word, and any fact the AI never extracted.
- In-memory storage; no accounts or multi-user.
- Rules in `markets/us` are drafted from the official regulation text with exact quotes, but most are marked `approved: false`: **a regulatory person should confirm them before real use**. Say this; it shows you understand the domain.

---

## 10. Cheat sheet (numbers and names)

| Thing | Value |
| --- | --- |
| Demo product | Dancing Fish Granola Berry Crunch, 480 g, US carton |
| Files | `samples/…Carton.pdf` (artwork), `samples/…Content_Sheet.xlsx` (approved info), `rulebooks/Dancing_Fish_US_Label_Rulebook.docx` (company rulebook, 21 rules, DF-01…DF-21) |
| Verdicts | Fail / Needs review / Pass |
| Demo totals | Read them off the app. Script says 29/11/7 + 2 cleared; tests say 23/10/4 + 2 without the rulebook |
| Honey | 9% (sheet B26) vs 1% (carton) |
| Total Fat %DV | 15 g ÷ 78 g = 19.2%; printed 2.2% |
| Serving size | 480 g ÷ 8 = 60 g, printed "85" |
| Storage text | 5.8 pt vs 6 pt minimum (DF-18) |
| Banned wording | "GMO free" ×2 (DF-16) |
| Hidden content | EU "Typical Values per 100g" table under the US panel (DF-19) |
| Proposed rule | DF-21, never applied |
| Quote-check fuzzy threshold | 92, but quotes under 12 chars exact, and digits never fuzzy |
| Tests (27 Oct) | 523 backend + 402 frontend + 7 e2e, all green |
| Stack | FastAPI / Python 3.12 / Pydantic; React 19 / TS / Vite / Tailwind; PyMuPDF; Gemini behind an adapter |
| Repo areas | `backend/` `frontend/` `markets/` `rulebooks/` `samples/` `e2e/` `docs/` `deploy/` |

### Run it
```
npm install && npm install --prefix frontend && uv sync --directory backend
npm run dev        # backend :8000, frontend :5173
```
Open http://localhost:5173 → Files → **Load demo**.

### Before you walk in
- [ ] Run the demo end to end once, on the machine you will present from.
- [ ] Read the real fail/review/pass counts off the top bar and use those.
- [ ] Press **Reset demo**, then **Load demo**, so no review item is already decided.
- [ ] Decide what you will say about the live URL **(check)**.
- [ ] Have the rulebook `.docx` and the carton PDF open in other windows as a backup.
- [ ] Phone on silent, notifications off, browser zoom 100%.
