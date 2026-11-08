# Arpegia

> **AI-Powered Guitar Intelligence Platform**  
> Audio Analysis • Chord Detection • Guitar Tablature Generation • Chord Voicing Diagrams • Interactive Tab Editor & Web Audio Synth

---

## Overview

Arpegia is an advanced music intelligence platform engineered specifically for guitarists. It ingests audio tracks (MP3/WAV), extracts musical key, tempo, and chord progressions with sub-second accuracy, generates ergonomically playable guitar tablature, and suggests AI-powered reharmonizations and fingerstyle arrangements.

### Phase 2 Guitar Intelligence Capabilities
- **Automated Guitar Tablature Transcription (`services/audio-engine`):** Extracts note onsets and fundamental pitches (pYIN), computes biomechanically optimal string and fret positions on a 6-string fretboard (minimizing hand strain and position shifts), detects articulation techniques (`normal`, `hammer-on`, `pull-off`, `slide`, `bend`), segments into measures, and renders a canonical 6-line ASCII tablature preview.
- **6-String Chord Voicing Diagrams (`apps/web` & `services/audio-engine`):** Resolves chord shapes with explicit 6-string frets (`-1` for muted, `0` for open, `1..24` for fretted), finger assignments (`0..4`), and base fret markers for open chords, barre chords, jazz/neo-soul extensions, and slash chords. Rendered cleanly via SVG diagrams.
- **Interactive Tab Editor (`apps/web`):** Allows musicians to select any transcribed note on the tab timeline, adjust its guitar string (1 to 6), fret (0 to 24), and technique, audition pitch changes in real time, and persist edits to the backend.
- **Web Audio Plucked String Synthesizer (`apps/web`):** Standalone zero-dependency Web Audio API synthesizer that models guitar string decay, harmonics, and articulation techniques for note auditioning and synchronized tablature playback.
- **Tablature Persistence API (`apps/api`):** Supports `PUT /api/v1/analyze/{job_id}/tablature` to update note positions, recompute MIDI numbers and scientific note names, regenerate canonical ASCII tabs, and persist state.

---

## Monorepo Architecture

This repository is structured as an isolated, multi-service monorepo:

```
arpegia/
├── apps/
│   ├── web/                  # Next.js 16 App Router, TypeScript, Tailwind CSS, Web Audio Synth
│   └── api/                  # Python FastAPI Backend Gateway (REST & WebSockets)
├── services/
│   └── audio-engine/         # Python Audio DSP (Librosa, SoundFile) & LangGraph AI Orchestration
├── packages/
│   └── shared-types/         # Cross-package TypeScript interfaces & Pydantic v2 schemas
├── infrastructure/
│   └── docker/               # Dockerfiles (Dockerfile.api, Dockerfile.web, Dockerfile.audio-engine)
├── scripts/
│   └── e2e_test.mjs          # Cross-platform automated Phase 2 E2E smoke test
├── docs/
│   ├── api-contract.md       # Phase 1 & Phase 2 REST and data model specification
│   └── architecture.md       # Monorepo architecture & agent boundary guide
├── docker-compose.yml        # Multi-container local orchestration with healthchecks
├── pytest.ini                # Monorepo pytest configuration
├── .env.example              # Complete environment variables template
├── .gitignore                # Root gitignore covering Node, Python, and artifacts
└── README.md
```

Detailed architectural specifications and boundary rules for development are available in [docs/architecture.md](docs/architecture.md).  
API specifications and schemas are documented in [docs/api-contract.md](docs/api-contract.md).

---

## Canonical Port Registry

| Service | Workspace Path | Port | Health Check / Base URL |
| :--- | :--- | :--- | :--- |
| **Web Frontend (Next.js)** | `apps/web/` | `3000` | `http://localhost:3000` |
| **Backend API Gateway (FastAPI)** | `apps/api/` | `8000` | `http://localhost:8000/health` |
| **Audio Engine (DSP & LangGraph)** | `services/audio-engine/` | In-process / Worker | Invoked directly by `apps/api` |

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

`NEXT_PUBLIC_USE_MOCK=false` is set by default for live integrated communication between the frontend and backend, while preserving the frontend UI Mock Mode toggle as a fallback.

### 3. Running with Docker Compose (Recommended)
Launch the entire stack with container healthchecks:
```bash
docker compose up --build
```
- **Web App:** http://localhost:3000
- **FastAPI Docs:** http://localhost:8000/docs
- **Health Check:** http://localhost:8000/health

### 4. Running Locally

#### Step 1: Start Backend API & Audio Engine (`apps/api` + `services/audio-engine`)
In Terminal 1, create a virtual environment, install dependencies, and start `uvicorn`:

**macOS / Linux:**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r apps/api/requirements.txt -r services/audio-engine/requirements.txt
PYTHONPATH="apps/api:services/audio-engine" uvicorn app.main:app --app-dir apps/api --reload --port 8000
```

**Windows (PowerShell):**
```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r apps/api/requirements.txt -r services/audio-engine/requirements.txt
$env:PYTHONPATH="apps/api;services/audio-engine"
uvicorn app.main:app --app-dir apps/api --reload --port 8000
```

#### Step 2: Start Next.js Frontend (`apps/web`)
In Terminal 2, install dependencies and start the development server:

```bash
cd apps/web
npm install
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to view the live application.

---

## Phase 2 REST API

### `POST /api/v1/analyze`
Uploads an audio file (`multipart/form-data`, field `file`), runs key/tempo detection, chord progression extraction, style improvisations, 6-string chord voicing diagrams, and guitar tablature transcription.

### `GET /api/v1/analyze/{job_id}`
Retrieves a previously analyzed job by ID, including its full `chord_diagrams` and `tablature` structures.

### `PUT /api/v1/analyze/{job_id}/tablature`
Updates note positions or measures from the Interactive Tab Editor, validates ranges, recalculates MIDI pitches and note names, and regenerates canonical 6-line ASCII tablature.

**Sample Request Payload:**
```json
{
  "capo": 0,
  "difficulty": "Intermediate",
  "notes": [
    {
      "id": "note-1",
      "string": 5,
      "fret": 10,
      "technique": "slide"
    }
  ]
}
```

---

## Testing & Smoke Verification

### 1. Automated Cross-Platform E2E Smoke Test (`node scripts/e2e_test.mjs`)
The automated E2E smoke test runs a complete Phase 2 user journey:
1. Asserts `GET /health` returns `200 OK`.
2. Generates a synthetic multi-note guitar WAV file (arpeggiated E Minor melody with realistic string harmonics and decay).
3. Uploads the audio to `POST /api/v1/analyze` and validates Phase 2 `chord_diagrams` and `tablature` with 6-string bounds (`string` 1-6, `fret` 0-24, 6-line `ascii_tab`).
4. Executes `PUT /api/v1/analyze/{job_id}/tablature` modifying a note's fret and technique (`slide`), validating that the returned and persisted `ascii_tab` contains `"4/"` articulation.
5. Verifies persistence via `GET /api/v1/analyze/{job_id}`.

To run the E2E smoke test:
```bash
node scripts/e2e_test.mjs
```
*(If the backend is not running, the script will automatically spawn a local instance, verify the journey, and cleanly shut down.)*

### 2. Pytest Test Suite
To run all unit, integration, and E2E tests across `apps/api` and `services/audio-engine`:
```bash
pytest
```
*(Uses configuration defined in `pytest.ini` with `--import-mode=importlib`.)*

### 3. Frontend Production Build
To verify the Next.js TypeScript build:
```bash
cd apps/web && npm run build
```

---

## Contributing & Agent Guidelines

- All sub-projects maintain strictly isolated dependencies. **Do not create `package.json` or `requirements.txt` in the root directory.**
- When adding or modifying data exchange structures, update [packages/shared-types](packages/shared-types) and [docs/api-contract.md](docs/api-contract.md) first.
