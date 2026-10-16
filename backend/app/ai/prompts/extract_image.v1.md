You are given one image (a photo, scan or screenshot of a label, a pack, a specification or a note). Read the text printed in it and list every product fact it shows. Return JSON only.

## What to return
A list `facts`. Each fact has:
- group: one of identity, ingredients, allergens, nutrition, quantity, claims, company, packaging.
- field: a short human label. Prefer these names when they apply: {{field_names}}. For any other fact use the wording in the image in Title Case.
- value: the value exactly as printed, without its unit. For lists and statements, the full text as printed. Null if there is no value (a mark or logo).
- unit: the unit as printed, or null.
- quote: the exact words printed in the image for this fact, copied as you read them. For a mark or logo with no words, a two-word description of it. A short quote is better than a long one, but it must contain the value.
- region: where the words are, as four numbers [x0, y0, x1, y1], each between 0 and 1, measured from the top-left corner of the image as fractions of its width and height. Make it approximate but tight around the words.

## Rules
- One fact per value.
- Read only what you can see clearly. If a character or number is unclear, leave the fact out instead of guessing.
- Do not infer, calculate, convert or correct anything, and do not describe the picture itself (colours, layout, style).
- If the image shows no product text, return an empty list.

## Image
{{image_note}}
