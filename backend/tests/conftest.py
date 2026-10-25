"""Test bootstrap: isolated SQLite DB + in-process state + in-process tools."""

from __future__ import annotations

import os
import tempfile

_DB_DIR = tempfile.mkdtemp(prefix="arra_test_")
os.environ["DATABASE_URL"] = f"sqlite:///{_DB_DIR}/test.db".replace("\\", "/")
os.environ["STATE_BACKEND"] = "memory"
os.environ["JWT_SECRET"] = "test-secret"
os.environ["ESCALATION_WEBHOOK_URL"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture(scope="session")
def client():
    from app.db import init_db
    from app.main import app

    init_db()
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def operator_headers(client):
    resp = client.post("/api/auth/login", json={"username": "operator1", "password": "operator1"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def operator2_headers(client):
    resp = client.post("/api/auth/login", json={"username": "operator2", "password": "operator2"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def admin_headers(client):
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin"})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
