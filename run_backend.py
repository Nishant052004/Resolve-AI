"""Launch the ARRA Backend FastAPI server.

Can be run from the repository root:
    python run_backend.py
"""

from __future__ import annotations

import sys
from pathlib import Path
import uvicorn

root_dir = Path(__file__).resolve().parent
backend_dir = root_dir / "backend"

if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

if __name__ == "__main__":
    print("=" * 65)
    print("🚀 Starting ARRA Backend API on http://127.0.0.1:8000")
    print("📚 Interactive API Docs: http://127.0.0.1:8000/docs")
    print("🏥 Health Check:         http://127.0.0.1:8000/health")
    print("=" * 65)
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True, app_dir=str(backend_dir))
