"""Orchestrator: runs one case through the state machine.

States (product spec §4):
    IdentifyProblem -> GatherEvidence -> CheckPolicy -> RecommendResolution
        -> ExecuteOrEscalate -> FinalOutcome (terminal)

Each handler is a plain async node returning the next state name (None to
finish) — the shape maps 1:1 onto LangGraph nodes/conditional edges if this is
ported to LangGraph later. Short-term state lives in the StateStore; every
state entry, tool attempt, decision, and outcome is appended to the audit log.
"""

from __future__ import annotations

import time
from collections.abc import Awaitable, Callable
from dataclasses import asdict
from datetime import timedelta

import httpx
from sqlalchemy.orm import Session

from ..config import Settings
from ..models import Case, CaseEvent, ToolCall, utcnow
from ..observability import metrics
from ..observability.logging import get_logger
from ..state_store import StateStore, new_state
from ..tools.base import ToolClient
from .decisions import decide, loop_detected_decision

logger = get_logger("arra.orchestrator")

REASON_KEYWORDS = {
    "damaged": ("damaged", "broken", "cracked", "smashed", "torn"),
    "late_delivery": (
        "late",
        "never arrived",
        "not delivered",
        "still waiting",
        "shipping",
        "lost",
    ),
    "defective": ("defective", "not working", "stopped working", "malfunction", "faulty"),
    "wrong_item": (
        "wrong item",
        "wrong color",
        "wrong colour",
        "wrong size",
        "incorrect item",
        "not what i ordered",
    ),
    "not_as_described": ("not as described", "different from", "doesn't match", "does not match"),
    "buyer_remorse": (
        "changed my mind",
        "don't want",
        "no longer need",
        "by mistake",
        "accidentally",
        "duplicate",
    ),
}


def classify_reason(reason: str) -> str:
    text = (reason or "").lower()
    for category, keywords in REASON_KEYWORDS.items():
        if any(k in text for k in keywords):
            return category
    return "other"


class Orchestrator:
    def __init__(
        self,
        settings: Settings,
        session_factory,
        state_store: StateStore,
        tool_client: ToolClient,
    ) -> None:
        self.settings = settings
        self.session_factory = session_factory
        self.state_store = state_store
        self.tools = tool_client

    # ------------------------------------------------------------------ ctx

    class Ctx:
        def __init__(self, case: Case, state: dict, session: Session, orch: Orchestrator) -> None:
            self.case = case
            self.state = state
            self.session = session
            self.settings = orch.settings
            self.tools = orch.tools

        def emit(self, event_type: str, payload: dict, actor: str = "agent") -> None:
            self.session.add(
                CaseEvent(case_id=self.case.id, event_type=event_type, actor=actor, payload=payload)
            )

        def _recorder(self, tool: str, call_params: dict):
            def record(attempt, status, latency_ms, error, data, request_id):
                self.session.add(
                    ToolCall(
                        case_id=self.case.id,
                        tool_name=tool,
                        request_id=request_id,
                        attempt=attempt,
                        status=status,
                        latency_ms=round(latency_ms),
                        params=call_params,
                        response={"data": data} if data else {},
                        error=error,
                    )
                )

            return record

        async def call(self, tool: str, params: dict):
            params_with_hints = {**params, "test_hints": self.case.test_hints or {}}
            return await self.tools.call_tool(
                self.case.id, tool, params_with_hints, on_attempt=self._recorder(tool, params)
            )

    # ------------------------------------------------------------------ run

    async def run_case(self, case_id: str, start_state: str | None = None) -> dict:
        started = time.perf_counter()
        with self.session_factory() as session:
            case = session.get(Case, case_id)
            if case is None:
                raise ValueError(f"case {case_id} not found")

            state = self.state_store.load(case_id) or new_state(case_id)
            ctx = self.Ctx(case, state, session, self)
            state_handler = self._handlers()

            current: str | None = start_state or "IdentifyProblem"
            while current is not None:
                visited = state["visited_states"]
                if visited.count(current) > self.settings.max_state_repeats and current not in (
                    "ExecuteOrEscalate",
                    "FinalOutcome",
                ):
                    logger.warning("loop_detected", extra={"case_id": case_id, "state": current})
                    state["decision"] = asdict(loop_detected_decision())
                    state["rationale"].extend(state["decision"]["rationale"])
                    ctx.emit("escalated", {"reason": "loop_detected"})
                    current = "ExecuteOrEscalate"

                state["visited_states"].append(current)
                case.status = "in_progress"
                ctx.emit("state_entered", {"state": current, "step": len(state["visited_states"])})
                handler: Callable[[Orchestrator.Ctx], Awaitable[str | None]] = state_handler[
                    current
                ]
                current = await handler(ctx)
                self.state_store.save(case_id, state)

            self._persist_outcome(case, state, session, started)
            self.state_store.save(case_id, state)
            session.commit()

            if case.status == "escalated" and self.settings.escalation_webhook_url:
                _notify_escalation(self.settings.escalation_webhook_url, case)

            return {
                "case_id": case.id,
                "status": case.status,
                "recommendation": case.recommendation,
                "priority_tags": case.priority_tags,
                "steps": case.steps,
            }

    # ------------------------------------------------------------- handlers

    def _handlers(self) -> dict[str, Callable[[Ctx], Awaitable[str | None]]]:
        return {
            "IdentifyProblem": self._identify_problem,
            "GatherEvidence": self._gather_evidence,
            "CheckPolicy": self._check_policy,
            "RecommendResolution": self._recommend_resolution,
            "ExecuteOrEscalate": self._execute_or_escalate,
            "FinalOutcome": self._final_outcome,
        }

    async def _identify_problem(self, ctx: Ctx) -> str:
        ctx.case.category = classify_reason(ctx.case.reason)
        ctx.state["rationale"].append(
            {"rule": "category_classified", "detail": f"category={ctx.case.category}"}
        )
        return "GatherEvidence"

    async def _gather_evidence(self, ctx: Ctx) -> str:
        state, failures, evidence = ctx.state, ctx.state["tool_failures"], ctx.state["evidence"]

        order = await ctx.call(
            "order_lookup",
            {
                "order_id": ctx.case.order_id,
                "customer_id": ctx.case.customer_id,
                "amount_cents": ctx.case.amount_cents,
            },
        )
        if not order.ok:
            failures.append("order_lookup")
            state["rationale"].append(
                {"rule": "critical_tool_failure", "detail": f"order_lookup: {order.error}"}
            )
            # fail-safe: no order evidence -> go straight to the decision phase,
            # whose rules escalate on tool failure
            return "RecommendResolution"
        evidence["order"] = order.data

        history = await ctx.call("customer_history", {"customer_id": ctx.case.customer_id})
        if history.ok:
            evidence["history"] = history.data
        else:
            failures.append("customer_history")
            state["rationale"].append(
                {"rule": "critical_tool_failure", "detail": f"customer_history: {history.error}"}
            )

        fraud = await ctx.call("fraud_check", {"customer_id": ctx.case.customer_id})
        if fraud.ok:
            evidence["fraud"] = fraud.data
        else:
            failures.append("fraud_check")
            state["rationale"].append(
                {"rule": "critical_tool_failure", "detail": f"fraud_check: {fraud.error}"}
            )
        return "CheckPolicy"

    async def _check_policy(self, ctx: Ctx) -> str:
        order = ctx.state["evidence"].get("order") or {}
        policy = await ctx.call(
            "policy_search",
            {
                "category": ctx.case.category,
                "amount_cents": ctx.case.amount_cents,
                "days_since_purchase": order.get("purchased_days_ago", 0),
            },
        )
        if not policy.ok:
            ctx.state["tool_failures"].append("policy_search")
            ctx.state["rationale"].append(
                {"rule": "critical_tool_failure", "detail": f"policy_search: {policy.error}"}
            )
            return "RecommendResolution"  # decision rules escalate on tool failure
        ctx.state["policy"] = policy.data
        return "RecommendResolution"

    async def _recommend_resolution(self, ctx: Ctx) -> str:
        window_start = utcnow() - timedelta(days=ctx.settings.abuse_window_days)
        recent = (
            ctx.session.query(Case)
            .filter(
                Case.customer_id == ctx.case.customer_id,
                Case.status == "auto_refunded",
                Case.created_at >= window_start,
            )
            .count()
        )
        decision = decide(
            amount_cents=ctx.case.amount_cents,
            category=ctx.case.category or "other",
            evidence={
                **ctx.state["evidence"],
                "policy": ctx.state["policy"],
                "tool_failures": ctx.state["tool_failures"],
            },
            settings=ctx.settings,
            recent_auto_refunds=recent,
        )
        ctx.state["decision"] = asdict(decision)
        ctx.state["rationale"].extend(decision.rationale)
        ctx.emit(
            "decision",
            {
                "action": decision.action,
                "recommendation": decision.recommendation,
                "escalate_reasons": decision.escalate_reasons,
            },
        )
        return "ExecuteOrEscalate"

    async def _execute_or_escalate(self, ctx: Ctx) -> str:
        decision = ctx.state["decision"] or asdict(loop_detected_decision())
        action = decision["action"]
        state = ctx.state

        if action == "auto_approve":
            refund = await ctx.call(
                "refund_creation",
                {
                    "order_id": ctx.case.order_id,
                    "amount_cents": ctx.case.amount_cents,
                    "currency": ctx.case.currency,
                },
            )
            if refund.ok:
                state["transaction_id"] = refund.data.get("transaction_id")
                state["final_status"] = "auto_refunded"
            else:
                # fail-safe: approved but could not execute -> human handles it
                state["tool_failures"].append("refund_creation")
                decision["escalate_reasons"].append("tool_failure")
                decision["priority_tags"] = sorted(
                    set(decision["priority_tags"]) | {"tool_failure"}
                )
                decision["recommendation"] = "manual_review"
                decision["action"] = "escalate"
                state["decision"] = decision
                state["final_status"] = "escalated"
        elif action == "auto_deny":
            state["final_status"] = "auto_denied"
        else:
            state["final_status"] = "escalated"
        return "FinalOutcome"

    async def _final_outcome(self, ctx: Ctx) -> None:
        return None

    # ------------------------------------------------------------- persist

    def _persist_outcome(self, case: Case, state: dict, session: Session, started: float) -> None:
        decision = state.get("decision") or {}
        final_status = state.get("final_status", "escalated")
        elapsed_ms = int((time.perf_counter() - started) * 1000)

        case.status = final_status
        case.recommendation = decision.get("recommendation")
        case.priority_tags = decision.get("priority_tags", [])
        case.escalated_reason = ",".join(decision.get("escalate_reasons", [])) or None
        case.rationale = state.get("rationale", [])
        case.steps = len(state.get("visited_states", []))
        case.transaction_id = state.get("transaction_id")
        case.outcome_by = "agent" if final_status in ("auto_refunded", "auto_denied") else None

        if final_status in ("auto_refunded", "auto_denied"):
            case.resolved_at = utcnow()
            case.latency_ms = elapsed_ms

        session.add(case)
        session.add(
            CaseEvent(
                case_id=case.id,
                event_type="outcome",
                actor="agent",
                payload={
                    "status": final_status,
                    "steps": case.steps,
                    "latency_ms": elapsed_ms,
                    "transaction_id": case.transaction_id,
                },
            )
        )
        if final_status in ("auto_refunded", "auto_denied"):
            metrics.observe_case(final_status, elapsed_ms)
        else:
            metrics.observe_case("escalated", elapsed_ms)

        logger.info(
            "case_finished",
            extra={
                "case_id": case.id,
                "status": final_status,
                "steps": case.steps,
                "latency_ms": elapsed_ms,
            },
        )


def _notify_escalation(url: str, case: Case) -> None:
    """Fire-and-forget escalation webhook; never blocks or fails the case."""

    async def _post() -> None:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                await client.post(
                    url,
                    json={
                        "case_id": case.id,
                        "amount_cents": case.amount_cents,
                        "priority_tags": case.priority_tags,
                        "reason": case.escalated_reason,
                    },
                )
        except Exception:
            logger.warning("escalation_webhook_failed", extra={"case_id": case.id})

    import asyncio
    import contextlib

    with contextlib.suppress(RuntimeError):  # pragma: no cover - no loop (tests)
        asyncio.get_running_loop().create_task(_post())
