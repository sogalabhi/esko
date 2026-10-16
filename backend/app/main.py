from fastapi import FastAPI

from .routers import answers, conflicts, files, project, questions
from .settings import get_settings

app = FastAPI(title="BriefForge")
app.include_router(files.router)
app.include_router(project.router)
app.include_router(answers.router)
app.include_router(questions.router)
app.include_router(conflicts.router)


@app.get("/api/health")
def health() -> dict:
    s = get_settings()
    return {
        "status": "ok",
        "ai": {"provider": s.llm_provider, "model": s.llm_model, "keySet": s.llm_api_key is not None},
    }
