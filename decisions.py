"""Decision rules: auto-approve / auto-deny / escalate (product spec §5).

Pure function over the gathered evidence — no I/O — so every rule is unit
testable and the full rationale is explicit and auditable.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from ..config import Settings

ESCALATE_REASONS = {
    "high_value",
    "fraud_risk",
    "policy_ambiguous",
    "tool_failure",
    "loop_detected",
    "abuse_suspected",
    "evidence_incomplete",
}


@dataclass
class Decision:
    action: str  # auto_approve | auto_deny | escalate
    recommendation: str  # approve_refund | deny | manual_review
    reasons: list[str] = field(default_factory=list)
    escalate_reasons: list[str] = field(default_factory=list)
    priority_tags: list[str] = field(default_factory=list)
    rationale: list[dict] = field(default_factory=list)


def _note(rationale: list[dict], rule: str, detail: str) -> None:
    rationale.append({"rule": rule, "detail": detail})


def decide(
    *,
    amount_cents: int,
    category: str,
    evidence: dict,
    settings: Settings,
    recent_auto_refunds: int,
) -> Decision:
    rationale: list[dict] = []
    escalate_reasons: list[str] = []
    priority_tags: list[str] = []
    recommendation = "manual_review"

    def escalate(reason: str, rec: str = "manual_review", tag: str | None = None) -> None:
        nonlocal recommendation
        escalate_reasons.append(reason)
        if tag and tag not in priority_tags:
            priority_tags.append(tag)
        if recommendation == "manual_review":
            recommendation = rec

    # 1. Fail-safe: any critical tool failure => escalate, never auto-resolve.
    failures = evidence.get("tool_failures") or []
    if failures:
        _note(rationale, "tool_failure", f"tools exhausted retries: {sorted(set(failures))}")
        escalate("tool_failure", tag="tool_failure")

    order = evidence.get("order")
    if order is None and not escalate_reasons:
        _note(rationale, "evidence_incomplete", "order evidence missing")
        escalate("evidence_incomplete", tag="policy_ambiguous")

    # 2. Fraud gate.
    fraud = evidence.get("fraud")
    if fraud:
        score = fraud.get("fraud_score", 0)
        flags = fraud.get("flags") or {}
        flagged = [name for name, on in flags.items() if on]
        _note(rationale, "fraud_check", f"score={score}, flags={flagged or 'none'}")
        if score >= settings.fraud_score_threshold or flagged:
            _note(
                rationale,
                "fraud_risk",
                f"score {score} >= threshold {settings.fraud_score_threshold} or flags present",
            )
            escalate("fraud_risk", rec="deny", tag="fraud_risk")

    history = evidence.get("history")
    if history:
        chargebacks = history.get("chargebacks_90d", 0)
        _note(
            rationale,
            "customer_history",
            f"chargebacks_90d={chargebacks}, past_refunds_90d={history.get('past_refunds_90d')}",
        )
        if chargebacks:
            _note(
                rationale,
                "chargeback_history",
                f"{chargebacks} chargeback(s) in last {settings.chargeback_window_days} days",
            )
            escalate("fraud_risk", rec="deny", tag="fraud_risk")

    # 3. Policy verdict.
    policy = evidence.get("policy")
    verdict = (policy or {}).get("verdict")
    _note(
        rationale, "policy_check", f"verdict={verdict}, category={category}, amount={amount_cents}"
    )
    if policy is None and not escalate_reasons:
        _note(rationale, "policy_ambiguous", "no policy result available")
        escalate("policy_ambiguous", tag="policy_ambiguous")

    if not escalate_reasons:
        amount_ok = amount_cents <= settings.auto_refund_max_cents
        if amount_ok:
            _note(
                rationale,
                "amount_ok",
                f"{amount_cents} <= auto threshold {settings.auto_refund_max_cents}",
            )
        else:
            _note(
                rationale,
                "amount_over_threshold",
                f"{amount_cents} > auto threshold {settings.auto_refund_max_cents}",
            )
            if amount_cents >= settings.dual_approval_threshold_cents:
                _note(
                    rationale,
                    "dual_approval_required",
                    f"{amount_cents} >= dual-approval threshold "
                    f"{settings.dual_approval_threshold_cents}",
                )

        if verdict == "allowed":
            if not amount_ok:
                escalate("high_value", rec="approve_refund", tag="high_value")
            elif recent_auto_refunds >= settings.abuse_max_auto_refunds:
                _note(
                    rationale,
                    "abuse_limit",
                    f"{recent_auto_refunds} auto-refunds in last {settings.abuse_window_days} days "
                    f"(limit {settings.abuse_max_auto_refunds})",
                )
                escalate("abuse_suspected", tag="abuse_suspected")
            else:
                _note(
                    rationale,
                    "abuse_limit_ok",
                    f"{recent_auto_refunds} auto-refunds in window "
                    f"(limit {settings.abuse_max_auto_refunds})",
                )
                recommendation = "approve_refund"
        elif verdict == "denied":
            if not amount_ok:
                escalate("high_value", rec="deny", tag="high_value")
            else:
                recommendation = "deny"
        else:  # conditional or unknown verdict
            _note(rationale, "policy_conditional", f"conditions={(policy or {}).get('conditions')}")
            escalate("policy_ambiguous", tag="policy_ambiguous")

    if escalate_reasons:
        return Decision(
            action="escalate",
            recommendation=recommendation,
            reasons=sorted({r for r in escalate_reasons}),
            escalate_reasons=escalate_reasons,
            priority_tags=priority_tags or ["manual_review"],
            rationale=rationale,
        )

    action = "auto_approve" if recommendation == "approve_refund" else "auto_deny"
    return Decision(
        action=action,
        recommendation=recommendation,
        reasons=["policy_verdict_" + str(verdict), "amount_ok", "fraud_ok", "abuse_ok"],
        rationale=rationale,
    )


def loop_detected_decision() -> Decision:
    """Forced decision when the state machine exceeds its visit budget."""
    return Decision(
        action="escalate",
        recommendation="manual_review",
        reasons=["loop_detected"],
        escalate_reasons=["loop_detected"],
        priority_tags=["loop_detected"],
        rationale=[
            {"rule": "loop_detected", "detail": "state visit budget exceeded; forcing escalation"}
        ],
    )
