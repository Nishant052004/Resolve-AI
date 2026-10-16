"""Uniform tool interface: `call_tool(...)` with retries, logging, metrics.

Two transports:
- in-process (default, zero-config): dispatches directly to mock handlers
- HTTP (`TOOL_BASE_URL` set): POSTs to the standalone mock/real tool service

Every attempt is reported to `on_attempt` so the orchestrator can persist an
audit row; latency and status also go to Prometheus.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field

import httpx

from ..config import Settings
from ..observability import metrics
from ..observability.logging import get_logger
from .handlers import HANDLERS, ToolFailed

logger = get_logger("arra.tools")


@dataclass
class ToolResult:
    tool: str
    status: str  # "ok" | "error"
    data: dict = field(default_factory=dict)
    attempts: int = 0
    latency_ms: float = 0.0
    request_id: str = ""
    error: str | None = None

    @property
    def ok(self) -> bool:
        return self.status == "ok"


class ToolClient:
    def __init__(self, settings: Settings, http: httpx.AsyncClient | None = None) -> None:
        self.settings = settings
        self.http = http

    async def call_tool(
        self,
        case_id: str,
        tool_name: str,
        params: dict,
        on_attempt: Callable[[int, str, float, str | None, dict, str], None] | None = None,
    ) -> ToolResult:
        base_url = self.settings.tool_base_url
        request_id = uuid.uuid4().hex
        attempts = 0
        total_latency = 0.0
        last_error: str | None = None
        http = self.http

        for attempt in range(1, self.settings.tool_max_retries + 1):
            attempts = attempt
            t0 = time.perf_counter()
            data: dict = {}
            error: str | None = None
            try:
                if base_url:
                    if http is None:
                        async with httpx.AsyncClient(
                            timeout=self.settings.tool_timeout_s
                        ) as client:
                            resp = await client.post(
                                f"{base_url}/{tool_name}",
                                json={"case_id": case_id, **params},
                                headers={"X-Request-ID": request_id},
                            )
                            if resp.status_code == 200:
                                data = resp.json().get("data", {})
                            else:
                                error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                    else:
                        resp = await http.post(
                            f"{base_url}/{tool_name}",
                            json={"case_id": case_id, **params},
                            headers={"X-Request-ID": request_id},
                            timeout=self.settings.tool_timeout_s,
                        )
                        if resp.status_code == 200:
                            data = resp.json().get("data", {})
                        else:
                            error = f"HTTP {resp.status_code}: {resp.text[:200]}"
                else:
                    data = HANDLERS[tool_name]({"case_id": case_id, **params})
            except ToolFailed as exc:
                error = str(exc)
            except (httpx.HTTPError, KeyError, ValueError) as exc:
                error = f"{type(exc).__name__}: {exc}"
            except Exception as exc:
                error = f"UnexpectedToolError ({type(exc).__name__}): {exc}"

            latency_ms = (time.perf_counter() - t0) * 1000
            total_latency += latency_ms
            status = "ok" if error is None else "error"

            metrics.observe_tool(tool_name, status, latency_ms)
            logger.info(
                "tool_call",
                extra={
                    "case_id": case_id,
                    "tool": tool_name,
                    "request_id": request_id,
                    "attempt": attempt,
                    "status": status,
                    "latency_ms": round(latency_ms, 2),
                    "error": error,
                },
            )
            if on_attempt:
                on_attempt(attempt, status, latency_ms, error, data, request_id)

            if error is None:
                return ToolResult(
                    tool=tool_name,
                    status="ok",
                    data=data,
                    attempts=attempts,
                    latency_ms=total_latency,
                    request_id=request_id,
                )
            last_error = error
            await asyncio.sleep(self.settings.tool_backoff_s * attempt)

        return ToolResult(
            tool=tool_name,
            status="error",
            attempts=attempts,
            latency_ms=total_latency,
            request_id=request_id,
            error=last_error,
        )
