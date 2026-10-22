// Builds docs/deck/BriefForge.pdf: the same slides as BriefForge.pptx, as a PDF handout / backup.
// Run: node docs/deck/build_pdf.mjs   (needs Playwright's chromium, as for the diagrams)
import { chromium } from "/home/abhijith/coding/esko/node_modules/playwright/index.mjs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const url = (p) => pathToFileURL(path.join(here, p)).href;
const HLD = url("../diagrams/hld.png"), LLD = url("../diagrams/lld.png"), CARTON = url("assets/carton.png");
const F = (f) => url("../diagrams/fonts/" + f);

const bars = [["Undeclared allergen (label error)", 115, true], ["Foodborne illness", 94], ["Chemical contamination", 26], ["Foreign objects", 9], ["Other", 7]];
const chip = (k, sub) => {
  const v = { fail: ["✕", "Fail"], review: ["?", "Needs review"], pass: ["✓", "Pass"] }[k];
  return `<div class="chip ${k}"><b>${v[0]}&nbsp; ${v[1]}</b>${sub ? `<span>${sub}</span>` : ""}</div>`;
};
const count = (cls, n, label) => `<div class="count ${cls}"><b>${n}</b><span>${label}</span></div>`;

const slides = [
  // 1 title
  `<section class="s light"><div class="kicker" style="left:.6in;top:.9in">BRIEFFORGE · ESKO AIFORGE HACKATHON · PROBLEM 2</div>
   <h1 class="serif" style="left:.6in;top:1.4in;font-size:84pt">BriefForge</h1>
   <div class="serif" style="left:.6in;top:3.0in;width:6.4in;font-size:32pt;line-height:1.15">Is this packaging artwork ready to print?</div>
   <p style="left:.6in;top:4.5in;width:5.9in;font-size:18pt;color:var(--muted)">It checks finished artwork against the approved product information and a rulebook, and shows the evidence for every answer.</p>
   <p style="left:.6in;top:6.5in;font-size:16pt;color:var(--muted)">Abhijith Sogal · 28 October 2026</p>
   <img src="${CARTON}" style="left:7.25in;top:1.3in;width:5.5in">
  </section>`,
  // 2 problem
  `<section class="s light"><h2>Almost half of food recalls are label errors</h2>
   <div class="card" style="left:.6in;top:1.65in;width:4.7in;height:1.95in"></div>
   <div class="serif teal" style="left:.9in;top:1.8in;font-size:50pt">45.8%</div>
   <p style="left:2.8in;top:1.85in;width:2.4in;font-size:15pt">of 2025 FDA food recalls: an allergen the label failed to declare (115 of 251)</p>
   <p class="src" style="left:.9in;top:3.0in;width:4.2in">Source: Esko, FDA food and beverage recalls 2025</p>
   <div class="card" style="left:.6in;top:3.8in;width:4.7in;height:1.95in"></div>
   <div class="serif teal" style="left:.9in;top:3.95in;font-size:50pt">45%</div>
   <p style="left:2.8in;top:4.0in;width:2.4in;font-size:15pt">of 2024 food recalls were label errors: 192 events, about $1.92 billion</p>
   <p class="src" style="left:.9in;top:5.15in;width:4.2in">Source: Loftware analysis of FDA Enforcement Report data</p>
   <div class="card" style="left:5.65in;top:1.65in;width:7.08in;height:4.1in"></div>
   <p style="left:5.95in;top:1.85in;font-size:14pt;font-weight:600">2025 FDA recalls by cause (251 events)</p>
   <div style="left:5.95in;top:2.4in;width:6.5in">${bars.map(([l, v, hi]) => `<div class="bar"><span class="bl">${l}</span><i style="width:${v * 2.1}px;background:var(${hi ? "--teal" : "--grey"})"></i><b>${v}</b></div>`).join("")}</div>
   <p class="serif" style="left:.6in;top:6.1in;font-size:26pt"><b>The cause:</b> <i>the spec changes and the label doesn't.</i></p>
   <p class="fn" style="left:.6in;top:6.8in;width:12.1in">Sources: Esko, “FDA food and beverage recalls 2025” (esko.com blog); Loftware analysis of FDA Enforcement Report data, 2024 (as posted on LinkedIn). Full links on the Sources page.</p>
  </section>`,
  // 2b non-negotiables
  `<section class="s light"><h2>Our six non-negotiables</h2><div style="left:.6in;top:1.5in;width:12.13in;display:grid;grid-template-columns:repeat(3,1fr);gap:.25in .28in"><div class="rcard"><i>1</i><h4 class="serif">Every fact has a source</h4><p>A quote checked by code. Unchecked means AI-suggested, never confirmed.</p></div><div class="rcard"><i>2</i><h4 class="serif">No finding without evidence</h4><p>A Fail cites a rule and code-checked evidence. AI judgement is only ever Needs review.</p></div><div class="rcard"><i>3</i><h4 class="serif">Rules are data</h4><p>Never hard-coded. Nothing market-specific in the engine code.</p></div><div class="rcard"><i>4</i><h4 class="serif">Nothing resolved silently</h4><p>Conflicts are never settled by the tool. A person decides, and it is logged.</p></div><div class="rcard"><i>5</i><h4 class="serif">Code proves, AI reads</h4><p>Code does maths, units, rules and geometry. AI reads, interprets and words. Its output is schema-validated.</p></div><div class="rcard"><i>6</i><h4 class="serif">No chat-first screens</h4><p>Chat only as “Ask about this finding”, using only that finding’s own rule and evidence.</p></div></div><p class="serif" style="left:.6in;top:6.8in;font-size:20pt"><i>Everything that follows is built around these.</i></p></section>`,
  // 3 solution
  `<section class="s light"><h2>Three things in, one answer out</h2>
   ${[["Finished artwork", "dieline PDF"], ["Approved product information", "Excel content sheet"], ["Rulebook", "law and company rules"]].map(([a, b], i) => `<div class="card" style="left:.6in;top:${1.75 + i * 1.5}in;width:3.7in;height:1.25in"></div><p style="left:.9in;top:${1.75 + i * 1.5 + .22}in;width:3.2in"><b style="font-size:19pt">${a}</b><br><span style="font-size:15pt;color:var(--muted)">${b}</span></p>`).join("")}
   <div class="arrow" style="left:4.45in;top:3.55in">➜</div>
   <div class="forge" style="left:5.2in;top:1.75in;width:3.1in;height:4.25in"><b class="serif">BriefForge</b><span>Compares the artwork with the approved information and applies the rulebook</span></div>
   <div class="arrow" style="left:8.45in;top:3.55in">➜</div>
   <div style="left:9.2in;top:1.75in;width:3.53in">${chip("fail", "A rule is broken, proven by code")}${chip("review", "A person must decide")}${chip("pass", "Correct, and where it was found")}</div>
   <p class="serif" style="left:.6in;top:6.3in;font-size:26pt"><i>Every result shows its evidence.</i></p>
  </section>`,
  // 4 demo
  `<section class="s dark"><h2>Live demo</h2>
   ${["Files", "Checks", "Rules", "Report"].map((t, i) => `<div class="dot" style="left:.6in;top:${2.0 + i}in">${i + 1}</div><p class="serif" style="left:1.5in;top:${2.0 + i}in;font-size:32pt;line-height:.6in">${t}</p>`).join("")}
   <p style="left:.6in;top:6.3in;font-size:16pt;color:var(--grey)">Dancing Fish Granola Berry Crunch · US carton</p>
   <div class="card white" style="left:7.1in;top:1.6in;width:5.6in;height:4.6in"></div>
   <img src="${CARTON}" style="left:7.3in;top:1.9in;width:5.2in">
  </section>`,
  // 5 HLD
  `<section class="s full"><img src="${HLD}" class="fb"></section>`,
  // 6 scale and limits
  `<section class="s light"><h2>Built to scale, and honest about limits</h2>
   <div class="card" style="left:.6in;top:1.65in;width:5.6in;height:4.1in"></div>
   <p class="serif" style="left:.95in;top:1.85in;width:4.9in;font-size:21pt;font-weight:700">A new country is a folder of rules, not new code</p>
   <pre style="left:.95in;top:2.85in">markets/
  us/        FDA rules
  in/        FSSAI rules (as data)
  company/   company rules</pre>
   <p style="left:.95in;top:4.6in;width:4.9in;font-size:15pt;color:var(--muted)">A test fails if market logic leaks into the engine. An AI-invented rule is rejected.</p>
   <div class="card" style="left:6.55in;top:1.65in;width:6.18in;height:4.1in"></div>
   <p class="serif" style="left:6.9in;top:1.85in;font-size:21pt;font-weight:700">Limits</p>
   <ul style="left:6.9in;top:2.5in;width:5.5in"><li>Text inside images is lower trust, so it goes to Needs review</li><li>Evidence outside the artwork (certificates) stays Needs review</li><li>Tested on one product; the India switch is not in the app yet</li></ul>
   <p style="left:.6in;top:6.0in;font-size:18pt"><b class="teal">520+</b> backend tests · <b class="teal">400+</b> frontend tests · end-to-end checks · none call the network</p>
   <p class="fn" style="left:.6in;top:6.7in;width:12.1in">Sources: test counts from this project’s own test run on 27 October 2026. Every market rule cites its regulation, clause, URL and exact quote in markets/ (US: 21 CFR; India: FSSAI and Legal Metrology). See the Sources page.</p>
  </section>`,
  // 7 close
  `<section class="s dark"><div class="serif" style="left:.6in;top:1.3in;font-size:50pt;line-height:1.1;width:7in">The AI reads.<br>The code proves.<br>A person decides.</div>
   <p style="left:.6in;top:4.8in;width:6.6in;font-size:18pt;color:var(--grey)"><b>Every finding shows its evidence</b><br>Next: India switch in the app · self-test on changed copies · a database</p>
   <p class="serif" style="left:.6in;top:6.4in;font-size:26pt">Thank you · Questions</p>
   <div class="card white" style="left:7.6in;top:1.3in;width:5.1in;height:4.6in"></div>
   <img src="${CARTON}" style="left:7.8in;top:1.6in;width:4.7in">
  </section>`,
  // 8 appendix: what the demo finds
  `<section class="s light"><h2>What the demo finds</h2>
   <div style="left:.6in;top:1.6in;width:12.13in;display:flex;gap:.25in">${count("fail", 29, "✕ Fail")}${count("review", 11, "? Needs review")}${count("pass", 7, "✓ Pass")}${count("cleared", 2, "✓ Checked and fine")}</div>
   <div style="left:.6in;top:3.2in;width:12.13in;display:flex;gap:.28in">
    <div class="fcard"><b class="vf">✕ Fail</b><h3 class="serif">Honey: 9% approved, 1% printed</h3><small>Approved sheet, cell B26</small><big>Honey (9%)</big><small>Carton, back panel</small><big class="red">Honey (1%)</big><em>Both quotes found in the files by code</em></div>
    <div class="fcard"><b class="vf">✕ Fail</b><h3 class="serif">Total Fat % Daily Value is wrong</h3><code>15 g ÷ 78 g = 19.2%</code><big class="red" style="font-size:18pt">Printed on the carton: 2.2%</big><em>Calculated by code, not by the AI</em></div>
    <div class="fcard"><b class="vf">✕ Fail</b><h3 class="serif">Hidden and too small</h3><p style="position:static;font-size:16pt;margin:8px 0">An old EU nutrition table sits under the US panel</p><p style="position:static;font-size:16pt;margin:8px 0">Storage text is 5.8 pt; the company minimum is 6 pt</p><em>Hidden text is never read as a fact</em></div>
   </div>
   <p class="fn" style="left:.6in;top:6.8in;width:12.1in">Sources: counts from the saved demo run on Esko’s sample carton and content sheet, checked against our own 21-rule demo rulebook. % Daily Value reference of 78 g total fat: 21 CFR 101.9(c)(9). The 6 pt minimum is company rule DF-18 (our demo rulebook). See the Sources page.</p></section>`,
  // appendix: every case
  `<section class="s light"><h2>Every case the checker produces</h2><div style="left:.6in;top:1.5in;width:12.13in;display:flex;gap:.25in"><div class="count fail ccol"><b class="serif" style="font-size:20pt;font-weight:400">✕&nbsp; Fail  ·  29</b><div class="ci"><span>Two files disagree</span><i>4</i></div><div class="ci"><span>Maths is wrong</span><i>14</i></div><div class="ci"><span>Required item missing</span><i>4</i></div><div class="ci"><span>Wrong format for the market</span><i>2</i></div><div class="ci"><span>Claim the ingredients contradict</span><i>2</i></div><div class="ci"><span>Company-rule breach</span><i>3</i></div></div><div class="count review ccol"><b class="serif" style="font-size:20pt;font-weight:400">?&nbsp; Needs review  ·  11</b><div class="ci"><span>AI-suggested fact to confirm</span><i>3</i></div><div class="ci"><span>Code found it, no rule covers it</span><i>3</i></div><div class="ci"><span>Proof is outside the artwork</span><i>5</i></div></div><div class="count pass ccol"><b class="serif" style="font-size:20pt;font-weight:400">✓&nbsp; Pass  ·  7</b><div class="ci"><span>Required item present, with where it was found</span><i>6</i></div><div class="ci"><span>Largest text on the front panel</span><i>1</i></div></div><div class="count cleared ccol"><b class="serif" style="font-size:20pt;font-weight:400">✓&nbsp; Not a problem</b><div class="ci"><span>Checked and fine, with proof</span><i>2</i></div><div class="ci"><span>Proposed rule: never applied</span><i>1</i></div><div class="ci"><span>Invented rule: unverified, never a Fail</span><i>—</i></div></div></div>
   <p class="fn" style="left:.6in;top:6.7in;width:12.1in">Counts are from the saved demo run. Each case, with its finding id, is in docs/DEMO_CASES.md.</p></section>`,
  // appendix: AI scans
  `<section class="s light"><h2>Every AI scan, and what checks it</h2><table class="aitab" style="left:.6in;top:1.4in;width:12.13in"><tr><th style="background:var(--blue)">AI scan</th><th style="background:var(--blue)">What it reads</th><th style="background:var(--blue)">What code does with the answer</th></tr><tr><td style="width:24%"><b>Sheet → facts</b></td><td style="width:27%">Excel cells (value and note)</td><td>Quote must be in the cell or its note; “assumed” notes stay AI-suggested</td></tr><tr><td style="width:24%"><b>Carton → facts</b></td><td style="width:27%">PDF text plus a picture of each panel</td><td>Quote check; facts seen only in a picture stay AI-suggested</td></tr><tr><td style="width:24%"><b>Documents and images → facts</b></td><td style="width:27%">Word, notes, plain PDFs, photos</td><td>Quote check; image-only facts are AI-suggested</td></tr><tr><td style="width:24%"><b>Meaning conflicts</b></td><td style="width:27%">All the facts, by id</td><td>Must cite real fact ids; result is Needs review, never Fail</td></tr><tr><td style="width:24%"><b>Rulebook → rules</b></td><td style="width:27%">The rulebook’s paragraphs</td><td>Every rule’s quote checked against the document; an invented rule is never a Fail</td></tr><tr><td style="width:24%"><b>Ask about this finding</b></td><td style="width:27%">One finding’s rule and evidence</td><td>Shown only if it cites that finding’s evidence and every number appears in it</td></tr><tr><td style="width:24%"><b>Question wording</b></td><td style="width:27%">A question the code built</td><td>Falls back to the code’s own wording if invalid</td></tr></table><p class="fn" style="left:.6in;top:6.6in;width:12.1in;font-size:13pt;font-style:italic">Every call: a versioned prompt, output validated against a schema, cached by file + prompt version + model, replayed from recordings in tests (no network).</p></section>`,
  // appendix: code checks
  `<section class="s light"><h2>Everything code checks</h2><div style="left:.6in;top:1.45in;width:12.13in;display:grid;grid-template-columns:repeat(3,1fr);gap:.25in .28in"><div class="ccard"><h4 class="serif teal">Reading the files</h4><ul><li>Text with panel and position in mm</li><li>Guide text set aside</li><li>Hidden text flagged</li><li>Letter-spaced and curved text</li></ul></div><div class="ccard"><h4 class="serif teal">Facts and the quote check</h4><ul><li>Quote must really be in the file</li><li>Digits are never fuzzy</li><li>Confirmed, AI-suggested, missing</li><li>Ingredient percentages split out</li></ul></div><div class="ccard"><h4 class="serif teal">Comparing the two files</h4><ul><li>Different values (units first)</li><li>Ingredient lists, item by item</li><li>A name repeated in one list</li><li>480 g = 16.93 oz: no conflict</li></ul></div><div class="ccard"><h4 class="serif teal">The maths</h4><ul><li>% Daily Value from the amounts</li><li>Calories from fat, carbs, protein</li><li>Serving size against pack weight</li><li>Sugars above carbs; UPC check digit</li></ul></div><div class="ccard"><h4 class="serif teal">The rules</h4><ul><li>Market rules kept as data</li><li>Required item, right panel</li><li>Banned words, text size, hidden text</li><li>Claims against ingredients</li></ul></div><div class="ccard"><h4 class="serif teal">The verdict</h4><ul><li>Fail: rule + code check + quotes</li><li>A final guard re-checks every Fail</li><li>No evidence, no finding</li><li>Cleared list, with the proof</li></ul></div></div></section>`,
  // appendix: edges and folds
  `<section class="s light"><h2>How the carton’s edges and folds are found</h2><div style="left:.6in;top:1.5in;width:6.8in"><div class="stp"><div class="dot" style="position:static">1</div><div><b class="serif" style="font-size:19pt;font-weight:400">Read the lines</b><br><span style="font-size:15pt">Every vector line and curve, with the layer it is drawn on</span></div></div><div class="stp"><div class="dot" style="position:static">2</div><div><b class="serif" style="font-size:19pt;font-weight:400">Find the panels</b><br><span style="font-size:15pt">Lines on the “Artwork panel” layer are chained into closed outlines, named from the printed labels (“Back panel”)</span></div></div><div class="stp"><div class="dot" style="position:static">3</div><div><b class="serif" style="font-size:19pt;font-weight:400">Grow to the true face</b><br><span style="font-size:15pt">Each side moves out to the nearest crease or cut line, giving the real panel size in mm</span></div></div><div class="stp"><div class="dot" style="position:static">4</div><div><b class="serif" style="font-size:19pt;font-weight:400">Find the folds</b><br><span style="font-size:15pt">Each crease is walked in 1 mm steps; two different panels on either side make one fold</span></div></div></div>
   <div class="card" style="left:7.7in;top:1.5in;width:5.03in;height:4.7in"></div><p class="serif amber" style="left:8.0in;top:1.7in;font-size:19pt">Limits</p><ul class="lim" style="left:8.0in;top:2.3in;width:4.45in"><li>Relies on named layers (artwork panel, crease, cut, glue), as in Esko’s DeskPack. Tested on one carton</li><li>A PDF with no layers or outlined artwork falls back to splitting the page around the printed panel labels; flaps and folds are lost</li><li>It finds where folds are, not their direction</li><li>The fold lines feed the 3D view and the fit checks; the verdicts need only the panels</li></ul>
   <p class="serif" style="left:.6in;top:6.5in;font-size:16pt;color:var(--muted)"><i>Read from the dieline’s own vector lines by layer. No AI is involved.</i></p></section>`,
  // 9 LLD
  `<section class="s full"><img src="${LLD}" class="fb"></section>`,
  // 10 who does what
  `<section class="s light"><h2>Who does what</h2>
   <table style="left:.6in;top:1.55in;width:12.13in"><tr><th style="background:var(--blue)">AI reads</th><th style="background:var(--teal)">Code proves</th><th style="background:var(--amber)">A person decides</th></tr>
   <tr><td>Turns the sheet, the carton text and images into facts, each with a quote</td><td>Checks every quote is really in the file (digits never fuzzy)</td><td>Every Needs review item, with a name, logged</td></tr>
   <tr><td>Flags contradictions in meaning (Vegan vs honey). Always Needs review</td><td>Maths: % Daily Values, calories, serving size, UPC check digit</td><td>Whether an AI-suggested fact is true</td></tr>
   <tr><td>Reads the rulebook into rules, each with a quote</td><td>Applies the rules; decides Fail / Needs review / Pass; writes the report</td><td>The market rules (approved: false until confirmed) and the sign-off</td></tr>
   <tr><td>Answers a question about one finding, from that finding's evidence only</td><td>Reads the files: panel and position in mm, guide and hidden text</td><td>Nothing decides design quality, or text only inside images and certificates</td></tr></table></section>`,
  // 11 RAG
  `<section class="s light"><h2>Why not RAG for the rulebook?</h2>
   <div style="left:.6in;top:1.6in;width:7.4in">${[["It is small.", "21 rules fit in one AI call, so there is nothing to retrieve."], ["We need rules, not answers.", "The rulebook is read into structured rules once; code applies them the same way every run."], ["RAG puts the AI in the verdict path.", "We only allow AI judgement to produce Needs review."], ["Quote-checking is stronger.", "Every rule is checked against the whole document, not a retrieved chunk."]].map(([a, b]) => `<p class="pt"><b class="teal">${a}</b> ${b}</p>`).join("")}</div>
   <div class="card" style="left:8.4in;top:1.6in;width:4.33in;height:3.9in"></div>
   <p style="left:8.7in;top:1.8in;width:3.75in;font-size:16pt"><b class="serif amber" style="font-size:19pt">Honest limit</b><br>A very long rulebook is read in one call and could exceed the model's context. There is no chunking yet.<br><br><b class="serif teal" style="font-size:19pt">Next step</b><br>Retrieval only to find candidate clauses. The quote check and the code triage stay as they are.</p>
  </section>`,
  // 12 sources
  `<section class="s light"><h2>Sources</h2><div style="left:.6in;top:1.4in;width:12.1in"><div class="srow"><b>1</b><div>Loftware analysis of FDA Enforcement Report data, 2024: 192 label-error recall events, 45% of food recalls, about $1.92 billion estimated cost, Listeria 15%. Read from the LinkedIn post, not the original report.<br><span>linkedin.com/posts/foodsafety-foodrecall-qualityassurance-share-7454565766894362624-ysoS</span></div></div><div class="srow"><b>2</b><div>Esko, “FDA food and beverage recalls 2025”: 251 recall events, 115 allergen mislabeling (45.8%), 94 foodborne illness; spec-versus-label cause. The blog says its figures are directional.<br><span>esko.com/en/blog/fda-food-and-beverage-recalls-2025</span></div></div><div class="srow"><b>3</b><div>21 CFR 101.9(c)(9), Daily Reference Values (total fat 78 g), used for the % Daily Value check.<br><span>ecfr.gov/current/title-21/section-101.9</span></div></div><div class="srow"><b>4</b><div>Esko’s sample files for the AIForge hackathon: Dancing Fish Granola Berry Crunch US carton (PDF) and content sheet (Excel).<br><span>samples/ in the project</span></div></div><div class="srow"><b>5</b><div>Dancing Fish US Label and Artwork Rulebook, rules DF-01 to DF-21: our own demo rulebook, written for this project (not a real company document).<br><span>rulebooks/ in the project</span></div></div><div class="srow"><b>6</b><div>Market rules (US FDA, India FSSAI and Legal Metrology): drafted from the regulations, each with clause, URL and exact quote. Most are marked approved: false until a regulatory person confirms them.<br><span>markets/ in the project</span></div></div><div class="srow"><b>7</b><div>Test counts: 523 backend, 402 frontend, 7 end-to-end, run on 27 October 2026.<br><span>backend/tests, frontend/src, e2e/ in the project</span></div></div></div></section>`,
  // part 2 divider
  `<section class="s dark"><p style="left:.6in;top:2.2in;font-size:16pt;font-weight:700;letter-spacing:.25em;color:var(--grey)">PART 2</p><h1 class="serif" style="left:.6in;top:2.6in;font-size:66pt">Under the hood</h1><p style="left:.6in;top:4.2in;font-size:24pt;color:var(--grey)">How it works, and why a Fail can be trusted</p></section>`,
  // rule types
  `<section class="s light"><h2>More than upload and compare</h2><p style="left:.6in;top:1.25in;font-size:18pt;color:var(--muted)">Seven kinds of rule, each checked by code</p>
   <div style="left:.6in;top:1.85in;width:12.13in;display:grid;grid-template-columns:repeat(4,1fr);gap:.25in"><div class="tcard"><h4 class="serif teal">Must be present</h4><p>A required item, on the right panel</p><em class="pass">✓&nbsp; Storage instructions on the Back panel: Pass</em></div><div class="tcard"><h4 class="serif teal">Must be absent</h4><p>Content that must not be there, such as text hidden under the artwork</p><em class="fail">✕&nbsp; 10 hidden lines on the Left panel: Fail</em></div><div class="tcard"><h4 class="serif teal">Must match</h4><p>Copy equals the approved information</p><em class="fail">✕&nbsp; Honey 9% on the sheet, 1% on the carton: Fail</em></div><div class="tcard"><h4 class="serif teal">Size limits</h4><p>Minimum font size, largest text, clear area</p><em class="fail">✕&nbsp; Storage text 5.8 pt, minimum 6 pt: Fail</em></div><div class="tcard"><h4 class="serif teal">Words and claims</h4><p>Banned or required words, and claims checked against the ingredients</p><em class="fail">✕&nbsp; “GMO free” printed twice; “Vegan” next to honey: Fail</em></div><div class="tcard"><h4 class="serif teal">Needs proof</h4><p>Evidence the artwork can’t show</p><em class="review">?&nbsp; Organic certificate not on file: Needs review</em></div><div class="tcard"><h4 class="serif teal">No automatic check</h4><p>Says so, and leaves it to a person</p><em class="review">?&nbsp; Date-code clear area: Needs review</em></div></div>
   <p style="left:.6in;top:6.7in;font-size:14pt;color:var(--muted)">A proposed rule is never applied. A rule whose quote isn’t in the rulebook is never a Fail.</p></section>`,
  // how we know it is sound
  `<section class="s light"><h2>How we know it’s sound</h2><div style="left:.6in;top:1.5in;width:12.13in;display:grid;grid-template-columns:repeat(4,1fr);gap:.25in"><div class="ccard" style="height:4in"><h4 class="serif teal" style="height:.8in">Tested without the network</h4><ul><li>523 backend tests, 402 frontend tests, 7 end-to-end</li><li>AI answers replayed from recordings, so every run is the same</li></ul></div><div class="ccard" style="height:4in"><h4 class="serif teal" style="height:.8in">Marked against answer keys</h4><ul><li>31 known issues in Esko’s files, written before the code (26 to catch, 5 that must not be flagged)</li><li>21 rulebook rules, each with its expected verdict</li></ul></div><div class="ccard" style="height:4in"><h4 class="serif teal" style="height:.8in">Guarded at every step</h4><ul><li>Quotes checked by code; digits never fuzzy</li><li>Every AI answer validated against a schema</li><li>A final guard re-checks every Fail</li></ul></div><div class="ccard" style="height:4in"><h4 class="serif teal" style="height:.8in">Proven by named tests</h4><ul><li>No market logic in the engine</li><li>An invented rule never fails</li><li>The 5 must-not-flag items never produce a Fail</li><li>A decision survives adding or removing a rulebook</li></ul></div></div>
   <p class="serif" style="left:.6in;top:5.85in;font-size:18pt;font-style:italic;font-family:Inter;width:12.1in">Honest gaps: tested on one product; the market rules are not yet approved by a regulatory person.</p></section>`,
];

const css = `
@font-face{font-family:"Instrument Serif";src:url(${F("instrument-serif-latin-400-normal.woff2")});font-style:normal}
@font-face{font-family:"Instrument Serif";src:url(${F("instrument-serif-latin-400-italic.woff2")});font-style:italic}
@font-face{font-family:"JBM";src:url(${F("jetbrains-mono-latin-500-normal.woff2")})}
:root{--ink:#16243a;--muted:#52607a;--bg:#faf7f2;--white:#fff;--teal:#0f766e;--grey:#a9b4c6;--red:#b42318;--amber:#b54708;--green:#05603a;--blue:#3b5bdb}
@page{size:13.333in 7.5in;margin:0}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Inter,Helvetica,Arial,sans-serif;color:var(--ink)}
.s{position:relative;width:13.333in;height:7.5in;overflow:hidden;page-break-after:always;background:var(--bg)}
.s.dark{background:var(--ink);color:var(--bg)} .s.full{background:var(--bg)}
.s>*{position:absolute}
.fb{left:0;top:0;width:13.333in;height:7.5in}
h2{left:.6in;top:.45in;font:400 40pt/1.1 "Instrument Serif",serif;width:12.1in}
h1{font:400 84pt/1 "Instrument Serif",serif}
.serif{font-family:"Instrument Serif",serif}
.kicker{font-size:13pt;font-weight:700;letter-spacing:.2em;color:var(--teal)}
.teal{color:var(--teal)} .amber{color:var(--amber)} .red{color:var(--red)}
p,li{line-height:1.3} .src{font-size:12pt;color:var(--muted)}
.card{background:var(--white);border:1px solid var(--grey);border-radius:.12in} .card.white{background:#fff;border:none}
img{display:block} .s>img:not(.fb){border-radius:.06in}
.arrow{font-size:34pt;color:var(--muted)}
.forge{background:var(--teal);color:#fff;border-radius:.15in;padding:.3in;display:flex;flex-direction:column;justify-content:center;gap:.15in}
.forge b{font-size:34pt;font-weight:400} .forge span{font-size:16pt;line-height:1.3}
.chip{border-radius:.12in;padding:.2in .25in;margin-bottom:.15in;border:1.5px solid;display:flex;flex-direction:column;gap:.05in;height:1.3in;justify-content:center}
.chip b{font-size:22pt} .chip span{font-size:15pt;color:var(--ink)}
.chip.fail{border-color:var(--red);background:#b4231816;color:var(--red)} .chip.review{border-color:var(--amber);background:#b5470816;color:var(--amber)} .chip.pass{border-color:var(--green);background:#05603a16;color:var(--green)}
.bar{display:flex;align-items:center;height:.62in;font-size:14pt} .bl{width:2.5in;flex:none} .bar i{display:block;height:.34in;border-radius:4px;margin-right:10px} .bar b{font-weight:700}
.dot{width:.6in;height:.6in;border-radius:50%;background:var(--teal);color:#fff;font-weight:700;font-size:20pt;display:flex;align-items:center;justify-content:center}
pre{font:500 17pt/1.5 JBM,monospace;color:var(--teal)}
ul{padding-left:.3in} li{font-size:18pt;margin-bottom:.18in}
.count{flex:1;border-radius:.12in;padding:.18in .25in;border:1.5px solid;display:flex;flex-direction:column;height:1.35in;justify-content:center}
.count b{font:400 40pt/1 "Instrument Serif",serif} .count span{font-size:16pt;font-weight:700}
.count.fail{border-color:var(--red);background:#b4231816;color:var(--red)} .count.review{border-color:var(--amber);background:#b5470816;color:var(--amber)} .count.pass{border-color:var(--green);background:#05603a16;color:var(--green)} .count.cleared{border-color:var(--grey);background:#fff;color:var(--teal)}
.fcard{position:static!important;flex:1;background:#fff;border:1px solid var(--grey);border-radius:.12in;padding:.28in;height:3.45in;display:flex;flex-direction:column}
.fcard .vf{color:var(--red);font-size:15pt} .fcard h3{font-weight:400;font-size:22pt;margin:.1in 0 .15in;line-height:1.1}
.fcard small{font-size:12pt;color:var(--muted)} .fcard big{font-size:22pt;font-weight:700;margin-bottom:.08in} .fcard code{font:500 19pt JBM,monospace;margin:.1in 0}
.fcard em{margin-top:auto;font-size:13pt;color:var(--green)}
table{border-collapse:collapse} th{color:#fff;font:400 20pt "Instrument Serif",serif;text-align:left;padding:.12in .18in} td{background:#fff;border:1px solid var(--grey);font-size:15pt;padding:.14in .18in;vertical-align:top;line-height:1.3;width:33%}
.fn{font-size:11pt;color:var(--muted);line-height:1.3}
.srow{display:flex;gap:.2in;margin-bottom:.14in;font-size:13pt;line-height:1.3}.srow>b{color:var(--teal);font-size:16pt;width:.3in;flex:none}.srow span{font-size:11pt;color:var(--teal)}
.rcard{position:relative!important;background:#fff;border:1px solid var(--grey);border-radius:.12in;padding:.28in .3in;height:2.4in}.rcard i{position:absolute;left:.3in;top:.28in;width:.5in;height:.5in;border-radius:50%;background:var(--teal);color:#fff;font:700 18pt/.5in Inter;text-align:center;font-style:normal}.rcard h4{margin:-.1in 0 0 .65in;font-weight:400;font-size:21pt;line-height:1.05;height:.7in;display:flex;align-items:center}.rcard p{position:static;margin-top:.2in;font-size:15pt}
.ccard{position:relative!important;background:#fff;border:1px solid var(--grey);border-radius:.12in;padding:.25in .3in;height:2.45in}.ccard h4{font-weight:400;font-size:20pt;margin-bottom:.1in}.ccard ul{position:static;padding-left:.25in}.ccard li{font-size:13pt;margin-bottom:.05in}.aitab td{font-size:14pt;padding:.1in .16in;line-height:1.25}.aitab th{padding:.1in .16in}
.lim li{font-size:14pt;margin-bottom:.14in}
.stp{display:flex;gap:.25in;align-items:flex-start;margin-bottom:.35in}.stp .dot{flex:none}
.ccol{position:static!important;flex:1;height:4.9in;display:block!important;padding:.2in .25in}.ci{display:flex;justify-content:space-between;gap:.15in;margin-top:.14in;font-size:13pt;line-height:1.25;color:var(--ink)}.ci i{font:400 18pt/1 "Instrument Serif",serif;font-style:normal}
.tcard{position:relative!important;background:#fff;border:1px solid var(--grey);border-radius:.12in;padding:.18in .25in;height:2.2in;display:flex;flex-direction:column}.tcard h4{font-weight:400;font-size:19pt;margin-bottom:.06in}.tcard p{position:static;font-size:14pt;line-height:1.25;color:var(--ink)}.tcard em{margin-top:auto;font-size:13pt;line-height:1.25}.tcard em.fail{color:var(--red)}.tcard em.review{color:var(--amber)}.tcard em.pass{color:var(--green)}
.pt{position:static;font-size:18pt;margin-bottom:.28in}
`;

const ORDER = [0, 1, 3, 4, 17, 2, 5, 18, 10, 11, 12, 19, 6, 7, 8, 9, 13, 14, 15, 16];
const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${ORDER.map((i) => slides[i]).join("\n")}</body></html>`;
const out = path.join(here, "BriefForge.pdf");
const htmlPath = path.join(here, "BriefForge.print.html");
import fs from "node:fs";
fs.writeFileSync(htmlPath, html);
const b = await chromium.launch();
const page = await b.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await page.pdf({ path: out, width: "13.333in", height: "7.5in", printBackground: true });
await b.close();
fs.unlinkSync(htmlPath);
console.log("wrote", out);
