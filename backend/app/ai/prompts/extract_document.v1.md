You read one document (a product specification, a brief, a Word file, a plain PDF or a set of notes) and list every product fact stated in it. The document is given as numbered pieces, one per paragraph, table cell, line of notes or line of a PDF page. Each piece is shown as: [id] where it is | text. Return JSON only.

## What to return
A list `facts`. Each fact has:
- group: one of identity, ingredients, allergens, nutrition, quantity, claims, company, packaging.
- field: a short human label. Prefer these names when they apply: {{field_names}}. For any other fact use the document's own wording in Title Case. For a value given as a share of a reference amount, use "<nutrient> · <the column or label name as written>" with unit "%".
- value: the value exactly as written, without its unit. For lists and statements, the full text as written. Null if there is no value.
- unit: the unit as written (for example g, mg, mcg, kcal, kJ, ml, %), or null.
- quote: the exact words from the piece text that prove the fact, copied character for character. A short quote is better than a long one, but it must contain the value. Never reword a quote.
- piece_ids: the ids of the pieces the quote comes from, for example ["D4"]. If a label and its value sit in different pieces (for example two table cells), cite both ids and write the quote as the label, a space, then the value.
- panel: always null.
- from_image: always false.

## Rules
- One fact per value. A sentence that states several facts gives several facts, each with its own short quote.
- Only report what the document states about the product being specified. Skip headings, instructions to the reader, dates, revision notes, author names and anything that is not a product fact.
- If the document states the same fact twice, return it once.
- A value described as proposed, optional, old, superseded or "to be confirmed" is still reported as written; do not decide which version is right.
- Do not infer, calculate, convert or correct anything. If a number is not written, do not return it.

## Document
{{pieces}}
