# Arpegia API & Data Contract Specification (Phase 1, Phase 2, Phase 3 & Phase 4)

> **Status:** LOCKED (Gate 1 Physical Contract — Phase 4)  
> **TypeScript Source of Truth:** [`packages/shared-types/index.ts`](../packages/shared-types/index.ts)  
> **Python Pydantic v2 Source of Truth:** [`packages/shared-types/schemas.py`](../packages/shared-types/schemas.py)

---

## 1. Canonical Port Registry

| Service | Workspace Path | Port | Base URL / Protocols |
| :--- | :--- | :--- | :--- |
| **Web Frontend (Next.js)** | `apps/web/` | `3000` | `http://localhost:3000` |
| **Backend API Gateway (FastAPI)** | `apps/api/` | `8000` | `http://localhost:8000`<br>`ws://localhost:8000/ws/analyze/{job_id}` |
| **Audio Engine (DSP & LangGraph)** | `services/audio-engine/` | In-process / Worker | Invoked by `apps/api` |

---

## 2. Physical Data Models (Phase 1 + Phase 2 + Phase 3 + Phase 4)

### 2.1 Phase 3 Enum / Literal Types
- `ArrangementStyle`: `Literal["Fingerstyle", "Neo Soul", "Jazz Chord Melody", "Acoustic Strumming"]`
- `DifficultyLevel`: `Literal["Beginner", "Intermediate", "Advanced"]`
- `ExportFormat`: `Literal["midi", "musicxml", "ascii", "pdf"]`
- `VoiceRole`: `Literal["melody", "bass", "harmony", "percussive"]`

### 2.2 Phase 4 Pipeline Stages & Milestones
- `PipelineStage`: `Literal["queued", "separating_stems", "detecting_key_tempo", "detecting_chords", "transcribing_tablature", "generating_arrangement", "completed", "failed"]`
- `StageStatus`: `Literal["pending", "in_progress", "completed", "skipped", "failed"]`

#### Ordered 5 Pipeline Stages & Milestone Percentage Breakdown:
1. `separating_stems` (**0% -> 25%**): Demucs 4-stem source separation (isolates guitar, bass, drums, vocals) or deterministic fast-skip if disabled.
2. `detecting_key_tempo` (**25% -> 40%**): Audio loading, beat tracking (BPM), and Krumhansl-Schmuckler key signature detection.
3. `detecting_chords` (**40% -> 60%**): Chromagram harmonic analysis, chord recognition, voicings, and genre-specific improvisations.
4. `transcribing_tablature` (**60% -> 85%**): Polyphonic pitch extraction (Basic Pitch) and biomechanical fretboard optimization via Viterbi trellis decoding.
5. `generating_arrangement` (**85% -> 100%**): Polyphonic fingerstyle voice separation (thumb bass + plucked melody), style arrangement synthesis, and output validation.

### 2.3 `PipelineStepInfo` (Phase 4)
Tracks the progress and granular status of an individual pipeline step:
- `stage`: `PipelineStage` — The pipeline stage identifier (`"separating_stems"`, `"detecting_key_tempo"`, etc.).
- `label`: `string` — Human-readable display label (e.g., `"Separating Audio Stems (Demucs)"`).
- `status`: `StageStatus` — `"pending"` | `"in_progress"` | `"completed"` | `"skipped"` | `"failed"`.
- `progress_percent`: `int` — Step-level progress from `0` to `100`.
- `detail`: `Optional[string]` — Granular runtime feedback (e.g., `"Isolating guitar & bass tracks..."`, `"Detected G Major @ 105 BPM"`).

### 2.4 `JobProgressEvent` (Phase 4)
Canonical progress event frame streamed over WebSocket (`WS /ws/analyze/{job_id}`) and polled via `GET /api/v1/analyze/{job_id}/progress`:
- `event`: `Literal["job.progress", "job.completed", "job.failed"]` — Event classification.
- `job_id`: `string` — Unique analysis job identifier.
- `status`: `Literal["queued", "processing", "completed", "failed"]` — High-level lifecycle state.
- `current_stage`: `PipelineStage` — The currently executing pipeline stage.
- `overall_percent`: `int` — Total aggregated pipeline progress (`0` to `100`).
- `message`: `string` — User-facing progress summary message (e.g., `"Transcribing guitar tablature..."`).
- `steps`: `List[PipelineStepInfo]` — Complete ordered list of all 5 pipeline steps and their real-time states.
- `updated_at`: `string` — ISO-8601 UTC timestamp of the progress event (e.g., `"2026-11-09T14:00:00Z"`).
- `result`: `Optional[AnalysisResponse]` — Populated with the full analysis payload when `status == "completed"`.
- `error`: `Optional[dict]` — Populated with the standard `ErrorEnvelope` dict when `status == "failed"`.

### 2.5 `TabNote`
Represents a single transcribed, arranged, or user-edited guitar note mapped to a specific string and fret:
- `id`: `string` — Unique identifier for the note (e.g., `"note-1"`).
- `start_time`: `float` — Note onset timestamp in seconds (`>= 0.0`).
- `duration`: `float` — Note duration in seconds (`>= 0.0`).
- `string`: `int` — Guitar string number from `1` to `6` (`1` = High E4, `6` = Low E2).
- `fret`: `int` — Fret number from `0` to `24` (`0` = open string).
- `midi`: `int` — MIDI pitch number (e.g., `40` = E2 to `88` = E6).
- `note_name`: `string` — Scientific pitch name (e.g., `"E4"`, `"G#3"`).
- `confidence`: `float` — Transcription confidence score (`0.0` to `1.0`).
- `technique`: `Literal["normal", "hammer-on", "pull-off", "slide", "bend"]` — Playing articulation.
- `voice`: `Optional[VoiceRole]` — Default `"melody"`. Enables polyphonic Fingerstyle separation between thumb bass notes on strings `4–6` (`"bass"`) and plucked melody/arpeggio notes on strings `1–3` (`"melody"`, `"harmony"`, `"percussive"`).

### 2.6 `TabMeasure`
- `measure_number`: `int` — 1-based measure index (`>= 1`).
- `start_time`: `float` — Measure start time in seconds.
- `end_time`: `float` — Measure end time in seconds.
- `notes`: `List[TabNote]` — Chronologically ordered notes within the measure.

### 2.7 `TablatureData`
- `tuning`: `List[str]` — 6-string tuning from Low E (string 6) to High E (string 1), default `["E2", "A2", "D3", "G3", "B3", "E4"]`.
- `capo`: `int` — Capo fret position (default `0`, range `0..12`).
- `difficulty`: `DifficultyLevel` (`Literal["Beginner", "Intermediate", "Advanced"]`) — Estimated playability tier.
- `measures`: `List[TabMeasure]` — Measure-by-measure tablature breakdown.
- `ascii_tab`: `str` — Pre-rendered 6-line ASCII tablature preview for quick view and `.txt` export.

### 2.8 `ChordDiagram`
- `chord`: `str` — Chord symbol (e.g., `"G"`, `"Cmaj7"`).
- `frets`: `List[int]` — Length 6 (Low E to High E): `-1` for muted string, `0` for open string, `1..24` for fretted string.
- `fingers`: `List[int]` — Length 6 (Low E to High E): `0` for open/muted, `1..4` for index to pinky finger.
- `base_fret`: `int` — Starting fret of the diagram (default `1`).

### 2.9 `ArrangementVariation` (Phase 3)
Represents a complete playable style arrangement generated during initial analysis or on demand:
- `arrangement_id`: `str` — Unique identifier for the arrangement variation (e.g., `"arr-fingerstyle-default"`).
- `title`: `str` — Human-readable title (e.g., `"Fingerstyle Solo Arrangement"`).
- `style`: `ArrangementStyle` — `"Fingerstyle"` | `"Neo Soul"` | `"Jazz Chord Melody"` | `"Acoustic Strumming"`.
- `difficulty`: `DifficultyLevel` — `"Beginner"` | `"Intermediate"` | `"Advanced"`.
- `description`: `str` — Summary of voice leading, bassline pattern, and chord substitutions used.
- `chords_used`: `List[str]` — Sequence of reharmonized or arranged chord symbols used in the variation.
- `tablature`: `TablatureData` — Complete playable 6-string tab with `measures`, polyphonic `notes` (with `voice`), and `ascii_tab`.

### 2.10 `ArrangementRequest` (Phase 3)
Request payload for generating a custom arrangement variation (`POST /api/v1/analyze/{job_id}/arrange`):
- `style`: `ArrangementStyle` — Target style (`"Fingerstyle"`, `"Neo Soul"`, `"Jazz Chord Melody"`, `"Acoustic Strumming"`).
- `difficulty`: `DifficultyLevel` — Target difficulty (`"Beginner"`, `"Intermediate"`, `"Advanced"`).
- `capo`: `int` — Capo fret position (default `0`, range `0` to `12`).
- `tempo_scale`: `float` — Tempo scaling multiplier (default `1.0`, range `0.5` to `1.5`).

---

## 3. Internal Python Callback Contract (`apps/api` <-> `services/audio-engine`)

The orchestrator in `services/audio-engine` exposes a callable signature accepting an optional real-time progress callback:

```python
def run_pipeline(
    audio_path: str,
    filename: str = "upload.mp3",
    progress_callback: Optional[Callable[[str, int, str, Optional[str]], None]] = None,
) -> dict:
    """Executes the 5-stage guitar intelligence pipeline with optional progress reporting.
    
    Args:
        audio_path: Absolute filesystem path to the uploaded audio file.
        filename: Original file name.
        progress_callback: Optional callback invoked across pipeline milestones:
            callback(stage: str, progress_percent: int, message: str, detail: Optional[str])
            - stage: One of PipelineStage literals ('separating_stems', 'detecting_key_tempo', etc.)
            - progress_percent: Total overall progress percentage (0 to 100).
            - message: High-level milestone summary message.
            - detail: Granular diagnostics or step details.
    
    Returns:
        dict: Conforming to AnalysisOutput / AnalysisResponse schemas.
    """
```

---

## 4. REST & Real-Time Endpoints (`apps/api` — Port `8000`)

### 4.1 `POST /api/v1/analyze` — Upload Audio & Run Pipeline (Synchronous or Asynchronous)

Accepts an MP3 or WAV audio file (`multipart/form-data`, field `file`, max 25MB). Supports dual execution modes:

- **Method:** `POST`
- **URL:** `http://localhost:8000/api/v1/analyze`
- **Query Parameter:**
  - `async_mode` (*optional*, boolean, default `false`):
    * `false` (default): Synchronous mode. Blocks until pipeline completion, returns `200 OK` with full `AnalysisResponse`. Preserves 100% backward compatibility with Phase 1–3 callers.
    * `true`: Asynchronous streaming mode. Immediately registers job, triggers background task, and returns `202 Accepted` (or `200 OK`) with the initial `JobProgressEvent` snapshot and `job_id`.
- **Form Field:** `file` (`.mp3` or `.wav`)

#### Async Mode Response (`202 Accepted` / `200 OK` with `JobProgressEvent`):
```json
{
  "event": "job.progress",
  "job_id": "7b084e85-4bc5-4dbb-a639-c1ee824c6020",
  "status": "processing",
  "current_stage": "separating_stems",
  "overall_percent": 5,
  "message": "Separating audio stems...",
  "steps": [
    {
      "stage": "separating_stems",
      "label": "Separating Audio Stems (Demucs)",
      "status": "in_progress",
      "progress_percent": 20,
      "detail": "Isolating guitar and bass tracks..."
    },
    {
      "stage": "detecting_key_tempo",
      "label": "Detecting Musical Key & Tempo",
      "status": "pending",
      "progress_percent": 0,
      "detail": null
    },
    {
      "stage": "detecting_chords",
      "label": "Recognizing Chords & Improvisations",
      "status": "pending",
      "progress_percent": 0,
      "detail": null
    },
    {
      "stage": "transcribing_tablature",
      "label": "Transcribing Guitar Tablature (Basic Pitch + Viterbi)",
      "status": "pending",
      "progress_percent": 0,
      "detail": null
    },
    {
      "stage": "generating_arrangement",
      "label": "Generating Fingerstyle Arrangement",
      "status": "pending",
      "progress_percent": 0,
      "detail": null
    }
  ],
  "updated_at": "2026-11-09T14:00:00Z",
  "result": null,
  "error": null
}
```

#### Synchronous Response (`200 OK` with complete `AnalysisResponse`):
```json
{
  "job_id": "7b084e85-4bc5-4dbb-a639-c1ee824c6020",
  "status": "completed",
  "metadata": {
    "filename": "song.mp3",
    "duration": 180.5,
    "key": "G Major",
    "bpm": 105,
    "time_signature": "4/4"
  },
  "chords": [
    {
      "chord": "G",
      "start_time": 0.0,
      "end_time": 2.4,
      "confidence": 0.94
    }
  ],
  "improvisations": [
    {
      "original_chord": "G",
      "style": "Neo Soul",
      "suggestions": ["Gmaj7", "G6/9"]
    }
  ],
  "chord_diagrams": [
    {
      "chord": "G",
      "frets": [3, 2, 0, 0, 0, 3],
      "fingers": [2, 1, 0, 0, 0, 3],
      "base_fret": 1
    }
  ],
  "tablature": {
    "tuning": ["E2", "A2", "D3", "G3", "B3", "E4"],
    "capo": 0,
    "difficulty": "Beginner",
    "measures": [
      {
        "measure_number": 1,
        "start_time": 0.0,
        "end_time": 2.4,
        "notes": [
          {
            "id": "note-1",
            "start_time": 0.0,
            "duration": 0.6,
            "string": 6,
            "fret": 3,
            "midi": 43,
            "note_name": "G2",
            "confidence": 0.95,
            "technique": "normal",
            "voice": "bass"
          }
        ]
      }
    ],
    "ascii_tab": "e|-----------------|\nB|-----------------|\nG|-----------------|\nD|-----------------|\nA|-----------------|\nE|-3---------------|"
  },
  "arrangements": [
    {
      "arrangement_id": "arr-fingerstyle-default",
      "title": "Fingerstyle Solo Arrangement",
      "style": "Fingerstyle",
      "difficulty": "Intermediate",
      "description": "Alternating thumb bass on strings 4-6 with syncopated melody and open-string harmonic resonance on strings 1-3.",
      "chords_used": ["Gmaj7", "Em9", "Cmaj9", "D11"],
      "tablature": {
        "tuning": ["E2", "A2", "D3", "G3", "B3", "E4"],
        "capo": 0,
        "difficulty": "Intermediate",
        "measures": [],
        "ascii_tab": ""
      }
    }
  ],
  "progress": null
}
```

---

### 4.2 `GET /api/v1/analyze/{job_id}/progress` — Poll Pipeline Progress (HTTP Fallback)

Returns the latest `JobProgressEvent` snapshot for clients unable to maintain a persistent WebSocket connection.

- **Method:** `GET`
- **URL:** `http://localhost:8000/api/v1/analyze/{job_id}/progress`
- **Response (`200 OK`):** `JobProgressEvent`
- **Error (`404 Not Found`):** Job ID does not exist (`ErrorEnvelope` with `JOB_NOT_FOUND`).

---

### 4.3 `WS /ws/analyze/{job_id}` — Real-Time Pipeline Progress WebSocket

Provides low-latency, bi-directional event streaming for real-time progress visualization on Port `8000`.

- **Protocol:** `WebSocket` (`WS`)
- **URL:** `ws://localhost:8000/ws/analyze/{job_id}`
- **Server Push Frames:** Pushes JSON-serialized `JobProgressEvent` frames whenever the orchestrator's `progress_callback` fires.
- **Connection Lifecycle:**
  1. Frontend opens WebSocket connection upon receiving `job_id` from `POST /api/v1/analyze?async_mode=true`.
  2. Server accepts connection, immediately broadcasts current `JobProgressEvent` snapshot.
  3. Server pushes subsequent frames as each stage advances (`event: "job.progress"`).
  4. On pipeline completion, server emits final `job.completed` frame containing full `result: AnalysisResponse`, then closes connection cleanly (`code 1000 Normal Closure`).
  5. On failure, server emits `job.failed` frame containing structured `error` envelope, then closes cleanly (`code 1000` or `1011`).

#### WebSocket Final Completion Frame Example:
```json
{
  "event": "job.completed",
  "job_id": "7b084e85-4bc5-4dbb-a639-c1ee824c6020",
  "status": "completed",
  "current_stage": "completed",
  "overall_percent": 100,
  "message": "Analysis completed successfully!",
  "steps": [
    {
      "stage": "separating_stems",
      "label": "Separating Audio Stems (Demucs)",
      "status": "completed",
      "progress_percent": 100,
      "detail": "Stem separation finished"
    },
    {
      "stage": "detecting_key_tempo",
      "label": "Detecting Musical Key & Tempo",
      "status": "completed",
      "progress_percent": 100,
      "detail": "Key: G Major, BPM: 105"
    },
    {
      "stage": "detecting_chords",
      "label": "Recognizing Chords & Improvisations",
      "status": "completed",
      "progress_percent": 100,
      "detail": "Identified 4 chords"
    },
    {
      "stage": "transcribing_tablature",
      "label": "Transcribing Guitar Tablature (Basic Pitch + Viterbi)",
      "status": "completed",
      "progress_percent": 100,
      "detail": "Generated 8 measures"
    },
    {
      "stage": "generating_arrangement",
      "label": "Generating Fingerstyle Arrangement",
      "status": "completed",
      "progress_percent": 100,
      "detail": "Default Fingerstyle arrangement generated"
    }
  ],
  "updated_at": "2026-11-09T14:00:15Z",
  "result": {
    "job_id": "7b084e85-4bc5-4dbb-a639-c1ee824c6020",
    "status": "completed",
    "metadata": { "filename": "song.mp3", "duration": 180.5, "key": "G Major", "bpm": 105, "time_signature": "4/4" },
    "chords": [],
    "improvisations": [],
    "chord_diagrams": [],
    "tablature": { "tuning": ["E2","A2","D3","G3","B3","E4"], "capo": 0, "difficulty": "Beginner", "measures": [], "ascii_tab": "" },
    "arrangements": []
  },
  "error": null
}
```

---

### 4.4 `GET /api/v1/analyze/{job_id}` — Retrieve Analysis Job

Retrieves an existing `AnalysisResponse` (including `chord_diagrams`, `tablature`, and `arrangements`) by `job_id`.

- **Method:** `GET`
- **URL:** `http://localhost:8000/api/v1/analyze/{job_id}`
- **Response (`200 OK`):** `AnalysisResponse`
- **Error (`404 Not Found`):** Job ID does not exist (`ErrorEnvelope` with `JOB_NOT_FOUND`).

---

### 4.5 `PUT /api/v1/analyze/{job_id}/tablature` — Update Tablature & Regenerate ASCII Tab

Allows the Interactive Tab Editor in `apps/web` to validate and save user-edited `TabNote` positions (`string`, `fret`, `technique`, optional `voice`) or updated `measures` (`tuning`, `capo`, `difficulty`), recalculate `midi` and `note_name` for modified notes, and regenerate the 6-line `ascii_tab`.

- **Method:** `PUT`
- **URL:** `http://localhost:8000/api/v1/analyze/{job_id}/tablature`
- **Content-Type:** `application/json`
- **Request Schema:** `TablatureUpdateRequest` (supports updating via `notes` patch array and/or full `measures` list)
- **Response (`200 OK`):** Complete updated `AnalysisResponse` (including `arrangements`).

#### Validation & Processing Rules:
1. Validate `job_id` exists (`404` if not found).
2. Validate every edited note has `1 <= string <= 6` (`1 = High E4`, `6 = Low E2`), `0 <= fret <= 24`, and `technique` in `["normal", "hammer-on", "pull-off", "slide", "bend"]` (`422` / `400` if out of range).
3. Recompute `midi` and `note_name` from `(tuning, capo, string, fret)` so pitch metadata stays physically consistent with fretboard edits.
4. Regenerate the 6-line `ascii_tab` string from the updated measures and notes.
5. Save the updated job in `analyzer_service` and return the complete updated `AnalysisResponse` (`200 OK`).

---

### 4.6 `POST /api/v1/analyze/{job_id}/arrange` — Generate Style & Fingerstyle Arrangement (Phase 3)

Synthesizes a new playable guitar arrangement variation (`ArrangementVariation`) for an existing analysis job, appends/updates it in the stored job's `arrangements` list, and returns the generated `ArrangementVariation`.

- **Method:** `POST`
- **URL:** `http://localhost:8000/api/v1/analyze/{job_id}/arrange`
- **Content-Type:** `application/json`
- **Request Schema:** `ArrangementRequest`
- **Response (`200 OK`):** `ArrangementVariation`

---

### 4.7 `GET /api/v1/analyze/{job_id}/export` — Multi-Format Tablature & Score Export (Phase 3)

Exports the job's primary `tablature` or a specific `ArrangementVariation` (`arrangement_id`) into a downloadable file stream in **MIDI** (`.mid`), **MusicXML** (`.musicxml`), **ASCII Tab** (`.txt`), or **PDF** (`.pdf`).

- **Method:** `GET`
- **URL:** `http://localhost:8000/api/v1/analyze/{job_id}/export?format={format}&arrangement_id={arrangement_id}`
- **Query Parameters:**
  - `format` (**required**): `ExportFormat` (`midi` | `musicxml` | `ascii` | `pdf`)
  - `arrangement_id` (*optional*): `str`
- **Response (`200 OK`):** Binary or text file stream with format-specific headers:

| `format` Query Param | File Extension (`<ext>`) | `Content-Type` Header | `Content-Disposition` Header |
| :--- | :--- | :--- | :--- |
| `midi` | `mid` | `audio/midi` | `attachment; filename="arpegia-<job_id>.mid"` |
| `musicxml` | `musicxml` | `application/vnd.recordare.musicxml+xml` | `attachment; filename="arpegia-<job_id>.musicxml"` |
| `ascii` | `txt` | `text/plain; charset=utf-8` | `attachment; filename="arpegia-<job_id>.txt"` |
| `pdf` | `pdf` | `application/pdf` | `attachment; filename="arpegia-<job_id>.pdf"` |

---

## 5. Standard Error Envelope

All API errors follow a structured error envelope (`ErrorEnvelope` in `packages/shared-types`):

```json
{
  "error": {
    "code": "UNSUPPORTED_EXPORT_FORMAT",
    "message": "Export format must be one of: midi, musicxml, ascii, pdf.",
    "details": {
      "field": "format",
      "received": "gp5"
    }
  }
}
```

| HTTP Status | Error Code | Description |
| :--- | :--- | :--- |
| `400 Bad Request` | `INVALID_AUDIO_FORMAT` | Unsupported audio extension or MIME type |
| `400 Bad Request` | `UNSUPPORTED_EXPORT_FORMAT` | Unsupported or invalid export format parameter |
| `400 Bad Request` | `INVALID_ARRANGEMENT_REQUEST` | Invalid style, difficulty, capo, or tempo_scale parameter |
| `404 Not Found` | `JOB_NOT_FOUND` | Requested `job_id` was not found in store |
| `404 Not Found` | `ARRANGEMENT_NOT_FOUND` | Requested `arrangement_id` was not found on the specified job |
| `413 Payload Too Large` | `FILE_TOO_LARGE` | Uploaded file exceeds 25MB limit |
| `422 Unprocessable Entity` | `VALIDATION_ERROR` | Invalid schema validation failure or parameter range violation |
| `500 Internal Server Error` | `INTERNAL_ERROR` | Unexpected server processing failure |
| `500 Internal Server Error` | `PIPELINE_ERROR` | Pipeline execution failure during audio processing |
