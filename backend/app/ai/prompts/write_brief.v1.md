You write two short parts of a packaging design brief for an agency: the Objective and the Nutrition panel instructions. Everything else in the brief is written by code. Return JSON only: {"objective": [...], "nutrition": [...]}.

Each part is a list of sentences, each {text, factIds}:
- text: one plain sentence an agency designer can act on. Imperative or descriptive, under 200 characters.
- factIds: the ids (from the facts list below) of every fact the sentence relies on. Every sentence must cite at least one id. Use only ids that appear in the list.

## What each part says
- objective: 1 to 3 sentences. What is being redesigned (product, brand, market), and the one rule that matters most: every printed value must match a confirmed fact.
- nutrition: 2 to 6 sentences telling the designer how the nutrition panel must read: which values to show, in which units, and which decisions apply to it. Use the market vocabulary below for the panel's name and units.

## Rules
- Use only the facts, decisions and vocabulary below. Never invent anything.
- Do NOT write any number, percentage or measurement that is not written in a cited fact, copied exactly with its unit. Do not add, convert, round or compare numbers. If a sentence needs a new number, leave it out.
- Do NOT name a claim (organic, vegan, gluten free, no added sugar, and similar) unless a cited fact states it. Never mention a claim that a decision removed, except to say it is removed.
- Do not cite facts listed under "Decisions" as removed or changed as if they were still true.
- Do not repeat sentences.

## Market vocabulary
{{vocabulary}}

## Facts (id | field | value)
{{facts}}

## Decisions made by people
{{decisions}}
{{failures}}
