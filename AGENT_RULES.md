# Arpegia Monorepo — Agent Rules & Directory Jail Specification (Phase 5)

This document defines the strict directory boundaries, read-only contract guarantees, and operational constraints for parallel autonomous agents working on **Arpegia Phase 5 (Live Microphone Guitar Tuner & Real-Time Mic Chord Detector with Distraction-Free UX)**.

---

## 1. Gate 2 Parallel Agent Directory Jails

During Gate 2 parallel execution, each specialized agent is strictly confined to its assigned directory jail. **Zero file-overlap is permitted across agents.**

| Agent Role | Strict Directory Jail (Read/Write Allowed) | Forbidden Directories (No Edits Allowed) |
| :--- | :--- | :--- |
| **Web Agent** | `apps/web/` | `apps/api/`, `services/audio-engine/`, `packages/`, `docs/`, `infrastructure/`, root files |
| **API Agent** | `apps/api/` | `apps/web/`, `services/audio-engine/`, `packages/`, `docs/`, `infrastructure/`, root files |
| **Audio Engine Agent** | `services/audio-engine/` | `apps/web/`, `apps/api/`, `packages/`, `docs/`, `infrastructure/`, root files |

### Specific Agent Responsibilities within Jails (Phase 5)

- **Web Agent (`apps/web/`):**
  - Maintain all Phase 1–4 capabilities (`ChordVoicingDiagram`, `TablatureViewer`, `InteractiveTabEditor`, `ArrangementGenerator`, `MultiFormatExport`, and real-time async pipeline progress streaming).
  - Implement the **Live Microphone Guitar Tuner UI**:
    * Web Audio API integration (`AudioContext`, `MediaStreamAudioSourceNode`, `AnalyserNode`, or AudioWorklet for pitch detection via YIN/autocorrelation).
    * Precision pitch deviation meter / needle gauge (`-50.0` to `+50.0` cents), target frequency display, detected note badge, and tuning status badge (`in_tune` when `|cents_deviation| <= 3.5`, `flat`, or `sharp`).
    * 6-string visual selector (strings 1 to 6) with auto-detect string mode and manual string override.
    * Preset switcher supporting all 5 canonical tunings: `standard`, `drop_d`, `half_step_down`, `open_g`, and `dadgad` (fetching definitions from `GET /api/v1/tuner/presets` or using client-side cache).
  - Implement the **Real-Time Mic Chord Detector & Distraction-Free UX**:
    * Live microphone capture streaming 12-bin chroma energy vectors or PCM audio frames via WebSocket (`WS /ws/live-chord`) with automatic HTTP fallback (`POST /api/v1/live/detect-chord`).
    * Distraction-free live jamming HUD mode: full-screen high-contrast display of detected chord (e.g., `Cmaj7`, `Am`), root, quality, confidence meter, detected notes list, and real-time 6-string SVG `ChordDiagram` voicing.
    * Resilient WebSocket connection management (automatic reconnection with backoff, heartbeat `{ "type": "ping" }` support, and offline graceful degradation).
  - Consume physical contracts strictly from `packages/shared-types/index.ts` (or mirror into `apps/web/src/types/index.ts` in 100% alignment).

- **API Agent (`apps/api/`):**
  - Maintain all Phase 1–4 endpoints (`POST /api/v1/analyze`, `GET /api/v1/analyze/{job_id}/progress`, `WS /ws/analyze/{job_id}`, `PUT /api/v1/analyze/{job_id}/tablature`, `POST /api/v1/analyze/{job_id}/arrange`, `GET /api/v1/analyze/{job_id}/export`).
  - Implement `GET /api/v1/tuner/presets`:
    * Returns `200 OK` with `List[TuningPreset]` (`standard`, `drop_d`, `half_step_down`, `open_g`, `dadgad`) and exact target frequencies in Hz.
  - Implement `POST /api/v1/live/detect-chord`:
    * Accepts `LiveChordFrameRequest` (12-bin `chroma` vector or `pcm_samples` buffer) and returns `200 OK` with `LiveChordDetectionResult` including the matching `ChordDiagram`.
  - Implement `WS /ws/live-chord`:
    * Real-time WebSocket endpoint on Port `8000` accepting JSON frames matching `LiveChordFrameRequest` (or `{ "type": "ping" }`) and streaming back `LiveChordDetectionResult` in real time for low-latency mic jamming.
  - Wire request handlers to call `services/audio-engine`'s `live_detector` helper functions (`get_tuning_presets()`, `evaluate_tuner_pitch()`, `detect_live_chord_from_frame()`).
  - Mirror/import Pydantic v2 contracts from `packages/shared-types/schemas.py` into `apps/api/app/schemas/`.

- **Audio Engine Agent (`services/audio-engine/`):**
  - Maintain Phase 1–4 DSP, Demucs separation, Basic Pitch transcription, Viterbi fretboard mapping, polyphonic Fingerstyle arrangement synthesis, and multi-format exporters.
  - Implement Phase 5 live detection module in `services/audio-engine/engine/live_detector.py`:
    * `get_tuning_presets(reference_a4_hz: float = 440.0) -> list[dict]`: returns presets for standard, drop_d, half_step_down, open_g, dadgad with 6 string targets each (ordered string 6 Low to string 1 High) with note, frequency_hz, and midi.
    * `evaluate_tuner_pitch(frequency_hz: float, preset_id: str = "standard", target_string: Optional[int] = None) -> dict`: evaluates pitch against preset targets, computing cents deviation `1200 * log2(f / target_f)`, status (`in_tune` when `abs(cents) <= 3.5`, `flat`, `sharp`), confidence, and closest string.
    * `detect_live_chord_from_frame(chroma: Optional[list[float]] = None, pcm_samples: Optional[list[float]] = None, sample_rate: int = 22050) -> dict`: identifies chord from 12-bin chroma vector or PCM audio window using chord templates / chromagram, returning chord symbol, root, quality, confidence, notes detected, and matching `ChordDiagram`.
  - Ensure 100% offline, deterministic, sub-50ms execution.

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
| **Backend API Gateway (FastAPI)** | `apps/api/` | `8000` | `http://localhost:8000`<br>`/api/v1/tuner/presets`<br>`/api/v1/live/detect-chord`<br>`ws://localhost:8000/ws/live-chord`<br>`/api/v1/analyze`<br>`ws://localhost:8000/ws/analyze/{job_id}` |
| **Audio Engine (Library / Worker)** | `services/audio-engine/` | N/A (In-process / Worker) | Invoked by `apps/api` or CLI |

---

## 5. Verification Checklist for Agents

Before completing any task in Gate 2, each agent must run `git status` and verify:
- Every modified or untracked file resides strictly inside the agent's assigned directory jail (`apps/web/`, `apps/api/`, or `services/audio-engine/`).
- `packages/`, `docs/api-contract.md`, `docs/architecture.md`, `AGENT_RULES.md`, and `.env.example` remain completely untouched.
- No root lockfiles, temporary audio/export artifacts, or build caches are left untracked in the repository.
