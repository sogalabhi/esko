# BriefForge — Esko AIForge Build Plan

Oct 14, 2026 · @Abhi

## The pitch

**BriefForge turns a brand manager's messy files into a packaging brief where every line is proven, every gap is asked about, and every rule is checked before a designer draws anything.**

One-line promise: *From messy files to a brief that can't lie, plus the checklist the final artwork must pass.*

Most tools wait for finished artwork and then hunt for mistakes. Esko's own 2025 recall study shows where those mistakes start: the spec changes and the label doesn't. BriefForge fixes the input instead of policing the output. That's the story we tell Esko: their tools catch errors at the end, and we stop them at the start.

**Three moments judges will remember**

1. **The truth about the box.** Drop in Esko's own carton and content sheet. In seconds, BriefForge lays out a dozen mistakes nobody mentioned: honey at 9% vs 1%, "No Added Sugar" on a pack with honey, "Certified Vegan" with honey and cholesterol, Daily Values that are off by 10x. Each one opens the exact spot in the PDF and the exact cell in the sheet.
2. **The question that knows why.** "Honey is an ingredient. Should the vegan mark go, or the honey?" comes with its reason and the rule behind it. One tap answers it, and the claims, nutrition panel and allergen line all update.
3. **Plug in a new country.** BriefForge ships with the United States market. Add the India market pack (a folder of rule records, nothing else) and the same carton is re-checked: FSSAI and Legal Metrology rules join, a veg mark, MRP and FSSAI licence appear as required, the oz quantity drops off, and the real dieline panels show what no longer fits. No code changed.

**What it is not:** not a chatbot, and not an AI that designs the pack. Chat exists only as a helper. The designer still designs.

## What Esko's sample files tell us

**The samples are a US product, not Indian, and they are full of planted mistakes.** That shapes the product: the submission must show the solution working on these exact files, so BriefForge is built for the United States first (Dancing Fish Granola Berry Crunch, 480 g carton, FDA rules). India is not a second product. It is a **market pack plugged into the same engine**, which proves the engine is general (see "Markets are plug-ins").

**The two files:**

| File | What it is | What's useful in it |
| --- | --- | --- |
| `DancingFish_Granola_Berry_US_Carton.pdf` | A dieline proof made in Esko DeskPack: one page (about 456 × 382 mm) with the flat carton, all six panels, cut and crease lines, and guide text like "Art orientation" and "Copy free" | Real text (677 positioned words including guide text, not just an image). Named layers: Main Design, Cut, Crease, Glue, Artwork panel, Dimensions, UPC A. Panel names printed on it: Front (Principal Display Panel), Back, Left, Right, Bottom. The certification marks (Certified Vegan, USDA Organic, recycling) are images, not text |
| `DancingFish_Granola_BerryCrunch_US_Content_Sheet.xlsx` | The approved content sheet: product overview, legal name, ingredients, allergens, claims, nutrition | Every field has a value and often a note like "confirm with label management" or "not clearly legible". The sheet itself says it was rebuilt from a French (FR) reference sheet |

**Problems already hiding in the files (found by reading both by hand):**

| What's wrong | Content sheet says | Carton says | How BriefForge catches it |
| --- | --- | --- | --- |
| Honey percentage | Honey (9%) | Honey (1%) | Value conflict between files |
| Ingredient list | No walnuts, flax, strawberries or pumpkin seeds; "Sunflower Seeds" listed twice | Walnuts, flax seeds, dried strawberries and pumpkin seeds included | List comparison, item by item |
| Allergens | Almonds and pecans are ingredients, yet the allergen box says "May Contain" them (the sheet's own note flags this) | Same; walnuts too | Rule: a tree nut that is an ingredient can't be only "may contain" |
| "No Added Sugar" claim and "0g Added Sugars" | Honey and coconut sugar are ingredients; crystallized ginger has cane sugar | Same | FDA counts honey and coconut sugar as added sugars, so the claim and the 0 g line are wrong |
| Vegan | "Certified Vegan" mark | "Suitable for Vegans", but honey is an ingredient, and the panel shows 45 mg cholesterol | Meaning conflict, found by AI |
| Nutrition math | Total carbohydrate 15 g, sodium 25 mg | Carbohydrate 66 g, sodium 23 mg | Value conflict between files |
| % Daily Value | 15 g fat = 2.2%; vitamin D 89 mcg = 12%; calcium 206 mg = 48% | Same | Code recalculates each % from FDA daily values (15 g fat is about 19%; 89 mcg vitamin D is about 445%) |
| Calories | 166 kcal per serving | Same | Code checks calories against fat, carbs and protein; the numbers don't add up |
| Serving size | "Not clearly legible" | "Serving size 85" (no unit) and 8 servings in a 480 g pack | Code: 480 g ÷ 8 = 60 g, not 85 |
| EU-style content on a US pack | — | Visible reference-intake icons on the back (197 kJ / 46 kcal, fat 3.8 g, saturates 1.1 g, sugars 2.4 g, salt 0.4 g) that don't match the US panel; "Cereals Containing Gluten" wording | US market rules flag non-US formats; value check flags the mismatch |
| Hidden text | — | A full EU "Typical Values per 100g" table (1868 kJ / 445 kcal, carbohydrate 65 g…) sits **under** the US Nutrition Facts panel, covered by its white background. It is in the file but not visible on the pack | Visibility check: text covered by artwork is reported as "hidden, not on pack", never as a fact. A naive text reader would raise false conflicts here |
| Calories vs per-100 g | 166 kcal per serving | Hidden EU table implies about 378 kcal per 85 g serving | Shown only as a note under "hidden text", since it isn't printed |
| Net quantity | 480g | "480g" on the back panel only | US rules need the quantity in both oz and g on the front, in the bottom part of the panel |
| Maker's address | — | "Produced by Dancing Fish Granola Co." with no address | US rules need city, state and ZIP |
| Barcode | 1 20000 00003 6 | Same | Check digit is valid: a **pass**, which shows we don't only find problems |
| Guesses in the sheet | Label ID and BPN "assumed", "confirm" | — | Shown as AI-suggested facts, never as confirmed |

**What this means for us:**

1. **The conflict engine is the star.** Esko planted at least a dozen real mistakes. A tool that finds them all, with sources, and asks the right person about each, wins Problem understanding, Trust and Demo at once.
2. **The fit check gets real.** The dieline's Cut, Crease and Artwork panel layers give true panel sizes, so the Pack Canvas measures instead of estimating.
3. **Reading the PDF needs care, and that care is a demo point.** Switching layers off in PyMuPDF does not remove the guide text (tested), so the reader tags each piece of text by the layer it is drawn in and by size (guide labels are 15–20 pt, real copy 5–16 pt), and drops guide text with a visible "ignored" list. It also checks visibility by rendering, so the hidden EU table is reported as hidden. Letter-spaced text ("1 5 g") and curved text ("PACKED WITH GOODNESS") are rebuilt in code, and the image-only marks (Certified Vegan, USDA Organic) are read by the vision model from a rendered page.
4. **The brief scenario writes itself:** "Relaunch Berry Crunch in the US with a corrected pack", then "Plug in India" to get a second brief from the same files.
5. **These samples probably go to Problem 2 teams too.** Our edge is that we don't just flag errors in finished art; we turn them into decisions, questions and a clean brief before the redesign.

## How we score on every judging criterion

Every feature in this plan exists to earn points on Esko's rubric. If a feature doesn't map to a row below, we don't build it.

| Criterion | Points | What judges see | Where it shows |
| --- | --- | --- | --- |
| Problem understanding | 15 | We open with numbers: agencies rate only 10% of briefs as good, label errors cause about 45% of US food recalls, and Esko itself says recalls start when the spec changes but the label doesn't. Then we show Esko's own carton has a dozen of exactly these mistakes. Every new market adds another rulebook on top. The product follows the brand manager's real day: scattered files, missing facts, rules that keep moving | Opening 30 seconds; Evidence Desk |
| Innovation | 15 | Fit check on real dieline geometry. Findings living on the pack: red-pen markup, shopper personas, a shelf-distance test, and the carton folded into 3D with pins on every problem. A requirements map that explains every question. Markets as plug-ins: a new country is a folder of rule records, not code. A launch-date time machine. A brief that compiles into the checklist the final artwork must pass | Lenses; 3D Pack View; Pack Canvas; market switch; Time Machine |
| Technical execution | 20 | Runs live on Esko's own sample files (dieline PDF and Excel content sheet; Word and images supported). Every fact carries its panel, page, cell or image region. Hidden and guide text is detected, not mistaken for facts. Progress streams live. Public repo with tests and a one-command setup | The whole demo runs on the samples, no slides |
| Meaningful AI | 15 | AI does what only AI can: reads messy files, spots conflicts in meaning, turns rule text into checks, writes the questions and the brief. Plain code does what code does better: units, math, rule logic, geometry | The AI-vs-code table in the architecture section |
| Trust, evidence, reliability | 15 | Every fact has a source chip and a checked quote. Three clear states: confirmed, AI-suggested, missing. Conflicts are never resolved silently. A self-test scoreboard shows how often we're right | Trust Console |
| User experience | 10 | Not chat-first. One guided flow, one-tap answers, a plain reason on every question, nothing a busy brand manager has to learn | Questions panel; the brief editor |
| Demo quality | 10 | One story on Esko's own files (relaunching Dancing Fish Berry Crunch in the US, then plugging in India), real problems found, and it ends with a brief an agency could use today | Demo script section |

## Who it's for

The brand manager drives BriefForge. The designer and the regulatory reviewer are the people who suffer when the brief is wrong, so the product is built to make their jobs easier too.

| Person | Their job | Pain today | What BriefForge gives them |
| --- | --- | --- | --- |
| Brand manager (main user) | Get a complete, correct brief to the agency fast | Facts spread across old packs, specs, spreadsheets and emails. Doesn't know what's missing until regulatory or the agency asks | Drop in files, answer a few smart questions, get a brief with every fact proven |
| Agency designer | Design without guessing | Vague briefs, rebriefs, legal text that arrives late and doesn't fit the pack | A brief that says what to keep, change, add and remove, with the mandatory content already sized for the pack |
| Regulatory / QA reviewer | Make sure mandatory content and claims are right | Sees the work only after design freeze, then checks the same items on every pack | The rules applied before design starts, each claim screened, and an acceptance checklist for the final artwork |

**Example user for the demo:** the brand manager for Dancing Fish Granola. She has the current US carton (a dieline PDF) and the US content sheet (Excel), and needs a brief for the agency to relaunch Berry Crunch with a corrected pack. Later, when the company plans an India launch, she enables the India market pack and gets a second brief from the same files.

## The journey at a glance

&#91;embedded content: BriefForge flow · files to brief to checklist\]

The dated rulebook feeds both the Requirements Map and the Pack Canvas, so every question and every fit warning traces back to a rule that is in force on launch day.

## Screen by screen

The app is one guided flow with five steps in a left rail: **Evidence → Facts → Questions → Pack → Brief**. A market switch (United States by default, plus any market pack that is installed) and a launch-date slider sit in the top bar on every screen. A progress ring shows brief health: how much is proven, how much is open.

### 1. Evidence Desk (drop your files)

- **What you see:** one big drop zone. Each file becomes a card with a thumbnail. As BriefForge reads, the thumbnails light up where facts are found, and a live counter ticks: "41 facts · 3 conflicts · 9 missing."
- **Why it matters:** it proves from the first second that we read their real files, not a template.
- **Wow detail:** highlights draw on the actual PDF page, Word paragraph or Excel cell as each fact is pulled out.

### 2. Fact Sheet (what we know, and how we know it)

- **What you see:** product facts grouped as identity, ingredients, nutrition, allergens, quantity and price, claims, and brand assets. Each row shows the value, a source chip and a state badge: **Confirmed**, **AI-suggested** or **Missing**.
- **Conflict cards:** when files disagree, the card splits in two, for example "Honey 9% (sheet, B26)" vs "Honey 1% (carton, back panel)", with buttons **Intended change**, **Mistake, use this one** or **Ask someone**.
- **Why it matters:** this is the trust layer. Nothing reaches the brief without a source or a human answer.
- **Wow detail:** clicking a source chip opens the file at the exact spot with the quote highlighted. Choosing "Intended change" writes the line straight into the brief's change list.

### 3. Requirements Map (why each thing is needed)

- **What you see:** a graph flowing left to right. Product facts (contains almonds and pecans, contains honey, sold in the US, carton, claims "No Added Sugar") lead to the rules they trigger (US major allergens, added sugars, nutrient content claims, net quantity, name and place of business), which lead to required pack content (a "Contains" line, the added sugars value, dual oz and g quantity on the front, a full address). Green means satisfied, amber needs an answer, red means a conflict or a block. Plugging in India adds a second column of rule nodes (FSSAI, Legal Metrology) feeding the same facts.
- **Why it matters:** judges see that our questions come from rule logic, not from an AI guessing.
- **Wow detail:** answer one question and a wave of nodes turns green. Click any rule to read its clause, source link and dates.

### 4. Smart Questions (a short stack, not a chat)

- **What you see:** a few question cards, ranked by impact: "Answering this unlocks 6 requirements." Each card has the question, a plain **Why we ask** line linked to the facts and rules behind it, and suggested answers pulled from the files for one-tap replies.
- **Can't answer?** "Ask someone" writes a short message for R&D or legal containing just that question and its context.
- **Why it matters:** this is the problem statement's "ask smart follow-up questions", done in a way that respects a busy person's time. The target is under 10 questions per brief.
- **Wow detail:** the stack shrinks live as answers come in, because one answer often settles several questions.

### 5. Pack Canvas (will it fit?)

- **What you see:** the real Berry Crunch dieline, drawn to scale from the PDF's Cut, Crease and Artwork panel layers. Mandatory content appears as blocks at their legal minimum sizes, brand art kept from the current pack (logo, bowl photo, "PACKED WITH GOODNESS") sits as locked zones, and each panel has a space meter.
- **The switch:** change the market and the blocks repack live. In the US the corrected content fits once the dual oz and g quantity and the address are added. Plug in India and the back panel gains a veg mark, FSSAI logo and licence number, MRP, unit sale price, date of manufacture and consumer care details, and overflows. Overflow turns red with suggested fixes: move the barcode to the bottom panel, shrink the photo zone, use the left panel.
- **Why it matters:** nobody finds out the legal text doesn't fit until the agency tries. We catch it at the brief, on the real carton.
- **Wow detail:** the India pack can add a second language (English + Hindi), and the space needed jumps. The same layout feeds the 3D Pack View (see "Lenses"). Everything here is labelled as a fit estimate, with the rule and numbers behind it.

### 6. Claims Radar (is this claim allowed?)

- **What you see:** the pack copy and the content sheet text with claim words underlined. Red means not allowed, amber means it needs proof or conditions, green means fine. US examples from the samples: "No Added Sugar" (red: honey and coconut sugar are added sugars), "Certified Vegan" (red: honey), "GMO free" (amber: needs proof), "USDA Organic" (amber: needs the certificate on file).
- **Why it matters:** claims are where regulators act hardest, and each market judges the same words differently.
- **Wow detail:** each market pack brings its own claim rules. With India plugged in, words like "100%" and "natural" are checked against the May 2025 FSSAI advisory and the August 2026 enforcement wave, with safer wording to discuss with legal.

### 7. Time Machine (rules on launch day)

- **What you see:** the launch-date slider. Move it and the rules in force recalculate everywhere. A "Coming" panel lists rules on the way for the selected market. US: FDA's updated "healthy" claim rule (compliance date in 2028) and the proposed front-of-package nutrition box. India: the 2026 labelling amendment in force from 1 July 2027, and the front-of-pack warning waiting on the Supreme Court. (Exact dates are checked against the official text when the rule records are written.)
- **Why it matters:** rules change in every market, and fastest in India. A brief written today must survive until launch.
- **Wow detail:** "Plan for it now" reserves a ghost zone on the Pack Canvas for a coming front-of-pack box.

### 8. The Brief (what the agency gets)

- **What you see:** a clean document with sections for objective, product facts, mandatory content, keep / change / add / remove, allowed claims, panel guidance, open questions for the agency, and the acceptance checklist. Every sentence has small source dots; hover to see the proof.
- **Why it matters:** this is the deliverable the problem asks for, and it's editable before it's final.
- **Wow detail:** an **Approve** button stamps the approver's name and time, and export gives a share link, a PDF and a machine-readable checklist.

### 9. Trust Console (how much to trust this brief)

- **What you see:** evidence coverage (share of facts with a checked source), count of AI-suggested facts still unconfirmed, who resolved each conflict, the self-test scoreboard, and a full change log.
- **Why it matters:** it answers the judges' trust question with numbers.
- **Wow detail:** "Show me why" on any line of the brief traces it back through rule, fact and source file.

### 10. Check-back (stretch goal)

- **What you see:** upload the agency's first draft and the acceptance checklist runs against it, marking each item found or missing.
- **Why it's last:** we must stay a Problem 1 entry. This screen only shows that the brief's checklist works downstream. Build it only if everything above is solid.

## Lenses: one set of findings, many views

Every finding already carries its file, panel and position on the pack. So the same findings can be shown through different **lenses**, each built on the same data and none of them decoration. One-line story: *"BriefForge reads the box like a regulator, marks it like a senior reviewer, and explains it like a shopper."*

**Reviewer lenses**

| Lens | What you see |
| --- | --- |
| **Red-pen markup** | The flat carton marked up like a senior reviewer did it by hand: "NO ADDED SUGAR" on the top flap circled and struck through, "Honey (1%)" circled with an arrow to a margin note "sheet says 9%", "2.2%" struck out with "≈19%" written above it. Handwriting-style notes, slightly wobbly strokes that draw themselves. A Clean / Marked toggle. Every mark opens its sources |
| **Sticky notes by owner** | Each finding becomes a sticky note on the pack, coloured by who must act: Legal, R&D or Brand. "Honey in a vegan product" goes to R&D; "No Added Sugar" goes to Legal |
| **Track changes** | Ingredients, allergen text and claims shown like Word's track changes, carton vs sheet: insertions underlined, deletions struck, duplicates ("Sunflower Seeds" twice) highlighted |
| **Before / after wipe** | A slider across the carton: today's pack with red pen on one side, a clean ghost of what the brief requires on the other |

**Shopper lenses**

| Lens | What you see |
| --- | --- |
| **Shopper personas** | Pick a person and the pack dims everything except what they rely on, with a one-line verdict. Nut allergy: the allergen box says only "may contain" almonds, pecans and walnuts, yet they are ingredients, and there's no "Contains" line. Vegan: sees the Certified Vegan mark, then honey. Watching sugar: "No Added Sugar" and "0 g added sugars", but honey and coconut sugar are in it. Low vision: see shelf test. With India plugged in: a shopper looking for the veg mark, a Hindi reader. Verdicts are written by AI from the findings only and pass the same audit as the brief, so they can't add claims |
| **Shelf test** | The box on a virtual shelf with a "shopper distance" slider (30 cm to 2 m). Text blurs as an eye would see it, and BriefForge lists which required items become unreadable ("net quantity unreadable beyond 1.2 m"), from type height vs distance. Labelled as an estimate with the numbers shown |
| **3-second glance** | A heatmap of where the eye lands first on the front panel (an open-source saliency model), then: "Statement of identity: seen. Net quantity: not on front. Vegan mark: seen first, and wrong." Labelled as an estimate |
| **Print accessibility** | Colour-blindness and low-contrast simulation on the real artwork; any required text that fails contrast is flagged. On this carton most required text is dark on white, so this may be an honest pass |

**Evidence lenses**

| Lens | What you see |
| --- | --- |
| **Evidence board** | The Requirements Map restyled as a detective's pin board: the carton on one side, the sheet on the other, red strings joining the same fact across files (honey 9% ↔ 1%), rules as index cards |
| **Confidence glow** | A faint overlay on the pack: solid where facts are confirmed, dotted violet where the AI only suggested |

**3D Pack View: fold the box, pin the problems**

- **The fold:** the flat dieline folds itself into a box along the crease lines in about 3 seconds, using the Cut and Crease layers of Esko's file. One carton style (tuck-end, which is what the sample is) for now.
- **Pins:** each finding is a pin on its exact spot on the box. Red over "NO ADDED SUGAR" on the top flap, red over the vegan mark on the front, amber over "Honey (1%)" on the back, a red cluster on the Nutrition Facts ("daily values wrong"), green on the barcode ("check digit valid"). Clicking a pin flies the camera to that face and opens both sources plus the rule.
- **X-ray mode:** brand art fades out and only regulated content glows. Missing items show as dashed ghost boxes where they should be (oz quantity on the front, the address).
- **Market switch in 3D:** with India plugged in, the veg mark appears on the front, the MRP and FSSAI block on the back, the oz quantity fades out, and an overflowing panel turns red on the box.
- **Brief with pictures:** each change in the exported brief comes with a snapshot of the box from the right angle with its pin.
- **Stretch, "on your table":** export the box as a 3D file and open it in AR on a phone via a QR code.
- **Honest pitch:** Esko already sells 3D packaging visualisation, so we never pitch "we made it 3D". The new part is *compliance findings living on the box*, plus X-ray and the shelf test.

**Demo and output tricks**

- **"Spot the mistakes" opener:** show the judges Esko's own carton: "You have 30 seconds. How many mistakes can you find?" Then BriefForge reveals about a dozen, with the red pen drawing itself.
- **A3 wall poster export:** one printable page with the marked-up dieline, a legend and the decisions taken. What agencies actually pin on the wall; bring a printed copy to the campus round.

**Build principle:** pins and marks on the flat 2D dieline come first, because every other lens (3D included) reuses them and they are the fallback if a later lens runs late.

## Beyond files: scan the box, and AR on the real box (campus round)

Two features for the campus round, both built on what already exists. The prop for both is a **real Dancing Fish carton**, printed from Esko's PDF and folded. It's printed from a render with the guide layers switched off (rendering respects layers, unlike text extraction), on A2, or scaled to A3, then cut on the cut line and glued. We make two in case one gets crushed.

### Scan to brief: no files, just the pack

The problem statement lists "an old package design" as an input, and in real life a brand manager often has only the physical pack. The old artwork may have been lost with a previous agency, or the reference is a competitor's box. So: pick up a carton, scan its sides with a phone, and BriefForge runs the full pipeline on it.

- **Guided capture:** the phone page says "Show me the front". It finds the box face in the frame, waits until the image is sharp and steady, captures automatically, and flattens the photo to a straight-on view. If detection fails, the user drags the corners.
- **A 3D twin builds itself:** a small box on screen fills in face by face with the real photos (the same 3D component as the 3D Pack View).
- **The rules steer the scan:** after each side, a live checklist updates. "Product name ✓ · Net quantity ✓ (front) · Nutrition Facts ✓ (side) · Maker's address ✗ not found yet. It's usually on the back or bottom; show me the bottom." The requirements engine is telling the user what to scan next.
- **Close-ups for small print:** for dense panels (ingredients, Nutrition Facts) it asks for one or two close-ups.
- **Two readers for photos:** each panel is read by local OCR and by the vision model. Where they agree, the fact is Confirmed; where they disagree, it's AI-suggested. Photos are less reliable than PDFs, and this keeps the trust rule intact.
- **Real size:** photos have no scale, so the user puts a bank card next to the box (85.6 × 54 mm) or types one dimension. The fit and shelf checks then work on the scanned pack too.
- **Then the normal pipeline:** Fact Sheet, conflicts, questions, red pen, brief. Every source chip shows the photo crop it came from.

**Demo moments it unlocks:**
- **"Two routes, same answer":** scan the printed Esko box and BriefForge finds the same mistakes it found from the PDF. Two different inputs agree, which is a strong reliability proof. It also checks our hidden-text detection: the scan can only see visible text, so the hidden EU table must be absent from both routes.
- **"Shelf vs approved":** scan the physical pack, then add the Excel content sheet. Conflicts now mean "what's on the shelf doesn't match what was approved", which is the real-world failure behind recalls.
- **A pack it has never seen:** scan a granola box bought from a local shop.

**Honest limits:** cartons first (glossy packs reflect and pouches curve; glare is detected and the user is asked to tilt). Small text is the weak point, which is why close-ups exist and why photo facts need two readers to agree. It's an extra input route; the judges evaluate on Esko's PDF and Excel, so the file route stays the main demo.

### Live AR: point your phone at the box

A judge scans a QR code with their own phone, points it at the printed carton, and the red-pen marks appear on the real box in real time: "NO ADDED SUGAR" struck out on the top flap, "Honey (1%)" circled with "sheet says 9%", corrected % values over the Nutrition Facts, a green tick on the barcode. Turn the box and the marks stay on each side.

- **Image tracking per panel** (MindAR.js, in the phone's browser, no app install). Each side of the box is its own target, made from the panel render. The Nutrition Facts side has little texture and may track weakly; if so, its marks are anchored from the neighbouring panel.
- **The overlay is the red-pen layer:** the backend exports one transparent image of the marks per panel, the same size as the panel, so positions line up. No AI calls during AR: instant, free, and it can't hit a rate limit on stage.
- **Served over HTTPS** (phones only allow the camera on secure pages), with a QR code to the page.
- **Stretch, "snap any pack":** point at a pack it has never seen and tap to capture one frame. The vision model reads it and the red pen draws on the frozen photo within seconds. That's "snap and mark", not live video. Problem 1 tie-in: a competitor's claims ("High Protein", "Gluten Free") go into the brief as competitor context.

**Pitch lines:** *"No files? Scan the box. BriefForge knows what a pack must say, tells you which side to show it next, and turns the shelf into a brief."* and *"Point a phone at the box on the shelf, and it marks it up like your toughest reviewer."*

## Design language

The look should say "serious tool a regulated company would trust", with motion saved for the moments that prove the AI is working.

- **Look:** light, calm, document-like, lots of white space. One accent colour as a nod to Esko's green. Clean sans-serif type with tabular numbers, so quantities line up.
- **Colour has fixed meaning everywhere:** green = satisfied, amber = needs an answer, red = conflict or blocked, violet with a dotted underline = AI-suggested and not yet confirmed. Colour is never used for decoration.
- **Never colour alone:** every state also has an icon and a word, so it works for colour-blind users and in black-and-white screenshots.
- **Motion with a job:** the highlight sweep when a fact is found, nodes turning green, blocks repacking on the canvas. Each takes about a quarter of a second. No confetti, no spinning logos.
- **Formats come from the market pack:** the US pack shows oz and g, $ and US number format. The India pack switches to ₹, Indian number format (1,70,535), an English + Hindi option, and the veg and non-veg marks drawn exactly as the rules describe. The UI has no market-specific code.
- **Keyboard first for power users:** J and K move between questions, number keys pick an answer, Enter approves.
- **Honest empty and error states:** if a file can't be read, the card says so and why ("scanned image, low resolution"). Nothing is dropped silently.

## How the AI works

&#91;embedded content: BriefForge pipeline · 6 stages, each AI step gated by code\]

This is the answer to "meaningful AI": AI does the reading and writing that only a language model can do, and plain code checks each output before it moves on. Nothing the AI produces reaches the brief without passing its gate.

| Stage | AI does | Code does | Why split it this way |
| --- | --- | --- | --- |
| 1. Read | Pulls facts from messy PDFs, spreadsheets, Word files and pack images, returning each with a quote and location in structured JSON; reads image-only marks (Certified Vegan, USDA Organic) from a rendered page | Parses files keeping positions; drops guide text and flags hidden text; rebuilds letter-spaced text; checks each quote exists where the AI says | AI is good at messy reading; code is perfect at string matching and geometry |
| 2. Reconcile | Finds conflicts in meaning that no rule could list in advance | Converts units and compares values | Stops false alarms like 480 g vs 16.9 oz |
| 3. Apply rules | Drafts rule records for a new market pack or a company's own rulebook (a person approves each one) | Runs the dated rule engine on facts, pack, the selected market pack and launch date; does the nutrition math (daily values, calories, servings × serving size) | Rule logic must be exact and repeatable |
| 4. Ask | Writes clear questions and the reason for each | Ranks gaps by impact and enforces the question budget | Good wording needs AI; good priorities need math |
| 5. Fit and claims | Judges whether claim wording is misleading under the claims rules | Packs mandatory blocks on true-scale panels; checks banned-word lists | Geometry is math; "misleading" needs judgement |
| 6. Write | Drafts the brief from fact IDs only | Rejects any sentence whose numbers or claims aren't in the Fact Sheet | The brief can't contain anything unproven |

**Model choice: build for ₹0, choose by measurement.**

- **One swappable AI client.** The app calls one small module with a task name and a JSON schema (generated from the Pydantic models). Behind it sits one adapter per provider. Changing models is a config change, never a rewrite.
- **Default: Gemini Flash on a free Google AI Studio key.** It takes images and PDFs directly (needed for the curved text and the image-only marks), supports strict JSON output, and needs no card. Free limits are unpublished and change, so check them in AI Studio on day one; a full run fits easily.
- **Optional helper: Groq free tier** (text only, fast) for short jobs like question wording, added only if Gemini's limits pinch. It's never sent whole documents.
- **Few, big calls:** about one call to read the carton, one for the sheet, one for meaning conflicts, one for questions and a few for brief sections, so about 10–20 calls per full run. No agent loops.
- **Cache everything:** the cache key is file fingerprint + prompt version + model name, so re-runs are instant and free, but a prompt fix or model switch is never answered from a stale cache. Rate-limit errors are retried with a wait, never a crash.
- **Model bake-off:** the self-test answer key (the known problems in Esko's files) scores 2–3 models on the same prompts: Gemini Flash plus one or two cheap vision models. The winner is picked by score, and about $5 of paid credit covers demo week. Line for the judges: *"We chose the model by testing it on your files."*
- **Privacy note:** free tiers may use inputs to improve the provider's models. That's fine for Esko's public samples; a production version would use a paid or private deployment.

## Trust, evidence and uncertainty

The rule behind everything: **the AI may suggest, but only sources and humans can confirm.** Every fact lives in one of three states, and the UI always shows which.

| State | How a fact gets here | How it looks |
| --- | --- | --- |
| Confirmed | Its quote was found by code at the stated spot in a file, or a person answered it | Green badge, solid source chip |
| AI-suggested | AI inferred it (for example "vegetarian, because no meat ingredients are listed") or the quote check was weak | Violet, dotted underline, needs one tap to accept or fix |
| Missing | A rule needs it and no source has it | Amber, becomes a question |

**Six guardrails, each answering a real failure from our research:**

| Guardrail | How it works | Failure it prevents |
| --- | --- | --- |
| No fact without a source | The AI must return a quote and a location for each fact. Code checks that the quote really exists at that page, paragraph or cell. If not, the fact drops to AI-suggested | A chatbot inventing a policy (Air Canada, 2024) |
| The brief can only use proven facts | Each sentence in the brief carries the IDs of the facts it uses. Code pulls every number and claim out of the draft and rejects any that isn't in the Fact Sheet | Made-up numbers slipping into print |
| Conflicts are never settled silently | Code catches unit mismatches first (480 g equals 16.9 oz, so no false conflict). AI catches conflicts in meaning ("Certified Vegan" vs honey in the ingredients). A person decides, and the decision is logged | Spec and label drifting apart, the top recall cause |
| Fewer, better questions | We ask only when an answer unlocks a requirement, ranked by impact, with a budget of about 10. Unsure items go to "needs review" instead of raising alarms | Alert fatigue: in one hospital study only 7.3% of alerts were relevant and 92.9% were overridden |
| Rules come from documents, never from AI memory | Every rule is stored with its clause, link and dates. Rules the AI drafts from a company rulebook stay "proposed" until a person accepts them | Rules that sound right but aren't real |
| A human signs off | Approve stamps name and time; every change is in the log | Nobody owning the final call |

**Self-test:** BriefForge breaks its own inputs on purpose (deletes an allergen from the spec, changes the net quantity, adds a "100%" claim) and checks whether it catches each break. The result shows in the Trust Console as "caught X of Y". Details are in the testing section.

## Markets are plug-ins

BriefForge is built for the United States, because that is what Esko's samples are. The engine itself knows nothing about any country: everything market-specific lives in a **market pack**, a folder of data files. The US pack ships built in. India is the first pack plugged in on top, and it is the proof that the next market (EU, UK, Canada) is a folder, not a rewrite.

**What the core engine owns (same for every market):** file reading, facts and sources, the quote check, conflicts, unit conversion, the rule engine and its date filter, question ranking, the pack canvas geometry, the brief writer and its audit, the Trust Console.

**What a market pack owns:**

| Part | US pack (built in) | India pack (plug-in) |
| --- | --- | --- |
| `market.yaml` | Name, regulators (FDA), units (oz + g), currency ($), number format, languages (English) | Name, regulators (FSSAI, Legal Metrology), units (g), currency (₹), Indian number format, languages (English, Hindi) |
| `rules/*.yaml` | 21 CFR Part 101 labeling rules, FALCPA allergens plus sesame, nutrient content claims | FSS Labelling and Display 2020 and amendments, FSS Advertising and Claims 2018, Legal Metrology Packaged Commodities 2011, FSSAI orders |
| `daily_values.yaml` | FDA daily values (fat 78 g, sodium 2,300 mg, vitamin D 20 mcg…) | FSSAI reference values |
| `allergens.yaml` | The 9 US major allergens | FSSAI allergen list |
| `claims.yaml` | Claim words and their conditions ("no added sugar", "healthy") | "100%", "natural", "fresh" and the advisories behind them |
| `marks/` | None required by law | Veg and non-veg marks, FSSAI logo, drawn to the rule's sizes |
| `pack_items.yaml` | Required items, their panel and minimum size (net quantity on the bottom 30% of the front) | Required items (MRP, unit sale price, licence number, consumer care) |

**How it shows in the product:** the market switch in the top bar lists the installed packs. Switching keeps every fact and answer, and recomputes requirements, questions, claims, the pack canvas and the brief. A banner says what changed ("India pack · 23 requirements changed · 6 new items missing").

**How a new pack gets made:** the AI drafts rule records from the official texts into a new folder, every record starts as "proposed", and a person approves each one against the source. The engine refuses to use a proposed rule in a brief.

**Why this matters to judges:** it answers "does this only work for one country?" on screen. It also fits how Esko's customers work: one global product, many markets.

## Rules knowledge base

Rules are data, not code: each rule is a record in a market pack with its source, clause, dates and conditions. Adding a rule never needs a code change, and every check can point back to the exact text it came from.

**What goes in for the demo (one category: granola and breakfast cereal, about 30–40 rules per market):**

- **US pack (built first, because the samples are US):** FDA food labeling rules (21 CFR Part 101): statement of identity, net quantity in both US and metric units on the front panel, name and place of business, ingredient order, Nutrition Facts format and daily values, the added sugars line, nutrient content claims like "no added sugar", and the major food allergens (FALCPA, plus sesame). Coming rules stored with their dates, such as the updated "healthy" claim and the proposed front-of-package nutrition box
- **India pack (plugged in after the US flow works):** FSS (Labelling and Display) Regulations 2020 with the amendments in force, the 2026 First Amendment stored as "from 1 July 2027", FSS (Advertising and Claims) Regulations 2018, Legal Metrology (Packaged Commodities) Rules 2011, and FSSAI orders such as the May 2025 "100%" advisory. Pending rules stored as pending, like the front-of-pack warning awaiting the Supreme Court
- **Company rules, as their own small pack layered on any market:** USDA Organic and Certified Vegan conditions, marked as stricter than the law

**What each rule record holds:**

| Field | Example |
| --- | --- |
| Market | `us` or `in` (or `company`) |
| Source and clause | 21 CFR 101.105, net quantity of contents |
| Plain summary | Net quantity goes in the bottom 30% of the front panel, in both US (oz) and metric (g) units |
| Link | Official text or gazette PDF |
| Status and dates | In force from date X / notified, starts on date Y / proposed / withdrawn on date Z |
| Applies if | Conditions on product facts: category, pack area, contains an ingredient, uses a claim word |
| Requires | The pack content it adds: an item, its minimum size, its panel, its languages |
| Check type | How code verifies it: present, exact match, number range, size, or a word list |
| Stricter than law? | Marked when a company rule goes beyond the regulation |

**How the rulebook gets built:** AI drafts rule records from the official PDFs, a person checks each one against the text, and the records are saved in the repo. Withdrawn rules stay in history with their dates (the A1/A2 milk order is a good example), so the Time Machine can show what changed and when.

**Honest scope line for judges:** built from public texts for one category, not legal advice. Legal review still signs off, and BriefForge makes that review faster and earlier.

## Tech stack and data model

Pick tools we already know for the backbone, and spend the learning time on the parts judges will see: the canvas, the graph and the AI pipeline.

| Layer | Tools | Why |
| --- | --- | --- |
| Frontend | React + TypeScript (Vite), Tailwind, shadcn/ui, Framer Motion | Fast to build a polished, consistent UI |
| Requirements Map | React Flow | Ready-made graph with zoom, pan and custom nodes |
| Pack Canvas and lenses | Konva (react-konva) for the flat dieline, red pen and pins; SVG stroke animation for the pen; react-three-fiber + drei for the 3D Pack View; `<model-viewer>` for the AR stretch; an open-source saliency model for the 3-second glance | True-scale 2D drawing with live repacking; one set of finding locations feeds every lens |
| Source viewer | PDF.js, plus simple Word and Excel previews | Opens a file at the exact spot and highlights the quote |
| Backend | FastAPI + Pydantic | Typed API; the same schemas validate AI output |
| Live progress | WebSockets | Facts appear on screen as they are found |
| Background jobs | FastAPI background tasks; Celery + Redis only if parsing gets slow | Keep it simple until it hurts |
| File reading | PyMuPDF (PDF text with coordinates, layers and rendering), openpyxl, python-docx; the vision model for image-only marks and scans | Every fact needs a location, so we need parsers that keep positions. No separate OCR engine needed for the samples |
| AI | A swappable AI client with provider adapters. Default Gemini Flash (free AI Studio key) with vision and strict JSON output; Groq free tier optional for short text jobs. Low temperature, prompts versioned in the repo, results cached | Free to build on; the model is picked by a bake-off on Esko's files, not by brand |
| Checks | rapidfuzz (quote matching), pint (units), rectpack (packing blocks on panels) | Plain code where code is more reliable than AI |
| Rules | Market packs: one folder per market (`markets/us/`, `markets/in/`) of YAML records, plus a small graph library (NetworkX) | Rules as data; a new market is a new folder |
| Storage | SQLite, files on disk | Zero setup for judges |
| Export | Browser print to PDF, JSON checklist | One click, no extra service |
| Scan and AR (campus round) | Mobile web page with OpenCV.js (face detection, sharpness, perspective flattening), local OCR as the second reader for photos, MindAR.js for image tracking, a free HTTPS host for the phone pages | No app install; photos get two readers; AR runs with no AI calls |
| Run it | `npm run dev` at the root starts backend and frontend together (uv pins Python 3.12 for the backend). A Dockerfile for the hosted demo is added in Phase 9; Docker Compose only if time allows | One command for judges without heavy local tooling; the demo never depends on Wi-Fi |

**Data model (the main records):**

| Record | Key fields |
| --- | --- |
| Source file | name, type (PDF, sheet, Word, photo), pages, sheets or scanned panels; for photos, the scale reference |
| Fact | field, value, unit, state, confidence, source (file, page or cell, region, quote), decided by |
| Conflict | the facts involved, kind (units or meaning), owner (Legal / R&D / Brand), resolution, who resolved it |
| Finding location | file, panel, position on the pack (mm); shared by every lens: red pen, sticky notes, pins in 2D and 3D, poster |
| Market pack | id, name, units, currency, number format, languages, rule files, daily values, required pack items |
| Rule | market, plus the fields in the rules section |
| Requirement | rule, pack item, status, facts used |
| Question | requirements it unlocks, text, why we ask, suggested answers, impact score, status |
| Pack spec | panels with sizes in mm, total area, languages |
| Brief | sections, sentences with fact IDs, version, approved by and when |
| Checklist item | requirement, what to look for, where on the pack |

## Testing and proof

We prove BriefForge works with a test set where we already know the right answers, and we show the misses as openly as the hits. A team that says "we caught 18 of 20, and here is why we missed 2" is more believable than one that claims perfection.

**The test set:** Esko's samples come with their own answer key: the problems listed in the samples section are the first test cases. On top of that, we make a clean, corrected copy of the files and about 20 broken copies, each with one to three planted problems:

| Planted problem | What should happen |
| --- | --- |
| Every problem already in Esko's samples (honey %, added sugars, vegan, daily values, serving math, address, oz quantity) | Each one found, with both sources shown |
| An allergen is in the ingredients but missing from the allergen statement | Flagged; allergen line marked unresolved |
| Net quantity differs between carton and sheet | Conflict card: intended change or mistake? |
| Same quantity in different units (480 g vs 16.9 oz) | **No** flag; this tests false alarms |
| A daily value % recalculated wrongly | Flagged by the math check with the correct value |
| "Natural" or "100%" claim added to the sheet | Claims Radar flags it with the rule for the selected market |
| Text moved off the front panel | Placement rule fails (net quantity must be on the front) |
| Barcode check digit changed | Flagged; the original passes |
| Hidden EU table under the US panel | Reported as hidden text; **no** false conflicts from its values |
| Guide text ("Art orientation", "Copy free") | Listed as ignored; never becomes a fact |
| A fact needed by a rule appears in no file | Becomes a question, ranked by impact |
| Switch the same files from the US pack to the India pack | Facts unchanged; requirements change (veg mark, MRP, licence added; oz removed) with no code change |

**What we measure:**

- **Gap recall:** planted gaps found ÷ gaps planted
- **Conflict precision:** real conflicts ÷ conflicts flagged (catches false alarms)
- **Wasted questions:** questions whose answer was already in the files
- **Citation accuracy:** share of source chips that open on the right spot, checked by code and by hand on a sample
- **Time to brief:** minutes from upload to approved brief, timed on the demo case

**Where it shows:** the Trust Console scoreboard, a results table in the README, and one slide-free moment in the demo where we run the suite live.

**Code tests too:** unit tests for unit conversion, rule filtering by date, and panel packing, plus fixed-answer tests for extraction on the sample files, so we notice when a prompt change breaks something.

## Demo script

One product, one story, start to finish, on Esko's own sample files: the Dancing Fish brand manager relaunching Berry Crunch in the US, then plugging in the India market pack. Every click happens on real files; no slides except the opening numbers.

**Submission video (about 4.5 minutes):**

1. **0:00–0:20 Hook.** "Agencies rate only 1 in 10 briefs as good. Label errors cause about 45% of US food recalls. Esko's own study says those errors start when the spec changes and the label doesn't. BriefForge stops them at the start."
2. **0:20–0:50 Evidence Desk.** Drop the Berry Crunch carton PDF and the US content sheet. Facts light up on the dieline panels and in the sheet cells; the counter ticks to about a dozen conflicts. The file card notes "Ignored: guide text · Hidden: EU table under the US panel".
3. **0:50–1:40 Fact Sheet and red pen.** The carton marks itself up in red pen. Honey 9% vs 1%: one click opens both spots. "No Added Sugar" vs honey and coconut sugar. Vitamin D 89 mcg shown as 12% (it's about 445%). The barcode gets a green tick, to show we don't just cry wolf. Flip to the nut-allergy shopper for one line: "the allergen box says only 'may contain'."
4. **1:40–2:20 Questions and Requirements Map.** "Honey is an ingredient: drop the vegan mark, or the honey?" Answer it; claims, nutrition and allergen nodes update in a wave.
5. **2:20–2:50 Pack Canvas and 3D.** The real dieline panels, measured. The corrected US content, including the dual oz and g quantity and the maker's address, is placed on the right panels. The carton folds into 3D with pins on every open problem; X-ray mode shows only the regulated content.
6. **2:50–3:30 Plug in a new country.** Show the `markets/in/` folder for two seconds ("a market is data, not code"), then pick India in the market switch. FSSAI and Legal Metrology rules apply, the veg mark, MRP, unit sale price and FSSAI licence become required, the oz quantity drops off, and the back panel overflows. Slide the launch date to July 2027 to show the coming amendment.
7. **3:30–4:00 The Brief.** Source dots on every line, keep / change / add / remove, open questions for the agency, Approve, export with the acceptance checklist.
8. **4:00–4:25 Trust Console.** Evidence coverage, then the self-test: "Esko's files had N planted problems; we caught X."
9. **4:25–4:40 Close.** "Esko catches errors at the end. BriefForge stops them at the start."

**Campus round (10 minutes of demo, 5 of questions):**

1. **0:00–1:00** "Spot the mistakes": show Esko's own carton, give the judges 30 seconds, then let the red pen reveal about a dozen. Then the numbers, and who it hurts (shopper personas).
2. **1:00–5:30** The same flow as the video, done live and slower, with one extra conflict and one extra question.
3. **5:30–6:30** The India pack: open its folder, plug it in, same carton, new rules, new brief. Mention that EU or UK would be the same amount of work.
4. **6:30–7:30** "Two routes, same answer": pick up the printed carton, scan it with a phone, and the same mistakes appear. Then hand the box to a judge with the QR code, and the red pen appears on the real box in their hands.
5. **7:30–8:30** Architecture walk: where AI is used, where code checks it.
6. **8:30–10:00** Trust Console and self-test score, then the closing line.

**Demo safety:** a reset button that restores the demo data in one click; three full rehearsals; the recorded video on a laptop as backup. If the AI service fails live, switch to a saved run and say so out loud. Hiding it would cost more trust than the outage.

## Build plan, 15–20 October

&#91;embedded content: Build plan · 15–28 Oct 2026\]

The rule: a plain version of the whole flow works on the sample files by 17 October. Only then do the wow features start, so a bad day never leaves us with half a product.

**Must-haves, done by 17 Oct:**

- File reading with positions for the dieline PDF and the Excel sheet (guide text dropped, hidden text flagged)
- Fact extraction with quotes, the quote check, and the three fact states
- Fact Sheet with conflict cards
- Market pack loader and the US pack: about 20 rules, daily values, the launch-date filter
- Requirements and ranked questions (a simple list is fine at this stage)
- Brief writer using fact IDs, the draft audit, the editor, Approve and export

**Wow features, 18–19 Oct:** Pack Canvas fit check, the India market pack plugged in, Claims Radar, Time Machine slider, the animated Requirements Map, Trust Console with the self-test.

**Lenses, between the phases:** red pen, sticky notes and track changes after the end-to-end milestone (5A); shopper lenses after the Pack Canvas (6A); the 3D Pack View after the India pack (7A). Anything not solid by feature freeze moves to the campus round. Details are decided when each phase starts.

**Campus round, after submission (21–27 Oct):** scan to brief (10A), live AR on the printed box (10B), plus AR "on your table", competitor snap, English + Hindi in the India pack, second product, Check-back, Word input. If scan or AR is ready early, a 10-second clip can close the submission video as a teaser. The video shows only what is actually built.

**If you have teammates, split by layer:** one person on backend and AI, one on frontend and UX, one on rules, test data and the demo. Solo, follow the order above exactly.

## Hand-off to Claude Code

This doc works as the product spec, but Claude Code can't open this page. It needs the plan as a file in the repo, plus the sample files and clear "done when" checks. Phases with checks it can verify keep it from drifting.

1. **Export this doc:** click the doc's name → Export → Markdown. Save it as `docs/PLAN.md` in the repo. Do the same for the research doc as `docs/RESEARCH.md` if you want the evidence nearby.
2. **Add the inputs:** put Esko's sample files in `samples/`, and the market packs (once drafted) in `markets/us/` and `markets/in/`.
3. **Write a short `CLAUDE.md` at the repo root:** the stack, the folder layout, how to run and test, and the non-negotiables: every fact needs a source and a checked quote; nothing reaches the brief without the audit; rules are data files, never hard-coded; nothing market-specific outside `markets/`; no chat-first screens.
4. **One phase per session:** ask it to read `docs/PLAN.md` and the phase below, and propose a plan before writing anything. Review the plan, then let it build.
5. **Check "done when" yourself before moving on.** Run it, click it, run the tests. Commit at the end of every phase so a bad session is easy to roll back.
6. **Keep the AI calls cached** from Phase 2 onward (key: file fingerprint + prompt version + model), so repeated runs during development don't burn time or free-tier quota.

## Build phases

Each phase ends with something you can run and check. Phases 0–5 are the must-haves (end to end by 17 Oct); 5A–8 are the wow features (the lens phases 5A, 6A and 7A sit between the main ones); 9 ships; 10 is for the campus round.

### Phase 0 — Setup (15 Oct, morning)

- **Goal:** an empty app that runs with one command.
- **Build:** repo with `backend/` (FastAPI, Python 3.12 via uv) and `frontend/` (React + TypeScript), a root `npm run dev` that starts both (no Docker yet), `CLAUDE.md`, `docs/PLAN.md`, sample files, an environment file for the AI key (`LLM_API_KEY`), and the AI client with the Gemini adapter and a one-line "ping" task.
- **Done when:** one command starts both; the page shows a working health check from the backend; the ping task returns valid JSON from the exact model name we'll use (free-tier model names change, so this is tested on day one).

### Phase 1 — Read files with positions (15 Oct)

- **Goal:** every sample file turns into text pieces that know where they came from.
- **Build:** parsers for PDF (text with page, box, panel and layer) and Excel (sheet and cell, columns A–C only, since the scaled columns are Excel 365 formulas), all producing one shared "source piece" format. For the dieline: map each piece to its panel using the Artwork panel layer, rebuild letter-spaced and curved text, drop guide text into an "ignored" list, and mark text covered by artwork as hidden by checking it against a render. Word, plain-PDF documents, notes and images come in Phase 4.
- **Done when:** both of Esko's sample files parse; each piece shows its file, panel or cell; "Art orientation" and "Copy free" are in the ignored list; the EU per-100 g table is marked hidden; "1 5 g" reads as "15 g". Tests cover both files.

### Phase 2 — Facts and the quote check (15–16 Oct)

- **Goal:** a Fact Sheet where every fact is proven or marked.
- **Build:** the fact schema, the extraction prompt with structured output, vision on a rendered page for image-only marks, the quote check, the three states, unit conversion, value conflicts, AI meaning conflicts, and caching by file fingerprint. Sheet notes like "assumed" or "confirm" make a fact AI-suggested.
- **Done when:** the samples produce facts with sources; honey 9% vs 1%, carbohydrate 15 g vs 66 g and the ingredient list differences become conflicts; the Certified Vegan mark is found; 480 g vs 16.9 oz does **not** become a conflict.

### Phase 3 — Rules, requirements and questions (16 Oct)

- **Goal:** facts plus a market and launch date decide what the pack must carry, and what we still need to ask.
- **Build:** the market pack format and loader, the US pack (about 20 FDA rule records for granola, FDA daily values, allergens, claim words, required pack items), the date filter, the "applies if" logic, the nutrition math checks (daily values, calories from fat, carbs and protein, servings × serving size = net weight), the barcode check digit, requirement statuses, ranking questions by impact, and AI wording for each question and its reason. Plus design keep/change questions for brand assets found in the old design (logo, product photo, colours, tagline, marks), whose answers feed the brief's keep / change / add / remove section.
- **Done when:** on Esko's samples, the API flags the added-sugar claim, the tree-nut "may contain" problem, the wrong daily values, the calorie math and the serving-size math; the barcode passes; at most 10 questions; and a search of the engine code finds no US-specific values (they all live in `markets/us/`).

### Phase 4 — Core UI flow (16–17 Oct)

- **Goal:** a person can do the whole job in the browser.
- **Build:** Evidence Desk with live progress, Fact Sheet with source chips that open the file at the right spot, conflict cards, the Questions stack. More inputs, because the challenge names them: a Word reader (paragraph locations), a plain-PDF document reader (page and line, no panels) for product specs, notes as pasted text or .txt (line numbers as the source), and JPG/PNG images of an old design read by the vision model (facts start AI-suggested).
- **Done when:** upload the samples, watch facts appear, resolve a conflict, answer a question, and see the Fact Sheet update.

### Phase 5 — Brief, audit and export (17 Oct) · milestone: end to end

- **Goal:** the deliverable.
- **Build:** brief sections with sentences that carry fact IDs, the AI draft, the audit that rejects unproven numbers and claims, the editor, Approve, PDF and checklist export. Plus a small "Ask about this" side panel (closed by default): it answers from the facts with sources, and an answer the user confirms becomes a fact. This covers the challenge's "conversation" without a chat-first screen.
- **Done when:** a full run goes from upload to an approved brief with zero unproven sentences. If this works, you have a valid entry even if nothing else gets built.

### Phase 5A — Reviewer lenses: red pen, sticky notes, track changes (dates set when we get here)

- **Goal:** the carton looks like a senior reviewer marked it up.
- **Build:** the shared finding-location layer (panel + position in mm) and pins on the flat dieline, the red-pen markup with self-drawing strokes and the Clean / Marked toggle, sticky notes by owner (Legal / R&D / Brand), track changes for ingredients, allergens and claims, the A3 wall poster export.
- **Done when:** every open finding on Esko's carton has a mark at its real spot that opens its sources; the toggle works; the poster exports as one printable page.

### Phase 6 — Pack Canvas (18 Oct)

- **Goal:** the "will it fit?" moment.
- **Build:** panel sizes from the dieline's Cut, Crease and Artwork panel layers, locked zones for existing brand art, block sizes from the market pack's minimum sizes and real text length, packing, the true-scale canvas, space meters, overflow and suggested fixes. Pack size becomes a question for files without dieline layers.
- **Done when:** the corrected US content is placed on the real Berry Crunch panels with space meters, and a test pack with extra required items makes the back panel overflow, with a fix that clears it.

### Phase 6A — Shopper lenses: personas, shelf test, glance, accessibility (dates set when we get here)

- **Goal:** turn rule problems into what a real shopper experiences.
- **Build:** shopper personas (nut allergy, vegan, watching sugar, low vision; India personas once the pack is in) with audited one-line verdicts, the shelf-distance test with readability per required item, the 3-second glance heatmap, colour-blindness and contrast checks, the confidence glow, the before / after wipe.
- **Done when:** the nut-allergy persona shows the "may contain" problem on the real carton with its sources; the shelf test names the first required item to become unreadable and shows its numbers; every estimate is labelled as one.

### Phase 7 — India market pack, Claims Radar, Time Machine, Requirements Map (18–19 Oct)

- **Goal:** prove the engine is general by plugging in a second market, and show the rule logic visually.
- **Build:** the India pack as data only (about 20 FSSAI and Legal Metrology records, reference values, veg mark, required items, claim words), the market switch in the top bar, claim word lists plus AI judgement with rule citations, the launch-date slider wired through every screen, the animated graph.
- **Done when:** adding `markets/in/` needs no code change; switching to India adds the veg mark, MRP, unit sale price, FSSAI licence and consumer care as required and removes the oz quantity; the back panel overflows on the real dieline; "No Added Sugar" and "Certified Vegan" are flagged in the US Claims Radar; a July 2027 date in India shows the amendment rules; answering a question turns nodes green. Optional style: the Requirements Map as an evidence board.

### Phase 7A — 3D Pack View: fold the box, pin the problems (dates set when we get here)

- **Goal:** the carton folds into a 3D box with every finding pinned on it.
- **Build:** panels and hinges from the Cut and Crease layers (tuck-end style), the rendered artwork as face textures, the fold animation, pins from the shared finding locations with camera fly-to, X-ray mode with ghost boxes for missing items, the market switch updating the box, 3D snapshots in the exported brief. Stretch: AR export with a QR code.
- **Done when:** Esko's carton folds into a closed box with the artwork on the right faces; every pin sits on its finding's spot and opens its sources; X-ray shows the missing oz quantity as a ghost box. If not solid by feature freeze, the 2D pins ship and 3D moves to the campus round.

### Phase 8 — Trust Console and self-test (19 Oct) · feature freeze

- **Goal:** trust shown as numbers.
- **Build:** the generator that makes broken test cases, the runner, the metrics, the scoreboard screen, the change log, and the model bake-off (the same runner scoring 2–3 models).
- **Done when:** the suite runs from the screen and shows "caught X of Y" with each miss explained; the bake-off table is in the README and the winning model is set in config. After this, fix bugs only.

### Phase 9 — Ship (20 Oct)

- **Goal:** a complete submission well before 11:59 PM.
- **Build:** README with setup and test results, the architecture diagram, the short write-up, the AI and tech description, a Dockerfile and a hosted demo plus the local `npm run dev` setup, the 3–5 minute video.
- **Done when:** a teammate who has never seen it can run it from the README, and every submission field is filled.

### Phase 10 — Campus extras (21–27 Oct)

- **Goal:** extra wow for the in-person round, only after results.
- **Build, in this order:** any lens that missed feature freeze, then Phases 10A and 10B below, then second product, English + Hindi in the India pack, AR "on your table", competitor snap, Check-back; the printed carton props, the "Spot the mistakes" opener and a printed A3 poster; three full rehearsals with the reset button.
- **Done when:** the 10-minute script runs twice in a row without a hitch.

### Phase 10A — Scan to brief (campus round; dates set when we get here)

- **Goal:** no files, just the pack: scan a carton with a phone and get the same pipeline.
- **Build:** the mobile capture page (HTTPS), face detection, sharpness and auto-capture, perspective flattening with manual corner fallback, the 3D twin filling in, upload per panel while scanning, two readers per panel (local OCR + vision model) with agreement deciding Confirmed vs AI-suggested, the live "what to scan next" checklist from the requirements engine, close-up requests, the bank-card scale reference, then the normal pipeline with photo-crop source chips.
- **Done when:** scanning the printed Esko carton finds the same mistakes as the PDF route ("two routes, same answer"), with no facts from the hidden EU table; scanning plus the Excel sheet gives "shelf vs approved" conflicts.

### Phase 10B — Live AR on the real box (campus round; dates set when we get here)

- **Goal:** a judge points their phone at the printed carton and sees the red pen on it in real time.
- **Build:** panel target images from the render, compiled for MindAR.js; one transparent red-pen image per panel from the backend; the AR page over HTTPS with a QR code; a fallback anchor for weakly tracked panels; tests in dim light, with a moving hand and on an older Android phone. Stretch: "snap any pack" with competitor claims going into the brief.
- **Done when:** on two different phones, marks stay on each side of the printed box as it turns, with no AI calls during AR.

## Risks and fallbacks

The biggest risk is not a bug; it's trying to build every wow feature and finishing none. Must-haves get built first, and every wow feature has a cut decision ready.

| Risk | Fallback |
| --- | --- |
| Too much scope for six days | Build order in the build phases above. Cut list ready, in this order: Check-back screen, AR, second product, Hindi in the India pack, 3-second glance, 3D Pack View (2D pins stay). The red pen and the India pack are cut last, because they carry the "reviewer" and "general engine" stories |
| 3D looks like Esko's existing 3D tools | Pitch "compliance findings live on the box", X-ray and the shelf test, never "we made it 3D". One carton style today, more styles next |
| The dieline's layers are hard to read on other files | Esko's sample has named Cut, Crease and Artwork panel layers, so the demo uses real sizes. For files without them, pack size becomes a question and the fit check is labelled an estimate |
| The samples are US, so judges expect FDA | The US pack is built first and the whole main demo is US. India is a plug-in on top, so if it slips, the US product is still complete |
| US-specific logic leaks into the engine, so India becomes a rewrite | Rule: nothing market-specific outside `markets/`. Phase 3's done-when includes a search of the engine code for US values |
| The PDF reader mistakes guide or hidden text for facts | Guide text goes to an "ignored" list and covered text is marked hidden; both have tests on the sample carton |
| AI misreads messy files | Quote check drops weak facts to AI-suggested; the test set catches regressions; prompts are versioned |
| It ends up looking like a chatbot | No chat screen anywhere on the demo path; chat is a side helper only |
| A rule in our base is wrong | Small scope (30–40 rules, one category), each checked against the text by a person, with the scope line shown to judges |
| Live demo or AI service fails | Saved run plus the recorded video, said out loud if used |
| Scan or AR fails in the venue (light, Wi-Fi, a phone blocking the camera) | Our own phone mirrored to the projector, a recorded clip of each working, and two printed cartons. Both are extras: the file route is the main demo |
| AI cost or rate limits | Free Gemini tier, about 10–20 calls per full run, every result cached, retries with a wait. The submission video is recorded on cached results so a rate limit can't interrupt it |
| A free model is renamed or retired mid-week | Swappable AI client; the model name lives in config and the Phase 0 ping test catches it. A paid tier on the same key is the fallback |
| Judges see Problem 1 as the easy one | Show the depth: the architecture, the rule engine, the geometry and the test scores |

## Judge Q&A prep

Five minutes of questions can win or lose the round. Each answer below is short, and each points to something on screen.

| Likely question | Our answer |
| --- | --- |
| How is this different from asking a chatbot to write a brief? | A chatbot can't prove its lines, apply dated rules, or do the fit math. Every line here has a checked source, every question comes from the requirements map, and the pack canvas is real geometry. Then show the Trust Console |
| How do you stop hallucinations? | Quotes are checked against the files by code, brief sentences carry fact IDs, and every number in the draft is matched to the Fact Sheet. Anything unproven stays violet. Then show the test score |
| How accurate is it? | Give the real test numbers, including the misses and why they happened |
| What happens when the rules change? | Rules are dated records. A new rule is a new record, no code. Then show the Time Machine |
| How does this fit with Esko's products? | It sits upstream. Our brief and checklist are structured data that an artwork checker could use later. Say it's a fit, not an existing integration |
| Can it scale to thousands of SKUs? | Each SKU runs through the same pipeline, rules are shared, results are cached, and facts can be reused across variants of one product |
| Esko already has 3D packaging tools. What's new here? | The 3D is only the canvas. What's new is that compliance findings live on the box, each pin linked to its proof, plus X-ray of regulated content and the shelf-distance readability test |
| Is the fit check accurate? | It's an early-warning estimate from minimum sizes and real text length, with the math shown. The designer still lays out the pack; we only flag the risk before design starts |
| Why US first, and why add India? | Esko's samples are a US product, so the core is built and tested on FDA rules. India shows the engine is general: the problem statement names FSSAI, Indian rules span two regulators and change fast, and it was added as a folder of rule records with no code change |
| How hard is a new market, say the EU? | A new market pack: market settings, rule records, reference values, required items and claim words. The AI drafts the records from the official texts and a person approves each one. No engine code changes |
| What about confidential files? | The demo runs Esko's public samples on a free tier. A production version would use a paid or private deployment where inputs aren't used for training, and the swappable AI client makes that a config change |
| Which model do you use, and why? | Whichever won our bake-off on your files, scored against the problems we know are in them. Show the bake-off table |
| What if the brand manager has no files, only the pack? | Scan it. The requirements engine tells her which side to show next, two readers check every photo fact, and the same pipeline runs. Then show "two routes, same answer" |
| What would you build next? | The check-back on agency drafts, more categories, an API for artwork systems, and learning from reviewer decisions |

## Sources

- [Esko AIForge — Research: Case Studies & Numbers](https://claude.ai/code/artifact/04078237-ea6d-4143-87af-4c60239cd131) (our research doc, with every source behind the numbers here)
- [Esko blog: A Study of FDA Food and Beverage Recalls in 2025](https://www.esko.com/en/blog/fda-food-and-beverage-recalls-2025)
- [B&T: BetterBriefs Project survey](https://www.bandt.com.au/the-betterbriefs-project-finds-33-of-marketing-budgets-wasted-due-to-poor-briefs/)
- [JMIR Medical Informatics: Appropriateness of alerts](https://medinform.jmir.org/2022/10/e40511)
- [Instacertify: FSSAI labelling rules 2026](https://instacertify.com/resources/blogs/fsaai-labeling-rules-guide-packaging-compliance)
- [PIB via Dept of Consumer Affairs: Legal Metrology declarations](https://consumeraffairs.nic.in/sites/default/files/02-Aug-2024.pdf)
- [GALA: FSSAI's August 2026 enforcement wave](https://blog.galalaw.com/post/102o0e2/indian-fssais-aug26-enforcement-wave-what-food-and-beverage-advertisers-shoul)
- [FoodOS360: Supreme Court reserves order on front-of-pack labels](https://www.foodos360.com/blog/fssai-front-of-pack-warning-labels-supreme-court-reserves-order)
