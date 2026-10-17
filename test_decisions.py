"""Unit tests for the decision rules (product spec §5)."""

import asyncio

from app.agent.decisions import decide, loop_detected_decision
from app.config import Settings
from app.schemas import CaseOut
from app.tools.base import ToolClient


def _evidence(**overrides):
    base = {
        "order": {"order_id": "ORD-1", "purchased_days_ago": 10},
        "history": {"past_refunds_90d": 0, "chargebacks_90d": 0},
        "fraud": {
            "fraud_score": 10,
            "flags": {"velocity": False, "device_mismatch": False, "ip_risk": False},
        },
        "policy": {"verdict": "allowed", "conditions": []},
        "tool_failures": [],
    }
    base.update(overrides)
    return base


def test_auto_approve_clear_cut():
    d = decide(
        amount_cents=2500,
        category="damaged",
        evidence=_evidence(),
        settings=Settings(),
        recent_auto_refunds=0,
    )
    assert d.action == "auto_approve"
    assert d.recommendation == "approve_refund"
    assert not d.escalate_reasons


def test_high_value_escalates_with_approve_recommendation():
    d = decide(
        amount_cents=120_000,
        category="damaged",
        evidence=_evidence(),
        settings=Settings(),
        recent_auto_refunds=0,
    )
    assert d.action == "escalate"
    assert "high_value" in d.escalate_reasons
    assert d.recommendation == "approve_refund"
    assert "high_value" in d.priority_tags


def test_fraud_score_escalates_with_deny_recommendation():
    evidence = _evidence(
        fraud={
            "fraud_score": 92,
            "flags": {"velocity": True, "device_mismatch": False, "ip_risk": True},
        }
    )
    d = decide(
        amount_cents=2500,
        category="damaged",
        evidence=evidence,
        settings=Settings(),
        recent_auto_refunds=0,
    )
    assert d.action == "escalate"
    assert "fraud_risk" in d.escalate_reasons
    assert d.recommendation == "deny"


def test_chargeback_history_escalates():
    evidence = _evidence(history={"past_refunds_90d": 1, "chargebacks_90d": 2})
    d = decide(
        amount_cents=2500,
        category="damaged",
        evidence=evidence,
        settings=Settings(),
        recent_auto_refunds=0,
    )
    assert "fraud_risk" in d.escalate_reasons


def test_policy_denied_small_amount_auto_denies():
    evidence = _evidence(policy={"verdict": "denied", "conditions": []})
    d = decide(
        amount_cents=1000,
        category="buyer_remorse",
        evidence=evidence,
        settings=Settings(),
        recent_auto_refunds=0,
    )
    assert d.action == "auto_deny"
    assert d.recommendation == "deny"


def test_policy_conditional_escalates():
    evidence = _evidence(policy={"verdict": "conditional", "conditions": ["receipt_verification"]})
    d = decide(
        amount_cents=2500,
        category="other",
        evidence=evidence,
        settings=Settings(),
        recent_auto_refunds=0,
    )
    assert d.action == "escalate"
    assert "policy_ambiguous" in d.escalate_reasons


def test_tool_failure_escalates_even_when_everything_else_passes():
    evidence = _evidence(tool_failures=["fraud_check"])
    d = decide(
        amount_cents=2500,
        category="damaged",
        evidence=evidence,
        settings=Settings(),
        recent_auto_refunds=0,
    )
    assert d.action == "escalate"
    assert "tool_failure" in d.escalate_reasons


def test_abuse_rate_limit_escalates():
    d = decide(
        amount_cents=2500,
        category="damaged",
        evidence=_evidence(),
        settings=Settings(),
        recent_auto_refunds=3,
    )
    assert d.action == "escalate"
    assert "abuse_suspected" in d.escalate_reasons


def test_dual_approval_threshold_flagged():
    d = decide(
        amount_cents=60_000,
        category="damaged",
        evidence=_evidence(),
        settings=Settings(),
        recent_auto_refunds=0,
    )
    assert d.action == "escalate"
    assert "high_value" in d.priority_tags


def test_loop_decision_shape():
    d = loop_detected_decision()
    assert d.action == "escalate"
    assert d.escalate_reasons == ["loop_detected"]
    assert d.recommendation == "manual_review"


def test_case_out_list_fields_are_isolated_per_instance():
    left = CaseOut.model_validate(
        {
            "id": "1",
            "customer_id": "CUST-1",
            "customer_email": "a@example.com",
            "order_id": "ORD-1",
            "amount_cents": 1000,
            "currency": "USD",
            "reason": "damaged",
            "status": "submitted",
        }
    )
    right = CaseOut.model_validate(
        {
            "id": "2",
            "customer_id": "CUST-2",
            "customer_email": "b@example.com",
            "order_id": "ORD-2",
            "amount_cents": 2000,
            "currency": "USD",
            "reason": "late delivery",
            "status": "submitted",
        }
    )

    left.rationale.append({"rule": "test"})
    assert left.rationale == [{"rule": "test"}]
    assert right.rationale == []


def test_tool_client_without_explicit_http_client_works():
    client = ToolClient(Settings(tool_base_url="http://example.invalid"))
    result = asyncio.run(
        client.call_tool(
            "case-1",
            "order_lookup",
            {"order_id": "ORD-1", "customer_id": "CUST-1", "amount_cents": 2500},
        )
    )
    assert result.status == "error"
    assert result.error is not None
