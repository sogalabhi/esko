You read a company rulebook (a Word file, a PDF or plain text) and turn it into one record per rule. The rulebook is given as numbered pieces, one per paragraph, table cell or line. Each piece is shown as: [id] where it is | text. Return JSON only.

## What to return
A list `rules`. Each rule has:
- id: the rule's identifier exactly as printed in the document, for example "DF-04". If a rule has no printed identifier, use "R" and its running number in the order of the document (R1, R2, ...).
- title: the rule's short name as printed (for example "Net quantity"). Without the id.
- status: "in_force" or "proposed". Use "proposed" only when the document says the rule is Proposed (or draft, planned, guidance only, not yet applied). Every other rule is "in_force". Copy what the document says; do not decide it yourself.
- text: the rule itself, as one sentence or short paragraph copied from the document. Leave out a label such as "Rule:".
- quote: the exact words from the piece text that state the rule, copied character for character. Quote the rule text exactly; never reword, shorten with "...", fix spelling or change numbers or punctuation. It is normally the same as `text`.
- piece_ids: the ids of the pieces the quote comes from, for example ["D22"]. Also add the id of the piece that holds the rule's heading (id and title) and the piece that holds its status, when they are separate pieces.
- check_type: your best guess of how software could check the rule on a finished pack. Exactly one of:
  - present: a named item or wording must appear (for example "storage instructions must appear on the back panel").
  - absent: a named word, element or kind of content must not appear anywhere.
  - exact: a value or wording must match approved information, or a given format, word for word.
  - size: a measured size must meet a limit (a font size, an area, a height).
  - word_list: a list of allowed or banned words, spellings or claims that must or must not be used.
  - evidence_on_file: a claim is allowed only if a certificate, report or approval is on file, which the artwork cannot show.
  - unsupported: none of the above fits, or the rule needs judgement, a calculation across several fields, or something no listed type describes. Use this when unsure.

## Rules for you
- One record per rule. A rule with several sentences is still one record. Do not split one rule into several, and do not merge two rules.
- Never invent a rule. Only return rules that are written in the document. Do not turn definitions, introductions, "why" notes, change logs, headers or document metadata into rules. Do not add rules that the regulations would suggest but the document does not state.
- Return the rules in the order of the document.
- Rules that are marked Proposed are returned too, with status "proposed".
- Do not interpret, correct, calculate or combine anything.

## Rulebook
{{pieces}}
