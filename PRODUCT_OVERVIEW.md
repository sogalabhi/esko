# BriefForge — Product Overview & Feature Specification

> **Audience:** Product Management, Design Leads, and Executive Stakeholders  
> **Status:** Active Build · Esko AIForge Hackathon (Problem 1)  
> **Core Promise:** *From messy packaging files to an airtight agency brief that cannot lie, backed by an acceptance checklist the final artwork must pass.*

---

## 1. Executive Summary & Product Vision

### The Problem in Packaging Today
In consumer packaged goods (CPG), packaging design briefs are notoriously inaccurate and fragmented:
- **High Recall Rates:** Approximately **45% of all food and beverage recalls** in major markets stem from labeling errors—specifically where product specifications change (new formulations, altered allergens, updated supplier percentages), but the physical packaging artwork fails to reflect them.
- **Wasted Agency Cycles:** Industry studies (such as the BetterBriefs Project) reveal that **up to 33% of marketing and creative budgets are wasted** due to vague, incomplete, or contradictory design briefs. Designers guess, legal reviewers intervene late, and packaging goes through multiple expensive redesign loops.
- **Jurisdiction Complexity:** Launching the same SKU in another country (e.g., expanding a US product into India) requires reconciling entirely different regulatory frameworks (FDA vs. FSSAI, imperial vs. metric units, mandatory statutory declarations like MRP, veg/non-veg logos, and importer addresses).

### How BriefForge Solves It
Most packaging tools act as **downstream inspectors**: they wait until artwork is finished and then search for mistakes. **BriefForge acts upstream**: it intercepts the input files (the brand manager's dieline PDF proofs, formulation spreadsheets, Word briefs, and regulatory notes), extracts every claim, checks every calculation, resolves every contradiction with the brand team, and produces an **audited, proven packaging design brief**.

### The "Proof-First" Core Philosophy
1. **Zero Hallucination Tolerance:** Every number, percentage, claim, and allergen statement in the brief must link directly to an underlying verified fact ID with exact document coordinates (page, panel, or spreadsheet cell).
2. **Clear Fact States:** Facts are explicitly labeled as **Confirmed** (code-checked against original files), **AI-Suggested** (derived from notes or ambiguous text), **Missing** (legally required but not found), or **Pass** (deterministic code check passed).
3. **No Silent Resolutions:** When the Excel formula says Honey is 9% and the carton says Honey is 1%, BriefForge never guesses. It flags the conflict, presents the exact source quotes side by side, and prompts the human owner to decide.
4. **Markets as Pluggable Data Packs:** No market regulations (FDA, FSSAI, 21 CFR, daily values, currencies) are hardcoded into the software. Switching markets is as simple as selecting a new data pack, re-running the same facts through a new rulebook.

---

## 2. The 5-Step Guided User Flow

The interface is structured as an intentional, linear workflow that guides a brand manager from scattered assets to an approved brief:

```
[ Step 1: Evidence ] ──► [ Step 2: Facts ] ──► [ Step 3: Questions ] ──► [ Step 4: Pack ] ──► [ Step 5: Brief ]
  Drop messy files         Verify facts &          Resolve conflicts &       Inspect 3D fit &         Audit & export
  (PDF, Excel, Docx)       review conflicts        answer policy gaps        compliance pins          ready brief
```

---

## 3. Deep Dive: Implemented Features & UX Details

### 3.1. Global App Shell & Top Navigation Bar
Present across every screen to provide continuous orientation and control:

- **Product Title & SKU Identity:** Displays the active product title (e.g., `Granola — Berry Crunch · 480 g`) derived automatically from the primary files.
- **Market Switcher:** Segmented radio pills allowing one-click toggling between target markets (e.g., **United States** vs. **India**). Switching markets instantly re-evaluates all mandatory content requirements across the app without reloading.
- **Launch Date Picker & Slider:** An interactive date input coupled with a slider allowing the brand team to simulate future launch dates (e.g., March 2027). This drives the regulatory rule engine to account for laws with future enforcement dates.
- **Brief Health Progress Ring:** An SVG circular progress ring displaying real-time compliance readiness (e.g., `30% proven · 7 open`). As conflicts are resolved and questions are answered, the ring dynamically fills with the brand accent color.
- **Backend Connectivity Indicator:** A live status badge with a colored indicator dot (Green = `Backend OK`, Yellow = `Connecting`, Red = `Unreachable`) with tooltip metadata on the active model.
- **"Ask About This" Quick-Trigger:** A dedicated search/copilot button in the top right that opens an intelligent side-drawer for natural language queries against project facts.
- **"Reset Demo" Action:** A clean one-click reset button that wipes local overrides and restores the pristine demo benchmark in seconds.

---

### 3.2. Left Navigation Rail
- **Numbered Workflow Steps:** Clearly delineates Steps 1 through 5 (`Evidence`, `Facts`, `Questions`, `Pack`, `Brief`).
- **Reviewer Lenses & Tools:** Direct links to specialized auxiliary views: `Markup` (Red-Pen Review), `Rules Map`, `Claims Radar`, and `Trust Console`.
- **Dynamic Status Dots:** Each step features a real-time status dot:
  - **Green (Done):** Step is complete (e.g., all files read or brief approved).
  - **Orange (Needs Input):** Active work required (e.g., unanswered questions).
  - **Red (Conflicts):** Critical contradictions detected.
  - **Hollow (Idle):** Downstream step awaiting upstream inputs.
- **Collapsible Rail (Micro-UX):** A toggle arrow button at the bottom allows collapsing the rail from $220\text{ px}$ to an icon-only $56\text{ px}$ strip, maximizing screen real estate for inspection. The collapsed state is persisted in local storage (`bf.rail.collapsed`).

---

### 3.3. Step 1: Evidence Desk (Drop & Ingest)
*Purpose: Ingest messy real-world files, parse text geometry, identify layers, and establish baseline provenance.*

- **Multi-Format Drop Zone:** Supports drag-and-drop or file browsing for all standard packaging assets:
  - **Dieline PDF Proofs:** Esko DeskPack or Illustrator dielines containing cut, crease, dimensions, and artwork layers.
  - **Content Sheets:** Multi-tab Excel workbooks (`.xlsx`) containing ingredient decks, nutrition panels, and internal brand notes.
  - **Specifications & Briefs:** Word documents (`.docx`), plain PDF documents, and plain text notes (`.txt`, `.md`).
  - **Visual Packaging Assets:** PNG/JPG artwork images.
- **File Cards with Live Status:** Each uploaded file displays its file name, file type icon, page/sheet count, and parsing status (`queued`, `reading`, `done`, `error`).
- **Transparency on Ignored/Skipped Content (Micro-UX):**
  - Displays a clean expandable disclosure showing what the parser deliberately ignored and why (e.g., *Ignored guide text: 'Art orientation', 'Copy free'* or *Ignored formula columns in Excel*).
  - Shows detection of **physically hidden text** (such as an older EU nutrition panel lurking behind an opaque white rectangle in the PDF) so it is never falsely ingested as active copy.
- **Error Resilience:** If one file fails (e.g., corrupted structure), a descriptive banner names the specific file and error reason while allowing all valid files to proceed smoothly.

---

### 3.4. Step 2: Facts & Reconciliation Sheet
*Purpose: Review extracted packaging claims, inspect discrepancies, and resolve conflicts side by side.*

- **Categorized Sections:** Facts are organized into 8 standardized packaging domains:
  1. *Identity* (Brand, Product Name, Net Weight)
  2. *Ingredients* (Formula percentages, sweetener breakdown)
  3. *Allergens* (Contains declarations vs. "May Contain" facility warnings)
  4. *Nutrition Facts* (Serving size, calories, daily values, nutrient weights)
  5. *Quantity & Barcode* (Dual units g/oz, UPC-A check digit validation)
  6. *Claims & Certifications* (Vegan mark, Organic seal, No Added Sugar)
  7. *Company & Address* (Legal manufacturer name, street address, postal code)
  8. *Packaging Structure* (Dieline dimensions, panel labels)
- **Four-Column Verification Layout:**
  - **Field:** Canonical specification field.
  - **Value:** Extracted value and unit.
  - **State Badge:** Explicit state chips (`Confirmed`, `AI-Suggested`, `Missing`, `Pass`) with text and icon—never color alone.
  - **Sources:** Clickable source chips indicating the file origin (e.g., `Carton · Back`, `Sheet · B26`).
- **Filter Bar:** One-click filter chips with live counts: `All`, `Conflicts (3)`, `AI-Suggested (2)`, `Missing (1)`, `Passed (1)`.
- **Collapsible Conflicts Side Column (Micro-UX):**
  - A split view with the Fact Sheet on the left and a dedicated conflict stack on the right.
  - A "Collapse" button allows folding the conflict column into a compact vertical strip showing the remaining open conflict count.
- **Interactive Conflict Cards:**
  - Displays the conflicting values side by side (e.g., Left: `Honey (9%)` vs. Right: `Honey (1%)`).
  - Lists the exact quote from each document with clickable source chips.
  - **One-Click Resolution Buttons:** Brand managers can resolve conflicts immediately by clicking `Use Content Sheet`, `Use Carton`, or typing a `Custom Value`.
  - Once resolved, the card smoothly collapses into a green confirmation state: `Resolved by Abhijith · use sheet value`.
- **Full-Width Ingredient List Diff Modal (Micro-UX):**
  - When comparing complex ingredient lists between files, an "Expand Diff" button opens a dedicated dialog.
  - Shows color-coded pill tags for **Added Ingredients** (e.g., walnuts, flax seeds on carton not in sheet) and **Duplicate Ingredients** (e.g., sunflower seeds listed twice).
  - Accessible dialog dismissible via `Esc` key or close button with focus restoration.
- **Synchronized Source Drawer (Micro-UX):**
  - Clicking any source chip opens a slide-over drawer from the right.
  - **PDF Crop Mode:** Renders a high-resolution, cropped visual bounding box of the exact panel and text quote directly from the vector PDF proof via PDF.js.
  - **Sheet Grid Mode:** Renders a clean spreadsheet grid highlighting the exact row, column, and cell coordinates (e.g., Cell `B26`).
  - Includes a "Copy Quote" button for swift review.

---

### 3.5. Step 3: Questions Engine
*Purpose: Convert data gaps and regulatory conflicts into clear, ranked business decisions with automated ripple effects.*

- **Ranked Question Stack:** Questions are not ordered randomly; they are mathematically ranked by **how many packaging requirements they unlock** (highest impact first).
- **Plain-English Explanations:** Every question card explains *why* the question exists and the regulatory or formulation rule behind it (e.g., *"Honey is an ingredient. Under FDA rules, honey counts as an added sugar, so the 'No Added Sugar' claim cannot remain."*).
- **One-Tap Suggested Answer Buttons:** Presents actionable decision options as clean buttons (e.g., `Keep honey, remove vegan claim`, `Remove honey, keep vegan claim`).
- **Keyboard Shortcuts (1–4):** Power users can press number keys `1`, `2`, `3`, or `4` on their keyboard to instantly select suggested answers.
- **"Ask Someone" Message Generator (Micro-UX):**
  - If the brand manager does not know the answer (e.g., needs R&D or Legal input), clicking "Ask someone" generates a pre-formatted, polite message summarizing the conflict, the source quotes, and the choices.
  - Includes a one-click "Copy message" button ready to paste into Slack, Teams, or email.
- **Skip & Undo Controls:** Questions can be skipped or answered; an "Undo" button allows immediate reversal.
- **Cascading Updates:** Answering a question immediately ripples through the system: resolving one question automatically clears related conflicts, updates fact states, and recalculates downstream requirements.

---

### 3.6. Step 4: Pack Canvas & 3D Interactive Pack View
*Purpose: Verify physical feasibility, inspect compliance findings in 3D, and validate carton fold geometry.*

- **Interactive 3D Carton Model:**
  - Real tuck-end carton model constructed using Three.js / React Three Fiber.
  - Textures each panel face with the actual artwork rendered from the dieline PDF proof.
- **Animated 0° to 90° Fold Control:**
  - A smooth "Fold box" / "Unfold" toggle button and an interactive 0% to 100% range slider.
  - Visualizes the carton transitioning from a completely flat dieline sheet to a folded, closed 3D box.
- **Double-Lid Closure & Caliper Thickness Offset (Micro-UX):**
  - In real cereal cartons, two full-depth flaps exist at the top (`Top flap Back` and `Top flap Front` with the curved tuck flap).
  - The 3D engine automatically identifies the inner closure flap and applies an internal caliper offset (`INNER_INSET = 0.8 mm`), preventing coplanar Z-fighting or overlapping glitches.
- **De-Cluttered 3D Pin Markers (Micro-UX):**
  - Compliance findings are placed at their exact spatial coordinates on the carton faces.
  - **Compact by Default:** Findings render as sleek $20\text{ px}$ circular pin badges showing severity icons (`Problem`, `Check`, `Pass`), preventing dense clusters (such as 10 nutrition facts on the side panel) from overlapping into an unreadable deck.
  - **Expand on Hover & Selection:** Hovering over any pin expands it into an elevated, full-text label badge (`Problem: Calories: printed 166, but...`).
  - **Camera Fly-To:** Clicking a pin or selecting an item from the right-hand findings list smoothly animates the 3D camera to frame that exact carton face directly.
- **X-Ray Compliance Mode:**
  - A toolbar toggle that makes the carton semi-transparent.
  - Outlines **Regulated Zones** (Nutrition Facts box, ingredient panel, barcode area).
  - Renders **Dashed Ghost Boxes** for legally required items that are missing from the packaging (e.g., missing manufacturer street address or missing net quantity in ounces).
- **High-Resolution 3D Snapshot Export (Micro-UX):**
  - A "Take 3D snapshot" button renders an instantaneous high-res PNG image from the current 3D camera angle.
  - Displays a snapshot banner with a one-click "Download PNG" link, ready for embedding in agency briefs or presentation decks.

---

### 3.7. Step 5: Brief Editor & Automated Audit Engine
*Purpose: Generate the final deliverable—an audited agency design brief and acceptance checklist that guarantees compliance.*

- **Eight Standard Agency Brief Sections:**
  1. *Objective & Scope* (Brand goals, redesign scope, target market).
  2. *Product Facts* (Canonical product name, net weights, servings).
  3. *Mandatory Content by Panel* (Exact legal copy required on Front, Back, Left, Right, and Flaps).
  4. *Keep / Change / Add / Remove* (Clear instructions on what brand art to retain, update, introduce, or discard).
  5. *Allowed Claims & Removals* (Permitted claims with substantiations, plus rejected claims with explicit regulatory reasons).
  6. *Nutrition Panel Instructions* (Daily values, calories, format requirements).
  7. *Open Questions for the Agency* (Unsettled design decisions).
  8. *Acceptance Checklist* (Itemized acceptance criteria for final art sign-off).
- **Sentence-Level Provenance Dots (Micro-UX):**
  - Every sentence ends with small clickable provenance dots indicating who authored it (`AI`, `Code`, or `User`) and which underlying fact IDs it cites.
  - Clicking any dot opens the Source Drawer showing the verified document origin.
- **The Automated Sentence Audit (Zero Hallucination Guarantee):**
  - Brand managers can edit any sentence directly in the browser.
  - As text is typed, the sentence is instantly audited against the verified project facts.
  - **Unproven Text Underline:** If an editor types a number, percentage, or claim that cannot be proven by a verified fact ID (e.g., typing *"Contains 12% honey"* when only 9% is proven), the sentence immediately receives a **violet dotted underline** with an explanatory warning tooltip (*"Not in facts — add a source or mark as assumption"*).
  - **Approve Gate Lock:** The primary "Approve Brief" button is disabled as long as any unproven sentence exists in the document, preventing accidental release of unsubstantiated briefs.
- **Formal Sign-Off Workflow:**
  - Clicking "Approve Brief" prompts for the reviewer's name.
  - Permanently stamps the brief with a green audit badge: `Approved by Abhijith · 2026-10-16 14:10`.
  - Re-editing any sentence automatically clears approval and increments the version number (`v1.1`), maintaining a complete change audit log.
- **Dual Export Formats:**
  - **Print / PDF Export:** Dedicated print stylesheet that strips all UI chrome, sidebars, and buttons, generating a clean, branded multi-page agency brief.
  - **JSON Checklist Export:** Downloads a machine-readable acceptance checklist containing every mandatory element, panel location, and minimum type height, designed for automated ingestion by packaging preflight tools.

---

### 3.8. Reviewer Lens: Red-Pen Markup (`/markup`)
*Purpose: Provide visual packaging teams with an immediate, graphic mark-up of errors drawn directly over the dieline.*

- **Hand-Drawn Red-Pen Annotations:**
  - Overlays the flat carton dieline with self-drawing, organic red strokes: circles around incorrect text, strike-through lines, and arrows pointing to corrections.
  - Includes a "Clean / Marked" toggle to flip between raw artwork and marked corrections.
- **Departmental Sticky Notes:**
  - Color-coded virtual sticky notes pinned to findings, organized by department owner:
    - **Legal / Regulatory:** Red notes for statutory violations.
    - **R&D / Food Science:** Blue notes for recipe and ingredient mismatches.
    - **Brand / Marketing:** Purple notes for brand voice, claims, and logos.
- **Interactive Keyboard Navigation (J / K Keys):**
  - Reviewers can press `J` and `K` on their keyboard to step through findings sequentially across the dieline.
- **A3 Wall Poster Export:**
  - Generates a high-impact, single-page A3 poster layout showing the dieline, red-pen markups, and side-by-side sticky note summary for print shop floor review.

---

### 3.9. Copilot Assistant: "Ask About This"
*Purpose: Natural language packaging copilot that answers brand questions with strict citation grounding.*

- **Context-Aware Side Drawer:** Opens from the top bar on any screen.
- **Fact-Grounded Responses:** Answers questions like *"Why is the vegan mark flagged?"* or *"What is our net quantity in ounces?"* by searching active project facts and market regulations.
- **Strict Anti-Hallucination Guard:** If a query cannot be answered by ingested facts, the assistant explicitly states that no source confirms it, rather than guessing.
- **"Confirm as Fact" Action:** If an answer provides new clarity, the reviewer can click "Confirm as Fact" to promote the answer directly into the project Fact Sheet as a user-verified fact.

---

## 4. Planned Features Roadmap (Next Build Phases)

### 4.1. India Market Pack (`markets/in/`) & Dynamic Country Switch
- **Pluggable Regulatory Jurisdictions:** Introducing the complete Food Safety and Standards Authority of India (FSSAI) and Legal Metrology rulebook.
- **Automatic Requirement Shifting:** Switching from US to India dynamically:
  - Replaces FDA Nutrition Facts with the Indian per-100g / per-serve format.
  - Requires the statutory Green/Brown **Vegetarian / Non-Vegetarian Logo**.
  - Adds mandatory Maximum Retail Price (**MRP incl. of all taxes**), Date of Manufacture, and Expiry.
  - Enforces the **FSSAI 14-digit License Number** and Consumer Care cell declarations.
  - Removes US-specific imperial units (ounces) in favor of mandatory metric declarations.

### 4.2. Regulatory Time Machine
- **Sliding Enforcement Dates:** An interactive timeline slider in the top bar allowing brand teams to scrub through future dates (e.g., June 2026 vs. July 2027).
- **Proactive Amendment Warnings:** Highlights rules that are currently proposals or upcoming statutory mandates (e.g., FSSAI's upcoming front-of-pack warning label regulations), warning brand managers if a pack designed today will become illegal by its launch date.

### 4.3. Claims Radar & Screening
- **Multi-Level Claim Risk Assessment:** Scans packaging for marketing claims (*"100% Natural"*, *"No Added Sugar"*, *"Heart Healthy"*, *"GMO Free"*).
- **Traffic Light Legal Risk:**
  - **Green (Substantiated):** Formula and laboratory data substantiate the claim under target market rules.
  - **Amber (Conditional / Advisory):** Permitted only with mandatory qualifying statements or disclaimers.
  - **Red (Prohibited / Misleading):** Explicitly prohibited (e.g., FDA prohibiting "No Added Sugar" when honey or concentrated fruit juice is present).

### 4.4. Trust Console & Mutation Benchmark
- **Automated Self-Test Scoreboard:** A built-in benchmark runner that executes synthetic mutations on packaging files (e.g., deleting an allergen, corrupting a barcode digit, altering net weight).
- **Quantified Reliability Metrics:** Reports real-time **Precision**, **Recall**, and **Citation Accuracy** scores on screen (*"BriefForge caught 31 of 31 planted packaging errors"*), proving platform reliability to executive stakeholders.

### 4.5. Campus Round Extras: Mobile "Scan to Brief" & WebAR
- **Mobile Camera Capture:** Using a phone browser to snap live photos of a folded physical carton.
- **Automatic Panel Flattening & Multi-Reader OCR:** Straightens perspective distortion, reads each panel via computer vision, and reconciles the physical box against the digital spec.
- **WebAR Visualizer:** Scanning a QR code on a real carton to overlay interactive AR red-pen pins directly onto the physical box in the user's hand.

---

## 5. User Experience & Micro-Interaction Catalog

| Feature | UX Implementation & Polish | Benefit to User |
| :--- | :--- | :--- |
| **3D Pin Stacking** | Compact $20\text{ px}$ circular badges that expand to full labels only on hover or selection. | Eliminates visual clutter; prevents overlapping card decks on dense panels. |
| **Double-Lid 3D Offset** | Automatic inner closure detection applying a $0.8\text{ mm}$ caliper offset (`INNER_INSET`). | Prevents coplanar Z-fighting and overlapping flickers between opposing top flaps. |
| **Sentence-Level Audit** | Instant violet dotted underline on unproven numbers, claims, or text. | Guaranteed zero hallucination; impossible to release an unsubstantiated brief. |
| **Keyboard Accessibility** | Number keys `1–4` on Questions; `J/K` on Red-Pen Markup; `Esc` on Drawers. | Rapid triage for power users without requiring mouse clicks. |
| **Source Provenance Drawer** | Visual bounding-box crop on PDF vectors + exact cell outline on Excel sheets. | Eliminates doubt; lets legal and regulatory reviewers verify citations in under 2 seconds. |
| **"Ask Someone" Generator** | One-click copyable Slack/Teams message summarizing conflict details and choices. | Reduces cross-team friction; speeds up resolution from R&D and legal colleagues. |
| **Ingredient Diff Modal** | Categorized colored pills showing Added, Missing, and Duplicate ingredients. | Instantly spots recipe drift without requiring manual word-by-word reading. |
| **Brief Approval Stamping** | Permanent reviewer name + ISO timestamp badge; clears upon re-edit. | Provides ironclad governance and change audit tracking. |
| **Print Optimization** | Custom print stylesheet stripping sidebars, nav rails, and buttons. | Produces clean, professional multi-page agency deliverables via standard browser print. |

---

*BriefForge — Built for Esko AIForge 2026.*

