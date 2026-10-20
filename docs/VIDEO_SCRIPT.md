# Demo video script (about 4 minutes)

What the judges should remember: **it checks finished artwork against the approved information and a rulebook, every finding shows its evidence, code proves the Fails, and a person decides the rest.**

## Before recording

- [ ] `npm run dev`, open http://localhost:5173 in a clean browser window at 1280 × 800 or larger, zoom 100%.
- [ ] Files → **Load demo** once, so the carton image is cached (it draws in about 2 s the first time).
- [ ] Then **Reset demo**, and Load demo again, so no review item is decided yet.
- [ ] If the Gemini key is set and the AI responses were re-recorded, keep scene 7 (Ask). If not, skip it: the stand-in answer is refused.
- [ ] Close other tabs and notifications. Record the screen at 1080p; record the voice separately if you can.
- [ ] Have `rulebooks/Dancing_Fish_US_Label_Rulebook.docx` open in Word or a PDF viewer for scene 4.

The numbers below are what the demo shows: **29 fail · 11 review · 7 pass · 2 checked and fine**, 21 rules in the rulebook.

---

## 1. The problem (0:00–0:20)

**Screen:** the carton PDF full screen (or the Files screen with the carton thumbnail).

**Say:**
> Before a pack goes to print, someone has to check the artwork line by line: is every required statement there, does the text match the approved product information, are the numbers right, does it follow the rules for the country? It's slow, and one missed line means a reprint or a recall.

## 2. Drop the files (0:20–0:40)

**Screen:** Files. Point at the three files: the carton (artwork), the content sheet (approved information), the rulebook.

**Say:**
> We give it three things: the finished carton from the agency, the approved content sheet, and the company's rulebook. It reads the artwork the way a printer does — every piece of text with its panel and its position in millimetres.

**Point at:** "Ignored 33 guide pieces" and "Hidden text on Left — 10 lines covered by an opaque fill".

> It already noticed two things a vision model would get wrong: dieline guide text that isn't copy, and an old EU nutrition table hidden under the US panel.

## 3. The verdict (0:40–1:00)

**Screen:** click **Checks**. Hold on the top bar: **Not ready to print: 29 fail · 11 review**.

**Say:**
> The answer up front: not ready to print. Every result is one of three things. Fail — code proved it against a rule. Needs review — it rests on judgement or on evidence the artwork can't show, so a person decides. Pass — the rule is met, and it says where.

## 4. A Fail you can trust (1:00–1:45)

**Screen:** scroll to the honey mismatch card (Honey 9% vs 1%). Show the two evidence crops side by side: the sheet cell B26 and the carton crop with the blue box.

**Say:**
> Honey: 9% on the approved sheet, 1% on the carton. Here are both sources — the exact cell, and the exact spot on the carton. "Quote checked by code" means the AI found it, but code confirmed the words are really there.

**Screen:** scroll to **Total Fat % Daily Value** card. Point at the proof line.

> And here the code does the maths: 15 grams against a daily value of 78 is 19%. The carton prints 2.2%. The AI doesn't do arithmetic here — code does, and shows its working.

## 5. The company's own rules (1:45–2:20)

**Screen:** **Rules**. Scroll to the rulebook section: "21 rules read · 20 verified · 1 proposed". Open DF-16.

**Say:**
> The company's rulebook is just a Word file. The AI reads it into rules — and code checks that every rule's wording is really in the document, so the AI can't invent a rule. This one is still a proposal, so it's never applied.

**Screen:** click DF-16's finding link → the **"GMO free" banned wording** Fail on Checks. Then show DF-18: "Storage instructions set below 6 pt".

> Rule DF-16 bans "GMO free" — found twice on the carton. DF-18 says mandatory text must be at least 6 point — the storage instructions are 5.8. That comes straight from the font sizes in the PDF.

## 6. What it didn't flag, and the hidden table (2:20–2:45)

**Screen:** filter **Checked and fine**.

**Say:**
> Avoiding false alarms matters as much as catching errors. These were checked and are fine, with the proof: the barcode check digit is valid; 33 pieces of dieline guide text were ignored.

**Screen:** the hidden-text Fail card → **Show on artwork**.

> And the hidden EU table: it isn't read as product facts, but it's a Fail under the company rule, because hidden copy can print if a layer moves at the printer.

## 7. Ask about a finding (2:45–3:05) — only with real AI responses

**Screen:** on a Fail card, **Ask about this finding**: "What should the agency change?"

**Say:**
> You can ask about any finding. The answer may only use that finding's own rule and evidence — if it points anywhere else, code refuses to show it.

## 8. A person decides (3:05–3:25)

**Screen:** filter **Needs review**. On the **HIGH-GRAIN** card, type a name, choose **It's a problem**. The top bar updates.

**Say:**
> Anything resting on judgement — like whether "High-Grain" is a claim — goes to a person. The decision is logged with their name, and the verdict updates.

## 9. The report (3:25–3:45)

**Screen:** **Report**. Scroll: the verdict, Fail list with crops, the marked-up carton, Rules used, Decisions log, Sign-off. Click **Print report** (cancel the dialog).

**Say:**
> The result is a print-approval report: every finding with its evidence, the marked-up carton, every rule used, every decision and who made it, and a sign-off line.

## 10. Close (3:45–4:00)

**Screen:** Marked-up artwork, full carton with the red pen marks.

**Say:**
> The AI reads, the code proves, a person decides. It runs on Esko's own sample files, and adding a country is a folder of rules, not new code. What it can't catch yet: a wrong sentence with no number or claim word in it, and text inside images.

---

## Editing notes

- Cut every wait; keep each screen on screen long enough to read one line.
- Zoom (in the editor) on: the top-bar verdict, the two honey crops, the % Daily Value proof line, DF-21 "Proposed — not applied", "5.8 pt", the hidden-table mark, the decision appearing.
- Captions for the three verdict words the first time they appear.
- If over time, drop scene 7 first, then shorten scene 6.
