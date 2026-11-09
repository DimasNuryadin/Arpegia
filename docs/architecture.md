# Arpegia Monorepo Architecture & Package Boundaries (Phase 1, Phase 2 & Phase 3)

## 1. System Overview

Arpegia is an AI-powered Guitar Intelligence Platform engineered to ingest audio files (MP3/WAV), extract musical key, tempo, and chord progressions, synthesize biomechanically realistic guitar tablature (`TablatureData`), generate 6-string chord voicing diagrams (`ChordDiagram`), enable interactive fretboard & tab editing, synthesize polyphonic style & fingerstyle arrangements (`ArrangementVariation`), perform genre-aware re-harmonization, and export playable scores to MIDI, MusicXML/GuitarPro, ASCII Tab, and PDF.

The repository is organized as a multi-package monorepo designed for clean boundary separation and conflict-free parallel development across multiple specialized agents.

---

## 2. Monorepo Directory Boundaries & Ownership

```
arpegia/
├── apps/
│   ├── web/                  # Next.js App Router (TypeScript, Tailwind, React 19) — Port 3000
│   └── api/                  # Python FastAPI REST Gateway — Port 8000
├── services/
│   └── audio-engine/         # Python DSP (Librosa, FFmpeg), Tab & Arrangement Synthesizer, Exporters & LangGraph AI
├── packages/
│   └── shared-types/         # Cross-package TypeScript (index.ts) & Pydantic v2 (schemas.py) contracts
├── infrastructure/
│   └── docker/               # Dedicated Dockerfiles for each service
├── docs/
│   ├── architecture.md       # System architecture & agent boundary specifications
│   └── api-contract.md       # Canonical Phase 1, Phase 2 & Phase 3 REST & schema contracts
├── AGENT_RULES.md            # Strict Gate 2 directory jail & read-only enforcement rules
├── docker-compose.yml        # Local development orchestration
├── .env.example              # Canonical environment variable specifications
├── .gitignore                # Unified monorepo ignore rules
└── README.md                 # Primary project entry point
```

### Canonical Port Registry

| Service | Directory | Port | Base URL |
| :--- | :--- | :--- | :--- |
| **Web Frontend (Next.js)** | `apps/web/` | `3000` | `http://localhost:3000` |
| **Backend API Gateway (FastAPI)** | `apps/api/` | `8000` | `http://localhost:8000` |
| **Audio Engine (DSP & LangGraph)** | `services/audio-engine/` | In-process / Worker | Invoked by `apps/api` or CLI |

### Boundary Guidelines for Parallel Agents (Gate 2)

| Path | Primary Language | Boundary Scope & Responsibilities | Allowed Cross-Imports |
| :--- | :--- | :--- | :--- |
| **`apps/web`** | TypeScript / React | User interface, audio timeline, `ChordDiagram` visualizer, `TablatureData` viewer, Interactive Tab Editor (`PUT /api/v1/analyze/{job_id}/tablature`), Phase 3 Style & Fingerstyle Arrangement Generator (`POST /api/v1/analyze/{job_id}/arrange`), polyphonic `VoiceRole` color-coding, and Multi-Format Export (`GET /api/v1/analyze/{job_id}/export` for `midi`, `musicxml`, `ascii`, `pdf`). | Consumes `@arpegia/shared-types`. Must **never** modify `packages/` or backend Python files during Gate 2. |
| **`apps/api`** | Python (FastAPI) | HTTP routing (`POST /api/v1/analyze`, `GET /api/v1/analyze/{job_id}`, `PUT /api/v1/analyze/{job_id}/tablature`, `POST /api/v1/analyze/{job_id}/arrange`, `GET /api/v1/analyze/{job_id}/export`), Pydantic validation, job persistence, and `services/audio-engine` orchestration. | References `packages/shared-types/schemas.py` and invokes `services/audio-engine`. |
| **`services/audio-engine`** | Python | Core audio signal processing (Librosa), key/BPM/chord detection, polyphonic/monophonic note transcription, biomechanical guitar fret-string optimization (`TabNote`, `TabMeasure`, `ascii_tab`), chord diagram resolution (`ChordDiagram`), Phase 3 polyphonic voice separation (`VoiceRole`), style arrangement generator (`ArrangementVariation`), re-harmonization, multi-format exporters (`midi`, `musicxml`, `ascii`, `pdf`), and LangGraph music intelligence. | Operates as a modular processing engine invoked by `apps/api` or standalone CLI. |
| **`packages/shared-types`** | TypeScript & Python | **READ-ONLY in Gate 2.** Source of truth for TypeScript interfaces (`index.ts`) and Python Pydantic v2 schemas (`schemas.py`). | Imported/mirrored by `apps/web`, `apps/api`, and `services/audio-engine`. |
| **`infrastructure/`** | Docker / Compose | Containerization scripts and system setup. | References app files from build contexts. |

---

## 3. Phase 3 Communication Flows

```
[apps/web (Next.js :3000)]
       │
       ├──── (1) POST /api/v1/analyze (Multipart MP3/WAV) ─────────► [apps/api (FastAPI :8000)]
       │                                                                    │
       │                                                                    ▼ (2) Run Pipeline
       │                                                            [services/audio-engine]
       │                                                             ├─ KeyAndTempoNode
       │                                                             ├─ ChordDetectionNode
       │                                                             ├─ ImprovisationNode
       │                                                             ├─ ChordDiagramNode
       │                                                             ├─ TablatureGenerationNode
       │                                                             └─ ArrangementGenerationNode
       │                                                                    │
       │◄─── (3) AnalysisResponse (chords, diagrams, tablature, ◄───────────┘
       │         arrangements [default Fingerstyle variation])
       │
       ├──── (4) PUT /api/v1/analyze/{job_id}/tablature ───────────► [apps/api (FastAPI :8000)]
       │     (Interactive Tab Editor validates string/fret/technique        │
       │      edits, recomputes MIDI/note_name & regenerates ascii_tab) ◄───┘
       │
       ├──── (5) POST /api/v1/analyze/{job_id}/arrange ────────────► [apps/api (FastAPI :8000)]
       │     (ArrangementRequest: style, difficulty, capo, tempo_scale)     │
       │◄─── Returns ArrangementVariation & appends to job.arrangements ◄───┘
       │
       └──── (6) GET /api/v1/analyze/{job_id}/export ──────────────► [apps/api (FastAPI :8000)]
             (?format=midi|musicxml|ascii|pdf&arrangement_id=...)           │
             Returns downloadable stream (arpegia-<job_id>.<ext>) ◄─────────┘
```

1. **Audio Upload & Guitar Intelligence Analysis (`POST /api/v1/analyze`):** `apps/web` uploads an audio file to `apps/api`, which invokes `services/audio-engine` (with deterministic fallback) to return `AnalysisResponse` containing `metadata`, `chords`, `improvisations`, `chord_diagrams`, `tablature`, and `arrangements` (pre-populated with at least 1 default `"Fingerstyle"` arrangement variation).
2. **Job Retrieval (`GET /api/v1/analyze/{job_id}`):** Retrieves a previously computed `AnalysisResponse` (including all generated `arrangements`) by `job_id`.
3. **Interactive Tablature Editing (`PUT /api/v1/analyze/{job_id}/tablature`):** Validates physical guitar constraints (`string` 1–6, `fret` 0–24), recalculates `midi` and `note_name`, regenerates the 6-line `ascii_tab`, persists the updated job, and returns the updated `AnalysisResponse`.
4. **Style & Fingerstyle Arrangement Generation (`POST /api/v1/analyze/{job_id}/arrange`):** Generates a new `ArrangementVariation` for the requested `style` (`"Fingerstyle"`, `"Neo Soul"`, `"Jazz Chord Melody"`, `"Acoustic Strumming"`), `difficulty` (`"Beginner"`, `"Intermediate"`, `"Advanced"`), `capo` (`0..12`), and `tempo_scale` (`0.5..1.5`), separating notes into polyphonic `VoiceRole` layers (`"melody"`, `"bass"`, `"harmony"`, `"percussive"`), appending/updating the variation in the job's `arrangements` list, and returning the `ArrangementVariation`.
5. **Multi-Format Score & Tablature Export (`GET /api/v1/analyze/{job_id}/export`):** Exports either the primary `tablature` or a selected `arrangement_id` as a binary/text attachment (`midi`, `musicxml`, `ascii`, or `pdf`) with canonical `Content-Type` and `Content-Disposition: attachment; filename="arpegia-<job_id>.<ext>"`.

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
