"""FastAPI application: API routes + mounted mock tools + Prometheus endpoint."""

from __future__ import annotations

from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware

from .agent.orchestrator import Orchestrator
from .api.routes import router as api_router
from .config import get_settings
from .db import SessionLocal, init_db
from .observability.logging import configure_logging, get_logger
from .observability.metrics import render_metrics
from .state_store import get_state_store
from .tools.base import ToolClient
from .tools.mock_service import app as mock_tools_app

configure_logging()
logger = get_logger("arra.main")

app_state: dict = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    init_db()
    state_store = get_state_store(settings)
    http = httpx.AsyncClient() if settings.tool_base_url else None
    tool_client = ToolClient(settings, http)
    app_state["orchestrator"] = Orchestrator(
        settings=settings,
        session_factory=SessionLocal,
        state_store=state_store,
        tool_client=tool_client,
    )
    app_state["settings"] = settings
    logger.info(
        "startup",
        extra={
            "state_backend": settings.state_backend,
            "tool_transport": "http" if settings.tool_base_url else "in-process",
        },
    )
    yield
    if http:
        await http.aclose()


app = FastAPI(title="ARRA — Autonomous Refund Resolution Agent", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"^https?://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

# Mock connectors served in-process by default; in Compose they run as their
# own service and TOOL_BASE_URL points at it instead.
if not get_settings().tool_base_url:
    app.mount("/mock-tools", mock_tools_app)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


@app.get("/metrics")
async def prometheus_metrics() -> Response:
    body, content_type = render_metrics()
    return Response(content=body, media_type=content_type)


if __name__ == "__main__":
    import sys
    from pathlib import Path

    import uvicorn

    backend_dir = Path(__file__).resolve().parent.parent
    if str(backend_dir) not in sys.path:
        sys.path.insert(0, str(backend_dir))

    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)
