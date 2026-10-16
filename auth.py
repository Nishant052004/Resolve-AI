"""Minimal JWT (HS256) auth with operator/admin roles.

Dependency-free implementation on purpose: no extra packages, fully auditable.
Production would swap the demo users for OIDC/SSO (compliance checklist §3).
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

from fastapi import Depends, HTTPException, Request

from .config import Settings, get_settings


class AuthError(Exception):
    pass


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def jwt_encode(payload: dict, secret: str) -> str:
    header = _b64url_encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    body = _b64url_encode(json.dumps(payload).encode())
    signing_input = f"{header}.{body}".encode()
    sig = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    return f"{header}.{body}.{_b64url_encode(sig)}"


def jwt_decode(token: str, secret: str) -> dict:
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise AuthError("malformed JWT token format")
        header, body, sig = parts
        expected = hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(sig, _b64url_encode(expected)):
            raise AuthError("bad signature")
        payload = json.loads(_b64url_decode(body))
        if payload.get("exp") and payload["exp"] < time.time():
            raise AuthError("token expired")
        return payload
    except AuthError:
        raise
    except Exception as exc:  # malformed token
        raise AuthError(f"invalid token: {exc}") from exc


def login(username: str, password: str, settings: Settings) -> dict | None:
    user = settings.demo_users.get(username)
    if not user or user["password"] != password:
        return None
    now = int(time.time())
    token = jwt_encode(
        {
            "sub": username,
            "role": user["role"],
            "iat": now,
            "exp": now + settings.jwt_ttl_minutes * 60,
        },
        settings.jwt_secret,
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "role": user["role"],
        "username": username,
    }


def current_principal(request: Request, settings: Settings = Depends(get_settings)) -> dict:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="missing bearer token")
    try:
        return jwt_decode(auth.removeprefix("Bearer "), settings.jwt_secret)
    except AuthError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc


def require_role(*roles: str):
    def checker(principal: dict = Depends(current_principal)) -> dict:
        if principal.get("role") not in roles:
            raise HTTPException(status_code=403, detail="insufficient role")
        return principal

    return checker
