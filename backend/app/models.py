"""Persistence models.

`cases` is the mutable case record; `case_events` is the append-only audit
trail (no update/delete API exists); `tool_calls` records every connector
attempt including retries.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import Column, DateTime, Integer, String, Text
from sqlalchemy.orm import declarative_base

Base = declarative_base()


def utcnow() -> datetime:
    """Naive UTC timestamps everywhere (SQLite-friendly, documented)."""
    return datetime.now(UTC).replace(tzinfo=None)


def new_id() -> str:
    return uuid.uuid4().hex


from sqlalchemy.types import TEXT, TypeDecorator  # noqa: E402


class JSONType(TypeDecorator):
    """Portable JSON column (works on SQLite and PostgreSQL)."""

    impl = TEXT
    cache_ok = True

    def process_bind_param(self, value, dialect):
        return json.dumps(value) if value is not None else None

    def process_result_value(self, value, dialect):
        return json.loads(value) if value is not None else None


class Case(Base):
    __tablename__ = "cases"

    id = Column(String(32), primary_key=True, default=new_id)
    customer_id = Column(String(64), index=True, nullable=False)
    customer_email = Column(String(255), default="")
    order_id = Column(String(64), index=True, nullable=False)
    amount_cents = Column(Integer, nullable=False)
    currency = Column(String(8), default="USD")
    reason = Column(Text, default="")
    test_hints = Column(JSONType)  # dev/test-only hints consumed by mock tools

    category = Column(String(32), index=True)  # derived in IdentifyProblem
    status = Column(String(24), index=True, default="submitted")
    recommendation = Column(String(24))  # approve_refund | deny | manual_review
    rationale = Column(JSONType, default=list)
    priority_tags = Column(JSONType, default=list)
    escalated_reason = Column(String(120))
    transaction_id = Column(String(64))

    steps = Column(Integer, default=0)
    approvals = Column(JSONType, default=list)  # [{operator, action, comment, ts}]
    outcome_by = Column(String(16))  # agent | operator

    created_at = Column(DateTime, default=utcnow)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow)
    resolved_at = Column(DateTime)
    latency_ms = Column(Integer)


class CaseEvent(Base):
    __tablename__ = "case_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String(32), index=True, nullable=False)
    event_type = Column(
        String(32), nullable=False
    )  # state_entered | tool_call | decision | escalated | operator_action | outcome
    actor = Column(String(16), default="agent")  # agent | operator | system
    payload = Column(JSONType, default=dict)
    created_at = Column(DateTime, default=utcnow)


class ToolCall(Base):
    __tablename__ = "tool_calls"

    id = Column(Integer, primary_key=True, autoincrement=True)
    case_id = Column(String(32), index=True, nullable=False)
    tool_name = Column(String(32), nullable=False)
    request_id = Column(String(32))
    attempt = Column(Integer, default=1)
    status = Column(String(16))  # ok | error
    latency_ms = Column(Integer)
    params = Column(JSONType, default=dict)
    response = Column(JSONType, default=dict)
    error = Column(Text)
    created_at = Column(DateTime, default=utcnow)
