"""Mock implementations of the five tool connectors.

Deterministic pseudo-data seeded from order_id / customer_id, so simulations
are reproducible. Outputs are strictly structured (machine-readable), per the
plan's Phase 3 design note. `test_hints` (dev/test only) inject failures or
fraud scores so every escalation path can be exercised on demand.
"""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime


class ToolFailed(Exception):
    """Raised by a mock connector to signal a failure (HTTP 500 when served)."""


def _seed(*parts: str) -> int:
    digest = hashlib.md5("|".join(parts).encode()).hexdigest()
    return int(digest[:8], 16)


def _pick(seed: int, options: list) -> object:
    return options[seed % len(options)]


def _hints(payload: dict) -> dict:
    return payload.get("test_hints") or {}


def _check_injected_failure(tool_name: str, payload: dict) -> None:
    if tool_name in (_hints(payload).get("fail_tools") or []):
        raise ToolFailed(f"injected failure for {tool_name}")


def order_lookup(payload: dict) -> dict:
    _check_injected_failure("order_lookup", payload)
    order_id = payload["order_id"]
    seed = _seed("order", order_id)
    if order_id.upper().startswith("ORD-UNK"):
        raise ToolFailed(f"order {order_id} not found")
    hints = _hints(payload)
    purchased_days_ago = (
        int(hints["purchased_days_ago"]) if "purchased_days_ago" in hints else 5 + (seed % 75)
    )  # 5..79 days before today
    delivered = seed % 8 != 0  # ~12% still in transit
    return {
        "order_id": order_id,
        "customer_id": payload.get("customer_id", "unknown"),
        "status": "delivered" if delivered else "in_transit",
        "purchased_days_ago": purchased_days_ago,
        "items": [
            {
                "sku": f"SKU-{seed % 9999:04d}",
                "name": _pick(seed, ["Headphones", "Desk Lamp", "Keyboard", "Backpack"]),
                "price_cents": 1000 + (seed % 90) * 100,
            }
        ],
        "order_total_cents": payload.get("amount_cents", 3000),
    }


def policy_search(payload: dict) -> dict:
    _check_injected_failure("policy_search", payload)
    category = payload["category"]
    days = payload["days_since_purchase"]

    # Verdict depends on category + purchase age only; amount-based limits are
    # the agent's decision rules, not the policy store's.
    windows = {
        "damaged": 60,
        "defective": 90,
        "wrong_item": 90,
        "not_as_described": 45,
        "late_delivery": 60,
        "buyer_remorse": 30,
    }
    max_days = windows.get(category)
    if max_days is None:
        return {
            "verdict": "conditional",
            "policy_text": f"Category '{category}' has no explicit refund rule; "
            "manual review required.",
            "conditions": ["manual_review"],
        }
    if days > max_days:
        return {
            "verdict": "denied",
            "policy_text": f"{category} refunds allowed within {max_days} days of purchase; "
            f"request is {days} days old.",
            "conditions": [],
        }
    return {
        "verdict": "allowed",
        "policy_text": f"{category} refunds allowed within {max_days} days; "
        f"request qualifies ({days} days).",
        "conditions": [],
    }


def customer_history(payload: dict) -> dict:
    _check_injected_failure("customer_history", payload)
    customer_id = payload["customer_id"]
    seed = _seed("customer", customer_id)
    chargebacks = 1 if "chargeback" in customer_id.lower() else (1 if seed % 17 == 0 else 0)
    return {
        "customer_id": customer_id,
        "past_refunds_90d": seed % 4,
        "chargebacks_90d": chargebacks,
        "lifetime_value_cents": 5_000 + (seed % 400) * 500,
        "account_age_days": 30 + (seed % 1000),
    }


def fraud_check(payload: dict) -> dict:
    _check_injected_failure("fraud_check", payload)
    customer_id = payload["customer_id"]
    seed = _seed("fraud", customer_id)
    hints = _hints(payload)
    score = (
        int(hints["fraud_override"])
        if "fraud_override" in hints
        else (80 + (seed % 15) if "fraud" in customer_id.lower() else seed % 45)
    )
    return {
        "customer_id": customer_id,
        "fraud_score": score,
        "flags": {
            "velocity": score >= 70,
            "device_mismatch": bool(seed % 2) and score >= 40,
            "ip_risk": score >= 55 and bool(seed % 3),
        },
    }


def refund_creation(payload: dict) -> dict:
    _check_injected_failure("refund_creation", payload)
    amount_cents = payload["amount_cents"]
    if amount_cents <= 0:
        raise ToolFailed("refund amount must be positive")
    txn = "TXN-" + hashlib.md5(f"{payload.get('case_id')}|{amount_cents}".encode()).hexdigest()[:10]
    return {
        "transaction_id": txn,
        "amount_cents": amount_cents,
        "currency": payload.get("currency", "USD"),
        "executed_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }


HANDLERS = {
    "order_lookup": order_lookup,
    "policy_search": policy_search,
    "customer_history": customer_history,
    "fraud_check": fraud_check,
    "refund_creation": refund_creation,
}
