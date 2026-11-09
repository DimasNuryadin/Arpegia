# Arpegia Monorepo Architecture & Package Boundaries (Phase 1, Phase 2, Phase 3 & Phase 4)

## 1. System Overview

Arpegia is an AI-powered Guitar Intelligence Platform engineered to ingest audio files (MP3/WAV), extract musical key, tempo, and chord progressions, synthesize biomechanically realistic guitar tablature (`TablatureData`), generate 6-string chord voicing diagrams (`ChordDiagram`), enable interactive fretboard & tab editing, synthesize polyphonic style & fingerstyle arrangements (`ArrangementVariation`), perform genre-aware re-harmonization, export playable scores to MIDI, MusicXML/GuitarPro, ASCII Tab, and PDF, and stream real-time pipeline execution progress via WebSockets and HTTP polling.

The repository is organized as a multi-package monorepo designed for clean boundary separation and conflict-free parallel development across multiple specialized agents.

---

## 2. Monorepo Directory Boundaries & Ownership

```
arpegia/
├── apps/
│   ├── web/                  # Next.js App Router (TypeScript, Tailwind, React 19) — Port 3000
│   └── api/                  # Python FastAPI REST & WebSocket Gateway — Port 8000
├── services/
│   └── audio-engine/         # Python DSP (Librosa, FFmpeg), Tab & Arrangement Synthesizer, Exporters & LangGraph AI
├── packages/
│   └── shared-types/         # Cross-package TypeScript (index.ts) & Pydantic v2 (schemas.py) contracts
├── infrastructure/
│   └── docker/               # Dedicated Dockerfiles for each service
├── docs/
│   ├── architecture.md       # System architecture & agent boundary specifications
│   └── api-contract.md       # Canonical Phase 1, Phase 2, Phase 3 & Phase 4 REST & schema contracts
├── AGENT_RULES.md            # Strict Gate 2 directory jail & read-only enforcement rules
├── docker-compose.yml        # Local development orchestration
├── .env.example              # Canonical environment variable specifications
├── .gitignore                # Unified monorepo ignore rules
└── README.md                 # Primary project entry point
```

### Canonical Port Registry

| Service | Directory | Port | Base URL / Protocols |
| :--- | :--- | :--- | :--- |
| **Web Frontend (Next.js)** | `apps/web/` | `3000` | `http://localhost:3000` |
| **Backend API Gateway (FastAPI)** | `apps/api/` | `8000` | `http://localhost:8000`<br>`ws://localhost:8000/ws/analyze/{job_id}` |
| **Audio Engine (DSP & LangGraph)** | `services/audio-engine/` | In-process / Worker | Invoked by `apps/api` or CLI |

### Boundary Guidelines for Parallel Agents (Gate 2)

| Path | Primary Language | Boundary Scope & Responsibilities | Allowed Cross-Imports |
| :--- | :--- | :--- | :--- |
| **`apps/web`** | TypeScript / React | User interface, audio timeline, `ChordDiagram` visualizer, `TablatureData` viewer, Interactive Tab Editor, Phase 3 Style Arrangement Generator, Multi-Format Export, and Phase 4 Real-Time Pipeline Streaming UI (WebSocket connection with automatic HTTP polling fallback). | Consumes `@arpegia/shared-types`. Must **never** modify `packages/` or backend Python files during Gate 2. |
| **`apps/api`** | Python (FastAPI) | HTTP & WebSocket routing (`POST /api/v1/analyze`, `GET /api/v1/analyze/{job_id}`, `GET /api/v1/analyze/{job_id}/progress`, `WS /ws/analyze/{job_id}`, `PUT /api/v1/analyze/{job_id}/tablature`, `POST /api/v1/analyze/{job_id}/arrange`, `GET /api/v1/analyze/{job_id}/export`), background task lifecycle, and `services/audio-engine` orchestration. | References `packages/shared-types/schemas.py` and invokes `services/audio-engine`. |
| **`services/audio-engine`** | Python | Core audio signal processing (Librosa), key/BPM/chord detection, polyphonic/monophonic note transcription, biomechanical guitar fret-string optimization (`TabNote`, `TabMeasure`, `ascii_tab`), chord diagram resolution (`ChordDiagram`), Phase 3 polyphonic voice separation (`VoiceRole`), style arrangement generator (`ArrangementVariation`), multi-format exporters, and LangGraph pipeline orchestration with real-time `progress_callback` across the 5 pipeline stages. | Operates as a modular processing engine invoked by `apps/api` or standalone CLI. |
| **`packages/shared-types`** | TypeScript & Python | **READ-ONLY in Gate 2.** Source of truth for TypeScript interfaces (`index.ts`) and Python Pydantic v2 schemas (`schemas.py`). | Imported/mirrored by `apps/web`, `apps/api`, and `services/audio-engine`. |
| **`infrastructure/`** | Docker / Compose | Containerization scripts and system setup. | References app files from build contexts. |

---

## 3. Phase 4 Communication & Streaming Flows

```
[apps/web (Next.js :3000)]
       │
       │── (1) POST /api/v1/analyze?async_mode=true (MP3/WAV) ──► [apps/api (FastAPI :8000)]
       │◄─ (2) 202 Accepted { job_id, event: "job.progress" } ───┤ (Spawns background task)
       │                                                         │
       │── (3) WS connect: /ws/analyze/{job_id} ────────────────►│ (FastAPI WebSocket Route)
       │   (or fallback: GET /api/v1/analyze/{job_id}/progress)  │
       │                                                         ▼ (4) run_pipeline(..., progress_callback)
       │                                                 [services/audio-engine]
       │                                                  ├─ (0%-25%)   separating_stems
       │                                                  ├─ (25%-40%)  detecting_key_tempo
       │                                                  ├─ (40%-60%)  detecting_chords
       │                                                  ├─ (60%-85%)  transcribing_tablature
       │                                                  └─ (85%-100%) generating_arrangement
       │                                                         │
       │◄─ (5) WS Frame: JobProgressEvent ("job.progress") ◄─────┤ (Progress callback updates)
       │◄─ (6) WS Final: JobProgressEvent ("job.completed") ◄────┘ (Contains full AnalysisResponse result)
       │       (WebSocket cleanly closed by server)
       │
       ├── (7) PUT /api/v1/analyze/{job_id}/tablature ──────────► [apps/api (FastAPI :8000)]
       │       (Interactive Tab Editor updates note/measure)
       │
       ├── (8) POST /api/v1/analyze/{job_id}/arrange ───────────► [apps/api (FastAPI :8000)]
       │       (Generates custom style arrangement variation)
       │
       └── (9) GET /api/v1/analyze/{job_id}/export ─────────────► [apps/api (FastAPI :8000)]
               (?format=midi|musicxml|ascii|pdf&arrangement_id=...)
```

### The 5 Ordered Pipeline Stages & Percentage Milestones

| Stage Index | Stage Identifier (`PipelineStage`) | Milestone Range | Processing Description |
| :---: | :--- | :---: | :--- |
| **1** | `separating_stems` | **0% -> 25%** | Demucs 4-stem source separation (isolates guitar, bass, drums, vocals) or deterministic fast-skip if disabled. |
| **2** | `detecting_key_tempo` | **25% -> 40%** | Audio loading, onset detection, tempo / BPM tracking, and Krumhansl-Schmuckler key profile correlation. |
| **3** | `detecting_chords` | **40% -> 60%** | Constant-Q / chromagram harmonic analysis, chord label estimation, voicing resolution, and genre-specific re-harmonization suggestions. |
| **4** | `transcribing_tablature` | **60% -> 85%** | Basic Pitch polyphonic note extraction, note segmentation, and biomechanical fretboard optimization via Viterbi shortest-path decoding (`TabNote`, `TabMeasure`, `ascii_tab`). |
| **5** | `generating_arrangement` | **85% -> 100%** | Polyphonic voice separation (`VoiceRole`: melody, bass, harmony, percussive), style arrangement generation (`ArrangementVariation`), and final score validation. |

### Progress Callback & Async Mode Architecture

1. **Synchronous Mode (Default):**
   - Invocation: `POST /api/v1/analyze` (or `async_mode=false`).
   - Behavior: Synchronously executes `run_pipeline(...)`, returning `200 OK` with complete `AnalysisResponse`. 100% backward compatible with existing test suites.
2. **Asynchronous Mode:**
   - Invocation: `POST /api/v1/analyze?async_mode=true`.
   - Behavior: Creates an in-memory job, launches `run_pipeline(audio_path, filename, progress_callback)` in a FastAPI background task, and returns `202 Accepted` with initial `JobProgressEvent` (`status="processing"`, `current_stage="separating_stems"`, `job_id`).
3. **Real-Time Streaming (`WS /ws/analyze/{job_id}`):**
   - The web client connects to `ws://localhost:8000/ws/analyze/{job_id}` upon receiving the `job_id`.
   - Each time `progress_callback(stage, percent, message, detail)` fires in `services/audio-engine`, `apps/api` constructs a `JobProgressEvent` frame and broadcasts it to connected WebSocket clients.
   - When the pipeline completes, a final frame (`event: "job.completed"`) containing the complete `AnalysisResponse` in `result` is transmitted, and the connection closes cleanly.
   - If an error occurs, an error frame (`event: "job.failed"`) with structured `error` envelope is sent before closure.
4. **HTTP Polling Fallback (`GET /api/v1/analyze/{job_id}/progress`):**
   - If WebSocket connection fails or is blocked by network infrastructure, `apps/web` falls back to polling `GET /api/v1/analyze/{job_id}/progress` at intervals specified by `ARPEGIA_ASYNC_POLL_INTERVAL_MS` (default `800` ms).

---

## 4. Multi-Agent Development Principles (Gate 1 & Gate 2)

To prevent merge conflicts and maintain system integrity when multiple agents work concurrently (see [`AGENT_RULES.md`](../AGENT_RULES.md)):

1. **Strict Directory Jails (Gate 2):**
   - **Web Agent** is strictly confined to `apps/web/`.
   - **API Agent** is strictly confined to `apps/api/`.
   - **Audio Engine Agent** is strictly confined to `services/audio-engine/`.
2. **Read-Only Shared Contracts in Gate 2:**
   - `packages/`, `docs/api-contract.md`, `docs/architecture.md`, `AGENT_RULES.md`, and `.env.example` are **READ-ONLY** during Gate 2 execution.
3. **No Root Package Contamination:**
   - Never run `npm install` at the repository root or create `package.json`, `package-lock.json`, `node_modules/`, or `requirements.txt` in the root directory.
