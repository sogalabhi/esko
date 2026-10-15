You check a packaging brief's facts for contradictions of meaning that a number comparison cannot find. Each fact below has an id, the file it comes from, its group, its field and its value. Return JSON only.

Find places where two or more facts cannot all be true or cannot all be said together. Examples of the kind of contradiction to look for: a dietary, ethical, health or origin claim that an ingredient or a nutrient value contradicts; a claim that one fact makes and another fact denies; a statement that is wrong given the ingredients.

## What to return
A list `conflicts`. Each conflict has:
- claim_fact_ids: ids of the fact(s) that make the claim (at least one).
- against_fact_ids: ids of the fact(s) that contradict it (at least one).
- claim: the claim in a short phrase.
- against: what contradicts it, in a short phrase.
- explanation: one or two plain sentences for a brand manager saying what clashes and why.
- severity: high (legal or safety risk or a false claim), medium, or low.
- owner: legal (claims, allergens, mandatory text), rnd (ingredients, nutrition), or brand (names, wording, imagery).

## Rules
- Use only fact ids from the list. Never invent an id.
- Do not report differences between the two files for the same field (those are found elsewhere), and do not report arithmetic.
- Report only real contradictions, not things that are merely incomplete. Return an empty list if there are none.

## Facts
{{facts}}
