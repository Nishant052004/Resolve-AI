"""End-to-end tests through the FastAPI app: intake -> state machine -> operator."""

import asyncio

from app.config import get_settings


def _submit(client, **overrides):
    payload = {
        "customer_id": "CUST-1",
        "customer_email": "cust1@example.com",
        "order_id": "ORD-100",
        "amount_cents": 2500,
        "reason": "item arrived damaged",
    }
    payload.update(overrides)
    resp = client.post("/api/refund-requests", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_clear_cut_case_auto_refunds(client):
    body = _submit(
        client, order_id="ORD-100", amount_cents=2500, test_hints={"purchased_days_ago": 10}
    )
    case = body["case"]
    assert case["status"] == "auto_refunded"
    assert case["transaction_id"]
    assert case["category"] == "damaged"
    assert case["outcome_by"] == "agent"

    detail = client.get(f"/api/cases/{case['id']}").json()
    states = [e["payload"]["state"] for e in detail["events"] if e["event_type"] == "state_entered"]
    assert states == [
        "IdentifyProblem",
        "GatherEvidence",
        "CheckPolicy",
        "RecommendResolution",
        "ExecuteOrEscalate",
        "FinalOutcome",
    ]
    tools = {t["tool_name"] for t in detail["tool_calls"]}
    assert tools == {
        "order_lookup",
        "customer_history",
        "fraud_check",
        "policy_search",
        "refund_creation",
    }
    assert all(t["status"] == "ok" for t in detail["tool_calls"])


def test_high_value_case_escalates_and_dual_approval(client, operator_headers, operator2_headers):
    body = _submit(
        client, amount_cents=120_000, order_id="ORD-200", test_hints={"purchased_days_ago": 10}
    )
    case = body["case"]
    assert case["status"] == "escalated"
    assert "high_value" in case["priority_tags"]
    assert case["recommendation"] == "approve_refund"
    assert case["escalated_reason"] == "high_value"

    # first approval: held for dual approval (amount >= dual threshold)
    resp = client.post(
        f"/api/cases/{case['id']}/action",
        json={"action": "approve", "comment": "ok"},
        headers=operator_headers,
    )
    assert resp.status_code == 200
    assert "dual approval" in resp.json().get("detail", "")

    # same operator again must not count as the second approver
    resp = client.post(
        f"/api/cases/{case['id']}/action",
        json={"action": "approve", "comment": "me again"},
        headers=operator_headers,
    )
    assert "dual approval" in resp.json().get("detail", "")

    # a distinct operator completes it
    resp = client.post(
        f"/api/cases/{case['id']}/action",
        json={"action": "approve", "comment": "+1"},
        headers=operator2_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["case"]["status"] == "completed"
    assert resp.json()["case"]["transaction_id"]
    assert resp.json()["case"]["outcome_by"] == "operator"


def test_fraud_case_escalates_and_reject_flow(client, operator_headers):
    body = _submit(
        client,
        amount_cents=1500,
        order_id="ORD-300",
        test_hints={"fraud_override": 95, "purchased_days_ago": 10},
    )
    case = body["case"]
    assert case["status"] == "escalated"
    assert "fraud_risk" in case["priority_tags"]
    assert case["recommendation"] == "deny"

    resp = client.post(
        f"/api/cases/{case['id']}/action",
        json={"action": "reject", "comment": "confirmed fraud"},
        headers=operator_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["case"]["status"] == "rejected"


def test_critical_tool_failure_escalates_never_auto_resolves(client):
    body = _submit(client, order_id="ORD-400", test_hints={"fail_tools": ["policy_search"]})
    case = body["case"]
    assert case["status"] == "escalated"
    assert "tool_failure" in case["escalated_reason"]

    detail = client.get(f"/api/cases/{case['id']}").json()
    policy_calls = [t for t in detail["tool_calls"] if t["tool_name"] == "policy_search"]
    assert len(policy_calls) == get_settings().tool_max_retries
    assert all(t["status"] == "error" for t in policy_calls)


def test_missing_order_escalates(client):
    body = _submit(client, order_id="ORD-UNK-404")
    case = body["case"]
    assert case["status"] == "escalated"
    assert "tool_failure" in case["escalated_reason"]


def test_request_info_and_action_guardrails(client, operator_headers):
    body = _submit(
        client, amount_cents=6000, order_id="ORD-500", test_hints={"purchased_days_ago": 10}
    )  # over auto threshold
    case = body["case"]
    assert case["status"] == "escalated"

    resp = client.post(
        f"/api/cases/{case['id']}/action",
        json={"action": "request_info", "comment": "need receipt"},
        headers=operator_headers,
    )
    assert resp.json()["case"]["status"] == "pending_info"

    # pending_info stays actionable
    resp = client.post(
        f"/api/cases/{case['id']}/action",
        json={"action": "approve", "comment": "receipt verified"},
        headers=operator_headers,
    )
    assert resp.status_code == 200
    assert resp.json()["case"]["status"] == "completed"

    # acting on a terminal case is refused
    resp = client.post(
        f"/api/cases/{case['id']}/action", json={"action": "approve"}, headers=operator_headers
    )
    assert resp.status_code == 409


def test_operator_endpoints_require_auth(client):
    resp = client.post("/api/cases/nope/action", json={"action": "approve"})
    assert resp.status_code == 401
    resp = client.post("/api/auth/login", json={"username": "operator1", "password": "wrong"})
    assert resp.status_code == 401


def test_replay_reruns_from_gather_evidence(client, admin_headers, operator_headers):
    body = _submit(
        client, amount_cents=6000, order_id="ORD-600", test_hints={"purchased_days_ago": 10}
    )
    case_id = body["case"]["id"]
    resp = client.post(f"/api/cases/{case_id}/replay", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.json()["case"]["status"] == "escalated"

    # non-admins cannot replay
    resp = client.post(f"/api/cases/{case_id}/replay", headers=operator_headers)
    assert resp.status_code == 403


def test_metrics_endpoint_aggregates(client):
    resp = client.get("/api/metrics")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_cases"] > 0
    assert 0 <= (data["autonomous_resolution_rate"] or 0) <= 1
    assert data["by_status"]
    assert data["avg_steps_per_case"]


def test_loop_detection_forces_escalation(client):
    from app.db import SessionLocal
    from app.main import app_state
    from app.models import Case
    from app.state_store import new_state

    case_id = "loopcase0000000000000000000001"
    with SessionLocal() as db:
        db.add(
            Case(
                id=case_id,
                customer_id="CUST-LOOP",
                order_id="ORD-700",
                amount_cents=2000,
                reason="damaged",
            )
        )
        db.commit()

    # pre-seed the app's own state store to simulate a looping machine
    orch = app_state["orchestrator"]
    state = new_state(case_id)
    state["visited_states"] = ["GatherEvidence"] * 3
    orch.state_store.save(case_id, state)

    summary = asyncio.run(orch.run_case(case_id, start_state="GatherEvidence"))
    assert summary["status"] == "escalated"

    with SessionLocal() as db:
        case = db.get(Case, case_id)
        assert "loop_detected" in (case.escalated_reason or "")
        assert case.priority_tags == ["loop_detected"]
