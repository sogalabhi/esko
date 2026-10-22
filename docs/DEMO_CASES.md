# BriefForge: every case, every check, with the real demo examples

A reference for the presentation and the Q&A. Everything here comes from the saved demo run (what **Load demo** shows: Esko's Dancing Fish Granola Berry Crunch US carton + content sheet + our 21-rule demo rulebook) and from the code. Finding ids (like `f-mismatch-c-3`) are the real ids, so you can find each one on the Checks screen.

**Demo totals:** 29 Fail · 11 Needs review · 7 Pass · 2 Checked and fine · 109 facts read · 26 conflicts found · 10 open questions.

---

## 1. The whole flow, in one picture

```
 DROP FILES ──► READ (code) ──► EXTRACT FACTS (AI) ──► QUOTE CHECK (code) ──► COMPARE + MATHS + RULES (code)
                                                                                         │
 REPORT ◄── PERSON DECIDES ◄── NEEDS REVIEW QUEUE ◄──────────── TRIAGE (code) ◄──────────┘
   (print)   (name + note, logged)                   Fail / Needs review / Pass  +  Checked and fine
```

1. **Import** three files: artwork (PDF), approved information (Excel), rulebook (Word/PDF/text).
2. **Read** each file into *pieces* (text + place). Code only.
3. **AI scans** turn pieces into *facts*, each with a quote. AI only.
4. **Quote check**: code confirms each quote is really in the file. Result: *confirmed* or *AI-suggested*.
5. **Compare, calculate, apply rules**: code only. Two files disagree? Numbers wrong? Required item missing? Rule broken?
6. **Triage**: code decides Fail / Needs review / Pass. A final `guard()` demotes any Fail that cannot prove itself.
7. **Person decides** each Needs review item (named, noted, logged).
8. **Report**: verdict line, every Fail and review item with evidence, marked-up carton, decisions log, rules used, sign-off.

---

## 2. Imports: what we can read, and how

| File type | Reader | What it produces | Notes from the demo |
| --- | --- | --- | --- |
| **Dieline PDF** (`.pdf` with panels) | PDF reader (PyMuPDF) | Every text piece with page, **panel** (Front/Back/Left/Right/Bottom) and **box in mm**; guide text tagged *ignored*; covered text tagged *hidden*; letter-spaced and curved text rebuilt | Carton: 33 guide pieces ignored, 10 lines hidden on the Left panel, 3 images sent to the vision step |
| **Plain PDF** (a spec, not a dieline) | PDF document reader | Lines with page + box, no panels, no guide logic | Decided per file automatically |
| **Excel** (`.xlsx`, `.xlsm`) | Excel reader | One piece per cell with its **address** (e.g. B26) and the cell's **note** | Content sheet: 60 formula cells skipped because scaled values are recomputed in code |
| **Word** (`.docx`) | Word reader | One piece per paragraph / table cell | The rulebook: 102 pieces |
| **Text / Markdown** (`.txt`, `.md`) | Text reader | One piece per line | For notes |
| **Image** (`.png`, `.jpg`, `.jpeg`) | Image reader | The picture itself, sent to the vision step | Photos, scans, screenshots |
| Anything else | none | "Unsupported file type" | A corrupt file reports an error, it does not crash the upload |

**File roles** (shown on the Files screen): *artwork* (the carton), *approved information* (the sheet), *rulebook* (kept apart, never read as product facts).

**The sample PDF's gotchas, handled in code:** guide text stays after layers are switched off (so it is tagged by layer and by a phrase list); an EU nutrition table is hidden under the US panel; certification marks are images, not text; the nutrition text is letter-spaced.

---

## 3. All the AI scans (everything the AI does)

| # | AI scan (prompt) | Runs on | What the AI returns | What code does with it |
| --- | --- | --- | --- | --- |
| 1 | `extract_sheet` | Excel content sheet | Facts: group, field, value, unit, **quote**, cell id | Quote check against the cell and its note. A value whose note says "assumed / confirm" stays AI-suggested |
| 2 | `extract_carton` | Dieline PDF text pieces **plus a picture of each main panel** | Facts, each with quote and piece ids; for marks only visible in the picture, `from_image: true` | Quote check. Image-only facts have nothing to check against, so they stay AI-suggested unless another file says the same |
| 3 | `extract_document` | Word, notes, plain PDFs | Facts with quote and piece ids | Quote check |
| 4 | `extract_image` | A photo / scan / screenshot | Facts read from the picture | Image-only, so AI-suggested |
| 5 | `meaning_conflicts` | All the facts (ids, file, field, value) | Contradictions of **meaning** a number comparison can't find (a claim vs an ingredient) with fact ids, severity, owner | Every id must be a real fact id, or the conflict is dropped. Result is **Needs review, never Fail** |
| 6 | `extract_rulebook` | The rulebook's numbered pieces | One record per rule: id, title, in-force/proposed, rule text, **quote**, a *guess* of how it can be checked | **Every quote is checked against the document.** Unverified rule: never a Fail. "Proposed" in the document overrides the AI. Invalid output is rejected |
| 7 | `ask` (Ask about this finding) | One finding: its rule text, facts, evidence quotes | A short plain answer + the ids it used | Shown only if it cites that finding's own facts/rules/quotes and every number in it appears there; otherwise refused with a reason |
| 8 | `question_wording` | A question the code built | Nicer wording and 2–4 suggested answers | Falls back to the code's own wording if invalid or no AI. Never changes ids or effects |

Not on the demo route: `write_brief` (the earlier brief writer, off the routes) and `ping` (a health check).

**Rules for every AI call:** a versioned prompt, output validated against a Pydantic schema, cache key = file fingerprint + prompt version + model, fallback models if one is overloaded, a fake adapter replaying recorded answers in tests (no network), and an "AI is busy, retry" message in the app.

**The demo's AI results:** 109 facts read (95 confirmed, 7 AI-suggested, 6 missing items). The AI flagged 3 meaning conflicts (below).

---

## 4. All the code checks (everything code does)

### 4.1 Reading and geometry
- Cut each file into pieces with place (page, panel, box in mm; sheet and cell).
- **Guide text** removal: by layer name (cut, crease, glue, dimensions, safety…) and by a phrase list ("Art orientation", "Copy free", "Principal Display Panel", glue codes).
- **Hidden text**: text covered by an opaque fill drawn on top.
- **Panel mapping** from the dieline's own "artwork panel" outlines; text within 3 mm of a panel belongs to it (bleed).
- Rebuild **letter-spaced** ("1 5 g") and **curved** text.
- Font sizes in pt (used by the text-size rules).
- **Page image** of the carton for crops and the marked-up artwork.

### 4.2 Facts and the quote check
- Quote must appear in the cited pieces (plus the next piece on the same panel for wrapped lines) or the cell's note. Case, spacing, punctuation and letter spacing are ignored.
- Short quotes (under 12 characters) must match exactly; longer ones may match at 92% similarity, **but digits are never fuzzy**: every number in the quote must appear in the source.
- Fact states: **confirmed** (quote checked, and corroborated where the same fact is in two files), **AI-suggested** (quote not checked, image-only, or assumed), **missing** (a required item the pack should have), **pass**.
- Ingredient percentages (`Honey (9%)`) are split out into their own facts so they can be compared across files.

### 4.3 Comparing the two files
- **Value mismatch**: same field, different values (units converted first, so 480 g = 16.93 oz is *not* a mismatch).
- **Ingredient list diff**: item by item (13 vs 16 ingredients), and a name **repeated** in one list.
- **Percent change** inside an ingredient list.

### 4.4 Maths (nutrition and serving)
- **% Daily Value** recomputed from the amount and the Daily Value kept in the market pack (e.g. 15 g ÷ 78 g = 19.2%).
- **Calories** recomputed from fat, carbohydrate and protein (9 / 4 / 4 kcal per g).
- **Serving size** against pack weight and number of servings (480 g ÷ 8 = 60 g).
- **Sugars above carbohydrate** (impossible).
- **Units**: parse and convert mass and volume, with a printing round-off tolerance.
- **UPC check digit**.

### 4.5 Market rules (from `markets/us`, `markets/in`, `markets/company`; data, not code)
Required item present (statement of identity, net quantity in both units on the front, allergen "Contains" line, manufacturer city/state/ZIP…); format markers (EU-style wording on a US pack); claim conditions ("No Added Sugar" against honey and other sugars); item on the right panel. Each rule record carries regulation, clause, URL, exact quote, and a status (in force or proposed). A rule that is "proposed" never produces a finding.

### 4.6 The uploaded company rulebook, by rule type
| Rule type | What code checks | Demo example |
| --- | --- | --- |
| `present` | A named item or wording appears (on the named panel) | DF-07 storage on the Back panel (Pass); DF-06 consumer care line (Fail, proof of absence over all visible text) |
| `absent` | A word, element or content must not appear | DF-19 no hidden content (Fail: 10 hidden lines) |
| `exact` | Value or wording must match approved information | DF-02 copy matches the sheet (4 mismatch Fails); DF-04 net quantity format; DF-01 sheet status |
| `size` | Font-size limit; "largest text on a panel"; clear-area check | DF-18 5.8 pt vs 6 pt (Fail); DF-03 largest text (Pass); DF-08 clear 40×15 mm area (cannot be proven from text → review) |
| `word_list` | Banned or required words/claims | DF-16 "GMO free" (Fail); DF-13 "No Added Sugar" vs honey and sugars (Fail); DF-11 US formats |
| `evidence_on_file` | A claim needs a certificate the artwork can't show | DF-15 organic certificate, DF-17 "HIGH-GRAIN", DF-14 vegan (review or claim fail) |
| `unsupported` | No automatic check exists | One review finding saying so; a person decides |
| Not verified (quote not found in the document) | Never applied as a Fail | One review finding saying "not applied" |
| Proposed (DF-21) | Nothing | No finding at all |

### 4.7 The triage and guards
- `triage()`: **Fail** only when a rule is cited **and** the check is deterministic code **and** every evidence quote passed the quote check. Anything else is Needs review.
- `guard()`: re-checks every Fail at the end and demotes any that can't prove itself.
- A candidate with **no evidence at all** is dropped. A Fail with no evidence is shown as a "Data problem", never as a Fail.
- **Checked and fine** list (cleared): a valid barcode check digit, ignored guide text, an amount printed in two agreeing units.

### 4.8 Output
Marked-up artwork (a numbered mark on the carton for every Fail and review item), print approval report, decisions log, rules-used table, sign-off line.

---

## 5. Every verdict case, with the real demo examples

### 5.1 FAIL (29): proven by code, rule cited, quotes checked

**A. Two files disagree (`mismatch`, 4)**: the artwork must say what the approved information says.
| Finding id | What it says | Expected → found | Rules cited |
| --- | --- | --- | --- |
| `f-mismatch-c-1` | Sodium: 25 mg in the approved information, 23 mg in the artwork | 25 mg → 23 mg | DF-02 |
| `f-mismatch-c-2` | Total Carbohydrate: 15 g in the approved information, 66 g in the artwork | 15 g → 66 g | DF-02 |
| `f-mismatch-c-3` | Honey %: 9% in the approved information, 1% in the artwork | 9% → 1% | DF-02 |
| `f-mismatch-c-4` | The ingredient lists differ between the approved information and the artwork | 13 ingredients → 16 ingredients | DF-02 |

**B. Maths is wrong (`math`, 14)**: the code recalculated and the printed number is off.
| Finding id | What it says | Expected → found | Rules cited |
| --- | --- | --- | --- |
| `f-math-dv-total_fat` | Total Fat % Daily Value shows 2.2%, the amounts give 19.2% | 19.2% → 2.2% | us.nutrition_facts.percent_daily_value, DF-10 |
| `f-math-dv-saturated_fat` | Saturated Fat % Daily Value shows 8%, the amounts give 25% | 25% → 8% | us.nutrition_facts.percent_daily_value, DF-10 |
| `f-math-dv-cholesterol` | Cholesterol % Daily Value shows 26%, the amounts give 15% | 15% → 26% | us.nutrition_facts.percent_daily_value, DF-10 |
| `f-math-dv-sodium` | Sodium % Daily Value shows 12%, the amounts give 1.1% (in the approved inform… | 1.1% → 12% | us.nutrition_facts.percent_daily_value, DF-10 |
| `f-math-dv-total_carbohydrate` | Total Carbohydrate % Daily Value shows 18%, the amounts give 5.5% (in the app… | 5.5% → 18% | us.nutrition_facts.percent_daily_value, DF-10 |
| `f-math-dv-dietary_fiber` | Dietary Fiber % Daily Value shows 5%, the amounts give 10.7% | 10.7% → 5% | us.nutrition_facts.percent_daily_value, DF-10 |
| `f-math-dv-vitamin_d` | Vitamin D % Daily Value shows 12%, the amounts give 445% | 445% → 12% | us.nutrition_facts.percent_daily_value, DF-10 |
| `f-math-dv-calcium` | Calcium % Daily Value shows 48%, the amounts give 15.8% | 15.8% → 48% | us.nutrition_facts.percent_daily_value, DF-10 |
| `f-math-dv-iron` | Iron % Daily Value shows 20%, the amounts give 27.8% | 27.8% → 20% | us.nutrition_facts.percent_daily_value, DF-10 |
| `f-math-dv-potassium` | Potassium % Daily Value shows 11%, the amounts give 0.5% | 0.5% → 11% | us.nutrition_facts.percent_daily_value, DF-10 |
| `f-math-calories` | Calories show 166, the nutrients give 331 (in the approved information) | about 331 → 166 | us.nutrition_facts.calories_not_kj_only, DF-10 |
| `f-math-dv-sodium-2` | Sodium % Daily Value shows 12%, the amounts give 1% (in the artwork) | 1% → 12% | us.nutrition_facts.percent_daily_value, DF-10 |
| `f-math-dv-total_carbohydrate-2` | Total Carbohydrate % Daily Value shows 18%, the amounts give 24% (in the artw… | 24% → 18% | us.nutrition_facts.percent_daily_value, DF-10 |
| `f-math-calories-2` | Calories show 166, the nutrients give 535 (in the artwork) | about 535 → 166 | us.nutrition_facts.calories_not_kj_only, DF-10 |

**C. A required item is missing (`missing`, 4)**
| Finding id | What it says | Expected → found | Rules cited |
| --- | --- | --- | --- |
| `f-missing-allergen_declaration` | Allergen "Contains" statement is missing | Allergen "Contains" statement → ALLERGEN INFORMATION: May Contain… | us.allergens.contains_or_parenthetical, DF-12 |
| `f-missing-manufacturer_address_city_state_zip` | Manufacturer city, state and ZIP code is missing | Manufacturer city, state and ZIP … → DANCING FISH GRANOLA CO. | us.name_place.city_state_zip, DF-05 |
| `f-missing-net_quantity_ounces` | Net quantity in ounces is missing | Net quantity in ounces → 480 g | us.net_quantity.ounces_first, DF-04 |
| `f-rule-df-06` | Consumer care line is missing from the artwork | Every pack must carry a consumer … → Nothing found | DF-06 |

**D. Wrong format for the market (`format`, 2)**
| Finding id | What it says | Expected → found | Rules cited |
| --- | --- | --- | --- |
| `f-format-fmt-1` | EU-style nutrition wording (kJ, Saturates, Salt, reference-intake icons) is o… | Calories, Saturated Fat and Sodiu… → Reference-intake icon · Calories … | us.nutrition_facts.percent_daily_value, DF-11 |
| `f-format-fmt-2` | "Cereals Containing Gluten" is EU allergen wording; a US label names the food… | A Contains line naming each major… → Allergen statement ALLERGEN INFOR… | us.allergens.contains_or_parenthetical, DF-12 |

**E. A claim that the ingredients contradict (`claim`, 2)**
| Finding id | What it says | Expected → found | Rules cited |
| --- | --- | --- | --- |
| `f-rule-df-13` | 'NO ADDED SUGAR' is claimed, but the ingredients include Honey, coconut sugar… | No Honey, coconut sugar, cane sug… → NO ADDED SUGAR | DF-13, us.claims.no_added_sugars, us.added_sugars.declaration |
| `f-rule-df-14` | 'Vegans', 'vegan' is claimed, but the ingredients include Honey | No Honey behind the claim → Vegans, vegan | DF-14, company.vegan.certification |

**F. Company-rule breaches (`rule`, `text_size`, `hidden`: 3)**
| Finding id | What it says | Expected → found | Rules cited |
| --- | --- | --- | --- |
| `f-rule-df-16` | Banned wording is on the pack: 'GMO free', 'GMO FREE' | Not used → GMO free, GMO FREE | DF-16 |
| `f-rule-df-18` | Storage instructions set below 6 pt | 6 pt or larger → 5.8 pt | DF-18 |
| `f-hidden-left` | 10 lines of hidden text on the Left panel (covered by an opaque fill drawn on… | No text under other artwork → 'NUTRITION FACTS'; 'Typical Value… | DF-19 |

Each Fail card shows: why it matters, the rule clause and link, expected vs found, **the code's proof** (e.g. "15 g ÷ 78 g = 19.2%, printed 2.2%"), and evidence crops side by side (the sheet cell and the carton region), with a link to the mark on the artwork.

### 5.2 NEEDS REVIEW (11): a person decides

**Reason 1: the fact is AI-suggested, so it can never be a Fail (3)**: the sheet says "assumed / confirm", or the fact was read from an image only.
| Finding id | What it says | Expected → found | Rules cited |
| --- | --- | --- | --- |
| `f-approval-f-1` | Label ID was suggested by AI, please confirm it |  → DF-GRAN-BERRY-US-001 | (none) |
| `f-approval-f-3` | BPN was suggested by AI, please confirm it |  → DF-BERRY-480G-US | (none) |
| `f-approval-f-65` | Recycling mark was suggested by AI, please confirm it |  → Paperboard Packaging Recyclable | (none) |

**Reason 2: code found a problem, but no loaded rule covers it (3)**: so it is not a Fail.
| Finding id | What it says | Expected → found | Rules cited |
| --- | --- | --- | --- |
| `f-mismatch-c-5` | Sunflower Seeds appears more than once in the same ingredient list | Sunflower Seeds listed once → Sunflower Seeds listed twice | (none) |
| `f-math-sugars_vs_carbohydrate` | Total Sugars (18 g) is more than Total Carbohydrate (15 g) | at most 15 g → 18 g | (none) |
| `f-math-servings` | The serving size is printed as '85' with no unit; 480g over 8 servings is 60 g | 60 g → 85 | (none) |

**Reason 3: the proof is outside the artwork (5)**: a certificate, a clear area, an approval status.
| Finding id | What it says | Expected → found | Rules cited |
| --- | --- | --- | --- |
| `f-claim-organic_certificate_and_certifier_name` | Organic certificate and certifier name is not on file | Organic certificate and certifier… → Not found in the files | us.claims.organic, DF-15 |
| `f-rule-df-17` | 'HIGH-GRAIN' is claimed; the proof is not in the files |  → HIGH-GRAIN | DF-17 |
| `f-rule-df-20` | The How2Recycle mark could not be confirmed on the artwork | How2Recycle → Not found as text on the artwork | DF-20 |
| `f-rule-df-08` | The copy points to base of the pack; a clear 40 x 15 mm area cannot be proven… | A clear 40 x 15 mm area → Not checkable from text | DF-08 |
| `f-rule-df-01` | The approved information has status 'Draft / In Review', the rule asks for 'A… | Approved → Draft / In Review | DF-01 |

### 5.3 PASS (7): met, and where it was found
| Finding id | What it says | Expected → found | Rules cited |
| --- | --- | --- | --- |
| `f-pass-statement_of_identity` | Statement of identity is present |  →  | us.identity.statement_of_identity, us.identity.bold_and_prominent |
| `f-pass-manufacturer_name_place` | Manufacturer name and place is present |  →  | us.name_place.manufacturer_packer_distributor |
| `f-pass-net_quantity` | Net quantity statement is present |  →  | us.net_quantity.dual_units_bottom30, us.net_quantity.distinct_item, us.net_quantity.net_weight_term |
| `f-pass-net_quantity_metric` | Net quantity in grams is present |  →  | us.net_quantity.metric_units |
| `f-rule-df-03` | Statement of identity is the largest text on the Front panel |  →  | DF-03 |
| `f-rule-df-07` | Storage instructions is on the Back panel |  →  | DF-07 |
| `f-rule-df-09` | Nutrition Facts panel is on the artwork |  →  | DF-09 |

### 5.4 CHECKED AND FINE (2): looked at, proven not a problem
| Item | The code's proof |
| --- | --- |
| The barcode check digit is valid | Digits 12000000003 give check digit 6; printed 6 |
| 33 pieces of dieline guide text ignored | They sit on the print-guide layer "Dimensions and text" and are not copy, so none was read as a fact (examples: "Orientation" ×11, "Art orientation" ×4, "Copy free" ×2) |

Also in this group in the code (not triggered by this carton): the same amount printed in two units that agree (480 g and its ounce equivalent).

### 5.5 NOT APPLIED
- **DF-21 Front-of-pack nutrition box**: status *Proposed* in the rulebook, so it **never produces a finding**. The UI lists it as not applied.
- A rule the AI invented or misquoted (its quote isn't in the document): kept in the Rules list as **unverified**, never a Fail, and shows as one review finding. Covered by tests (`test_invented_rule_is_kept_but_unchecked`, `test_an_unverified_rule_never_fails_it_is_one_review_finding`).

### 5.6 The special cases worth showing
1. **Hidden table (the X-ray).** An EU "Typical Values per 100g" table (1868 kJ / 445 kcal…) sits under the US Nutrition Facts panel. It is *not* read as product facts (so no false conflicts), but it is reported: **Review** on its own, **Fail** because rule DF-19 bans hidden content (`f-hidden-left`).
2. **Guide text.** "Art orientation" and "Copy free" are never read as copy.
3. **Not a false alarm.** 480 g vs its ounce equivalent is the same quantity, so no conflict. (The *missing ounces* is a separate, real finding: `f-missing-net_quantity_ounces`.)
4. **The AI found it, code proved it.** The AI flagged "Certified Vegan vs honey" (conflict `c-6`), "No Added Sugar vs honey" (`c-7`) and "May Contain almonds, but almonds are ingredients" (`c-8`). The company rulebook rules DF-14, DF-13 and DF-12 then made the same problems code-checked Fails (`f-rule-df-14`, `f-rule-df-13`, `f-missing-allergen_declaration`). Without the rulebook, the vegan (`c-6`) and no-added-sugar (`c-7`) readings stay **Needs review**; the allergen one is already a Fail from the US "Contains statement" rule. That is the clearest picture of "AI proposes, code proves".
5. **The same finding, with and without the rulebook.** Without it, a mismatch cites the built-in `approved-info` rule; with it, rule DF-02 replaces that citation. Without a rulebook: 23 fail · 10 review · 4 pass (the unit tests); with it: 29 · 11 · 7 (the demo).

---

## 6. The loop: what a person does, and what changes

| Action | Where | What happens |
| --- | --- | --- |
| **"It's fine"** on a Needs review item | Checks | Needs a **name** and an optional note. The item keeps verdict *review*, gains the decision, and no longer counts as waiting |
| **"It's a problem"** | Checks | Same, but the item now **counts as a problem** in the top bar, like a fail |
| **"Ask someone"** | Checks | Writes a short message (the question and its context) to copy to R&D, legal or brand |
| **Answer / skip a question** | The Questions page (`/questions`, not in the left menu) | Logged. Answering a conflict can set the fact (keep the sheet's value, keep the artwork's, intended change, or custom text) |
| **Resolve a conflict** | The conflict cards on *What we read* | Choice: intended change / left / right / custom, with a name; logged. Nothing is resolved silently |
| **Ask about this finding** | Card | AI answers using only that finding's own rule and evidence; refused if it reaches outside. A person can confirm an answer, which adds it as a fact |
| **Upload a rulebook** | Files / Rules | AI reads it, code quote-checks each rule, findings appear. **Delete it** and the findings return to the no-rulebook set. Decisions on review items **survive** adding or removing it |
| **Undo** | Decisions | The project is recomputed from the run plus the decision log, so any decision can be undone |
| **Reset demo / Load demo** | Files | Restore the saved run with **zero AI calls** |
| **Print report** | Report | The print-approval report |

**The top bar rule:** *Ready to print* only when **0 fails (including review items decided "a problem") and 0 undecided review items**. Otherwise it reads "Not ready to print: N fail · M review". Deciding all 11 review items "It's fine" still leaves the 29 fails.

**Decision log fields:** kind (answer / skip / resolve / decide), target, verdict, name, note, time.

---

## 7. A suggested demo path with real clicks (about 5 minutes)

1. **Files**: three files loaded; point at "Ignored 33 guide pieces" and "Hidden text on Left (10 lines)".
2. **Checks** top bar: "Not ready to print: 29 fail · 11 review".
3. **Honey** (`f-mismatch-c-3`): sheet cell B26 "Honey (9%)" vs carton back panel "Honey (1%)"; both quotes confirmed by code.
4. **Total Fat** (`f-math-dv-total_fat`): 15 g ÷ 78 g = 19.2%, printed 2.2%. Code did the sum.
5. **Rules**: DF-16 "GMO free" (`f-rule-df-16`), DF-18 5.8 pt (`f-rule-df-18`); DF-21 proposed, not applied.
6. **Checked and fine** filter: barcode check digit and the 33 ignored guide pieces.
7. **Hidden table** (`f-hidden-left`): Show on artwork.
8. **Needs review → HIGH-GRAIN** (`f-rule-df-17`): enter a name, choose "It's a problem", watch the top bar change.
9. **Report**: verdict, Fails with crops, marked-up carton, decisions log, sign-off; Print report.

---

## 8. Edge cases and what the app does

| Situation | What happens |
| --- | --- |
| No AI key / no network | **Load demo** works (no AI calls). New files can't be read; the app says so |
| The AI is overloaded | A message "AI is busy" with a Retry; the client tries the next fallback model first |
| The AI returns invalid output | Rejected against the schema; a clear error, nothing half-applied |
| The AI quotes something not in the file | The fact becomes **AI-suggested**; it can never cause a Fail |
| The AI invents an id in a conflict or answer | Dropped / refused |
| The AI invents a rulebook rule | Kept as **unverified**, never applied as a Fail |
| A rule is "Proposed" | Never produces a finding |
| A rule can't be mapped to a check | One review finding: "no automatic check; a person decides" |
| A Fail would have no evidence | Shown as a "Data problem", never as a Fail |
| Unsupported or corrupt file | Reported on the Files screen; the upload doesn't crash |
| Text inside images / outlined text | Read only by the vision step, lower trust, always Needs review |
| Evidence the artwork can't show (certificates, clear areas) | Needs review, never Fail |
| Nothing checked yet | The top bar never says "Ready to print" when there are no findings |

---

## 9. Where each case is proven by a test

| Case | Test file |
| --- | --- |
| Every answer-key item maps to one finding with the right verdict; `flag: false` items never Fail; every Fail has a rule and checked evidence | `backend/tests/integration/test_checks_samples.py` |
| Every rulebook rule gets the verdict in `rulebook_key.yaml` (12 fail, 3 pass, 5 review, 1 not applied) | `test_rulebook_apply.py` |
| Banned words, text size, claims vs ingredients, absence of contact details, unverified and proposed rules, copy-match replacement | `test_rulebook_rules.py` |
| Invented rule kept but unchecked; changed number in a quote not confirmed; "proposed" in the document overrides the AI; schema-invalid output rejected | `test_rulebook_reader.py` |
| Quote check: digits never fuzzy, wrapped lines, notes | `test_quote_check.py` |
| Guide text, hidden text, letter-spaced and curved text, panel mapping | `test_pdf_reader.py` |
| % Daily Value, calories, servings maths; UPC; units | `test_checks_nutrition.py`, `test_checks_barcode.py`, `test_checks_units.py` |
| No market-specific code in the engine | `test_no_market_leak.py` |
| Triage and `guard()` | `test_verdicts.py` |
| The decision, log, replay and undo | `test_p2_contract.py`, `test_rulebook_apply.py` |
| The screens, the decision, the report, Ask | frontend unit tests and `e2e/demo-flow.spec.ts`, `e2e/rulebook-flow.spec.ts` |
