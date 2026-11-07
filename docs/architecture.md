# Arpegia Monorepo Architecture & Package Boundaries

## 1. System Overview

Arpegia is an AI-powered Guitar Intelligence Platform engineered to ingest audio files (MP3/WAV), extract musical key, tempo, and chord progressions, synthesize biomechanically realistic guitar tablature, and provide AI-driven chord reharmonizations and fingerstyle arrangements.

The repository is organized as a multi-package monorepo designed for clean boundary separation and conflict-free parallel development across multiple specialized agents.

---

## 2. Monorepo Directory Boundaries & Ownership

```
arpegia/
├── apps/
│   ├── web/                  # Next.js App Router (TypeScript, Tailwind, React 19)
│   └── api/                  # Python FastAPI REST & WebSocket Gateway
├── services/
│   └── audio-engine/         # Python DSP (Librosa, FFmpeg) & LangGraph AI
├── packages/
│   └── shared-types/         # Cross-package TypeScript definitions & contracts
├── infrastructure/
│   └── docker/               # Dedicated Dockerfiles for each service
├── docs/                     # Architectural specs, RFCs, and API documentation
├── docker-compose.yml        # Local development orchestration
├── .env.example              # Canonical environment variable specifications
├── .gitignore                # Unified monorepo ignore rules
└── README.md                 # Primary project entry point
```

### Boundary Guidelines for Agents

| Path | Primary Language | Boundary Scope & Responsibilities | Allowed Cross-Imports |
| :--- | :--- | :--- | :--- |
| **`apps/web`** | TypeScript / React | User interface, waveform visualization, interactive fretboard & chord progression cards, AlphaTab playback. | Can consume `@arpegia/shared-types`. Must **never** import backend Python files. |
| **`apps/api`** | Python (FastAPI) | HTTP routing, authentication, PostgreSQL persistence, task dispatching to Redis/Celery, WebSocket progress streaming. | Dispatches jobs to `services/audio-engine` via task queues. |
| **`services/audio-engine`** | Python | Core audio signal processing (Librosa), chord detection, polyphonic note tracking, LangGraph music intelligence. | Operates as a stateless or worker-backed processing engine. |
| **`packages/shared-types`** | TypeScript | Source of truth for API response contracts, chord event schemas, and guitar tab data structures. | Imported by `apps/web`. Serves as reference contract for `apps/api` Pydantic models. |
| **`infrastructure/`** | Docker / Compose | Containerization scripts and system setup. | References app files from build contexts. |

---

## 3. Communication Flows

```
[apps/web (Next.js)]
       │
       ├──── (1) POST /api/v1/audio/upload (Multipart) ────► [apps/api (FastAPI)]
       │                                                            │
       │                                                            ▼ (2) Enqueue Job
       │                                                     [Redis Queue]
       │                                                            │
       │                                                            ▼ (3) Worker Ingestion
       │◄─── (5) WebSocket Job Progress Updates ─────────── [services/audio-engine]
       │                                                            │
       └──── (6) GET /api/v1/tracks/{id}/tab ◄──────────────────────┘ (4) Persist Analysis
```

1. **Client to API Gateway:** `apps/web` communicates with `apps/api` exclusively through typed REST endpoints and WebSockets for real-time analysis progress.
2. **API to Audio Engine:** `apps/api` communicates with `services/audio-engine` via asynchronous job queues (Celery over Redis) to ensure long-running audio processing never blocks HTTP threads.
3. **Data Storage:** Audio files are stored in S3/MinIO; relational data and high-frequency chord timeline entries are stored in PostgreSQL.

---

## 4. Multi-Agent Development Principles

To prevent merge conflicts and maintain system integrity when multiple agents or contributors work concurrently:

1. **Strict Folder Isolation:**
   - Frontend agents must restrict code changes to `apps/web/` and `packages/shared-types/`.
   - Backend API agents must restrict code changes to `apps/api/`.
   - AI / Audio processing agents must restrict code changes to `services/audio-engine/`.
2. **No Root Package Contamination:**
   - No `package.json` or `requirements.txt` shall be placed in the repository root. All dependencies are scoped strictly to their respective app or service folder.
3. **Schema First:**
   - Changes to API payload formats or musical structures must be updated first in `packages/shared-types` and mirrored in `apps/api/app/schemas/` before UI or service implementations are updated.
