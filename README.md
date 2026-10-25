# Resolve AI (ARRA) — Autonomous Refund Resolution Agent

[![CI Pipeline](https://github.com/Nishant052004/Resolve-AI/actions/workflows/ci.yml/badge.svg)](https://github.com/Nishant052004/Resolve-AI/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React%20%2B%20Vite-61DAFB.svg?logo=react&logoColor=black)](https://react.dev)
[![TailwindCSS](https://img.shields.io/badge/Styling-TailwindCSS-38B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)

**Resolve AI** (ARRA — Autonomous Refund Resolution Agent) is an enterprise-grade full-stack platform designed to autonomously investigate, evaluate, and resolve customer refund requests using deterministic decision rules, AI state machine orchestration, human-in-the-loop escalation controls, robust audit logging, and real-time operator analytics dashboards.

---

## 🌐 Live Deployments

- **Frontend Dashboard (Vercel)**: [https://resolve-ai-umber.vercel.app](https://resolve-ai-umber.vercel.app)
- **Backend API (Render)**: [https://resolve-ai-wlim.onrender.com](https://resolve-ai-wlim.onrender.com)
- **Interactive API Docs (Swagger UI)**: [https://resolve-ai-wlim.onrender.com/docs](https://resolve-ai-wlim.onrender.com/docs)

---

## 🚀 Key Features

- **Autonomous Resolution Engine**: Resolves routine, low-risk refund claims within milliseconds without human intervention.
- **State Machine Orchestration**: Multi-step state transitions with automatic retries, backoff, and idempotent step execution.
- **Human-in-the-Loop (HITL) Controls**: Intelligent escalations for high-value transactions, policy edge cases, high fraud scores, and tool outages.
- **Full Operator Dashboard**: Modern real-time UI with investigation timelines, rationale breakdowns, step logs, and one-click manual approvals or denials.
- **Auditing & Compliance**: Immutable audit trails tracking every state change, risk calculation, and operator action with PII masking.
- **Resilient Tool Connectors**: Built-in fault tolerance with exponential backoff for internal commerce services, payment gateways, and tracking APIs.

---

## 🏗️ Architecture

```
                                  +-----------------------+
                                  |   React + Vite UI     |
                                  |  (Operator Dashboard) |
                                  +-----------+-----------+
                                              |  HTTP / REST
                                              v
+-----------------------------------------------------------------------------------+
|                              FastAPI Application Server                           |
|                                                                                   |
|  +--------------------+   +-----------------------+   +------------------------+  |
|  |     API Routes     |-->|   State Orchestrator  |-->|    Decision Engine     |  |
|  | (/refunds, /cases) |   |    (State Machine)    |   | (Policy & Risk Rules)  |  |
|  +--------------------+   +-----------------------+   +------------------------+  |
|                                       |                                           |
|                                       v                                           |
|                           +-----------------------+                               |
|                           |  Resilient Tool Layer |                               |
|                           | (Orders, Shipping, PG)|                               |
|                           +-----------------------+                               |
+---------------------------------------+-------------------------------------------+
                                        |
                                        v
                            +-----------------------+
                            |  SQLite / PostgreSQL  |
                            | (Audit Logs & State)  |
                            +-----------------------+
```

---

## 📁 Repository Structure

```
RESOLVE AI/
├── .github/
│   └── workflows/ci.yml       # GitHub Actions CI pipeline
├── backend/
│   ├── app/
│   │   ├── agent/             # Orchestrator & decision logic
│   │   ├── api/               # FastAPI endpoints & routes
│   │   ├── observability/     # Metrics & structured logging
│   │   ├── tools/             # Tool connectors & retry wrappers
│   │   ├── config.py          # App configuration
│   │   ├── db.py              # Database engine & session setup
│   │   ├── models.py          # SQLAlchemy ORM models
│   │   ├── schemas.py         # Pydantic schemas
│   │   └── state_store.py     # State persistence engine
│   ├── scripts/               # Simulation and maintenance scripts
│   ├── tests/                 # Unit, integration, and e2e test suite
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── src/                   # React components, pages & API client
│   ├── package.json
│   ├── vite.config.js
│   └── Dockerfile
├── docker-compose.yml         # Containerized local deployment
├── package.json               # Root scripts
├── run.py                     # Unified multi-service launcher
└── process.txt                # System architecture & process specifications
```

---

## ⚡ Quick Start

### Prerequisites

- **Python 3.11+**
- **Node.js 18+** & `npm`

### 1. Installation

Clone the repository and set up dependencies:

```bash
# Clone the repository
git clone https://github.com/Nishant052004/Resolve-AI.git
cd Resolve-AI

# Install backend dependencies
pip install -r backend/requirements.txt
pip install -r backend/requirements-dev.txt

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### 2. Running Locally

Run both the backend API and frontend dashboard with the unified runner:

```bash
python run.py
```

Or run services individually:

```bash
# Run backend only (FastAPI on http://127.0.0.1:8000)
python run.py --backend

# Run frontend only (Vite on http://localhost:5173)
python run.py --frontend
```

Once running:
- **Frontend Dashboard**: [http://localhost:5173](http://localhost:5173)
- **Backend API**: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- **Interactive API Docs (Swagger UI)**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

---

## 🐳 Docker Deployment

To spin up the entire stack using Docker Compose:

```bash
docker-compose up --build
```

---

## 🧪 Running Tests & Simulation

Run the automated test suite:

```bash
cd backend
pytest
```

Simulate automated refund evaluation scenarios:

```bash
python backend/scripts/simulate.py --cases 40 --base-url http://127.0.0.1:8000
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
