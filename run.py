"""Unified launcher for RESOLVE AI (ARRA).

Single-command full stack runner connecting Frontend and Backend.

Usage:
    python run.py                # Connects Frontend directly to deployed Render Backend
    python run.py --local        # Starts both local Backend and Frontend
    python run.py --backend      # Starts local Backend API only
    python run.py --frontend     # Starts Frontend Dashboard only
"""

from __future__ import annotations

import argparse
import os
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = ROOT_DIR / "backend"
FRONTEND_DIR = ROOT_DIR / "frontend"
RENDER_BACKEND_URL = "https://resolve-ai-wlim.onrender.com"
VERCEL_FRONTEND_URL = "https://resolve-ai-umber.vercel.app"


def check_url(url: str, timeout: float = 3.0) -> bool:
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "ARRA-Launcher/1.0"})
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.status == 200
    except Exception:
        return False


def run_process(cmd: list[str], cwd: Path, name: str, env: dict | None = None) -> subprocess.Popen:
    print(f"[{name}] Starting: {' '.join(cmd)}")
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)
    return subprocess.Popen(
        cmd,
        cwd=str(cwd),
        env=merged_env,
        stdout=sys.stdout,
        stderr=sys.stderr,
        shell=(sys.platform == "win32"),
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Run ARRA Full Stack application")
    parser.add_argument("--local", action="store_true", help="Run local backend instead of deployed Render backend")
    parser.add_argument("--backend", action="store_true", help="Run only the local backend API")
    parser.add_argument("--frontend", action="store_true", help="Run only the frontend dashboard")
    args = parser.parse_args()

    print("=" * 72)
    print("🌟 RESOLVE AI (ARRA) — Autonomous Refund Resolution Agent")
    print("=" * 72)

    processes: list[subprocess.Popen] = []
    run_env = os.environ.copy()

    if args.backend:
        print("⚡ Running local Backend API only on http://127.0.0.1:8000")
        backend_cmd = [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
            "--reload",
            "--app-dir",
            str(BACKEND_DIR),
        ]
        proc_be = run_process(backend_cmd, cwd=ROOT_DIR, name="BACKEND")
        processes.append(proc_be)

    elif args.local:
        print("⚡ Running locally with internal backend:")
        print("   • Backend API:        http://127.0.0.1:8000")
        print("   • API Docs:           http://127.0.0.1:8000/docs")
        print("   • Frontend Dashboard: http://localhost:5173")
        run_env["ARRA_API_URL"] = "http://127.0.0.1:8000"
        run_env["VITE_API_URL"] = "http://127.0.0.1:8000"

        backend_cmd = [
            sys.executable,
            "-m",
            "uvicorn",
            "app.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
            "--reload",
            "--app-dir",
            str(BACKEND_DIR),
        ]
        proc_be = run_process(backend_cmd, cwd=ROOT_DIR, name="BACKEND")
        processes.append(proc_be)

        time.sleep(1.5)
        frontend_cmd = ["npm", "run", "dev"]
        proc_fe = run_process(frontend_cmd, cwd=FRONTEND_DIR, name="FRONTEND", env=run_env)
        processes.append(proc_fe)

    else:
        # Default: Single command connecting Frontend to live Render backend
        print("🔗 Connecting Frontend to live Render Backend:")
        print(f"   • Backend API:        {RENDER_BACKEND_URL}")
        print(f"   • API Documentation:  {RENDER_BACKEND_URL}/docs")
        print(f"   • API Health:         {RENDER_BACKEND_URL}/health")
        print("   • Frontend Dashboard: http://localhost:5173")
        print(f"   • Live Vercel App:    {VERCEL_FRONTEND_URL}")

        print("🔍 Verifying Render backend connectivity...")
        if check_url(f"{RENDER_BACKEND_URL}/health", timeout=4.0):
            print("   ✅ Render backend is online and healthy!")
        else:
            print("   ⏳ Render backend is starting up or waking from sleep (this is normal on free tier).")

        run_env["ARRA_API_URL"] = RENDER_BACKEND_URL
        run_env["VITE_API_URL"] = RENDER_BACKEND_URL

        frontend_cmd = ["npm", "run", "dev"]
        proc_fe = run_process(frontend_cmd, cwd=FRONTEND_DIR, name="FRONTEND", env=run_env)
        processes.append(proc_fe)

    print("=" * 72)
    print("✨ ARRA is running. Press CTRL+C to terminate.")
    print("=" * 72)

    def shutdown(signum=None, frame=None):
        print("\n🛑 Stopping ARRA services...")
        for p in processes:
            try:
                if sys.platform == "win32":
                    subprocess.call(
                        ["taskkill", "/F", "/T", "/PID", str(p.pid)],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
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
