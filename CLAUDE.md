# BriefForge

Turns a brand manager's packaging files (dieline PDF, content sheet) into a design brief where every line has a checked source, gaps become questions, and rules are applied per market. Esko AIForge hackathon, Problem 1.

- Product spec: `docs/PLAN.md` · UI spec: `docs/UI.md` · Build phases and tests: `docs/PHASES.md`
- Demo data: `samples/` (Esko's Dancing Fish Granola Berry Crunch, US carton + content sheet)

## Non-negotiables

1. Every fact needs a source and a quote checked by code. Unchecked = AI-suggested, never confirmed.
2. Nothing reaches the brief without passing the audit (every number and claim maps to a fact ID).
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
- One phase per session. Propose a plan for the phase before writing code; finish with the checkpoint gate in `docs/PHASES.md`, then commit `phase N: ...` and tag `phase-N`.
- Tests never call the network; AI goes through the fake adapter replaying `backend/tests/fixtures/ai/`.
- AI cache key = file fingerprint + prompt version + model. Bump the prompt version when a prompt changes.
- Secrets live in `backend/.env` (gitignored). Never print or commit them.
- Sample PDF gotchas: switching layers off doesn't remove guide text; an EU nutrition table is hidden under the US panel; certification marks are images; nutrition text is letter-spaced.
