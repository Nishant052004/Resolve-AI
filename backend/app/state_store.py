"""Short-term (per-case) agent state.

Stored in Redis in production (`STATE_BACKEND=redis`), in-process otherwise so
the stack runs with zero external dependencies. The shape mirrors the plan:
evidence, tool responses, visited states (loop detection), retry counters.
"""

from __future__ import annotations

import copy
import json
from typing import Protocol

from .config import Settings


def new_state(case_id: str) -> dict:
    return {
        "case_id": case_id,
        "visited_states": [],
        "evidence": {},  # order / history / fraud
        "policy": None,  # policy_search result
        "tool_failures": [],  # tools that exhausted retries
        "decision": None,  # decision dict from RecommendResolution
        "transaction_id": None,
        "escalate_reasons": [],  # accumulated before decision phase
        "rationale": [],
    }


class StateStore(Protocol):
    def load(self, case_id: str) -> dict: ...
    def save(self, case_id: str, state: dict) -> None: ...
    def clear(self, case_id: str) -> None: ...


class InMemoryStateStore:
    """Default backend: per-case dict in the running process."""

    def __init__(self) -> None:
        self._data: dict[str, dict] = {}

    def load(self, case_id: str) -> dict:
        return copy.deepcopy(self._data.get(case_id, {}))

    def save(self, case_id: str, state: dict) -> None:
        self._data[case_id] = copy.deepcopy(state)

    def clear(self, case_id: str) -> None:
        self._data.pop(case_id, None)


class RedisStateStore:
    """Redis hash per case (`case:state:<id>`), JSON-encoded."""

    def __init__(self, redis_url: str) -> None:
        import redis  # optional dependency, only needed for STATE_BACKEND=redis

        self._redis = redis.Redis.from_url(redis_url, decode_responses=True)

    def _key(self, case_id: str) -> str:
        return f"case:state:{case_id}"

    def load(self, case_id: str) -> dict:
        raw = self._redis.get(self._key(case_id))
        return json.loads(raw) if raw else {}

    def save(self, case_id: str, state: dict) -> None:
        self._redis.set(self._key(case_id), json.dumps(state))

    def clear(self, case_id: str) -> None:
        self._redis.delete(self._key(case_id))


def get_state_store(settings: Settings) -> StateStore:
    if settings.state_backend == "redis":
        return RedisStateStore(settings.redis_url)
    return InMemoryStateStore()
