# Arpegia

> **AI-Powered Guitar Intelligence Platform**  
> Audio Analysis • Chord Detection • Guitar Tablature Generation • AI Improvisation & Fingerstyle Arranging

---

## Overview

Arpegia is an advanced music intelligence platform engineered specifically for guitarists. It ingests audio tracks (MP3/WAV), extracts musical key, tempo, and chord progressions with sub-second accuracy, generates ergonomically playable guitar tablature, and suggests AI-powered reharmonizations and fingerstyle arrangements.

---

## Monorepo Architecture

This repository is structured as an isolated, multi-service monorepo:

```
arpegia/
├── apps/
│   ├── web/                  # Next.js 15+ App Router, TypeScript, Tailwind CSS
│   └── api/                  # Python FastAPI Backend Gateway (REST & WebSockets)
├── services/
│   └── audio-engine/         # Python Audio DSP (Librosa, FFmpeg) & LangGraph AI
├── packages/
│   └── shared-types/         # Cross-package TypeScript interfaces & schemas
├── infrastructure/
│   └── docker/               # Service Dockerfiles
├── docs/
│   └── architecture.md       # Monorepo architecture & agent boundary guide
├── docker-compose.yml        # Multi-container local orchestration
├── .env.example              # Environment variables template
├── .gitignore                # Root gitignore covering Node, Python, and artifacts
└── README.md
```

Detailed architectural specifications and boundary rules for parallel development are available in [docs/architecture.md](docs/architecture.md).

---

## Quick Start

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [Python](https://www.python.org/) (v3.11+)
- [Docker](https://www.docker.com/) & Docker Compose

### 2. Environment Setup
Copy the example environment file and configure secrets as needed:
```bash
cp .env.example .env
```

### 3. Running with Docker Compose (Recommended)
Launch the entire stack (Web, API, Audio Engine, PostgreSQL, Redis) with a single command:
```bash
docker compose up --build
```
- **Web App:** http://localhost:3000
- **FastAPI Docs:** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/health

### 4. Running Locally (Backend + Audio Engine + Frontend)

#### Step 1: Start Backend API & Audio Engine (`apps/api` + `services/audio-engine`)
In Terminal 1, create a virtual environment, install dependencies (which include both FastAPI and the Librosa/LangGraph audio engine), and start `uvicorn` on port `8000`:

**macOS / Linux:**
```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt -r ../../services/audio-engine/requirements.txt
PYTHONPATH=".:../../services/audio-engine" uvicorn app.main:app --reload --port 8000
```

**Windows (PowerShell):**
```powershell
cd apps/api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt -r ..\..\services\audio-engine\requirements.txt
$env:PYTHONPATH=".;..\..\services\audio-engine"
uvicorn app.main:app --reload --port 8000
```

#### Step 2: Start Next.js Frontend (`apps/web`)
In Terminal 2, install Node dependencies and start the development server on port `3000`:

```bash
cd apps/web
npm install
npm run dev
```

#### One-Liner Local Dev Startup (from Repo Root)
- **Windows (PowerShell):**
  ```powershell
  Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd apps/api; .\.venv\Scripts\Activate.ps1; uvicorn app.main:app --reload --port 8000"
  cd apps/web; npm run dev
  ```
- **macOS / Linux:**
  ```bash
  (cd apps/api && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000) & (cd apps/web && npm run dev)
  ```

#### Running Standalone Audio Engine CLI (`services/audio-engine`)
```bash
python services/audio-engine/cli.py path/to/track.wav --styles "Neo Soul,Jazz,Pop,Fingerstyle"
```

---

## Contributing & Agent Guidelines

- All sub-projects maintain strictly isolated dependencies. **Do not create `package.json` or `requirements.txt` in the root directory.**
- When adding or modifying data exchange structures, update [packages/shared-types](packages/shared-types) first.
