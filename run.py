"""Unified launcher for RESOLVE AI (ARRA).

Usage:
    python run.py                # Starts both Backend and Frontend
    python run.py --backend      # Starts Backend API only
    python run.py --frontend     # Starts Frontend Dashboard only
"""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"


def run_process(cmd: list[str], cwd: Path, name: str) -> subprocess.Popen:
    print(f"[{name}] Starting: {' '.join(cmd)}")
    return subprocess.Popen(
        cmd,
        cwd=str(cwd),
        stdout=sys.stdout,
        stderr=sys.stderr,
        shell=(sys.platform == "win32"),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run ARRA Full Stack application")
    parser.add_argument("--backend", action="store_true", help="Run only the backend API")
    parser.add_argument("--frontend", action="store_true", help="Run only the frontend dashboard")
    args = parser.parse_args()

    run_both = not (args.backend or args.frontend)
    start_backend = run_both or args.backend
    start_frontend = run_both or args.frontend

    print("=" * 70)
    print("🌟 RESOLVE AI (ARRA) — Autonomous Refund Resolution Agent")
    print("=" * 70)

    processes: list[subprocess.Popen] = []

    if start_backend:
        print("⚡ Backend API:       http://127.0.0.1:8000")
        print("📚 API Documentation: http://127.0.0.1:8000/docs")
        backend_cmd = [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload", "--app-dir", str(BACKEND_DIR)]
        proc_be = run_process(backend_cmd, cwd=ROOT_DIR, name="BACKEND")
        processes.append(proc_be)

    if start_frontend:
        print("🎨 Frontend UI:       http://localhost:5173")
        # Give backend a moment to bind port before launching frontend
        if start_backend:
            time.sleep(1.5)
        frontend_cmd = ["npm", "run", "dev"]
        proc_fe = run_process(frontend_cmd, cwd=FRONTEND_DIR, name="FRONTEND")
        processes.append(proc_fe)

    print("=" * 70)
    print("✨ ARRA is running. Press CTRL+C to terminate all services.")
    print("=" * 70)

    def shutdown(signum=None, frame=None):
        print("\n🛑 Stopping ARRA services...")
        for p in processes:
            try:
                if sys.platform == "win32":
                    subprocess.call(["taskkill", "/F", "/T", "/PID", str(p.pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                else:
                    p.terminate()
            except Exception:
                pass
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, shutdown)

    try:
        while True:
            for p in processes:
                ret = p.poll()
                if ret is not None:
                    print(f"⚠️ A service exited with code {ret}")
                    shutdown()
            time.sleep(1)
    except KeyboardInterrupt:
        shutdown()

    return 0


if __name__ == "__main__":
    sys.exit(main())
