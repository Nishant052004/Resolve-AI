"""REST API: case intake, operator actions, business metrics.

The orchestrator runs inline on submission for the MVP (latency is real and
the response carries the outcome); the production path moves this onto the
escalation queue / worker (README §roadmap).
"""

from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..agent.orchestrator import Orchestrator
from ..auth import login as auth_login
from ..auth import require_role
from ..config import get_settings
from ..db import get_db
from ..models import Case, CaseEvent, ToolCall, utcnow
from ..observability import metrics as prom
from ..observability.logging import get_logger
from ..schemas import CaseOut, LoginIn, OperatorActionIn, RefundRequestIn

router = APIRouter(prefix="/api")
logger = get_logger("arra.api")


def _orchestrator() -> Orchestrator:
    from ..main import app_state  # late import to avoid a cycle

    if "orchestrator" not in app_state:
        from ..config import get_settings
        from ..db import SessionLocal, init_db
        from ..state_store import get_state_store
        from ..tools.base import ToolClient

        settings = get_settings()
        init_db()
        state_store = get_state_store(settings)
        tool_client = ToolClient(settings)
        app_state["orchestrator"] = Orchestrator(
            settings=settings,
            session_factory=SessionLocal,
            state_store=state_store,
            tool_client=tool_client,
        )
        app_state["settings"] = settings

    return app_state["orchestrator"]


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.replace(tzinfo=UTC).isoformat()


def _case_out(case: Case) -> dict:
    return CaseOut.model_validate(case).model_dump(mode="json")


# ----------------------------------------------------------------- root & info


@router.get("", include_in_schema=False)
@router.get("/", include_in_schema=False)
def api_root() -> dict:
    return {
        "status": "online",
        "service": "Resolve AI API",
        "docs": "/docs",
        "endpoints": [
            "/api/auth/login",
            "/api/refund-requests",
            "/api/cases",
            "/api/metrics",
        ],
    }


# ----------------------------------------------------------------- auth


@router.post("/auth/login")
def login(payload: LoginIn):
    result = auth_login(payload.username, payload.password, get_settings())
    if result is None:
        raise HTTPException(status_code=401, detail="invalid credentials")
    return result


# ------------------------------------------------------------- intake


@router.post("/refund-requests")
async def submit_refund_request(payload: RefundRequestIn, db: Session = Depends(get_db)):
    case = Case(
        customer_id=payload.customer_id,
        customer_email=payload.customer_email,
        order_id=payload.order_id,
        amount_cents=payload.amount_cents,
        currency=payload.currency,
        reason=payload.reason,
        test_hints=payload.test_hints,
        status="submitted",
    )
    db.add(case)
    db.commit()
    logger.info("case_created", extra={"case_id": case.id, "customer_id": case.customer_id})

    summary = await _orchestrator().run_case(case.id)

    db.refresh(case)
    return {"case": _case_out(case), "summary": summary}


# -------------------------------------------------------------- cases


@router.get("/cases")
def list_cases(
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    query = select(Case).order_by(Case.created_at.desc()).limit(min(limit, 200)).offset(offset)
    if status:
        query = query.where(Case.status == status)
    cases = db.execute(query).scalars().all()
    return {"cases": [_case_out(c) for c in cases]}


@router.get("/cases/{case_id}")
def get_case(case_id: str, db: Session = Depends(get_db)):
    case = db.get(Case, case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="case not found")
    events = (
        db.execute(select(CaseEvent).where(CaseEvent.case_id == case_id).order_by(CaseEvent.id))
        .scalars()
        .all()
    )
    tool_calls = (
        db.execute(select(ToolCall).where(ToolCall.case_id == case_id).order_by(ToolCall.id))
        .scalars()
        .all()
    )
    return {
        "case": _case_out(case),
        "events": [
            {
                "id": e.id,
                "event_type": e.event_type,
                "actor": e.actor,
                "payload": e.payload,
                "created_at": _iso(e.created_at),
            }
            for e in events
        ],
        "tool_calls": [
            {
                "id": t.id,
                "tool_name": t.tool_name,
                "attempt": t.attempt,
                "status": t.status,
                "latency_ms": t.latency_ms,
                "error": t.error,
                "response": t.response,
                "created_at": _iso(t.created_at),
            }
            for t in tool_calls
        ],
    }


# ---------------------------------------------------- operator actions


@router.post("/cases/{case_id}/action")
async def operator_action(
    case_id: str,
    payload: OperatorActionIn,
    db: Session = Depends(get_db),
    principal: dict = Depends(require_role("operator", "admin")),
):
    case = db.get(Case, case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="case not found")
    if case.status not in ("escalated", "pending_info"):
        raise HTTPException(
            status_code=409, detail=f"case is not actionable (status={case.status})"
        )

    operator = principal["sub"]
    now = _iso(utcnow())
    approval = {
        "operator": operator,
        "action": payload.action,
        "comment": payload.comment,
        "ts": now,
    }
    case.approvals = [*(case.approvals or []), approval]
    db.add(
        CaseEvent(
            case_id=case.id,
            event_type="operator_action",
            actor="operator",
            payload={**approval, "recommendation": case.recommendation},
        )
    )

    if payload.action == "request_info":
        case.status = "pending_info"
        db.commit()
        db.refresh(case)
        return {"case": _case_out(case)}

    if payload.action == "reject":
        case.status = "rejected"
        case.outcome_by = "operator"
        case.resolved_at = utcnow()
        case.latency_ms = int((case.resolved_at - case.created_at).total_seconds() * 1000)
        prom.observe_case("rejected", case.latency_ms)
        db.commit()
        db.refresh(case)
        return {"case": _case_out(case)}

    # approve: dual approval gate for high-value cases
    if case.amount_cents >= get_settings().dual_approval_threshold_cents:
        distinct_approvers = {a["operator"] for a in case.approvals if a["action"] == "approve"}
        if len(distinct_approvers) < 2:
            db.commit()
            db.refresh(case)
            return {
                "case": _case_out(case),
                "detail": "dual approval required: one more distinct operator must approve",
            }

    orch = _orchestrator()
    refund = await orch.tools.call_tool(
        case.id,
        "refund_creation",
        {"order_id": case.order_id, "amount_cents": case.amount_cents, "currency": case.currency},
    )
    if not refund.ok:
        case.status = "failed"
        db.add(
            CaseEvent(
                case_id=case.id,
                event_type="outcome",
                actor="agent",
                payload={"status": "failed", "error": refund.error},
            )
        )
        db.commit()
        raise HTTPException(status_code=502, detail=f"refund connector failed: {refund.error}")

    case.status = "completed"
    case.outcome_by = "operator"
    case.transaction_id = refund.data.get("transaction_id")
    case.resolved_at = utcnow()
    case.latency_ms = int((case.resolved_at - case.created_at).total_seconds() * 1000)
    db.add(
        CaseEvent(
            case_id=case.id,
            event_type="outcome",
            actor="agent",
            payload={"status": "completed", "transaction_id": case.transaction_id},
        )
    )
    prom.observe_case("completed", case.latency_ms)
    db.commit()
    db.refresh(case)
    return {"case": _case_out(case)}


@router.post("/cases/{case_id}/replay")
async def replay_case(
    case_id: str,
    db: Session = Depends(get_db),
    principal: dict = Depends(require_role("admin")),
):
    case = db.get(Case, case_id)
    if case is None:
        raise HTTPException(status_code=404, detail="case not found")
    summary = await _orchestrator().run_case(case_id, start_state="GatherEvidence")
    db.refresh(case)
    return {"case": _case_out(case), "summary": summary}


# ------------------------------------------------------------ metrics


def _p95(values: list[float]) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(0.95 * len(ordered)))]


@router.get("/metrics")
def business_metrics(db: Session = Depends(get_db)):
    settings = get_settings()
    total = db.scalar(select(func.count(Case.id))) or 0
    by_status = dict(
        db.execute(select(Case.status, func.count(Case.id)).group_by(Case.status)).all()
    )

    auto_resolved = by_status.get("auto_refunded", 0) + by_status.get("auto_denied", 0)
    escalated = by_status.get("escalated", 0)

    # escalation accuracy: operator decision agreed with the agent recommendation
    agreed = 0
    decided = 0
    for case in db.execute(
        select(Case).where(Case.status.in_(["completed", "rejected"]))
    ).scalars():
        approvals = case.approvals
        if isinstance(approvals, str):
            try:
                import json

                approvals = json.loads(approvals)
            except Exception:
                approvals = []
        if not isinstance(approvals, list):
            approvals = []
        actions = {a.get("action") for a in approvals if isinstance(a, dict)}
        if "approve" in actions or "reject" in actions:
            decided += 1
            if (case.recommendation == "approve_refund" and "approve" in actions) or (
                case.recommendation == "deny" and "reject" in actions
            ):
                agreed += 1

    tool_total = db.scalar(select(func.count(ToolCall.id))) or 0
    tool_ok = db.scalar(select(func.count(ToolCall.id)).where(ToolCall.status == "ok")) or 0

    steps = db.scalar(select(func.avg(Case.steps))) or 0
    latencies = [
        row[0]
        for row in db.execute(select(Case.latency_ms).where(Case.latency_ms.isnot(None))).all()
    ]
    latencies_ms = [float(v) for v in latencies]

    # cost model (docs/metrics.md): steps + tool calls + infra, per resolved case
    total_steps = db.scalar(select(func.coalesce(func.sum(Case.steps), 0))) or 0
    resolved = auto_resolved + by_status.get("completed", 0) + by_status.get("rejected", 0)
    avg_cost_usd = (
        total_steps * settings.cost_per_step_usd
        + tool_total * settings.cost_per_tool_call_usd
        + max(resolved, 1) * settings.infra_cost_per_case_usd
    ) / max(resolved, 1)

    return {
        "total_cases": total,
        "by_status": by_status,
        "autonomous_resolution_rate": round(auto_resolved / total, 4) if total else None,
        "escalations": escalated,
        "escalation_accuracy": round(agreed / decided, 4) if decided else None,
        "tool_call_success_rate": round(tool_ok / tool_total, 4) if tool_total else None,
        "avg_steps_per_case": round(float(steps), 2) if total else None,
        "latency": {
            "avg_ms": round(sum(latencies_ms) / len(latencies_ms), 1) if latencies_ms else None,
            "p95_ms": round(_p95(latencies_ms), 1) if latencies_ms else None,
        },
        "cost_per_resolution_usd": round(avg_cost_usd, 4) if resolved else None,
        "cost_model": {
            "per_step_usd": settings.cost_per_step_usd,
            "per_tool_call_usd": settings.cost_per_tool_call_usd,
            "infra_per_case_usd": settings.infra_cost_per_case_usd,
        },
        "prometheus_tool_calls": prom.HAVE_PROMETHEUS,
    }
