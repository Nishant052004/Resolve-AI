"""Tests for the tool-call wrapper: retries, audit callbacks, transports."""

import asyncio

import httpx
import pytest

from app.config import Settings
from app.tools.base import ToolClient
from app.tools.handlers import ToolFailed, order_lookup, policy_search


def test_order_lookup_returns_structured_data():
    data = order_lookup({"order_id": "ORD-100", "customer_id": "C1", "amount_cents": 2500})
    assert data["order_id"] == "ORD-100"
    assert 5 <= data["purchased_days_ago"] <= 79
    assert data["status"] in ("delivered", "in_transit")


def test_unknown_order_raises():
    with pytest.raises(ToolFailed):
        order_lookup({"order_id": "ORD-UNK-9"})


def test_policy_search_verdicts():
    allowed = policy_search(
        {"category": "damaged", "amount_cents": 2500, "days_since_purchase": 10}
    )
    assert allowed["verdict"] == "allowed"
    denied = policy_search(
        {"category": "damaged", "amount_cents": 2500, "days_since_purchase": 120}
    )
    assert denied["verdict"] == "denied"
    conditional = policy_search(
        {"category": "other", "amount_cents": 2500, "days_since_purchase": 10}
    )
    assert conditional["verdict"] == "conditional"


def test_in_process_wrapper_retries_and_records_attempts():
    calls = []

    def on_attempt(attempt, status, latency_ms, error, data, request_id):
        calls.append((attempt, status))

    settings = Settings(tool_max_retries=3, tool_backoff_s=0.0)
    client = ToolClient(settings)
    result = asyncio.run(
        client.call_tool(
            "case-1",
            "policy_search",
            {
                "category": "damaged",
                "amount_cents": 100,
                "days_since_purchase": 1,
                "test_hints": {"fail_tools": ["policy_search"]},
            },
            on_attempt=on_attempt,
        )
    )
    assert not result.ok
    assert result.attempts == 3
    assert "injected failure" in (result.error or "")
    assert calls == [(1, "error"), (2, "error"), (3, "error")]


def test_http_transport_success_after_transient_failure():
    attempts = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["n"] += 1
        if attempts["n"] == 1:
            return httpx.Response(500, json={"detail": "boom"})
        return httpx.Response(
            200, json={"status": "ok", "data": {"verdict": "allowed"}, "meta": {}}
        )

    settings = Settings(tool_base_url="http://tools.test", tool_max_retries=3, tool_backoff_s=0.0)
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = ToolClient(settings, http)
    result = asyncio.run(client.call_tool("case-1", "policy_search", {}))
    assert result.ok
    assert result.attempts == 2
    assert result.data == {"verdict": "allowed"}


def test_http_transport_exhausts_retries():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, json={"detail": "down"})

    settings = Settings(tool_base_url="http://tools.test", tool_max_retries=2, tool_backoff_s=0.0)
    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = ToolClient(settings, http)
    result = asyncio.run(client.call_tool("case-1", "fraud_check", {}))
    assert not result.ok
    assert result.attempts == 2
    assert "503" in (result.error or "")
