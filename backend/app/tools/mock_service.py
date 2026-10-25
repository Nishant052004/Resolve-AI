"""Standalone FastAPI service exposing the mock connectors over HTTP.

Run with: python -m app.tools.mock_service   (port 9100)
Used by docker-compose as the `tools` service; the API points at it via
TOOL_BASE_URL. Every response is {"status": "ok", "data": {...}, "meta": {...}}.
"""

from __future__ import annotations

import time

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from .handlers import HANDLERS, ToolFailed

app = FastAPI(title="ARRA Mock Tool Service")


@app.post("/{tool_name}")
async def call_tool(tool_name: str, request: Request) -> JSONResponse:
    if tool_name not in HANDLERS:
        return JSONResponse(status_code=404, content={"detail": f"unknown tool {tool_name}"})
    payload = await request.json()
    request_id = request.headers.get("X-Request-ID", "")
    t0 = time.perf_counter()
    try:
        data = HANDLERS[tool_name](payload)
    except ToolFailed as exc:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "detail": str(exc), "meta": {"request_id": request_id}},
        )
    latency_ms = (time.perf_counter() - t0) * 1000
    return JSONResponse(
        content={
            "status": "ok",
            "data": data,
            "meta": {
                "request_id": request_id,
                "tool": tool_name,
                "latency_ms": round(latency_ms, 2),
            },
        }
    )


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "service": "mock-tools"}


if __name__ == "__main__":  # pragma: no cover
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=9100)
