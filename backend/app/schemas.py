"""API request/response schemas."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class RefundRequestIn(BaseModel):
    customer_id: str = Field(min_length=1, max_length=64)
    customer_email: str = Field(default="", max_length=255)
    order_id: str = Field(min_length=1, max_length=64)
    amount_cents: int = Field(gt=0, le=10_000_000)
    currency: str = Field(default="USD", max_length=8)
    reason: str = Field(min_length=3, max_length=2000)
    # dev/test-only: lets the mock tools inject failures / fraud scores
    test_hints: dict | None = None


class OperatorActionIn(BaseModel):
    action: Literal["approve", "reject", "request_info"]
    comment: str = Field(default="", max_length=2000)


class LoginIn(BaseModel):
    username: str
    password: str


class CaseOut(BaseModel):
    model_config = {"from_attributes": True}

    id: str
    customer_id: str
    customer_email: str
    order_id: str
    amount_cents: int
    currency: str
    reason: str
    category: str | None = None
    status: str
    recommendation: str | None = None
    rationale: list = Field(default_factory=list)
    priority_tags: list = Field(default_factory=list)
    escalated_reason: str | None = None
    transaction_id: str | None = None
    steps: int = 0
    approvals: list = Field(default_factory=list)
    outcome_by: str | None = None
    created_at: datetime | None = None
    resolved_at: datetime | None = None
    latency_ms: int | None = None
