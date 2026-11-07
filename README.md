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

### 4. Running Sub-Projects Locally

#### Frontend (`apps/web`)
```bash
cd apps/web
npm install
npm run dev
```

#### API Backend (`apps/api`)
```bash
cd apps/api
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

#### Audio Engine (`services/audio-engine`)
```bash
cd services/audio-engine
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

---

## Contributing & Agent Guidelines

- All sub-projects maintain strictly isolated dependencies. **Do not create `package.json` or `requirements.txt` in the root directory.**
- When adding or modifying data exchange structures, update [packages/shared-types](packages/shared-types) first.
