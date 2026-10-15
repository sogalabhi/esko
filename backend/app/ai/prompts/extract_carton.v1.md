You read the text of one packaging artwork (a carton dieline) and list every printed fact on it. You are given, for each panel, the text pieces found in the PDF (each with an id) and, as images in the same order, a picture of each main panel. Return JSON only.

## What to return
A list `facts`. Each fact has:
- group: one of identity, ingredients, allergens, nutrition, quantity, claims, company, packaging.
- field: a short human label. Use the printed wording in Title Case. Prefer these names when they apply: Product name, Brand, Statement of identity, Marketing copy, Ingredient list, Allergen statement, Dietary statement, Storage instructions, Net quantity, Servings per container, Serving size, Calories, Total Fat, Saturated Fat, Trans Fat, Cholesterol, Sodium, Total Carbohydrate, Dietary Fiber, Total Sugars, Incl. Added Sugars, Protein, Vitamin D, Calcium, Iron, Potassium, Claim, Certification mark, Recycling mark, Manufacturer, Barcode. For the percent daily value printed next to a nutrient use "<nutrient> · % Daily Value" (for example "Sodium · % Daily Value") with unit "%".
- value: the value exactly as printed, without its unit. For lists and statements, the full text as printed. Null if there is no value (a mark).
- unit: the unit as printed (g, mg, mcg, kcal, kJ, %, oz), or null.
- quote: the exact words from the artwork that prove the fact, copied character for character from the piece text. A short quote is better than a long one, but it must contain the value. Never reword a quote.
- piece_ids: the ids of the pieces the quote comes from (for example ["P12"] or ["P12","P13"] if the quote wraps over two pieces).
- panel: the name of the panel the pieces are on (as written in the panel heading).
- from_image: false for text taken from pieces. true only for something you can see in a panel image but that is not in the piece text (certification marks, logos, recycling marks, icons whose text is missing). For those, piece_ids is empty, quote is the words printed on the mark (or a two-word description if it has none), and panel is the panel in the image.

## Rules
- One fact per value. A nutrition table row with an amount and a percent gives two facts.
- Take every line of the nutrition table, the ingredient list, the allergen statement, the claims, storage text, the maker and the net quantity.
- The back panel may show small fragmented energy and reference-intake icons (calories, fat, saturates, sugars, salt with kJ, kcal, g and percent values). Report each as group nutrition, field "Reference-intake icon · <name>" (for example "Reference-intake icon · Salt"), value as printed (for example "0.4g 10%"), citing the pieces involved.
- Marks in the images, such as Certified Vegan, USDA Organic, and recycling marks, are facts with from_image true (group claims, field "Certification mark" or "Recycling mark", value the mark name).
- Do not invent text. If a number is not printed, do not return it. Do not infer, calculate or correct anything.
- Ignore barcodes' digits unless printed as text. Do not return empty facts.
- Return each fact once, even if the text is repeated.

## Artwork
{{artwork}}
