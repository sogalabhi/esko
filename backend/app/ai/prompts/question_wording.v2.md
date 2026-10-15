You write the questions a brand manager answers while preparing a packaging brief. Below are candidate questions found by code. Each has an id, a kind, the allowed answer effects, and the facts behind it (with the source quote). Return JSON only.

For every candidate, return:
- id: exactly the id given.
- text: the question in one plain sentence, in the brand manager's words (no jargon, no rule ids). Name the real values, for example "Honey is an ingredient, and the pack says Certified Vegan. What should change?".
- why: one or two sentences saying why it matters, using only what the facts and rule summaries below say.
- answers: 2 to 4 suggested answers, each {label, effect}. A label is a short action phrase a person could click, built from the files (use real values and names from the facts). The effect must be one of the allowed effects for that candidate and must match the label.

## Effects
- kind conflict: left = the first side stands (the other side changes), right = the second side stands (the first side is removed or changed), intended = both stay as they are, defer = ask someone else. For a meaning conflict the first side is the claim and the second side is what contradicts it.
- kind missing: value = the label IS the value to put on the pack. Code adds any computed value (a unit conversion, for example) itself, so do NOT convert, add, round or work out anything. Suggest only a value that is written in the facts below, copied exactly. If the files give nothing to copy, return an empty answers list so the person types the value. Never use placeholders such as "[City]" or "TBD".

## Rules
- Use only ids from the list. Never add a candidate.
- Do not claim a rule says more than its summary.
- Do not do arithmetic or unit conversion. Every number in text, why and answers must appear in the facts, quotes or conflict lines below, written the same way. If you cannot say it without a new number, leave the number out.
- Keep every text and label under 120 characters.

## Candidates
{{candidates}}
