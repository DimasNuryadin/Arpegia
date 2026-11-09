# Arpegia Monorepo — Agent Rules & Directory Jail Specification (Phase 3)

This document defines the strict directory boundaries, read-only contract guarantees, and operational constraints for parallel autonomous agents working on **Arpegia Phase 3 (AI Music Intelligence: Fingerstyle & Style Arrangement Generator, Re-harmonization, and Multi-Format Export for MIDI, MusicXML/GuitarPro, and PDF)**.

---

## 1. Gate 2 Parallel Agent Directory Jails

During Gate 2 parallel execution, each specialized agent is strictly confined to its assigned directory jail. **Zero file-overlap is permitted across agents.**

| Agent Role | Strict Directory Jail (Read/Write Allowed) | Forbidden Directories (No Edits Allowed) |
| :--- | :--- | :--- |
| **Web Agent** | `apps/web/` | `apps/api/`, `services/audio-engine/`, `packages/`, `docs/`, `infrastructure/`, root files |
| **API Agent** | `apps/api/` | `apps/web/`, `services/audio-engine/`, `packages/`, `docs/`, `infrastructure/`, root files |
| **Audio Engine Agent** | `services/audio-engine/` | `apps/web/`, `apps/api/`, `packages/`, `docs/`, `infrastructure/`, root files |

### Specific Agent Responsibilities within Jails
- **Web Agent (`apps/web/`):**
  - Maintain all Phase 1 & Phase 2 UI capabilities (`ChordVoicingDiagram`, `TablatureViewer`, `InteractiveTabEditor`, `PUT /api/v1/analyze/{job_id}/tablature`).
  - Implement Phase 3 UI components: Fingerstyle & Style Arrangement Generator studio (`POST /api/v1/analyze/{job_id}/arrange`), polyphonic voice role visualization (`melody`, `bass`, `harmony`, `percussive`), arrangement variation switcher (`arrangements`), and Multi-Format Export controls (`GET /api/v1/analyze/{job_id}/export` for `midi`, `musicxml`, `ascii`, and `pdf`).
  - Consume physical contracts from `packages/shared-types/index.ts` (or mirror into `apps/web/src/types/index.ts` in strict alignment with `packages/shared-types/index.ts`).
- **API Agent (`apps/api/`):**
  - Mirror and/or import the Pydantic v2 contracts from `packages/shared-types/schemas.py` into `apps/api/app/schemas/analysis.py`.
  - Extend `POST /api/v1/analyze`, `GET /api/v1/analyze/{job_id}`, and `PUT /api/v1/analyze/{job_id}/tablature` to include `arrangements: List[ArrangementVariation]` (with at least 1 default Fingerstyle arrangement generated during analysis).
  - Implement `POST /api/v1/analyze/{job_id}/arrange` accepting `ArrangementRequest` (`style`, `difficulty`, `capo`, `tempo_scale`), returning the newly generated `ArrangementVariation` (`200 OK`), and appending/updating it in the stored job's `arrangements` list.
  - Implement `GET /api/v1/analyze/{job_id}/export` accepting query params `format` (`midi` | `musicxml` | `ascii` | `pdf`) and optional `arrangement_id`, returning the binary/text stream with the canonical `Content-Type` and `Content-Disposition: attachment; filename="arpegia-<job_id>.<ext>"`.
- **Audio Engine Agent (`services/audio-engine/`):**
  - Maintain Phase 1 & Phase 2 DSP, chord diagram resolution (`ChordDiagram`), and biomechanical fretboard mapping (`TabNote`, `TabMeasure`, `TablatureData`, `ascii_tab`).
  - Implement Phase 3 polyphonic voice separation (`VoiceRole`: `"melody"`, `"bass"`, `"harmony"`, `"percussive"`), style-aware arrangement synthesis (`ArrangementVariation` for `"Fingerstyle"`, `"Neo Soul"`, `"Jazz Chord Melody"`, and `"Acoustic Strumming"`), re-harmonization, and multi-format exporters (`midi`, `musicxml`, `ascii`, `pdf`).
  - Extend the LangGraph pipeline (`engine/orchestrator.py`) to populate `arrangements` (with at least 1 default Fingerstyle arrangement) conforming strictly to `packages/shared-types/schemas.py`.

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
| **Backend API Gateway (FastAPI)** | `apps/api/` | `8000` | `http://localhost:8000` (`/api/v1/analyze`) |
| **Audio Engine (Library / Worker)** | `services/audio-engine/` | N/A (In-process / Worker) | Invoked by `apps/api` or CLI |

---

## 5. Verification Checklist for Agents

Before completing any task in Gate 2, each agent must run `git status` and verify:
- Every modified or untracked file resides strictly inside the agent's assigned directory jail (`apps/web/`, `apps/api/`, or `services/audio-engine/`).
- `packages/`, `docs/api-contract.md`, `docs/architecture.md`, `AGENT_RULES.md`, and `.env.example` remain completely untouched.
- No root lockfiles, temporary audio/export artifacts, or build caches are left untracked in the repository.
