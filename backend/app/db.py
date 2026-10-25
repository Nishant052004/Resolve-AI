"""Database engine/session setup. SQLite by default, PostgreSQL in Compose."""

from __future__ import annotations

from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from .config import get_settings

_settings = get_settings()

if _settings.database_url.startswith("sqlite:///"):
    # make sure the data directory exists
    try:
        raw_path = _settings.database_url.removeprefix("sqlite:///")
        Path(raw_path).parent.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

engine_kwargs: dict = {"future": True}
if _settings.database_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(_settings.database_url, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db():
    """FastAPI dependency: one session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    from . import models

    models.Base.metadata.create_all(bind=engine)
