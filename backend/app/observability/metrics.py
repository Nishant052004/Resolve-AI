"""Prometheus metrics. Falls back to a no-op registry if the client lib is absent."""

from __future__ import annotations

try:
    from prometheus_client import (
        CONTENT_TYPE_LATEST,
        Counter,
        Histogram,
        generate_latest,
    )

    HAVE_PROMETHEUS = True
except ImportError:  # pragma: no cover - only when the optional dep is missing
    HAVE_PROMETHEUS = False

if HAVE_PROMETHEUS:
    TOOL_CALLS = Counter("arra_tool_calls_total", "Tool connector calls", ["tool", "status"])
    TOOL_LATENCY = Histogram(
        "arra_tool_latency_seconds",
        "Tool connector latency",
        ["tool"],
        buckets=(0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5),
    )
    CASES = Counter("arra_cases_total", "Cases by final outcome", ["outcome"])
    CASE_LATENCY = Histogram(
        "arra_case_latency_seconds",
        "End-to-end case latency",
        ["outcome"],
        buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60),
    )

    def observe_tool(tool: str, status: str, latency_ms: float) -> None:
        TOOL_CALLS.labels(tool=tool, status=status).inc()
        TOOL_LATENCY.labels(tool=tool).observe(latency_ms / 1000.0)

    def observe_case(outcome: str, latency_ms: float) -> None:
        CASES.labels(outcome=outcome).inc()
        CASE_LATENCY.labels(outcome=outcome).observe(latency_ms / 1000.0)

    def render_metrics() -> tuple[bytes, str]:
        return generate_latest(), CONTENT_TYPE_LATEST

else:  # pragma: no cover

    def observe_tool(tool: str, status: str, latency_ms: float) -> None:
        pass

    def observe_case(outcome: str, latency_ms: float) -> None:
        pass

    def render_metrics() -> tuple[bytes, str]:
        return b"# prometheus-client not installed\n", "text/plain; version=0.0.4"
