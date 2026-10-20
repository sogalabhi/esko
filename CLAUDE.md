# BriefForge

Checks finished packaging artwork against the approved product information and a rulebook (official regulations and the company's own rules), and says what is correct, what is wrong and what needs a person, with the evidence for each. Esko AIForge hackathon, **Problem 2** ("Is this packaging artwork ready to launch?"). The project started as Problem 1 (a design brief) and pivoted on 20 Oct; the brief code is kept but off the routes.

- Current plan: `docs/PHASES.md`, "Problem 2 pivot" (P2 phases). `docs/PLAN.md` and `docs/UI.md` still describe the Problem 1 product; their engine, evidence and market-pack sections still apply.
- Demo data: `samples/` (Esko's Dancing Fish Granola Berry Crunch: the US carton is the finished artwork, the content sheet is the approved information) and `rulebooks/` (our own company rulebook; edit the YAML, rebuild with `backend/scripts/build_rulebook.py`)

## Non-negotiables

1. Every fact needs a source and a quote checked by code. Unchecked = AI-suggested, never confirmed.
2. No finding without evidence: a Fail cites a rule and code-checked evidence; anything resting on AI judgement is Needs review, never Fail. Rules read from a user's rulebook are quote-checked too.
3. Rules are data in `markets/<market>/`, never hard-coded. Nothing market-specific in engine code (no FDA values, units, currencies or `if market == ...` in `backend/app/`).
4. Conflicts are never resolved silently; a person decides and it's logged.
5. Code does math, units, rules, geometry. AI does reading, meaning, wording. AI output is validated against a Pydantic schema.
6. No chat-first screens.

## Layout

```
backend/    FastAPI app (Python 3.12 via uv) — app/, tests/{unit,integration,live,fixtures}
frontend/   React + TypeScript (Vite), Tailwind
markets/    us/, in/, company/ — market packs (YAML)
samples/    Esko sample files (read-only)
rulebooks/  our demo company rulebook (YAML source, generated .docx and .pdf)
e2e/        Playwright specs
docs/       PLAN, UI, PHASES
```

## Run and test

- `npm run dev` — backend + frontend
- `npm test` — backend unit + integration, frontend unit (no network)
- `npm run test:e2e` — Playwright
- `npm run test:live` / `npm run test:record` — real AI calls (use quota)

## Working rules

- Agents live in `.claude/agents/` (who owns what, and at which model and effort: `docs/PHASES.md`, "Who builds what"). Hand-offs are precise briefs: phase, files, tests to make green.
- One phase per session. Propose a plan for the phase before writing code; finish with the checkpoint gate in `docs/PHASES.md`, then commit `phase N: ...` and tag `p2-phase-N` (P2 numbering; Problem 1 used `phase-N`).
- Tests never call the network; AI goes through the fake adapter replaying `backend/tests/fixtures/ai/`.
- AI cache key = file fingerprint + prompt version + model. Bump the prompt version when a prompt changes.
- Secrets live in `backend/.env` (gitignored). Never print or commit them.
- Sample PDF gotchas: switching layers off doesn't remove guide text; an EU nutrition table is hidden under the US panel; certification marks are images; nutrition text is letter-spaced.
