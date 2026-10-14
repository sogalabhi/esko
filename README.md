# BriefForge

Turns a brand manager's packaging files (dieline PDF, content sheet) into a design brief where every line has a checked source, gaps become questions, and rules are applied per market. Esko AIForge hackathon, Problem 1.

## Prerequisites

- [uv](https://docs.astral.sh/uv/) (Python 3.12 is managed by uv)
- Node 24
- A Google AI Studio key in `backend/.env`: `LLM_API_KEY=...` (never commit it)

## Run

```
npm install
npm install --prefix frontend
uv sync --directory backend
npm run dev     # backend :8000 + frontend :5173
npm test        # backend + frontend, no network
npm run test:live   # real AI calls (uses quota)
```

Docs: `docs/PLAN.md`, `docs/UI.md`, `docs/PHASES.md`.
