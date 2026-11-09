# Arpegia Monorepo — Agent Rules & Directory Jail Specification (Phase 4)

This document defines the strict directory boundaries, read-only contract guarantees, and operational constraints for parallel autonomous agents working on **Arpegia Phase 4 (Real-Time Async Pipeline Progress Streaming: Separating Stems -> Detecting Key & Chords -> Transcribing Guitar Tab -> Generating AI Arrangement -> Completed)**.

---

## 1. Gate 2 Parallel Agent Directory Jails

During Gate 2 parallel execution, each specialized agent is strictly confined to its assigned directory jail. **Zero file-overlap is permitted across agents.**

| Agent Role | Strict Directory Jail (Read/Write Allowed) | Forbidden Directories (No Edits Allowed) |
| :--- | :--- | :--- |
| **Web Agent** | `apps/web/` | `apps/api/`, `services/audio-engine/`, `packages/`, `docs/`, `infrastructure/`, root files |
| **API Agent** | `apps/api/` | `apps/web/`, `services/audio-engine/`, `packages/`, `docs/`, `infrastructure/`, root files |
| **Audio Engine Agent** | `services/audio-engine/` | `apps/web/`, `apps/api/`, `packages/`, `docs/`, `infrastructure/`, root files |

### Specific Agent Responsibilities within Jails (Phase 4)

- **Web Agent (`apps/web/`):**
  - Maintain all Phase 1, Phase 2, and Phase 3 UI capabilities (`ChordVoicingDiagram`, `TablatureViewer`, `InteractiveTabEditor`, `ArrangementGenerator`, `MultiFormatExport`).
  - Implement real-time pipeline progress streaming UI via WebSocket (`ws://localhost:8000/ws/analyze/{job_id}`) with automatic fallback to HTTP polling (`GET /api/v1/analyze/{job_id}/progress`) using `ARPEGIA_ASYNC_POLL_INTERVAL_MS` (default `800` ms).
  - Add `async_mode=true` query parameter support to `POST /api/v1/analyze?async_mode=true` upon audio upload, immediately switching to the progress streaming view upon receiving `202 Accepted` / `200 OK` with the initial `JobProgressEvent` / `job_id`.
  - Render the 5 ordered pipeline stages with animated progress indicators, overall percentage bar (`0%` -> `100%`), step status badges (`pending`, `in_progress`, `completed`, `skipped`, `failed`), and dynamic step details (`detail`).
  - Gracefully transition into completed analysis state upon receiving `job.completed` with the full `result: AnalysisResponse`, or display structured error banner on `job.failed`.
  - Consume physical contracts from `packages/shared-types/index.ts` (or mirror into `apps/web/src/types/index.ts` in strict alignment).

- **API Agent (`apps/api/`):**
  - Maintain 100% backward compatibility for synchronous `POST /api/v1/analyze` (`async_mode=false` or omitted), executing the pipeline and returning `200 OK` with complete `AnalysisResponse`.
  - Implement async analysis mode `POST /api/v1/analyze?async_mode=true`, returning `202 Accepted` (or `200 OK`) with initial `JobProgressEvent` / `job_id` and launching background execution.
  - Implement HTTP polling endpoint `GET /api/v1/analyze/{job_id}/progress`, returning the latest `JobProgressEvent` snapshot.
  - Implement WebSocket endpoint `WS /ws/analyze/{job_id}` on Port `8000`, pushing real-time `JobProgressEvent` frames whenever the progress callback fires, closing cleanly on `job.completed` or `job.failed`.
  - Wire `services/audio-engine`'s `run_pipeline(..., progress_callback=...)` to update job progress state and broadcast events to connected WebSocket clients and polling cache.
  - Mirror/import Pydantic v2 contracts from `packages/shared-types/schemas.py` into `apps/api/app/schemas/analysis.py`.

- **Audio Engine Agent (`services/audio-engine/`):**
  - Maintain Phase 1, Phase 2, and Phase 3 audio signal processing (Librosa), chord diagram resolution (`ChordDiagram`), biomechanical fretboard tab generation (`TablatureData`), style arrangement synthesis (`ArrangementVariation`), and multi-format exporters (`midi`, `musicxml`, `ascii`, `pdf`).
  - Extend `run_pipeline` in `engine/orchestrator.py` to accept the canonical progress callback signature:
    `run_pipeline(audio_path: str, filename: str = "upload.mp3", progress_callback: Optional[Callable[[str, int, str, Optional[str]], None]] = None) -> dict`
    where the callback receives `(stage: str, progress_percent: int, message: str, detail: Optional[str])`.
  - Implement progress milestone emissions across the 5 canonical pipeline stages:
    1. `separating_stems` (0% -> 25%): Demucs 4-stem source separation (or fast-skip if disabled).
    2. `detecting_key_tempo` (25% -> 40%): Audio loading, BPM, and Krumhansl-Schmuckler key detection.
    3. `detecting_chords` (40% -> 60%): Chromagram chord recognition, voicings & style improvisations.
    4. `transcribing_tablature` (60% -> 85%): Basic Pitch polyphonic extraction & Viterbi fretboard mapping.
    5. `generating_arrangement` (85% -> 100%): Polyphonic Fingerstyle arrangement & final output validation.
  - Ensure the pipeline operates 100% offline/deterministically without external API dependencies.

---

## 2. Read-Only Contract & Root Lock Rules

During **Gate 2 parallel execution**, the following paths are **STRICTLY READ-ONLY** for all agents:

- `packages/` (including `packages/shared-types/index.ts`, `packages/shared-types/schemas.py`, and `packages/shared-types/src/*`)
- `docs/api-contract.md` and `docs/architecture.md`
- `AGENT_RULES.md`
- `.env.example`
- Repository root files (`README.md`, `docker-compose.yml`, `.gitignore`)

> **CRITICAL:** If an agent detects a perceived schema mismatch during Gate 2, it MUST adapt its internal implementation inside its directory jail to conform to the locked contracts in `packages/shared-types/` and `docs/api-contract.md`. Never mutate shared contracts during parallel execution.

---

## 3. Root Dependency & Lockfile Prohibition

1. **NEVER run `npm install`, `pnpm install`, or `yarn install` at the repository root.**
2. **NEVER create `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `node_modules/`, `requirements.txt`, or `.venv/` at the repository root.**
3. All Node.js commands (`npm install`, `npm run build`, `npm test`) MUST be executed solely inside `apps/web/` (or `packages/shared-types/` during Gate 1 type verification).
4. All Python virtual environments and `pip install` commands MUST be scoped to `apps/api/` or `services/audio-engine/`.

---

## 4. Canonical Port Registry

All agents and services must adhere to the following port assignments:

| Service | Directory | Port | Base URL / Endpoint |
| :--- | :--- | :--- | :--- |
| **Web Frontend (Next.js)** | `apps/web/` | `3000` | `http://localhost:3000` |
| **Backend API Gateway (FastAPI)** | `apps/api/` | `8000` | `http://localhost:8000` (`/api/v1/analyze`, `/ws/analyze/{job_id}`) |
| **Audio Engine (Library / Worker)** | `services/audio-engine/` | N/A (In-process / Worker) | Invoked by `apps/api` or CLI |

---

## 5. Verification Checklist for Agents

Before completing any task in Gate 2, each agent must run `git status` and verify:
- Every modified or untracked file resides strictly inside the agent's assigned directory jail (`apps/web/`, `apps/api/`, or `services/audio-engine/`).
- `packages/`, `docs/api-contract.md`, `docs/architecture.md`, `AGENT_RULES.md`, and `.env.example` remain completely untouched.
- No root lockfiles, temporary audio/export artifacts, or build caches are left untracked in the repository.
