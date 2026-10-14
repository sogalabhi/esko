from fastapi import FastAPI

from .routers import files
from .settings import get_settings

app = FastAPI(title="BriefForge")
app.include_router(files.router)


@app.get("/api/health")
def health() -> dict:
    s = get_settings()
    return {
        "status": "ok",
        "ai": {"provider": s.llm_provider, "model": s.llm_model, "keySet": s.llm_api_key is not None},
    }
