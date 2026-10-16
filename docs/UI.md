# BriefForge — UI build spec

## 1. What you are building
BriefForge is a web app for a brand manager at a food company. She uploads messy
packaging files (an old carton dieline PDF, a content spreadsheet, notes). The app
finds every fact, proves where it came from, finds mistakes and conflicts, asks her
a few smart questions, and produces a design brief for the agency. The brief has a
source behind every line and ends with a checklist the final artwork must pass.

Demo data: Esko's sample product "Dancing Fish Granola — Berry Crunch", 480 g carton,
market United States. Second act: switch the market to India.

## 2. Hard rules (do not break these)
1. NOT a chatbot. There is no chat screen on the main path. The UI is a guided
   workspace: tables, cards, a graph, a pack canvas, a document. (An optional
   "Ask about this" side panel may exist, closed by default.)
2. Every fact shown anywhere has a SOURCE CHIP. Clicking it opens the file at the
   exact spot with the quote highlighted.
3. Every fact has one of three STATES, always visible:
   - Confirmed (green): found in a file and checked by code, or answered by a person
   - AI-suggested (violet, dotted underline): AI inferred it; needs one tap to accept/fix
   - Missing (amber): a rule needs it, no file has it; it becomes a question
4. Conflicts are never settled silently. The UI always shows both values and asks.
5. Colour always has the same meaning and is never the only signal: every state
   also has an icon and a word.
6. Show "PASS" results too (for example, the barcode check digit is valid), so the
   app never looks like it flags everything.

## 3. Look and feel
Mood: a calm, serious tool a regulated company trusts. Document-like, lots of white
space, flat (no gradients, no glow, no emoji).

Colours (tokens):
- --bg #FAFAF7 (page), --surface #FFFFFF (cards), --border #E4E4DE
- --ink #16181D (text), --ink-2 #5B6170 (secondary text)
- --accent #2F7D32 (brand green, buttons and active step)
- --ok #1F7A4D, --warn #B45309, --bad #B42318, --ai #6D28D9, --info #1D4ED8
- Tints for badge backgrounds: the same colours at about 10% opacity
Type: "IBM Plex Sans" for UI, "IBM Plex Mono" for numbers, quantities, cell
references and codes. Use tabular numbers. Sizes 12 / 14 / 16 / 20 / 28.
Spacing: 4 px grid (4, 8, 12, 16, 24, 32). Radius 8 px cards, 6 px chips.
Motion: only with a purpose, about 200–250 ms, ease-out. Respect reduced-motion.
Icons: one stroke icon set (lucide). No emoji.

## 4. App shell (same on every screen)
- TOP BAR (56 px): product name "Granola — Berry Crunch · 480 g"; MARKET switch
  (United States / India); LAUNCH DATE picker with a small slider; a BRIEF HEALTH ring
  (percent of required items that are proven), e.g. "68% proven · 9 open";
  buttons "Reset demo" and "Export".
- LEFT RAIL (220 px): the 5 steps in order, each with a status dot and count:
  1 Evidence · 2 Facts · 3 Questions · 4 Pack · 5 Brief.
  Below a divider: "Rules map", "Claims", "Trust".
  The rail collapses to icons under 1024 px wide.
- SOURCE DRAWER (right side, 480 px, slides over): opens from any source chip.
  Shows the file at the right spot: a PDF page zoomed to the panel with a highlight
  box over the quote, or a spreadsheet grid with the cell outlined. Header: file
  name, location ("Carton · Back panel" / "Content sheet · B26"), the exact quote,
  and "Quote checked by code ✓" or "Quote not found — demoted to AI-suggested".

## 5. Shared components
- SourceChip: small pill, file icon + short location ("Carton · Back", "Sheet · B26").
  Several sources = stacked pills. Click → Source Drawer.
- StateBadge: Confirmed / AI-suggested / Missing / Conflict / Pass, icon + word.
- ConflictCard: two halves side by side, each with value, source chip and quote.
  Kind label ("Value conflict", "Math check", "Rule", "Meaning (AI)").
  Buttons: "Intended change", "Use left", "Use right", "Ask someone". Once
  resolved, it collapses to one line: "Resolved by Abhijith · use sheet value".
- QuestionCard: question text; "Why we ask" line (plain words, links to the facts
  and rule behind it); "Unlocks N requirements" tag; 2–4 suggested answers as large
  buttons (pre-filled from the files); "Other…" text input; "Ask someone" (writes a
  short message to copy to R&D or legal); "Skip for now".
- RuleChip: rule short name + market flag + date status, e.g.
  "US · 21 CFR 101.105 · in force". Hover shows the plain summary and a link.

## 6. Screens

### 6.1 Evidence (step 1)
Purpose: show the app reads the real files.
Layout: big drop zone on top ("Drop your packaging files"); below it, one card per
file with a thumbnail, type, and a live line like "Reading… 41 facts found".
While reading: the thumbnail of the carton shows small highlight boxes appearing
where facts are found (the wow detail). A live counter on top:
"34 facts · 12 conflicts · 6 missing · 1 pass".
Each file card also lists what was skipped and why, e.g. "Ignored guide layers:
Cut, Crease, Dimensions, 'Art orientation' text". Error state: "Could not read
page 2: scanned image, low resolution", with a retry button.
Primary button: "Review facts →".

### 6.2 Facts (step 2)
Purpose: one trusted list of what we know.
Layout: left 2/3 a table grouped into sections: Identity, Ingredients, Allergens,
Nutrition, Quantity & barcode, Claims & marks, Company & address, Packaging.
Columns: Field · Value · State · Sources. Right 1/3: a sticky "Conflicts" column
with ConflictCards, sorted by severity.
Filters on top: All / Conflicts / AI-suggested / Missing / Passed.
Demo conflicts that must show (with real sources):
- Honey: "9%" (Sheet · B26) vs "1%" (Carton · Back) — Value conflict
- Ingredients: walnuts, flax seeds, dried strawberries, pumpkin seeds on carton but
  not in sheet; "Sunflower Seeds" twice in sheet — List conflict, shown as a diff
- Total carbohydrate 15 g (Sheet) vs 66 g (Carton); sodium 25 mg vs 23 mg
- "No Added Sugar" claim + "Incl. 0g Added Sugars" vs honey, coconut sugar, cane
  sugar in ingredients — Rule (US added sugars)
- "Certified Vegan" mark + "Suitable for Vegans" vs honey and 45 mg cholesterol —
  Meaning (AI)
- Almonds, pecans, walnuts are ingredients but only "May contain" — Rule (allergens)
- % Daily Values wrong — Math check, show "printed 2.2% · correct ≈19%" for fat,
  "printed 12% · correct ≈445%" for vitamin D, calcium "48% · ≈16%"
- Calories 166 vs about 535 from fat + carbs + protein — Math check
- Serving size "85" with no unit; 480 g ÷ 8 servings = 60 g — Math check
- EU-style items on a US pack: kJ, "of which saturates", "Salt", reference-intake
  icons, "Cereals containing gluten" — Rule (US format)
- Net quantity only "480g" on back panel; US needs oz + g on front — Rule
- "Produced by Dancing Fish Granola Co." with no address — Rule
- PASS: UPC 1 20000 00003 6, check digit valid
- AI-suggested (from sheet notes): Label ID and BPN "assumed — confirm"
Small diff view for list conflicts: carton items vs sheet items, added in green,
missing in red, duplicates marked.

### 6.3 Questions (step 3)
Purpose: turn problems into a few decisions.
Layout: centre column of QuestionCards (max width 720 px), ranked by impact. A
progress line on top: "3 of 6 answered · 14 requirements unlocked". Right side: a
mini Rules Map that animates when an answer lands.
Example cards:
1. "Honey is in the recipe, and the pack says Certified Vegan. What should change?"
   Answers: "Keep honey, remove vegan claims" / "Replace honey (R&D to confirm)" /
   "Ask someone". Why: honey is not vegan; the vegan mark and back-panel text conflict
   with the ingredients. Unlocks: 4.
2. "The pack says No Added Sugar, but honey and coconut sugar are added sugars under
   US rules. Remove the claim?" Unlocks: 3.
3. "Which honey % is correct: 9% (sheet) or 1% (carton)?"
4. "What is the real serving size in grams?" (suggest 40 g / 60 g / other)
5. "Company address for the label (city, state, ZIP)?" (text input)
6. "Are almonds, pecans and walnuts ingredients (Contains) or only possible traces?"
Answering a card: the card collapses with a check, the count goes up, and related
facts and conflicts elsewhere update (the "ripple"). A toast says
"Answer applied to 4 items · Undo".

### 6.4 Pack (step 4)
Purpose: will the required content fit, and where does it go.
Layout: the real flat dieline drawn to scale from the PDF's Cut/Crease/Artwork panel
layers, panels labelled (Front · Back · Left · Right · Top flaps · Bottom).
Over it, coloured blocks for each mandatory item (statement of identity, net
quantity, Nutrition Facts, ingredients, allergen statement, maker's name and
address, barcode, certification marks) placed on their panel at minimum legal size.
Existing brand art (logo, bowl photo, "PACKED WITH GOODNESS") shown as locked grey
zones. Each panel has a space meter ("Back: 82% used").
Controls: Market switch (US/India) and Language set; "Show changes vs current
pack" toggle (new = green outline, moved = blue, removed = red strike).
Overflow: the block turns red, the meter goes over 100%, and a fixes list appears
("Move barcode to bottom panel", "Reduce photo zone by 18 mm", "Use left panel").
Every number shows its basis on hover ("Nutrition Facts min. width from US rule X;
text length 214 characters at 6 pt"). Label the screen "Fit estimate".

### 6.5 Brief (step 5)
Purpose: the deliverable.
Layout: a clean document in the centre (max 800 px), outline on the left.
Sections: Objective · Product facts · Mandatory content by panel · Keep / Change /
Add / Remove · Allowed claims (and removed claims, with reason) · Nutrition panel
instructions · Open questions for the agency · Acceptance checklist.
Every sentence has small source dots at the end; hover = sources; click = drawer.
Unproven text is impossible: if a person types a number not in the facts, it gets
a violet underline "Not in facts — add a source or mark as assumption".
Top right: "Approve" (records name + time), "Export PDF", "Export checklist (JSON)",
"Copy share link". Version label: "Draft 3 · edited 2 min ago".

### 6.6 Rules map (secondary)
A left-to-right graph (React Flow): Product facts → Rules → Required pack items.
Node colours = states. Click a rule: side panel with the rule text, source link,
dates ("in force since…", "from 1 July 2027"), and why it applies here.
When the market changes, nodes fade out and in (US rules leave, India rules arrive).

### 6.7 Claims (secondary)
The pack copy and the content sheet text, with claim words underlined:
red = not allowed, amber = needs proof or conditions, green = fine.
Hover a word: the rule, the reason, and safer wording to discuss with legal.
US demo: "No Added Sugar" (red), "Certified Vegan" (red, conflicts with honey),
"GMO free" (amber, needs proof), "USDA Organic" (amber, needs certificate on file).
India demo: also check words like "100%" and "natural" against FSSAI advisories.

### 6.8 Trust (secondary)
Cards on top: Evidence coverage (% of facts with a checked quote), AI-suggested
still open, Conflicts resolved by a person, Self-test score.
Self-test: button "Run self-test" → a table of planted problems with Caught / Missed
and the reason for each miss. Shows "Esko sample: caught X of Y".
Below: a change log (who changed what, when, from which answer).

### 6.9 Market switch: "Same box, new country"
When the market changes to India: a short full-width banner "Switched to India ·
FSSAI + Legal Metrology rules · 23 requirements changed". Facts stay; requirements,
questions, claims and the pack canvas recompute. New India items appear as Missing
(veg mark, FSSAI logo + licence no., MRP, unit sale price, month/year of
manufacture, consumer care details); the oz quantity is removed. The launch date
slider shows "Coming: FSS L&D amendment from 1 July 2027" as a dashed marker.

### 6.10 Lenses (detailed when each lens phase starts)
Same findings, different views; the full list and intent are in `PLAN.md` "Lenses".
- Reviewer (Phase 5A): red-pen markup on the flat dieline (handwriting-style notes,
  self-drawing strokes, Clean / Marked toggle), sticky notes coloured by owner,
  track changes for ingredients / allergens / claims, A3 wall poster export.
- Shopper (Phase 6A): personas (nut allergy, vegan, watching sugar, low vision),
  shelf-distance test, 3-second glance heatmap, print accessibility, confidence
  glow, before / after wipe.
- 3D Pack View (Phase 7A): the dieline folds into a box, pins on findings with
  camera fly-to, X-ray mode with ghost boxes, market switch on the box.
Rules that still apply in every lens: each mark opens the Source Drawer; colour is
never the only signal (marks carry text); estimates are labelled as estimates.

### 6.11 Phone pages: scan and AR (campus round, detailed in Phases 10A / 10B)
These are the only phone-first screens (portrait, one-handed, large touch targets).
- Scan: camera view with "Show me the front" prompt, auto-capture when sharp,
  draggable corners as fallback, a small 3D twin filling in, and the live checklist
  ("Maker's address ✗ not found yet: show me the bottom"). Then hand off to the normal
  desktop flow, where source chips show photo crops.
- AR: camera view with the red-pen marks tracked onto the printed box; a short
  "Point at any side of the box" hint; no other UI.

## 7. States every screen must handle
Loading (skeletons, never spinners alone) · Empty ("No files yet") · Error with a
plain reason and a retry · Partial (some files read, some failed).

## 8. Accessibility and layout
Real buttons and inputs with labels; keyboard: J/K move between cards, 1–4 pick an
answer, Enter approves; focus rings visible; text contrast at least 4.5:1;
works from 1280 px down to 1024 px; below that the rail collapses and the drawer
goes full width.

## 9. Data contract (build the UI against mock JSON first)
GET /api/project returns:
{ files:[{id,name,type,pages,status,skipped:[]}],
  facts:[{id,group,field,value,unit,state,sources:[{fileId,where:{panel?,page?,bbox?,sheet?,cell?},quote,quoteChecked}]}],
  conflicts:[{id,kind,severity,owner,factIds,left,right,ruleId?,explanation,resolution?,
              locations:[{fileId,panel,x,y,w,h}]}],   // owner: legal | rnd | brand; locations in mm, shared by every lens
  questions:[{id,text,why,ruleIds,factIds,unlocks,answers:[],status}],
  requirements:[{id,ruleId,item,panel?,status,factIds}],
  rules:[{id,market,ref,summary,url,status,from?,to?}],
  pack:{panels:[{name,x,y,w,h}],blocks:[{item,panel,x,y,w,h,state}]},
  brief:{version,sections:[{title,sentences:[{text,factIds}]}],approvedBy?,approvedAt?},
  trust:{coverage,aiOpen,resolved,selfTest:{caught,total,rows:[]}} }
Shape details fixed in UI chunk 1 (the backend must match; see frontend/src/types/project.ts):
- conflict.left / right = {value, sources[]} (sources empty when the value is computed or
  rule-stated); kind = value | list | math | rule | meaning; severity = high | medium | low;
  resolution = {choice: intended | left | right, by, at}.
- fact.state = confirmed | ai_suggested | missing | pass. "Conflict" is derived from open
  conflicts, never stored on the fact. group ids are lower-case.
- question.status = open | answered | skipped (+ answer once the backend stores it).
- file.skipped = [{item, reason}]. bbox = [x, y, w, h] in mm, same frame as pack.panels.
- Brief health = met requirements ÷ all requirements.
- file.error = plain reason when status is error (e.g. "page 2: scanned image, low resolution").
- question.requirementIds = the requirements an answer settles (unlocks = its length).
- Phase 5: brief sentence = {text, factIds, status: ok | unproven, problems: string[],
  source: code | ai | user}; brief.log = [{who, what, at}].
  Routes: POST /api/brief/draft · PATCH /api/brief/sentences {section, index, text, factIds}
  · POST /api/brief/approve {name} (409 while unproven) · GET /api/brief/checklist.json
  · POST /api/ask {question} → {answer, factIds, refused?} · POST /api/ask/confirm
  {question, answer, factIds} → project (answer becomes a user-sourced fact).
Live progress comes over a WebSocket as small events: fact_found, conflict_found,
file_done. Ship a mock file with the Dancing Fish data from section 6.2 so the UI
can be built before the backend exists.

## 10. Do not build
A chat-first screen · AI-generated pack artwork · decorative charts · dark mode
(not needed for the demo) · login.