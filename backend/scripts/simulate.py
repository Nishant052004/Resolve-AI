"""Run N simulated refund cases against a running API and print the metrics.

Usage:
    python scripts/simulate.py --cases 40 --base-url https://resolve-ai-wlim.onrender.com

Profile mix (docs/metrics.md): clear-cut majority, plus high-value, fraud,
policy-edge, and injected-tool-failure cases so every escalation path fires.
"""

from __future__ import annotations

import argparse
import random
import sys

import httpx

REASONS = [
    "item arrived damaged in shipping",
    "device stopped working after two weeks",
    "I received the wrong item color",
    "product does not match the description on the site",
    "package never arrived, still waiting",
]


def make_case(rng: random.Random, i: int) -> dict:
    roll = rng.random()
    base = {
        "customer_id": f"CUST-{rng.randint(1, 60):03d}",
        "customer_email": f"customer{i}@example.com",
        "order_id": f"ORD-SIM-{i:04d}",
        "currency": "USD",
        "reason": rng.choice(REASONS),
        "test_hints": {"purchased_days_ago": rng.randint(5, 30)},
    }
    if roll < 0.60:  # clear-cut small refund -> auto-resolve
        base["amount_cents"] = rng.randint(500, 4500)
    elif roll < 0.72:  # high value -> escalate (high_value)
        base["amount_cents"] = rng.randint(60_000, 150_000)
    elif roll < 0.82:  # fraud signals -> escalate (fraud_risk)
        base["amount_cents"] = rng.randint(500, 4500)
        base["test_hints"]["fraud_override"] = rng.randint(75, 95)
    elif roll < 0.92:  # outside the policy window -> auto-deny
        base["amount_cents"] = rng.randint(500, 4500)
        base["reason"] = "changed my mind about this purchase"
        base["test_hints"]["purchased_days_ago"] = rng.randint(40, 70)
    else:  # injected tool failure -> escalate (tool_failure)
        base["amount_cents"] = rng.randint(500, 4500)
        base["test_hints"]["fail_tools"] = [rng.choice(["policy_search", "fraud_check"])]
    return base


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default="https://resolve-ai-wlim.onrender.com")
    parser.add_argument("--cases", type=int, default=40)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    rng = random.Random(args.seed)
    client = httpx.Client(base_url=args.base_url, timeout=30)

    health = client.get("/health")
    health.raise_for_status()

    counts: dict[str, int] = {}
    for i in range(1, args.cases + 1):
        body = make_case(rng, i)
        resp = client.post("/api/refund-requests", json=body)
        resp.raise_for_status()
        case = resp.json()["case"]
        counts[case["status"]] = counts.get(case["status"], 0) + 1
        tags = ",".join(case["priority_tags"]) or "-"
        print(f"[{i:3d}] {case['status']:<14} ${case['amount_cents'] / 100:>8.2f}  tags={tags}")

    print("\n--- status counts ---")
    for status, n in sorted(counts.items()):
        print(f"{status:<16} {n}")

    metrics = client.get("/api/metrics").json()
    print("\n--- business metrics (GET /api/metrics) ---")
    print(f"total_cases                {metrics['total_cases']}")
    print(f"autonomous_resolution_rate {metrics['autonomous_resolution_rate']}")
    print(f"escalations                {metrics['escalations']}")
    print(f"escalation_accuracy        {metrics['escalation_accuracy']}")
    print(f"tool_call_success_rate     {metrics['tool_call_success_rate']}")
    print(f"avg_steps_per_case         {metrics['avg_steps_per_case']}")
    print(f"latency_avg_ms             {metrics['latency']['avg_ms']}")
    print(f"latency_p95_ms             {metrics['latency']['p95_ms']}")
    print(f"cost_per_resolution_usd    {metrics['cost_per_resolution_usd']}")
    print("\nOperator queue: GET /api/cases?status=escalated  (dashboard: http://localhost:5173)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
