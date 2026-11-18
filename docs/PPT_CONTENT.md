# BriefForge: slide content

Eight slides (one of them the live demo) plus a short appendix, for a 10-minute talk with a live demo. Slides take about 3 minutes; the demo takes 6–7. Each slide gives the on-slide text (short), a visual, and what to say.

> **Running order (this is what `docs/deck/BriefForge.pptx` uses): the product first, for a user; then under the hood, for technical judges.**
> **Part 1, the product (about 5 min):** 1 Title → 2 Problem → 3 Solution → 4 **Live demo**.
> **Part 2, under the hood (about 5 min):** divider → Our six non-negotiables → How it works (the HLD) → **More than upload and compare** (seven kinds of rule) → Every AI scan → Everything code checks → How the carton's edges and folds are found → **How we know it's sound** → Built to scale and limits → Close.
> If short of time, skip the AI-scans, code-checks and edges-and-folds slides: they are detail for questions.
> **Appendix:** What the demo finds, Every case, Inside one finding (the LLD), Who does what, Why not RAG, Sources. Full detail for each is in `docs/DEMO_CASES.md`.
> The slide numbers in the sections below are from the first draft; the content is unchanged. Rebuild with `docs/deck/build_deck.js` and `docs/deck/build_pdf.mjs` after changing any image or text.

Slide text is deliberately brief. Put the detail in your voice, not on the slide.

---

## Slide 1: Title

**On the slide**
- **BriefForge**
- Is this packaging artwork ready to print?
- Esko AIForge hackathon · Problem 2
- Your name · 28 October 2026

**Visual:** the Dancing Fish carton, flat dieline, full width.

**Say (10 s):** "BriefForge checks finished packaging artwork before it goes to print, and shows its evidence for every answer."

---

## Slide 2: The problem

**On the slide**
- **Close to half of US food recalls are label errors**
  - 45% of 2024 recalls: 192 events, about $1.92 billion (Loftware, from FDA data)
  - 45.8% of 2025 recalls were allergen mislabeling: 115 of 251 (Esko)
- Pathogens come second (Listeria 15% in 2024)
- The cause: *the spec changes and the label doesn't*

**Visual:** `docs/ppt-assets/1-recall-causes.png` (our own chart, drawn from the published figures). It shows the 2025 recall causes as bars with the allergen/label-error bar highlighted, and the Loftware 2024 numbers in a strip underneath, with both sources printed on the image.

**Say (45 s):** "In 2024 and again in 2025, almost half of US food recalls were label mistakes, not contamination. Esko's own analysis explains why: a formulation changes and is recorded in the spec, but the artwork is not updated. Today, a person checks the artwork line by line. It's slow, and one missed line means a reprint or a recall."

**Careful:**
- The two percentages are different studies and years. Say the source each time. Don't merge them into one number.
- Esko's own headline graphic says **98** foodborne illness recalls, but its text and its bar chart say **94**. Our chart uses 94; don't quote the 98.
- If asked about allergens: Esko's chart gives Milk/Dairy 34, Tree Nuts 28, Wheat/Gluten 23, Peanuts 15, Sesame 11, Soy 10, Egg 9, Sulfites 5, Shrimp/Fish 5 (some recalls had several).

---

## Slide 2b: Our six non-negotiables (after the problem, before the solution)

**On the slide:** six cards, numbered 1 to 6, each a short title and one line. The same wording is in the speaker notes.
1. **Every fact has a source:** a quote checked by code. Unchecked means AI-suggested, never confirmed.
2. **No finding without evidence:** a Fail cites a rule and code-checked evidence. AI judgement is only ever Needs review.
3. **Rules are data:** never hard-coded; nothing market-specific in engine code.
4. **Nothing resolved silently:** a person decides, and it is logged.
5. **Code proves, AI reads:** code does maths, units, rules, geometry; AI does reading, meaning, wording; output is schema-validated.
6. **No chat-first screens:** chat only as "Ask about this finding", using only that finding's own rule and evidence.

**Say (60 s):** "Because a wrong answer in this domain is worse than no answer, we started from six rules we would not break. ... Now the solution built on them."

---

## Slide 3: The solution

**On the slide**
- **Three things in**
  - Finished artwork (dieline PDF)
  - Approved product information (Excel)
  - A rulebook (laws and company rules)
- **One answer out**
  - **Fail:** a rule is broken, proven by code
  - **Needs review:** a person must decide
  - **Pass:** correct, and where it was found
- Every result shows its evidence

**Visual:** `docs/ppt-assets/2-where-we-fit.png`: approved info → artwork → **BriefForge** → approval, the rulebook feeding in from below, the three verdicts on the right, and the "gap" between spec and artwork marked in red. Title on the image: "The spec changes. The label doesn't."

**Say (45 s):** "You give it the finished artwork, the approved information, and the rulebook. It tells you what's wrong, what needs a person, and what's correct, with the evidence for each. We built and tested it on Esko's own sample files: the Dancing Fish Granola carton and its content sheet."

---

## Slide 4: How it works (why you can trust it)

**On the slide**
- **The AI reads. The code proves. A person decides.**
- Every fact carries a quote, **checked by code**
- Maths, units and rules are **code**, not AI
- Anything resting on AI judgement is **Needs review**, never Fail
- Rules are **data**, never hard-coded

**Visual:** `docs/diagrams/hld.png` ("The journey of a carton"): the three files cross the floor left to right (readers → AI → quote check → rules and maths → triage) into Fail / Needs review / Pass bays, the findings rise to the app's screens, and a person decides. The right-hand card says why a Fail can be trusted.

The same pipeline as text:

```
Artwork + Sheet + Rulebook
        ↓
  Readers: text with panel + position in mm
        ↓
  AI extracts facts, each with a quote
        ↓
  Code checks the quote is really in the file
        ↓
  Rules + maths  →  Fail / Needs review / Pass
        ↓
  Person decides  →  Report with sign-off
```

**Alternative visual:** `docs/ppt-assets/4-how-it-works.png`: four boxes (AI reads → code checks the quote → code applies rules → a person decides), and under them "A Fail needs all three: a cited rule, a check done by code, evidence code has confirmed".

**Say (75 s):** "Three ideas make this trustworthy. First, the AI only reads. For every fact it extracts, it must give a quote, and then our code checks that quote really appears in the file. If it doesn't, the fact is marked AI-suggested and can never cause a Fail. Second, anything that can be calculated is calculated by code: percent daily values, calories, unit conversions, the barcode check digit. Third, a Fail needs a cited rule and evidence that code has checked. Everything else goes to a person."

---

## Slide 5: What it finds (a taste before the demo)

**On the slide** *(3 examples, one line each)*
- **Honey:** 9% on the approved sheet, **1%** on the carton
- **Total Fat % Daily Value:** 15 g ÷ 78 g = **19.2%**, printed **2.2%**
- **Hidden:** an old EU nutrition table sits **under** the US panel
- Plus: storage text at 5.8 pt against a 6 pt company minimum
- On Esko's sample files: **29 fail · 11 review · 7 pass**, plus 2 checked and fine

**Visual:** `docs/ppt-assets/3-a-finding.png`: two finding cards (honey 9% vs 1% with both sources; Total Fat 15 g ÷ 78 g = 19.2% vs 2.2% printed). Optionally swap in a real screenshot of the Checks screen.

**Say (30 s):** "Here is what it finds on Esko's own files. These are real mistakes, each with the exact spot in both sources. The percent daily value is calculated by code, and the working is shown. Let me show you."

> **The counts (29 fail · 11 review · 7 pass · 2 checked and fine) are read from the saved demo snapshot, which is what Load demo shows.** The unit tests assert different totals (23 · 10 · 4) because they run without the rulebook. Say 29 and 11 on stage, and glance at the top bar first to confirm.

**→ Next: slide 6, the live demo.**

---

## Slide 6: Live demo

**On the slide** *(keep it nearly empty; it is a bookmark while you switch windows)*
- **Live demo**
- Files → Checks → Rules → Report
- Dancing Fish Granola Berry Crunch · US carton

**Visual:** a clean title slide with the carton thumbnail on one side. Nothing to read.

**Say (10 s):** "Let me show you on Esko's own files." Then switch to the browser.

**Before you switch:** the app is already running locally and has been reset and reloaded with **Load demo** (no AI calls), the recorded video is open in another window as a fallback, and the browser is at 100% zoom.

**Demo run (6–7 min):**

| Min | Show | Point out |
| --- | --- | --- |
| 0:00 | **Files**: the three files | Guide text ignored; hidden text on the Left panel |
| 0:45 | **Checks** top bar | "Not ready to print: 29 fail · 11 review" |
| 1:15 | Honey card | Two crops side by side; "checked by code" |
| 2:00 | Total Fat % DV card | The working line: code did the sum |
| 2:45 | **Rules** and DF-16, DF-18 | Rulebook is a Word file; each rule quote-checked; DF-21 proposed, never applied |
| 4:00 | "Checked and fine" filter | The valid barcode and the ignored guide text, with proof |
| 4:30 | Needs review → HIGH-GRAIN | Type a name, "It's a problem", the verdict updates |
| 5:30 | **Report** | Fail list, marked-up carton, decisions log, sign-off |

Details are in `docs/VIDEO_SCRIPT.md`. When done, return to the deck and go to slide 7.

---

## Slide 7: Built to scale, and honest about limits

**On the slide**
- **A new country is a folder of rules, not new code**
  - US (FDA) in use · India (FSSAI) written as data
  - A test fails if market logic leaks into the engine
- **Company rules count too**, and an AI-invented rule is rejected
- **Tested:** 520+ backend tests, 400+ frontend tests, end-to-end checks; none call the network
- **Limits**
  - Text inside images is lower trust → Needs review
  - Evidence outside the artwork (certificates) stays Needs review
  - Built on one product; India switch not in the UI yet

**Visual:** a folder tree:

```
markets/
  us/        FDA rules
  in/        FSSAI rules
  company/   company rules
```

**Say (50 s):** "Adding a country means adding a folder of rule records, each with the regulation, the clause and an exact quote. India is already written this way. No engine code changes, and a test enforces that. The honest limits: text inside images is read by a vision model, so it's lower trust and always goes to a person. Anything that needs evidence from outside the artwork, like a certificate, stays Needs review. We've tested on one product, and the India market switch isn't in the interface yet."

---

## Slide 8: Close

**On the slide**
- **The AI reads. The code proves. A person decides.**
- Every finding shows its evidence
- Next: India switch in the app · self-test on changed copies · a database
- Thank you · questions

**Visual:** the marked-up carton with the red marks, full width.

**Say (20 s):** "Checking artwork shouldn't depend on someone remembering to check. BriefForge makes the evidence visible, the proof checkable and the decision a person's. Thank you."

---

## Appendix (not presented; keep for questions)

**A1. Triage rule.** Fail needs: a cited rule + a deterministic code check + every evidence quote passed the code check. Otherwise Needs review. Nothing is reported with no evidence.

**A2. Quote check.** Case, spacing and letter spacing ignored. Short quotes must match exactly. Digits are never fuzzy, so "1%" can never match "9%".

**A3. Code vs AI.**

| Code | AI |
| --- | --- |
| Daily values, calories, serving maths | Reading messy files |
| Unit conversion, barcode check digit | Meaning ("Vegan" vs honey) |
| Rule logic, banned wording, text size | Reading images and marks |
| Geometry, hidden text | Reading rulebook prose into rules |

**A4. Stack.** FastAPI, Python 3.12, Pydantic · React 19, TypeScript, Vite, Tailwind · PyMuPDF for the PDF · Gemini behind an adapter (swappable; tests use a fake adapter with recorded responses).

**A5. Inside one finding.** `docs/diagrams/lld.png`: the honey mismatch end to end (sheet cell B26 and the carton's Back panel → AI fact with a quote → quote check → value conflict c-3 → rule DF-02 → triage → finding `f-mismatch-c-3` → the Checks card), plus the other road: the AI-suggested Label ID that can only reach Needs review. Use it if asked how a single result is built.

**A6. Screenshots (fallback if the demo fails).** Capture these before you present: Checks top bar, honey card, Total Fat card, hidden-table mark on the carton, Report page.

**A7. Why not RAG for the rulebook?** 21 rules fit in one AI call, so there is nothing to retrieve. We turn the rulebook into structured rules once and code applies them the same way every run; RAG would put the AI in the verdict path, which we only allow to produce Needs review. Every rule's quote is checked against the whole document, not a retrieved chunk. Market rules are curated YAML with exact quotes. Limit: a very long rulebook is read in one call and could exceed the model's context. Next step: retrieval only to find candidate clauses, with the quote check and the code triage unchanged.

**A8. How two values are compared.** Number and unit read by one regex; pint converts both sides to a base unit (g, kJ, ml); different kinds (g against kcal) are not compared; same kind conflicts above 2%. % Daily Value = amount ÷ official daily value × 100, within 1 point (calories 10%, servings 5%). Example: 15 g ÷ 78 g = 19.2% against 2.2% printed. Limits: tolerances are product defaults; two printed percentages are compared exactly; no FDA rounding model; "2 x 40 g" is not parsed (goes to a person).

**A9. When we match exactly, and when we don't.** Values: by number after conversion. A quote with digits must appear exactly (case, spacing, letter spacing ignored). A quote with no digits: fuzzy, score 92+, 12+ characters. Ingredient lists: singular names, only descriptor words (dried, organic, roasted...) ignored. Rule to field: word and fuzzy match (90 / 80), to find a field, never to decide a Fail.

**A10. Where a fact is on the artwork.** Code reads each text piece with page, panel and position in mm; panels come from the dieline outlines; the AI returns value, quote and piece ids; code finds the quote in those pieces (and the next line on the same panel); the location is the union of their boxes. Image-only facts stay AI-suggested until the sheet says the same.

---

## Design notes for building the deck

- **Three colours at most.** Use icon plus word for the verdicts (Fail, Needs review, Pass), never colour alone.
- **One idea per slide.** If a slide needs more than 5 lines, move detail into your speech.
- **Large text:** body 24 pt or more, so it reads from the back of a room.
- **Real screenshots over diagrams** wherever you can; judges like seeing the product.
- **Timing:** slides 1–3 (with the non-negotiables) about 2.5 min, slide 4 about 1.25 min, slide 5 about 0.5 min, demo 6–7 min, slides 7–8 about 1.25 min. That is slightly over 10 min, so shorten the demo first.
- **Fill in** your name, the real counts, and screenshots. Everything else is ready.
