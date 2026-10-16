"""Application settings, read from environment variables with MVP defaults."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache


def _env_str(name: str, default: str) -> str:
    return os.environ.get(name, default)


def _env_int(name: str, default: int) -> int:
    return int(os.environ.get(name, default))


def _env_float(name: str, default: float) -> float:
    return float(os.environ.get(name, default))


def _default_db_url() -> str:
    env_val = os.environ.get("DATABASE_URL")
    if env_val:
        return env_val
    from pathlib import Path

    here = Path(__file__).resolve().parent
    backend_dir = here.parent
    project_dir = backend_dir.parent

    backend_db = backend_dir / "data" / "arra.db"
    root_db = project_dir / "data" / "arra.db"

    if backend_db.exists():
        chosen = backend_db
    elif root_db.exists():
        chosen = root_db
    else:
        chosen = backend_db

    return f"sqlite:///{chosen.as_posix()}"


@dataclass
class Settings:
    # --- infrastructure ---
    database_url: str = field(default_factory=_default_db_url)
    # "memory" (zero-dependency default) or "redis"
    state_backend: str = field(default_factory=lambda: _env_str("STATE_BACKEND", "memory"))
    redis_url: str = field(
        default_factory=lambda: _env_str("REDIS_URL", "redis://localhost:6379/0")
    )
    # Empty => mock tools are dispatched in-process (no Docker needed).
    # In Compose set TOOL_BASE_URL=http://tools:9100 to go over real HTTP.
    tool_base_url: str = field(default_factory=lambda: _env_str("TOOL_BASE_URL", ""))
    tool_max_retries: int = field(default_factory=lambda: _env_int("TOOL_MAX_RETRIES", 3))
    tool_timeout_s: float = field(default_factory=lambda: _env_float("TOOL_TIMEOUT_S", 5.0))
    tool_backoff_s: float = field(default_factory=lambda: _env_float("TOOL_BACKOFF_S", 0.15))

    # --- agent rules (product spec §5) ---
    max_state_repeats: int = field(default_factory=lambda: _env_int("MAX_STATE_REPEATS", 2))
    auto_refund_max_cents: int = field(
        default_factory=lambda: _env_int("AUTO_REFUND_MAX_CENTS", 5000)
    )
    dual_approval_threshold_cents: int = field(
        default_factory=lambda: _env_int("DUAL_APPROVAL_THRESHOLD_CENTS", 50000)
    )
    fraud_score_threshold: int = field(
        default_factory=lambda: _env_int("FRAUD_SCORE_THRESHOLD", 60)
    )
    chargeback_window_days: int = field(
        default_factory=lambda: _env_int("CHARGEBACK_WINDOW_DAYS", 90)
    )
    abuse_window_days: int = field(default_factory=lambda: _env_int("ABUSE_WINDOW_DAYS", 30))
    abuse_max_auto_refunds: int = field(
        default_factory=lambda: _env_int("ABUSE_MAX_AUTO_REFUNDS", 3)
    )

    # --- auth ---
    jwt_secret: str = field(default_factory=lambda: _env_str("JWT_SECRET", "dev-only-secret"))
    jwt_ttl_minutes: int = field(default_factory=lambda: _env_int("JWT_TTL_MINUTES", 480))

    # --- cost model (docs/metrics.md) ---
    cost_per_step_usd: float = field(default_factory=lambda: _env_float("COST_PER_STEP_USD", 0.002))
    cost_per_tool_call_usd: float = field(
        default_factory=lambda: _env_float("COST_PER_TOOL_CALL_USD", 0.001)
    )
    infra_cost_per_case_usd: float = field(
        default_factory=lambda: _env_float("INFRA_COST_PER_CASE_USD", 0.01)
    )

    # --- notifications ---
    escalation_webhook_url: str = field(
        default_factory=lambda: _env_str("ESCALATION_WEBHOOK_URL", "")
    )

    demo_users: dict = field(
        default_factory=lambda: {
            "operator1": {"password": "operator1", "role": "operator"},
            "operator2": {"password": "operator2", "role": "operator"},
            "admin": {"password": "admin", "role": "admin"},
        }
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
