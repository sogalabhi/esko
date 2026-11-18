// Builds docs/deck/BriefForge.pptx. Content: docs/PPT_CONTENT.md.
// Images (replace by re-rendering the files, then re-run this script):
//   ../diagrams/hld.png, ../diagrams/lld.png, assets/carton.png
// Run: NODE_PATH=<dir with pptxgenjs> node docs/deck/build_deck.js
const path = require("path");
const pptxgen = require("pptxgenjs");
const SKILL = process.env.PPTX_SKILL_DIR;
const { applyTheme } = require(path.join(SKILL, "scripts", "apply_theme.js"));

const THEME = {
  name: "BriefForge",
  headFontFace: "Cambria",
  bodyFontFace: "Calibri",
  colors: {
    dk1: "16243A", lt1: "FAF7F2", dk2: "52607A", lt2: "FFFFFF",
    accent1: "0F766E", accent2: "B42318", accent3: "B54708",
    accent4: "05603A", accent5: "3B5BDB", accent6: "A9B4C6",
    hlink: "0F766E", folHlink: "52607A",
  },
};
const HEX = THEME.colors;

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE"; // 13.333 x 7.5 in
pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
pres.title = "BriefForge: is this packaging artwork ready to print?";
const C = pres.SchemeColor;
const W = 13.333, M = 0.6, CW = W - 2 * M;

const img = (f) => path.join(__dirname, f);

pres.defineSlideMaster({
  title: "LIGHT", background: { color: C.background1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 0.45, w: CW, h: 0.95, fontSize: 36, bold: true, color: C.text1, valign: "top", margin: 0 }, text: "" } },
  ],
  slideNumber: { x: W - 1.1, y: 7.0, w: 0.5, h: 0.3, fontSize: 11, color: C.text2 },
});
pres.defineSlideMaster({
  title: "DARK", background: { color: C.text1 },
  objects: [
    { placeholder: { options: { name: "title", type: "title", x: M, y: 0.45, w: CW, h: 0.95, fontSize: 36, bold: true, color: C.background1, valign: "top", margin: 0 }, text: "" } },
  ],
});
pres.defineSlideMaster({ title: "FULL", background: { color: C.background1 }, objects: [] });

const FONT = { fontFace: "Calibri" };
const text = (s, t, o) => s.addText(t, { isTextBox: true, margin: 0, ...FONT, ...o });
const card = (s, x, y, w, h, name, o = {}) =>
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, {
    x, y, w, h, rectRadius: 0.12, fill: { color: C.background2 },
    line: { color: C.accent6, width: 1 }, objectName: name, ...o,
  });
// Verdict chip: tinted rounded rectangle with icon + word (never colour alone).
const VERDICT = {
  fail: { c: C.accent2, icon: "✕", word: "Fail" },
  review: { c: C.accent3, icon: "?", word: "Needs review" },
  pass: { c: C.accent4, icon: "✓", word: "Pass" },
};
function chip(s, kind, x, y, w, h, sub, size = 22) {
  const v = VERDICT[kind];
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12, fill: { color: v.c, transparency: 88 }, line: { color: v.c, width: 1.25 }, objectName: `chip ${v.word}` });
  text(s, [
    { text: `${v.icon}  ${v.word}`, options: { bold: true, color: v.c, fontSize: size, breakLine: !!sub } },
    ...(sub ? [{ text: sub, options: { color: C.text1, fontSize: 15 } }] : []),
  ], { x: x + 0.25, y, w: w - 0.5, h, valign: "middle", objectName: `chip text ${v.word}` });
}
const notes = (s, t) => s.addNotes(t);
const slides = []; // one function per slide; the order is set at the bottom
let SECTION = "";

// ---------------------------------------------------------------- 1 Title
slides.push(() => {
  const s = pres.addSlide({ masterName: "FULL", sectionTitle: SECTION });
  text(s, "BRIEFFORGE  ·  ESKO AIFORGE HACKATHON  ·  PROBLEM 2", { x: M, y: 0.9, w: 7, h: 0.35, fontSize: 14, bold: true, color: C.accent1, charSpacing: 3, objectName: "kicker" });
  text(s, "BriefForge", { x: M, y: 1.6, w: 6.6, h: 1.4, fontSize: 72, bold: true, fontFace: "Cambria", color: C.text1, objectName: "title" });
  text(s, "Is this packaging artwork ready to print?", { x: M, y: 3.05, w: 6.4, h: 1.3, fontSize: 30, fontFace: "Cambria", color: C.text1, objectName: "subtitle" });
  text(s, "It checks finished artwork against the approved product information and a rulebook, and shows the evidence for every answer.", { x: M, y: 4.55, w: 5.9, h: 1.0, fontSize: 18, color: C.text2, objectName: "description" });
  text(s, "Abhijith Sogal  ·  28 October 2026", { x: M, y: 6.5, w: 6, h: 0.4, fontSize: 16, color: C.text2, objectName: "presenter" });
  s.addImage({ path: img("assets/carton.png"), x: 7.25, y: 1.2, w: 5.5, h: 5.5 * 1352 / 1616, sizing: { type: "contain", w: 5.5, h: 4.6 }, altText: "Dancing Fish Granola Berry Crunch US carton, flat dieline", objectName: "IMAGE carton (replace)" });
  notes(s, "BriefForge checks finished packaging artwork before it goes to print, and shows its evidence for every answer. (10 s)\n\nIMAGE: the carton picture is a render of the sample PDF. Replace it if you have a better crop.");
});

// ---------------------------------------------------------------- 2 Problem
slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("Almost half of food recalls are label errors", { placeholder: "title" });
  // two stat cards
  const stat = (y, big, line, src, name) => {
    card(s, M, y, 4.7, 1.95, name);
    text(s, big, { x: M + 0.3, y: y + 0.18, w: 1.9, h: 1.0, fontSize: 48, bold: true, fontFace: "Cambria", color: C.accent1, valign: "middle", objectName: name + " number" });
    text(s, line, { x: M + 2.2, y: y + 0.2, w: 2.3, h: 1.0, fontSize: 15, color: C.text1, valign: "middle", objectName: name + " text" });
    text(s, src, { x: M + 0.3, y: y + 1.3, w: 4.2, h: 0.5, fontSize: 12, color: C.text2, valign: "top", objectName: name + " source" });
  };
  stat(1.65, "45.8%", "of 2025 FDA food recalls: an allergen the label failed to declare (115 of 251)", "Source: Esko, FDA food and beverage recalls 2025", "stat 2025");
  stat(3.8, "45%", "of 2024 food recalls were label errors: 192 events, about $1.92 billion", "Source: Loftware analysis of FDA Enforcement Report data", "stat 2024");
  // native bar chart
  const labels = ["Undeclared allergen (label error)", "Foodborne illness", "Chemical contamination", "Foreign objects", "Other"];
  const values = [115, 94, 26, 9, 7];
  card(s, 5.65, 1.65, W - M - 5.65, 4.1, "chart card");
  s.addChart(pres.charts.BAR, [{ name: "Recalls", labels, values }], {
    x: 5.8, y: 1.75, w: W - M - 5.65 - 0.3, h: 3.9, barDir: "bar", barGapWidthPct: 45,
    chartColors: [HEX.accent1, HEX.accent6, HEX.accent6, HEX.accent6, HEX.accent6],
    catAxisOrientation: "maxMin", catAxisLabelColor: HEX.dk1, catAxisLabelFontSize: 14, catAxisLabelFontFace: "+mn-lt",
    valAxisHidden: true, valGridLine: { style: "none" }, catGridLine: { style: "none" },
    showValue: true, dataLabelPosition: "outEnd", dataLabelColor: HEX.dk1, dataLabelFontSize: 14, dataLabelFontBold: true, dataLabelFontFace: "+mn-lt",
    showLegend: false, showTitle: true, title: "2025 FDA recalls by cause (251 events)", titleColor: HEX.dk1, titleFontSize: 14, titleFontFace: "+mn-lt",
  });
  text(s, [{ text: "The cause: ", options: { bold: true } }, { text: "the spec changes and the label doesn't.", options: { italic: true } }],
    { x: M, y: 6.1, w: CW, h: 0.5, fontSize: 24, fontFace: "Cambria", color: C.text1, objectName: "takeaway" });
  text(s, "Sources: Esko, \u201cFDA food and beverage recalls 2025\u201d (esko.com blog); Loftware analysis of FDA Enforcement Report data, 2024 (as posted on LinkedIn). Full links on the Sources slide.", { x: M, y: 6.75, w: CW, h: 0.5, fontSize: 11, color: C.text2, valign: "top", objectName: "sources note" });
  notes(s, "In 2024 and again in 2025, almost half of US food recalls were label mistakes, not contamination. Esko's own analysis explains why: a formulation changes and is recorded in the spec, but the artwork is not updated. Today, a person checks the artwork line by line. It's slow, and one missed line means a reprint or a recall. (45 s)\n\nCAREFUL: the 45% (Loftware, 2024, all label errors) and the 45.8% (Esko, 2025, allergen mislabeling only) are different studies. Say the source each time. Esko says its figures are directional. The foodborne illness bar uses 94 (Esko's text and chart); its headline graphic says 98, so don't quote that.");
});

// ---------------------------------------------------------------- 3 Solution
slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("Three things in, one answer out", { placeholder: "title" });
  const inputs = [["Finished artwork", "dieline PDF"], ["Approved product information", "Excel content sheet"], ["Rulebook", "law and company rules"]];
  inputs.forEach(([a, b], i) => {
    const y = 1.75 + i * 1.5;
    card(s, M, y, 3.7, 1.25, `input ${i + 1}`);
    text(s, [{ text: a, options: { bold: true, fontSize: 19, breakLine: true } }, { text: b, options: { fontSize: 15, color: C.text2 } }],
      { x: M + 0.3, y, w: 3.2, h: 1.25, valign: "middle", color: C.text1, objectName: `input ${i + 1} text` });
  });
  s.addShape(pres.shapes.RIGHT_ARROW, { x: 4.45, y: 3.55, w: 0.6, h: 0.5, fill: { color: C.text2 }, line: { type: "none" }, objectName: "arrow in" });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.2, y: 1.75, w: 3.1, h: 4.25, rectRadius: 0.15, fill: { color: C.accent1 }, line: { type: "none" }, objectName: "BriefForge box" });
  text(s, [
    { text: "BriefForge", options: { bold: true, fontSize: 30, fontFace: "Cambria", breakLine: true } },
    { text: "Compares the artwork with the approved information and applies the rulebook", options: { fontSize: 16 } },
  ], { x: 5.45, y: 1.75, w: 2.6, h: 4.25, valign: "middle", color: C.background2, objectName: "BriefForge text" });
  s.addShape(pres.shapes.RIGHT_ARROW, { x: 8.45, y: 3.55, w: 0.6, h: 0.5, fill: { color: C.text2 }, line: { type: "none" }, objectName: "arrow out" });
  chip(s, "fail", 9.2, 1.75, W - M - 9.2, 1.3, "A rule is broken, proven by code");
  chip(s, "review", 9.2, 3.2, W - M - 9.2, 1.3, "A person must decide");
  chip(s, "pass", 9.2, 4.65, W - M - 9.2, 1.35, "Correct, and where it was found");
  text(s, "Every result shows its evidence.", { x: M, y: 6.3, w: CW, h: 0.5, fontSize: 24, fontFace: "Cambria", italic: true, color: C.text1, objectName: "takeaway" });
  notes(s, "You give it the finished artwork, the approved information, and the rulebook. It tells you what's wrong, what needs a person, and what's correct, with the evidence for each. We built and tested it on Esko's own sample files: the Dancing Fish Granola carton and its content sheet. (45 s)\n\nNEXT: go straight to the live demo; the details come after it.");
});

// ---------------------------------------------------------------- 4 How it works (HLD, full bleed)
slides.push(() => {
  const s = pres.addSlide({ masterName: "FULL", sectionTitle: SECTION });
  s.addImage({ path: img("../diagrams/hld.png"), x: 0, y: 0, w: W, h: 7.5, altText: "High-level design: the journey of a carton from three files through readers, AI, quote check, rules and maths, triage, to the app's screens", objectName: "IMAGE hld (replace)" });
  notes(s, "BACK FROM THE DEMO: you have just seen what it does; this is how it works. Three ideas make this trustworthy. First, the AI only reads. For every fact it extracts, it must give a quote, and then our code checks that quote really appears in the file. If it doesn't, the fact is marked AI-suggested and can never cause a Fail. Second, anything that can be calculated is calculated by code: percent daily values, calories, unit conversions, the barcode check digit. Third, a Fail needs a cited rule and evidence that code has checked. Everything else goes to a person. (75 s)\n\nIMAGE: docs/diagrams/hld.png. Re-render it (python3 docs/diagrams/build_diagrams.py hld) and re-run docs/deck/build_deck.js to refresh this slide.");
});

// ---------------------------------------------------------------- 5 What it finds
slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("What the demo finds", { placeholder: "title" });
  const cw = (CW - 3 * 0.25) / 4;
  [["fail", "29", "Fail"], ["review", "11", "Needs review"], ["pass", "7", "Pass"]].forEach(([k, n, w], i) => {
    const v = VERDICT[k], x = M + i * (cw + 0.25);
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.6, w: cw, h: 1.35, rectRadius: 0.12, fill: { color: v.c, transparency: 88 }, line: { color: v.c, width: 1.25 }, objectName: `count ${w}` });
    text(s, [{ text: n, options: { fontSize: 36, bold: true, fontFace: "Cambria", color: v.c, breakLine: true } }, { text: `${v.icon} ${w}`, options: { fontSize: 16, bold: true, color: v.c } }],
      { x: x + 0.25, y: 1.6, w: cw - 0.4, h: 1.35, valign: "middle", objectName: `count text ${w}` });
  });
  {
    const x = M + 3 * (cw + 0.25);
    card(s, x, 1.6, cw, 1.35, "count cleared");
    text(s, [{ text: "2", options: { fontSize: 36, bold: true, fontFace: "Cambria", color: C.accent1, breakLine: true } }, { text: "✓ Checked and fine", options: { fontSize: 16, bold: true, color: C.accent1 } }],
      { x: x + 0.25, y: 1.6, w: cw - 0.4, h: 1.35, valign: "middle", objectName: "count text cleared" });
  }
  const w3 = (CW - 2 * 0.28) / 3, y0 = 3.2, h0 = 3.45;
  const cards = [
    { k: "fail", title: "Honey: 9% approved, 1% printed", body: [["Approved sheet, cell B26", "Honey (9%)"], ["Carton, back panel", "Honey (1%)"]], foot: "Both quotes found in the files by code" },
    { k: "fail", title: "Total Fat % Daily Value is wrong", mono: ["15 g ÷ 78 g = 19.2%", "Printed on the carton: 2.2%"], foot: "Calculated by code, not by the AI" },
    { k: "fail", title: "Hidden and too small", plain: ["An old EU nutrition table sits under the US panel", "Storage text is 5.8 pt; the company minimum is 6 pt"], foot: "Hidden text is never read as a fact" },
  ];
  cards.forEach((c, i) => {
    const x = M + i * (w3 + 0.28), v = VERDICT[c.k];
    card(s, x, y0, w3, h0, `finding ${i + 1}`);
    text(s, `${v.icon}  ${v.word}`, { x: x + 0.3, y: y0 + 0.2, w: 2, h: 0.35, fontSize: 15, bold: true, color: v.c, objectName: `finding ${i + 1} verdict` });
    text(s, c.title, { x: x + 0.3, y: y0 + 0.65, w: w3 - 0.6, h: 0.9, fontSize: 20, bold: true, fontFace: "Cambria", color: C.text1, valign: "top", objectName: `finding ${i + 1} title` });
    if (c.body) c.body.forEach(([lab, val], j) => {
      text(s, [{ text: lab, options: { fontSize: 12, color: C.text2, breakLine: true } }, { text: val, options: { fontSize: 22, bold: true, color: j ? C.accent2 : C.text1 } }],
        { x: x + 0.3, y: y0 + 1.6 + j * 0.8, w: w3 - 0.6, h: 0.7, objectName: `finding ${i + 1} source ${j + 1}` });
    });
    if (c.mono) {
      text(s, c.mono[0], { x: x + 0.3, y: y0 + 1.65, w: w3 - 0.6, h: 0.6, fontSize: 20, bold: true, fontFace: "Courier New", color: C.text1, objectName: `finding ${i + 1} proof` });
      text(s, c.mono[1], { x: x + 0.3, y: y0 + 2.3, w: w3 - 0.6, h: 0.6, fontSize: 18, bold: true, color: C.accent2, objectName: `finding ${i + 1} printed` });
    }
    if (c.plain) c.plain.forEach((t, j) => {
      text(s, t, { x: x + 0.3, y: y0 + 1.6 + j * 0.8, w: w3 - 0.6, h: 0.7, fontSize: 16, color: C.text1, valign: "top", objectName: `finding ${i + 1} point ${j + 1}` });
    });
    text(s, c.foot, { x: x + 0.3, y: y0 + h0 - 0.62, w: w3 - 0.6, h: 0.42, fontSize: 13, italic: true, color: C.accent4, objectName: `finding ${i + 1} note` });
  });
  text(s, "Sources: counts from the saved demo run on Esko\u2019s sample carton and content sheet, checked against our own 21-rule demo rulebook. % Daily Value reference of 78 g total fat: 21 CFR 101.9(c)(9). The 6 pt minimum is company rule DF-18 (our demo rulebook). See the Sources slide.", { x: M, y: 6.78, w: CW, h: 0.5, fontSize: 11, color: C.text2, valign: "top", objectName: "sources note" });
  notes(s, "Here is what it finds on Esko's own files: 29 fails, 11 for a person to review, 7 passes, and 2 things it checked and cleared. These are real mistakes, each with the exact spot in both sources. The percent daily value is calculated by code, and the working is shown. Let me show you. (30 s)\n\nThe counts are from the saved demo snapshot (what Load demo shows). Glance at the app's top bar first to confirm. The unit tests assert different totals because they run without the rulebook.\n\nOPTIONAL IMAGE: swap a card for a real screenshot of the Checks screen.");
});

// ---------------------------------------------------------------- 6 Live demo
slides.push(() => {
  const s = pres.addSlide({ masterName: "DARK", sectionTitle: SECTION });
  s.addText("Live demo", { placeholder: "title" });
  const steps = ["Files", "Checks", "Rules", "Report"];
  steps.forEach((t, i) => {
    const y = 2.0 + i * 1.0;
    s.addShape(pres.shapes.OVAL, { x: M, y, w: 0.6, h: 0.6, fill: { color: C.accent1 }, line: { type: "none" }, objectName: `step ${i + 1} badge` });
    text(s, String(i + 1), { x: M, y, w: 0.6, h: 0.6, fontSize: 20, bold: true, color: C.background2, align: "center", valign: "middle", objectName: `step ${i + 1} number` });
    text(s, t, { x: M + 0.9, y, w: 4.5, h: 0.6, fontSize: 30, fontFace: "Cambria", color: C.background1, valign: "middle", objectName: `step ${i + 1} label` });
  });
  text(s, "Dancing Fish Granola Berry Crunch · US carton", { x: M, y: 6.3, w: 6.5, h: 0.4, fontSize: 16, color: C.accent6, objectName: "demo subject" });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 7.1, y: 1.6, w: 5.6, h: 4.6, rectRadius: 0.12, fill: { color: C.background2 }, line: { type: "none" }, objectName: "image frame" });
  s.addImage({ path: img("assets/carton.png"), x: 7.3, y: 1.8, w: 5.2, h: 4.2, sizing: { type: "contain", w: 5.2, h: 4.2 }, altText: "The carton being checked", objectName: "IMAGE carton (replace)" });
  notes(s, "Let me show you on Esko's own files. (10 s) Then switch to the browser. After the demo, come back here: the next slide explains how it works.\n\nBEFORE YOU SWITCH: the app is running locally (npm run dev), reset and reloaded with Load demo (no AI calls), the recorded video is open as a fallback, browser zoom is 100%.\n\nDEMO RUN (6-7 min):\n0:00 Files: the three files; guide text ignored; hidden text on the Left panel\n0:45 Checks top bar: Not ready to print: 29 fail, 11 review\n1:15 Honey card: two crops side by side; checked by code\n2:00 Total Fat % DV: the working line\n2:45 Rules: DF-16 and DF-18; rulebook is a Word file; each rule quote-checked; DF-21 proposed, never applied\n4:00 Checked and fine: the valid barcode and the ignored guide text, with proof\n4:30 Needs review, HIGH-GRAIN: type a name, It's a problem, the verdict updates\n5:30 Report: Fail list, marked-up carton, decisions log, sign-off\n\nIMAGE: swap for a screenshot of the Checks screen if you prefer.");
});

// ---------------------------------------------------------------- 7 Scale and limits
slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("Built to scale, and honest about limits", { placeholder: "title" });
  const lw = 5.6;
  card(s, M, 1.65, lw, 4.1, "scale card");
  text(s, "A new country is a folder of rules, not new code", { x: M + 0.35, y: 1.85, w: lw - 0.7, h: 0.9, fontSize: 20, bold: true, fontFace: "Cambria", color: C.text1, valign: "top", objectName: "scale heading" });
  text(s, [
    { text: "markets/", options: { breakLine: true, bold: true } },
    { text: "  us/        FDA rules", options: { breakLine: true } },
    { text: "  in/        FSSAI rules (as data)", options: { breakLine: true } },
    { text: "  company/   company rules", options: {} },
  ], { x: M + 0.35, y: 2.85, w: lw - 0.7, h: 1.5, fontSize: 17, fontFace: "Courier New", color: C.accent1, valign: "top", objectName: "folder tree" });
  text(s, "A test fails if market logic leaks into the engine. An AI-invented rule is rejected.", { x: M + 0.35, y: 4.6, w: lw - 0.7, h: 0.9, fontSize: 15, color: C.text2, valign: "top", objectName: "scale note" });
  const rx = M + lw + 0.35, rw = W - M - rx;
  card(s, rx, 1.65, rw, 4.1, "limits card");
  text(s, "Limits", { x: rx + 0.35, y: 1.85, w: rw - 0.7, h: 0.5, fontSize: 20, bold: true, fontFace: "Cambria", color: C.text1, objectName: "limits heading" });
  const lim = ["Text inside images is lower trust, so it goes to Needs review", "Evidence outside the artwork (certificates) stays Needs review", "Tested on one product; the India switch is not in the app yet"];
  text(s, lim.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < lim.length - 1, paraSpaceAfter: 10 } })),
    { x: rx + 0.35, y: 2.5, w: rw - 0.7, h: 3.0, fontSize: 18, color: C.text1, valign: "top", objectName: "limits list" });
  text(s, [{ text: "520+ ", options: { bold: true, color: C.accent1 } }, { text: "backend tests  ·  ", options: {} }, { text: "400+ ", options: { bold: true, color: C.accent1 } }, { text: "frontend tests  ·  end-to-end checks  ·  none call the network", options: {} }],
    { x: M, y: 6.1, w: CW, h: 0.5, fontSize: 18, color: C.text1, objectName: "tests line" });
  text(s, "Sources: test counts from this project\u2019s own test run on 28 October 2026. Every market rule cites its regulation, clause, URL and exact quote in markets/ (US: 21 CFR; India: FSSAI and Legal Metrology). See the Sources slide.", { x: M, y: 6.8, w: CW, h: 0.5, fontSize: 11, color: C.text2, valign: "top", objectName: "sources note" });
  notes(s, "Adding a country means adding a folder of rule records, each with the regulation, the clause and an exact quote. India is already written this way. No engine code changes, and a test enforces that. The honest limits: text inside images is read by a vision model, so it's lower trust and always goes to a person. Anything that needs evidence from outside the artwork, like a certificate, stays Needs review. We've tested on one product, and the India market switch isn't in the interface yet. (50 s)\n\nSay also: the market rules are drafted from the regulations with exact quotes, but most are marked approved: false, so a regulatory person should confirm them before real use.");
});

// ---------------------------------------------------------------- 8 Close
slides.push(() => {
  const s = pres.addSlide({ masterName: "DARK", sectionTitle: SECTION });
  text(s, "The AI reads.\nThe code proves.\nA person decides.", { x: M, y: 1.3, w: 7, h: 3.2, fontSize: 46, bold: true, fontFace: "Cambria", color: C.background1, valign: "top", objectName: "closing line" });
  text(s, [
    { text: "Every finding shows its evidence", options: { breakLine: true, bold: true } },
    { text: "Next: India switch in the app · self-test on changed copies · a database", options: {} },
  ], { x: M, y: 4.8, w: 6.6, h: 1.2, fontSize: 18, color: C.accent6, valign: "top", objectName: "next steps" });
  text(s, "Thank you  ·  Questions", { x: M, y: 6.4, w: 6, h: 0.5, fontSize: 24, fontFace: "Cambria", color: C.background1, objectName: "thanks" });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 7.6, y: 1.3, w: 5.1, h: 4.6, rectRadius: 0.12, fill: { color: C.background2 }, line: { type: "none" }, objectName: "image frame" });
  s.addImage({ path: img("assets/carton.png"), x: 7.8, y: 1.5, w: 4.7, h: 4.2, sizing: { type: "contain", w: 4.7, h: 4.2 }, altText: "Carton with its problems marked", objectName: "IMAGE marked-up carton (replace)" });
  notes(s, "Checking artwork shouldn't depend on someone remembering to check. BriefForge makes the evidence visible, the proof checkable and the decision a person's. Thank you. (20 s)\n\nIMAGE: replace with a screenshot of the Marked-up artwork screen (the carton with the red marks).");
});

// ---------------------------------------------------------------- Appendix
slides.push(() => {
  const s = pres.addSlide({ masterName: "FULL", sectionTitle: SECTION });
  s.addImage({ path: img("../diagrams/lld.png"), x: 0, y: 0, w: W, h: 7.5, altText: "Low-level design: how one finding, honey 9% against 1%, is built from the sheet cell to the Checks card", objectName: "IMAGE lld (replace)" });
  notes(s, "Appendix: inside one finding. The honey mismatch from cell B26 and the carton's back panel, through the AI fact with a quote, the quote check, the value conflict, rule DF-02, triage, to the finding and the Checks card. The second road shows an AI-suggested fact that can only reach Needs review.\n\nIMAGE: docs/diagrams/lld.png.");
});
slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("Who does what", { placeholder: "title" });
  const hdr = (t, c) => ({ text: t, options: { bold: true, color: C.background2, fill: { color: c }, fontSize: 18, fontFace: "Cambria", valign: "middle" } });
  const cell = (t) => ({ text: t, options: { color: C.text1, fontSize: 15, valign: "top", fill: { color: C.background2 } } });
  s.addTable([
    [hdr("AI reads", C.accent5), hdr("Code proves", C.accent1), hdr("A person decides", C.accent3)],
    [cell("Turns the sheet, the carton text and images into facts, each with a quote"), cell("Checks every quote is really in the file (digits never fuzzy)"), cell("Every Needs review item, with a name, logged")],
    [cell("Flags contradictions in meaning (Vegan vs honey). Always Needs review"), cell("Maths: % Daily Values, calories, serving size, UPC check digit"), cell("Whether an AI-suggested fact is true")],
    [cell("Reads the rulebook into rules, each with a quote"), cell("Applies the rules; decides Fail / Needs review / Pass; writes the report"), cell("The market rules (approved: false until confirmed) and the sign-off")],
    [cell("Answers a question about one finding, from that finding's evidence only"), cell("Reads the files: panel and position in mm, guide and hidden text"), cell("Nothing decides design quality, or text only inside images and certificates")],
  ], { x: M, y: 1.55, w: CW, colW: [CW / 3, CW / 3, CW / 3], border: { type: "solid", color: HEX.accent6, pt: 1 }, rowH: [0.55, 1.1, 1.1, 1.1, 1.1], margin: [0.08, 0.14, 0.08, 0.14], objectName: "who does what" });
  notes(s, "The AI is a very good typist who must show its source. The code is the proofreader. A person decides the rest.");
});
slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("Why not RAG for the rulebook?", { placeholder: "title" });
  const pts = [
    ["It is small.", "21 rules fit in one AI call, so there is nothing to retrieve."],
    ["We need rules, not answers.", "The rulebook is read into structured rules once; code applies them the same way every run."],
    ["RAG puts the AI in the verdict path.", "We only allow AI judgement to produce Needs review."],
    ["Quote-checking is stronger.", "Every rule is checked against the whole document, not a retrieved chunk."],
  ];
  pts.forEach(([a, b], i) => {
    const y = 1.6 + i * 1.0;
    text(s, [{ text: a + " ", options: { bold: true, color: C.accent1 } }, { text: b, options: {} }], { x: M, y, w: 7.4, h: 0.9, fontSize: 18, color: C.text1, valign: "top", objectName: `rag point ${i + 1}` });
  });
  card(s, 8.4, 1.6, W - M - 8.4, 3.9, "limit card");
  text(s, [
    { text: "Honest limit", options: { bold: true, fontSize: 18, fontFace: "Cambria", color: C.accent3, breakLine: true } },
    { text: "A very long rulebook is read in one call and could exceed the model's context. There is no chunking yet.", options: { fontSize: 16, breakLine: true, paraSpaceAfter: 12 } },
    { text: "Next step", options: { bold: true, fontSize: 18, fontFace: "Cambria", color: C.accent1, breakLine: true } },
    { text: "Retrieval only to find candidate clauses. The quote check and the code triage stay as they are.", options: { fontSize: 16 } },
  ], { x: 8.7, y: 1.8, w: W - M - 8.4 - 0.6, h: 3.5, color: C.text1, valign: "top", objectName: "limit text" });
  notes(s, "For this job RAG adds risk and no benefit. We read the rulebook once into structured rules and code applies them. For very large rulebooks, retrieval is the right next step, but only to find the relevant clause; the verdict is still decided by code.");
});

slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("Sources", { placeholder: "title" });
  const rows = [
    ["1", "Loftware analysis of FDA Enforcement Report data, 2024: 192 label-error recall events, 45% of food recalls, about $1.92 billion estimated cost, Listeria 15%. Read from the LinkedIn post, not the original report.", "linkedin.com/posts/foodsafety-foodrecall-qualityassurance-share-7454565766894362624-ysoS"],
    ["2", "Esko, \u201cFDA food and beverage recalls 2025\u201d: 251 recall events, 115 allergen mislabeling (45.8%), 94 foodborne illness; spec-versus-label cause. The blog says its figures are directional.", "esko.com/en/blog/fda-food-and-beverage-recalls-2025"],
    ["3", "21 CFR 101.9(c)(9), Daily Reference Values (total fat 78 g), used for the % Daily Value check.", "ecfr.gov/current/title-21/section-101.9"],
    ["4", "Esko\u2019s sample files for the AIForge hackathon: Dancing Fish Granola Berry Crunch US carton (PDF) and content sheet (Excel).", "samples/ in the project"],
    ["5", "Dancing Fish US Label and Artwork Rulebook, rules DF-01 to DF-21: our own demo rulebook, written for this project (not a real company document).", "rulebooks/ in the project"],
    ["6", "Market rules (US FDA, India FSSAI and Legal Metrology): drafted from the regulations, each with clause, URL and exact quote. Most are marked approved: false until a regulatory person confirms them.", "markets/ in the project"],
    ["7", "Test counts: 547 backend, 403 frontend, 7 end-to-end, run on 28 October 2026.", "backend/tests, frontend/src, e2e/ in the project"],
  ];
  rows.forEach(([n, t, u], i) => {
    const y = 1.4 + i * 0.75;
    text(s, n, { x: M, y, w: 0.4, h: 0.7, fontSize: 16, bold: true, color: C.accent1, valign: "top", objectName: `source ${n} number` });
    text(s, [{ text: t, options: { fontSize: 13, color: C.text1, breakLine: true } }, { text: u, options: { fontSize: 11, color: C.accent1 } }], { x: M + 0.45, y, w: CW - 0.45, h: 0.72, valign: "top", objectName: `source ${n}` });
  });
  notes(s, "Every number in the talk comes from one of these. The two recall studies are different years and scopes; say the source each time.");
});

slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("Our six non-negotiables", { placeholder: "title" });
  const items = [["Every fact has a source", "A quote checked by code. Unchecked means AI-suggested, never confirmed."], ["No finding without evidence", "A Fail cites a rule and code-checked evidence. AI judgement is only ever Needs review."], ["Rules are data", "Never hard-coded. Nothing market-specific in the engine code."], ["Nothing resolved silently", "Conflicts are never settled by the tool. A person decides, and it is logged."], ["Code proves, AI reads", "Code does maths, units, rules and geometry. AI reads, interprets and words. Its output is schema-validated."], ["No chat-first screens", "Chat only as “Ask about this finding”, using only that finding’s own rule and evidence."]];
  const w3 = (CW - 2 * 0.28) / 3, h = 2.4;
  items.forEach(([t, b], i) => {
    const x = M + (i % 3) * (w3 + 0.28), y = 1.5 + Math.floor(i / 3) * (h + 0.25);
    card(s, x, y, w3, h, `rule ${i + 1}`);
    s.addShape(pres.shapes.OVAL, { x: x + 0.3, y: y + 0.28, w: 0.5, h: 0.5, fill: { color: C.accent1 }, line: { type: "none" }, objectName: `rule ${i + 1} badge` });
    text(s, String(i + 1), { x: x + 0.3, y: y + 0.28, w: 0.5, h: 0.5, fontSize: 18, bold: true, color: C.background2, align: "center", valign: "middle", objectName: `rule ${i + 1} number` });
    text(s, t, { x: x + 0.95, y: y + 0.18, w: w3 - 1.2, h: 0.7, fontSize: 19, bold: true, fontFace: "Cambria", color: C.text1, valign: "middle", objectName: `rule ${i + 1} title` });
    text(s, b, { x: x + 0.3, y: y + 1.0, w: w3 - 0.6, h: h - 1.15, fontSize: 15, color: C.text1, valign: "top", objectName: `rule ${i + 1} text` });
  });
  text(s, "Everything that follows is built around these.", { x: M, y: 6.8, w: CW, h: 0.45, fontSize: 20, fontFace: "Cambria", italic: true, color: C.text1, objectName: "takeaway" });
  notes(s, "Because a wrong answer in this domain is worse than no answer, we started from six rules we would not break. One: every fact has a source and a quote checked by code. Two: no finding without evidence; a Fail cites a rule and code-checked evidence, and anything resting on AI judgement is Needs review, never Fail. Three: rules are data, never hard-coded. Four: conflicts are never resolved silently; a person decides and it is logged. Five: code does the maths, units, rules and geometry; AI does reading, meaning and wording, and its output is schema-validated. Six: no chat-first screens; chat exists only as Ask about this finding. Now the solution built on them. (60 s)");
});

slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("Every AI scan, and what checks it", { placeholder: "title" });
  const rows = [["Sheet → facts", "Excel cells (value and note)", "Quote must be in the cell or its note; “assumed” notes stay AI-suggested"], ["Carton → facts", "PDF text plus a picture of each panel", "Quote check; facts seen only in a picture stay AI-suggested"], ["Documents and images → facts", "Word, notes, plain PDFs, photos", "Quote check; image-only facts are AI-suggested"], ["Meaning conflicts", "All the facts, by id", "Must cite real fact ids; result is Needs review, never Fail"], ["Rulebook → rules", "The rulebook’s paragraphs", "Every rule’s quote checked against the document; an invented rule is never a Fail"], ["Ask about this finding", "One finding’s rule and evidence", "Shown only if it cites that finding’s evidence and every number appears in it"], ["Question wording", "A question the code built", "Falls back to the code’s own wording if invalid"]];
  const hdr = (t) => ({ text: t, options: { bold: true, color: C.background2, fill: { color: C.accent5 }, fontSize: 15, fontFace: "Cambria", valign: "middle" } });
  const cell = (t, b) => ({ text: t, options: { color: C.text1, fontSize: 14, bold: !!b, valign: "middle", fill: { color: C.background2 } } });
  s.addTable([[hdr("AI scan"), hdr("What it reads"), hdr("What code does with the answer")], ...rows.map(([a, b, c]) => [cell(a, true), cell(b), cell(c)])],
    { x: M, y: 1.4, w: CW, colW: [2.9, 3.3, CW - 6.2], border: { type: "solid", color: HEX.accent6, pt: 1 }, rowH: [0.42, ...rows.map(() => 0.62)], margin: [0.05, 0.12, 0.05, 0.12], objectName: "ai scans table" });
  text(s, "Every call: a versioned prompt, output validated against a schema, cached by file + prompt version + model, replayed from recordings in tests (no network).", { x: M, y: 6.55, w: CW, h: 0.6, fontSize: 13, italic: true, color: C.text2, valign: "top", objectName: "ai scans note" });
  notes(s, "Eight AI tasks in all, and none of them produces a verdict. Each answer is validated against a schema, and code checks it before it is used: quotes against the file, fact ids against the real list, rule quotes against the rulebook.");
});

slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("Everything code checks", { placeholder: "title" });
  const cards = [["Reading the files", ["Text with panel and position in mm", "Guide text set aside", "Hidden text flagged", "Letter-spaced and curved text"]], ["Facts and the quote check", ["Quote must really be in the file", "Digits are never fuzzy", "Confirmed, AI-suggested, missing", "Ingredient percentages split out"]], ["Comparing the two files", ["Different values (units first)", "Ingredient lists, item by item", "A name repeated in one list", "480 g = 16.93 oz: no conflict"]], ["The maths", ["% Daily Value from the amounts", "Calories from fat, carbs, protein", "Serving size against pack weight", "Sugars above carbs; UPC check digit"]], ["The rules", ["Market rules kept as data", "Required item, right panel", "Banned words, text size, hidden text", "Claims against ingredients"]], ["The verdict", ["Fail: rule + code check + quotes", "A final guard re-checks every Fail", "No evidence, no finding", "Cleared list, with the proof"]]];
  const w3 = (CW - 2 * 0.28) / 3, h = 2.45;
  cards.forEach(([t, bl], i) => {
    const x = M + (i % 3) * (w3 + 0.28), y = 1.45 + Math.floor(i / 3) * (h + 0.25);
    card(s, x, y, w3, h, `code ${i + 1}`);
    text(s, t, { x: x + 0.3, y: y + 0.2, w: w3 - 0.6, h: 0.45, fontSize: 19, bold: true, fontFace: "Cambria", color: C.accent1, objectName: `code ${i + 1} title` });
    text(s, bl.map((b, j) => ({ text: b, options: { bullet: true, breakLine: j < bl.length - 1, paraSpaceAfter: 4 } })), { x: x + 0.3, y: y + 0.75, w: w3 - 0.6, h: h - 0.9, fontSize: 13, color: C.text1, valign: "top", objectName: `code ${i + 1} list` });
  });
  notes(s, "Everything on this slide is plain code: no AI. This is what produces every Fail.");
});

slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("How the carton’s edges and folds are found", { placeholder: "title" });
  const steps = [["Read the lines", "Every vector line and curve, with the layer it is drawn on"], ["Find the panels", "Lines on the “Artwork panel” layer are chained into closed outlines, named from the printed labels (“Back panel”)"], ["Grow to the true face", "Each side moves out to the nearest crease or cut line, giving the real panel size in mm"], ["Find the folds", "Each crease is walked in 1 mm steps; two different panels on either side make one fold"]];
  steps.forEach(([t, b], i) => {
    const y = 1.5 + i * 1.2;
    s.addShape(pres.shapes.OVAL, { x: M, y, w: 0.55, h: 0.55, fill: { color: C.accent1 }, line: { type: "none" }, objectName: `step ${i + 1} badge` });
    text(s, String(i + 1), { x: M, y, w: 0.55, h: 0.55, fontSize: 18, bold: true, color: C.background2, align: "center", valign: "middle", objectName: `step ${i + 1} number` });
    text(s, [{ text: t, options: { bold: true, fontSize: 19, fontFace: "Cambria", breakLine: true } }, { text: b, options: { fontSize: 15 } }], { x: M + 0.8, y: y - 0.05, w: 6.0, h: 1.05, color: C.text1, valign: "top", objectName: `step ${i + 1} text` });
  });
  const lx = 7.7, lw = W - M - lx;
  card(s, lx, 1.5, lw, 4.7, "limits card");
  text(s, "Limits", { x: lx + 0.3, y: 1.7, w: lw - 0.6, h: 0.45, fontSize: 19, bold: true, fontFace: "Cambria", color: C.accent3, objectName: "limits heading" });
  const lim = ["Relies on named layers (artwork panel, crease, cut, glue), as in Esko’s DeskPack. Tested on one carton", "A PDF with no layers or outlined artwork falls back to splitting the page around the printed panel labels; flaps and folds are lost", "It finds where folds are, not their direction", "The fold lines feed the 3D view and the fit checks; the verdicts need only the panels"];
  text(s, lim.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < lim.length - 1, paraSpaceAfter: 8 } })), { x: lx + 0.3, y: 2.3, w: lw - 0.6, h: 3.8, fontSize: 14, color: C.text1, valign: "top", objectName: "limits list" });
  text(s, "Read from the dieline’s own vector lines by layer. No AI is involved.", { x: M, y: 6.5, w: 6.9, h: 0.5, fontSize: 15, italic: true, color: C.text2, objectName: "method note" });
  notes(s, "The panels and folds come straight from the vector lines in the dieline PDF, so the geometry is exact, but it relies on conventionally named layers. Verdicts need only the panel outlines to place text and crops; the fold lines feed the 3D view.");
});

slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("Every case the checker produces", { placeholder: "title" });
  const cols = [["fail", "Fail  ·  29", [["Two files disagree", "4"], ["Maths is wrong", "14"], ["Required item missing", "4"], ["Wrong format for the market", "2"], ["Claim the ingredients contradict", "2"], ["Company-rule breach", "3"]]], ["review", "Needs review  ·  11", [["AI-suggested fact to confirm", "3"], ["Code found it, no rule covers it", "3"], ["Proof is outside the artwork", "5"]]], ["pass", "Pass  ·  7", [["Required item present, with where it was found", "6"], ["Largest text on the front panel", "1"]]], ["none", "Not a problem", [["Checked and fine, with proof", "2"], ["Proposed rule: never applied", "1"], ["Invented rule: unverified, never a Fail", "—"]]]];
  const cw = (CW - 3 * 0.25) / 4;
  cols.forEach(([k, head, items], i) => {
    const x = M + i * (cw + 0.25), v = VERDICT[k];
    const c = v ? v.c : C.accent1;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.5, w: cw, h: 4.9, rectRadius: 0.12, fill: { color: v ? v.c : C.background2, transparency: v ? 92 : 0 }, line: { color: v ? v.c : C.accent6, width: 1.25 }, objectName: `cases ${head}` });
    text(s, (v ? v.icon + "  " : "✓  ") + head, { x: x + 0.25, y: 1.65, w: cw - 0.5, h: 0.5, fontSize: 18, bold: true, color: c, objectName: `cases ${i + 1} head` });
    items.forEach(([t, n], j) => {
      const y = 2.4 + j * 0.62;
      text(s, t, { x: x + 0.25, y, w: cw - 1.0, h: 0.58, fontSize: 13, color: C.text1, valign: "top", objectName: `cases ${i + 1} item ${j + 1}` });
      text(s, n, { x: x + cw - 0.8, y, w: 0.55, h: 0.4, fontSize: 18, bold: true, fontFace: "Cambria", color: c, align: "right", objectName: `cases ${i + 1} count ${j + 1}` });
    });
  });
  text(s, "Counts are from the saved demo run. Each case, with its finding id, is in docs/DEMO_CASES.md.", { x: M, y: 6.6, w: CW, h: 0.4, fontSize: 12, color: C.text2, objectName: "cases note" });
  notes(s, "The demo run: 29 Fail (two files disagree 4, maths 14, required item missing 4, wrong format 2, claim contradicted by ingredients 2, company-rule breach 3); 11 Needs review (AI-suggested 3, code found it but no rule covers it 3, proof outside the artwork 5); 7 Pass; 2 checked and fine. A proposed rule is never applied and an invented rule is never a Fail.");
});

slides.push(() => {
  const s = pres.addSlide({ masterName: "DARK", sectionTitle: SECTION });
  text(s, "PART 2", { x: M, y: 2.2, w: 6, h: 0.4, fontSize: 16, bold: true, color: C.accent6, charSpacing: 4, objectName: "part label" });
  text(s, "Under the hood", { x: M, y: 2.7, w: 10, h: 1.3, fontSize: 60, bold: true, fontFace: "Cambria", color: C.background1, objectName: "divider title" });
  text(s, "How it works, and why a Fail can be trusted", { x: M, y: 4.1, w: 10, h: 0.7, fontSize: 24, color: C.accent6, objectName: "divider subtitle" });
  notes(s, "That is the product, as a user sees it. Now the technical side: the principles behind it, how it is built, what exactly the AI and the code each do, and how we know it is sound. (If you are short of time, skip the AI-scans, code-checks and edges-and-folds slides: they are detail for questions.)");
});

slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("More than upload and compare", { placeholder: "title" });
  text(s, "Seven kinds of rule, each checked by code", { x: M, y: 1.25, w: CW, h: 0.4, fontSize: 18, color: C.text2, objectName: "subtitle" });
  const rt = [["Must be present", "A required item, on the right panel", "pass", "Storage instructions on the Back panel: Pass"], ["Must be absent", "Content that must not be there, such as text hidden under the artwork", "fail", "10 hidden lines on the Left panel: Fail"], ["Must match", "Copy equals the approved information", "fail", "Honey 9% on the sheet, 1% on the carton: Fail"], ["Size limits", "Minimum font size, largest text, clear area", "fail", "Storage text 5.8 pt, minimum 6 pt: Fail"], ["Words and claims", "Banned or required words, and claims checked against the ingredients", "fail", "“GMO free” printed twice; “Vegan” next to honey: Fail"], ["Needs proof", "Evidence the artwork can’t show", "review", "Organic certificate not on file: Needs review"], ["No automatic check", "Says so, and leaves it to a person", "review", "Date-code clear area: Needs review"]];
  const cw = (CW - 3 * 0.25) / 4, h = 2.2;
  rt.forEach(([t, d, k, ex], i) => {
    const x = M + (i % 4) * (cw + 0.25), y = 1.85 + Math.floor(i / 4) * (h + 0.25), v = VERDICT[k];
    card(s, x, y, cw, h, `rule type ${i + 1}`);
    text(s, t, { x: x + 0.25, y: y + 0.18, w: cw - 0.5, h: 0.4, fontSize: 18, bold: true, fontFace: "Cambria", color: C.accent1, objectName: `rule type ${i + 1} title` });
    text(s, d, { x: x + 0.25, y: y + 0.65, w: cw - 0.5, h: 0.75, fontSize: 14, color: C.text1, valign: "top", objectName: `rule type ${i + 1} text` });
    text(s, `${v.icon}  ${ex}`, { x: x + 0.25, y: y + 1.42, w: cw - 0.5, h: 0.7, fontSize: 13, italic: true, color: v.c, valign: "top", objectName: `rule type ${i + 1} example` });
  });
  text(s, "A proposed rule is never applied. A rule whose quote isn’t in the rulebook is never a Fail.", { x: M, y: 6.7, w: CW, h: 0.4, fontSize: 14, color: C.text2, objectName: "rule note" });
  notes(s, "It is not just upload and compare. The company rulebook is read into rules, and each rule is one of seven kinds, so the code knows how to check it. Must be present: storage instructions on the back panel. Must be absent: text hidden under the artwork. Must match: honey 9 percent on the sheet, 1 percent on the carton. Size limits: storage text at 5.8 points against a 6 point minimum. Words and claims: GMO free printed twice, and a vegan claim next to honey in the ingredients. Needs proof: an organic certificate the artwork cannot show. And where no automatic check exists, it says so and leaves it to a person. A proposed rule is never applied, and a rule whose quote is not in the rulebook is never a Fail. (40 s)");
});

slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("How we know it’s sound", { placeholder: "title" });
  const cols = [["Tested without the network", ["547 backend tests, 403 frontend tests, 7 end-to-end", "AI answers replayed from recordings, so every run is the same"]], ["Marked against answer keys", ["31 known issues in Esko’s files, written before the code (26 to catch, 5 that must not be flagged)", "21 rulebook rules, each with its expected verdict"]], ["Guarded at every step", ["Quotes checked by code; digits never fuzzy", "Every AI answer validated against a schema", "A final guard re-checks every Fail"]], ["Proven by named tests", ["No market logic in the engine", "An invented rule never fails", "The 5 must-not-flag items never produce a Fail", "A decision survives adding or removing a rulebook"]]];
  const cw = (CW - 3 * 0.25) / 4, h = 4.0;
  cols.forEach(([t, bl], i) => {
    const x = M + i * (cw + 0.25);
    card(s, x, 1.5, cw, h, `sound ${i + 1}`);
    text(s, t, { x: x + 0.25, y: 1.7, w: cw - 0.5, h: 0.8, fontSize: 19, bold: true, fontFace: "Cambria", color: C.accent1, valign: "top", objectName: `sound ${i + 1} title` });
    text(s, bl.map((b, j) => ({ text: b, options: { bullet: true, breakLine: j < bl.length - 1, paraSpaceAfter: 8 } })), { x: x + 0.25, y: 2.6, w: cw - 0.5, h: h - 1.3, fontSize: 14, color: C.text1, valign: "top", objectName: `sound ${i + 1} list` });
  });
  text(s, "Honest gaps: tested on one product; the market rules are not yet approved by a regulatory person.", { x: M, y: 5.85, w: CW, h: 0.5, fontSize: 16, italic: true, color: C.text1, objectName: "sound note" });
  notes(s, "How do we know it is sound? First, it is tested without the network: 547 backend tests, 403 frontend tests and 7 end-to-end tests, with the AI answers replayed from recordings so every run is the same. Second, two answer keys written before the code, like an exam: 31 known issues in Esko's files, 26 to catch and 5 that must not be flagged, and the expected verdict for each of the 21 rulebook rules. Third, guards at every step: quotes checked by code, every AI answer validated against a schema, and a final guard that re-checks every Fail. Fourth, named tests for the things that matter: no market logic in the engine, an invented rule never fails, the must-not-flag items never produce a Fail. And the honest gaps: one product so far, and the market rules are not yet approved by a regulatory person. (40 s)");
});

// ---- Appendix: how values are compared, matched and located (backup for technical questions)
slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("Numbers compared by value, not spelling", { placeholder: "title" });
  const steps = [["Read", "“15 g”, “1,5 g” and “15G” each become a number and a unit"], ["Convert", "Both sides go to a base unit (g, kJ or ml) with pint, a units library"], ["Different kinds", "Grams against kcal are not compared, so no false conflict"], ["Same kind", "A conflict if they differ by more than 2%"], ["% Daily Value", "Amount ÷ official daily value × 100, within 1 point"]];
  steps.forEach(([t, b], i) => {
    const y = 1.5 + i * 0.98;
    s.addShape(pres.shapes.OVAL, { x: M, y, w: 0.5, h: 0.5, fill: { color: C.accent1 }, line: { type: "none" }, objectName: `value step ${i + 1} badge` });
    text(s, String(i + 1), { x: M, y, w: 0.5, h: 0.5, fontSize: 18, bold: true, color: C.background2, align: "center", valign: "middle", objectName: `value step ${i + 1} number` });
    text(s, [{ text: t, options: { bold: true, fontSize: 19, fontFace: "Cambria", breakLine: true } }, { text: b, options: { fontSize: 15 } }], { x: M + 0.75, y: y - 0.05, w: 6.3, h: 0.9, color: C.text1, valign: "top", objectName: `value step ${i + 1} text` });
  });
  const lx = 7.7, lw = W - M - lx;
  card(s, lx, 1.5, lw, 4.7, "worked example card");
  text(s, "A worked example", { x: lx + 0.3, y: 1.7, w: lw - 0.6, h: 0.45, fontSize: 19, bold: true, fontFace: "Cambria", color: C.accent1, objectName: "example heading" });
  text(s, [
    { text: "Total fat on the carton", options: { fontSize: 14, color: C.text2, breakLine: true } },
    { text: "15 g  ÷  78 g  =  19.2%", options: { fontSize: 22, bold: true, fontFace: "Cambria", breakLine: true, paraSpaceAfter: 10 } },
    { text: "78 g is the daily value from 21 CFR 101.9(c)(9), kept as data in the market pack.", options: { fontSize: 13, color: C.text2, breakLine: true, paraSpaceAfter: 12 } },
    { text: "The label prints 2.2%", options: { fontSize: 14, color: C.text2, breakLine: true } },
    { text: "19.2 against 2.2: outside 1 point", options: { fontSize: 16, bold: true, breakLine: true, paraSpaceAfter: 10 } },
  ], { x: lx + 0.3, y: 2.3, w: lw - 0.6, h: 3.0, color: C.text1, valign: "top", objectName: "example working" });
  chip(s, "fail", lx + 0.3, 5.1, lw - 0.6, 0.9, "with this working line as the proof", 18);
  text(s, "The AI never converts a unit or does a sum. Other checks use their own tolerance: calories 10%, servings 5%.", { x: M, y: 6.55, w: 6.9, h: 0.6, fontSize: 14, italic: true, color: C.text2, valign: "top", objectName: "value note" });
  notes(s, "BACKUP for 'how do you compare two values?' The AI never converts a unit or does a sum. pint is a units library: it knows ounces from grams and refuses to compare grams with calories, which is why we never raise a false conflict between a weight and an energy value. Two values of the same kind are converted to a base unit and compared with a 2 percent relative tolerance, so 480 g and 16.93 oz match. For percent daily value, the amount is divided by the official daily value from the market pack and compared with the printed percent within one point. Honest limits: the tolerances are product defaults, not regulation; two printed percentages from two files are compared exactly; we do not model FDA rounding rules; a value like '2 x 40 g' is not parsed, so it goes to a person instead of passing.");
});
slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("When we match exactly, and when we don’t", { placeholder: "title" });
  const rows = [
    ["Numbers and units", "By value after conversion, never fuzzy", "“8 g” must never match “18 g”"],
    ["A quote with digits", "Must appear exactly; case, spacing and letter-spacing ignored", "A number can’t come from another label"],
    ["A quote with no digits", "Fuzzy: score 92 or more, 12+ characters", "Forgives a typo or a reading slip"],
    ["Ingredient lists", "Names made singular, then compared; only words like dried, organic, roasted are ignored", "“Blueberries” = “Dried blueberries”; “Sugar” ≠ “Coconut sugar”"],
    ["Rule to field", "Word and fuzzy match (90 for names, 80 for pack items), to find which field a rule means", "Matching finds; it never decides a Fail"],
  ];
  const hdr = (t) => ({ text: t, options: { bold: true, color: C.background2, fill: { color: C.accent5 }, fontSize: 15, fontFace: "Cambria", valign: "middle" } });
  const cell = (t, b) => ({ text: t, options: { color: C.text1, fontSize: 14, bold: !!b, valign: "middle", fill: { color: C.background2 } } });
  s.addTable([[hdr("What"), hdr("How"), hdr("Why")], ...rows.map(([a, b, c]) => [cell(a, true), cell(b), cell(c)])],
    { x: M, y: 1.4, w: CW, colW: [2.7, 5.1, CW - 7.8], border: { type: "solid", color: HEX.accent6, pt: 1 }, rowH: [0.42, ...rows.map(() => 0.85)], margin: [0.05, 0.12, 0.05, 0.12], objectName: "matching table" });
  text(s, "Fuzzy matching locates; it never decides. A Fail still needs a code-checked quote and a rule.", { x: M, y: 6.25, w: CW, h: 0.5, fontSize: 17, bold: true, fontFace: "Cambria", color: C.accent1, valign: "top", objectName: "matching takeaway" });
  text(s, "Limits: the descriptor words and unit words are a fixed English list; “Sodium” and “Salt” are different nutrients; the thresholds are tuned defaults.", { x: M, y: 6.85, w: CW, h: 0.4, fontSize: 12, color: C.text2, valign: "top", objectName: "matching limits" });
  notes(s, "BACKUP for 'are you comparing tokens or exact spelling?' Four methods, chosen on purpose. Values are compared by number after unit conversion. A quote that contains digits must appear exactly in the source text, after ignoring case, spacing and letter spacing, so a number can never come from the wrong label. Only quotes with no digits get fuzzy matching, to forgive a small reading slip. Ingredient lists are compared name by name after making them singular; only a short fixed list of descriptor words such as dried or organic is ignored, so blueberries matches dried blueberries but sugar does not match coconut sugar. Finally, to find which field a rule is talking about we use word and fuzzy matching, but that only locates a field. It never decides a Fail.");
});
slides.push(() => {
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("Every fact points back to a box on the artwork", { placeholder: "title" });
  const steps = [["Code reads every text piece", "With its page, panel and position in mm. Letter-spaced text is rebuilt."], ["Panels come from the dieline", "Closed outlines on the artwork-panel layer, named from the printed labels"], ["The AI returns a fact", "A value, a quote, and the pieces it read from"], ["Code finds the quote in those pieces", "Wrapped lines are covered; a wrong panel never confirms"], ["The box is the union of the pieces", "Drawn on the carton in the app. Hidden and guide text never counts."]];
  steps.forEach(([t, b], i) => {
    const y = 1.5 + i * 0.98;
    s.addShape(pres.shapes.OVAL, { x: M, y, w: 0.5, h: 0.5, fill: { color: C.accent1 }, line: { type: "none" }, objectName: `locate step ${i + 1} badge` });
    text(s, String(i + 1), { x: M, y, w: 0.5, h: 0.5, fontSize: 18, bold: true, color: C.background2, align: "center", valign: "middle", objectName: `locate step ${i + 1} number` });
    text(s, [{ text: t, options: { bold: true, fontSize: 19, fontFace: "Cambria", breakLine: true } }, { text: b, options: { fontSize: 15 } }], { x: M + 0.75, y: y - 0.05, w: 6.3, h: 0.9, color: C.text1, valign: "top", objectName: `locate step ${i + 1} text` });
  });
  const lx = 7.7, lw = W - M - lx;
  card(s, lx, 1.5, lw, 4.7, "locate limits card");
  text(s, "Limits", { x: lx + 0.3, y: 1.7, w: lw - 0.6, h: 0.45, fontSize: 19, bold: true, fontFace: "Cambria", color: C.accent3, objectName: "locate limits heading" });
  const lim = ["Text that is only a picture has nothing to check a quote against: the fact stays AI-suggested until the sheet says the same", "A fact read by the AI cannot be placed by the AI: the position always comes from code", "A PDF with no panel layer falls back to the printed panel labels, so positions are less precise"];
  text(s, lim.map((t, i) => ({ text: t, options: { bullet: true, breakLine: i < lim.length - 1, paraSpaceAfter: 10 } })), { x: lx + 0.3, y: 2.3, w: lw - 0.6, h: 3.8, fontSize: 14, color: C.text1, valign: "top", objectName: "locate limits list" });
  text(s, "The AI never invents a location.", { x: M, y: 6.55, w: 6.9, h: 0.5, fontSize: 15, italic: true, color: C.text2, objectName: "locate note" });
  notes(s, "BACKUP for 'how do you know where the ingredients are on the artwork?' The code reads every piece of text from the PDF with its page, panel and position in millimetres. The panels come from the dieline's own outlines. The AI returns a fact with a quote and the pieces it read from; code then finds the quote in those pieces, including the next line on the same panel for wrapped text, and the fact's location is the combined box of the matched pieces. If the AI cites the wrong panel, the quote does not confirm. If a mark is only an image, the fact stays AI-suggested until the sheet states the same value.");
});

slides.push(() => { // 23: updating a file
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("Update a file: read only what changed", { placeholder: "title" });
  const steps = [["Compare", "The new file against the version the last run read: cell by cell for a sheet, panel by panel (text and picture) for a carton"], ["Keep", "Facts from everything that did not change stay, and their quotes are checked against the new file again by code"], ["Read", "Only the changed cells or panels go to the AI"], ["Replay", "Your decisions are kept where the finding is the same, and handed back where it changed"]];
  steps.forEach(([t, b], i) => {
    const y = 1.5 + i * 1.2;
    s.addShape(pres.shapes.OVAL, { x: M, y, w: 0.5, h: 0.5, fill: { color: C.accent1 }, line: { type: "none" }, objectName: `update step ${i + 1} badge` });
    text(s, String(i + 1), { x: M, y, w: 0.5, h: 0.5, fontSize: 18, bold: true, color: C.background2, align: "center", valign: "middle", objectName: `update step ${i + 1} number` });
    text(s, [{ text: t, options: { bold: true, fontSize: 19, fontFace: "Cambria", breakLine: true } }, { text: b, options: { fontSize: 15 } }], { x: M + 0.75, y: y - 0.05, w: 6.2, h: 1.1, color: C.text1, valign: "top", objectName: `update step ${i + 1} text` });
  });
  const lx = 7.7, lw = W - M - lx;
  card(s, lx, 1.5, lw, 4.7, "saving card");
  text(s, "One cell edited (Honey 9% \u2192 1%)", { x: lx + 0.3, y: 1.7, w: lw - 0.6, h: 0.45, fontSize: 18, bold: true, fontFace: "Cambria", color: C.accent1, objectName: "saving heading" });
  text(s, "86%", { x: lx + 0.3, y: 2.25, w: lw - 0.6, h: 1.1, fontSize: 66, bold: true, fontFace: "Cambria", color: C.accent4, objectName: "saving figure" });
  text(s, "fewer tokens to read the content sheet again (79\u201387% whichever cell is edited)", { x: lx + 0.3, y: 3.4, w: lw - 0.6, h: 0.7, fontSize: 15, color: C.text1, valign: "top", objectName: "saving figure note" });
  text(s, [
    { text: "Carton, one text panel changed: 74\u201387% fewer", options: { bullet: true, breakLine: true, paraSpaceAfter: 4 } },
    { text: "Carton unchanged: 0 tokens, 11 pictures not sent", options: { bullet: true, breakLine: true, paraSpaceAfter: 4 } },
    { text: "Whole update run: about 55\u201370% fewer", options: { bullet: true } },
  ], { x: lx + 0.3, y: 4.2, w: lw - 0.6, h: 1.4, fontSize: 14, color: C.text1, valign: "top", objectName: "saving list" });
  text(s, "Estimates: characters \u00f7 4, on the real prompts and demo files. The meaning and wording calls still run.", { x: lx + 0.3, y: 5.55, w: lw - 0.6, h: 0.55, fontSize: 11, italic: true, color: C.text2, valign: "top", objectName: "saving note" });
  text(s, "The AI is never asked what changed. Code compares, and code re-checks every reused quote.", { x: M, y: 6.55, w: 6.9, h: 0.5, fontSize: 15, italic: true, color: C.text2, objectName: "update note" });
  notes(s, "This is the part we think is new. When a file is updated, we do not read the whole thing again. Code compares the new version with the one the last run read: cell by cell for a sheet, panel by panel for a carton, and for a carton a panel counts as changed if its text or its picture changed. Facts from everything that did not change are kept, and their quotes are checked against the new file again by code, so nothing is trusted just because it was read before. Only the changed cells or panels are sent to the AI. On the demo, editing one cell of the content sheet sends about 14 percent of the tokens: 86 percent fewer, and between 79 and 87 percent whichever cell it is. One changed carton panel is 74 to 87 percent fewer; an unchanged carton costs nothing and none of its 11 pictures are sent. Honest figure for the whole update run: about 55 to 70 percent fewer, because the meaning-conflict and question-wording calls still run; making those incremental too is the next step. These are estimates, characters divided by four, on the real prompts and the real demo files; backend/scripts/measure_delta.py reproduces them. Your earlier decisions are kept where the finding is the same and handed back where it changed.");
});
slides.push(() => { // 24: version history
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("Version history, with every change", { placeholder: "title" });
  const pts = [["Every version", "Who changed it and when, and how the verdicts moved"], ["In the file", "The numbers that changed come first: Honey 9% \u2192 1%"], ["In the checks", "2 fixed, 2 changed, 0 new, each listed by name"], ["Your decisions", "Kept where they still apply; one handed back, never resolved silently"]];
  pts.forEach(([a, b], i) => {
    const y = 1.55 + i * 1.15;
    text(s, [{ text: a, options: { bold: true, fontSize: 19, fontFace: "Cambria", color: C.accent1, breakLine: true } }, { text: b, options: { fontSize: 15 } }], { x: M, y, w: 4.4, h: 1.05, color: C.text1, valign: "top", objectName: `history point ${i + 1}` });
  });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: 5.3, y: 1.45, w: W - M - 5.3, h: 5.4, rectRadius: 0.12, fill: { color: C.background2 }, line: { color: C.accent6, width: 1 }, objectName: "image frame" });
  s.addImage({ path: img("assets/versions-changes.png"), x: 5.4, y: 1.55, w: W - M - 5.5, h: 5.2, sizing: { type: "contain", w: W - M - 5.5, h: 5.2 }, altText: "The What changed screen: three versions, what was fixed, and a decision handed back", objectName: "IMAGE what changed (replace)" });
  notes(s, "This is the second demo: Load demo, version history. It shows a content sheet corrected twice, so there are three versions. Every version has who and when and how the verdicts moved. In the file, the numbers that changed come first. In the checks, what was fixed. And your earlier decisions: this one was kept, and this one was handed back to a person because the finding it was about changed. The three sheet files and the text that changed between them are real; which findings move is staged from the real first check, and the screen says so. To do it live, use Update this file on the Files screen.");
});
slides.push(() => { // 25: token savings, measured
  const s = pres.addSlide({ masterName: "LIGHT", sectionTitle: SECTION });
  s.addText("Token savings, measured", { placeholder: "title" });
  const rows = [["Content sheet: 1 cell changed", "4.2k", "0.6k", "86%  (79\u201387%)"], ["Content sheet: 5 cells changed", "4.2k", "0.8k", "81%"], ["Content sheet: 20 cells changed", "4.2k", "1.7k", "60%"], ["Content sheet: everything changed", "4.2k", "4.1k", "3%"], ["Carton: 1 text panel changed", "7.0k\u201316.5k", "1.1k\u20133.4k", "74\u201387%"], ["Carton: nothing changed", "11 pictures", "0", "100%"], ["A whole update run (one cell edited)", "21k\u201331k", "about 10k", "55\u201370%"]];
  const hdr = (t) => ({ text: t, options: { bold: true, color: C.background2, fill: { color: C.accent5 }, fontSize: 15, fontFace: "Cambria", valign: "middle" } });
  const cell = (t, b) => ({ text: t, options: { color: C.text1, fontSize: 14, bold: !!b, valign: "middle", fill: { color: C.background2 } } });
  s.addTable([[hdr("Update"), hdr("Full read"), hdr("Changed only"), hdr("Fewer tokens")], ...rows.map(([a, b, c, d]) => [cell(a, true), cell(b), cell(c), cell(d, true)])],
    { x: M, y: 1.4, w: CW, colW: [5.2, 2.2, 2.2, CW - 9.6], border: { type: "solid", color: HEX.accent6, pt: 1 }, rowH: [0.42, ...rows.map(() => 0.6)], margin: [0.05, 0.12, 0.05, 0.12], objectName: "token savings table" });
  text(s, "Estimates: characters \u00f7 4 on the real prompts and demo files; a panel picture counts 255\u20131,118 tokens. Every cell is tried as the edit; the figure is the mean. The meaning-conflict and question-wording calls still run on every update (making them incremental is next). Reproduce: backend/scripts/measure_delta.py.", { x: M, y: 6.1, w: CW, h: 0.9, fontSize: 12, italic: true, color: C.text2, valign: "top", objectName: "token savings note" });
  notes(s, "The measurement behind the update slide. Real prompts, real demo files, no AI calls. The saving is large for a small edit and shrinks as more of the file changes, down to about nothing if everything changed, which is as it should be. For the whole run it is about 55 to 70 percent, because two calls still run in full.");
});

// Part 1 is the product, as a user sees it: title, problem, solution, LIVE DEMO.
// Part 2 goes under the hood: principles, how it works, the kinds of rule, the AI scans, the code checks,
// the carton's edges and folds, how we know it is sound, scale and limits, close.
// Appendix: kept for questions.
const ORDER = [
  ["Part 1: The product", [0, 1, 2, 5]],
  ["Part 2: Under the hood", [17, 12, 3, 18, 23, 24, 13, 14, 15, 19, 6, 7]],
  ["Appendix", [4, 16, 8, 20, 21, 22, 25, 9, 10, 11]],
];
ORDER.forEach(([title, idx]) => {
  SECTION = title;
  pres.addSection({ title });
  idx.forEach((k) => slides[k]());
});

(async () => {
  const out = path.join(__dirname, "BriefForge.pptx");
  await pres.writeFile({ fileName: out });
  await applyTheme(out, THEME);
  console.log("wrote", out);
})();
