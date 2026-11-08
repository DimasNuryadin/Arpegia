# Arpegia API & Data Contract Specification (Phase 1 & Phase 2)

> **Status:** LOCKED (Gate 1 Physical Contract)  
> **TypeScript Source of Truth:** [`packages/shared-types/index.ts`](../packages/shared-types/index.ts)  
> **Python Pydantic v2 Source of Truth:** [`packages/shared-types/schemas.py`](../packages/shared-types/schemas.py)

---

## 1. Canonical Port Registry

| Service | Workspace Path | Port | Base URL |
| :--- | :--- | :--- | :--- |
| **Web Frontend (Next.js)** | `apps/web/` | `3000` | `http://localhost:3000` |
| **Backend API Gateway (FastAPI)** | `apps/api/` | `8000` | `http://localhost:8000` |
| **Audio Engine (DSP & LangGraph)** | `services/audio-engine/` | In-process / Worker | Invoked by `apps/api` |

---

## 2. Physical Data Models (Phase 1 + Phase 2)

### 2.1 `TabNote`
Represents a single transcribed or user-edited guitar note mapped to a specific string and fret:
- `id`: `string` — Unique identifier for the note (e.g., `"note-1"`).
- `start_time`: `float` — Note onset timestamp in seconds (`>= 0.0`).
- `duration`: `float` — Note duration in seconds (`>= 0.0`).
- `string`: `int` — Guitar string number from `1` to `6` (`1` = High E4, `6` = Low E2).
- `fret`: `int` — Fret number from `0` to `24` (`0` = open string).
- `midi`: `int` — MIDI pitch number (e.g., `40` = E2 to `88` = E6).
- `note_name`: `string` — Scientific pitch name (e.g., `"E4"`, `"G#3"`).
- `confidence`: `float` — Transcription confidence score (`0.0` to `1.0`).
- `technique`: `Literal["normal", "hammer-on", "pull-off", "slide", "bend"]` — Playing articulation.

### 2.2 `TabMeasure`
- `measure_number`: `int` — 1-based measure index (`>= 1`).
- `start_time`: `float` — Measure start time in seconds.
- `end_time`: `float` — Measure end time in seconds.
- `notes`: `List[TabNote]` — Chronologically ordered notes within the measure.

### 2.3 `TablatureData`
- `tuning`: `List[str]` — 6-string tuning from Low E (string 6) to High E (string 1), default `["E2", "A2", "D3", "G3", "B3", "E4"]`.
- `capo`: `int` — Capo fret position (default `0`).
- `difficulty`: `Literal["Beginner", "Intermediate", "Advanced"]` — Estimated playability tier.
- `measures`: `List[TabMeasure]` — Measure-by-measure tablature breakdown.
- `ascii_tab`: `str` — Pre-rendered 6-line ASCII tablature preview for quick view and `.txt` export.

### 2.4 `ChordDiagram`
- `chord`: `str` — Chord symbol (e.g., `"G"`, `"Cmaj7"`).
- `frets`: `List[int]` — Length 6 (Low E to High E): `-1` for muted string, `0` for open string, `1..24` for fretted string.
- `fingers`: `List[int]` — Length 6 (Low E to High E): `0` for open/muted, `1..4` for index to pinky finger.
- `base_fret`: `int` — Starting fret of the diagram (default `1`).

---

## 3. REST Endpoints

### 3.1 `POST /api/v1/analyze` — Upload Audio & Run Guitar Intelligence Pipeline

Accepts an MP3 or WAV audio file (`multipart/form-data`, field `file`, max 25MB), executes the audio engine pipeline (key/BPM detection, chord timeline, style improvisations, chord voicing diagrams, and polyphonic/monophonic guitar tablature generation), stores the job, and returns an `AnalysisResponse`.

- **Method:** `POST`
- **URL:** `http://localhost:8000/api/v1/analyze`
- **Content-Type:** `multipart/form-data`
- **Form Field:** `file` (`.mp3` or `.wav`)
- **Response (`200 OK`):** `AnalysisResponse`

#### Complete `AnalysisResponse` JSON Example:

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
    },
    {
      "chord": "Em",
      "start_time": 2.4,
      "end_time": 4.8,
      "confidence": 0.91
    },
    {
      "chord": "C",
      "start_time": 4.8,
      "end_time": 7.2,
      "confidence": 0.88
    },
    {
      "chord": "D",
      "start_time": 7.2,
      "end_time": 9.6,
      "confidence": 0.92
    }
  ],
  "improvisations": [
    {
      "original_chord": "G",
      "style": "Neo Soul",
      "suggestions": ["Gmaj7", "G6/9"]
    },
    {
      "original_chord": "Em",
      "style": "Neo Soul",
      "suggestions": ["Em9", "Em11"]
    }
  ],
  "chord_diagrams": [
    {
      "chord": "G",
      "frets": [3, 2, 0, 0, 0, 3],
      "fingers": [2, 1, 0, 0, 0, 3],
      "base_fret": 1
    },
    {
      "chord": "Em",
      "frets": [0, 2, 2, 0, 0, 0],
      "fingers": [0, 2, 3, 0, 0, 0],
      "base_fret": 1
    },
    {
      "chord": "C",
      "frets": [-1, 3, 2, 0, 1, 0],
      "fingers": [0, 3, 2, 0, 1, 0],
      "base_fret": 1
    },
    {
      "chord": "D",
      "frets": [-1, -1, 0, 2, 3, 2],
      "fingers": [0, 0, 0, 1, 3, 2],
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
            "technique": "normal"
          },
          {
            "id": "note-2",
            "start_time": 0.6,
            "duration": 0.6,
            "string": 4,
            "fret": 0,
            "midi": 50,
            "note_name": "D3",
            "confidence": 0.93,
            "technique": "normal"
          },
          {
            "id": "note-3",
            "start_time": 1.2,
            "duration": 0.6,
            "string": 3,
            "fret": 0,
            "midi": 55,
            "note_name": "G3",
            "confidence": 0.94,
            "technique": "normal"
          },
          {
            "id": "note-4",
            "start_time": 1.8,
            "duration": 0.6,
            "string": 2,
            "fret": 0,
            "midi": 59,
            "note_name": "B3",
            "confidence": 0.92,
            "technique": "normal"
          }
        ]
      }
    ],
    "ascii_tab": "e|-----------------|\nB|-------------0---|\nG|---------0-------|\nD|-----0-----------|\nA|-----------------|\nE|-3---------------|"
  }
}
```

---

### 3.2 `GET /api/v1/analyze/{job_id}` — Retrieve Analysis Job

Retrieves an existing `AnalysisResponse` (including `chord_diagrams` and `tablature`) by `job_id`.

- **Method:** `GET`
- **URL:** `http://localhost:8000/api/v1/analyze/{job_id}`
- **Response (`200 OK`):** `AnalysisResponse`
- **Error (`404 Not Found`):** Job ID does not exist.

---

### 3.3 `PUT /api/v1/analyze/{job_id}/tablature` — Update Tablature & Regenerate ASCII Tab

Allows the Interactive Tab Editor in `apps/web` to validate and save user-edited `TabNote` positions (`string`, `fret`, `technique`) or updated `measures` (`tuning`, `capo`, `difficulty`), recalculate `midi` and `note_name` for modified notes, and regenerate the 6-line `ascii_tab`.

- **Method:** `PUT`
- **URL:** `http://localhost:8000/api/v1/analyze/{job_id}/tablature`
- **Content-Type:** `application/json`
- **Request Schema:** `TablatureUpdateRequest` (supports updating via `notes` patch array and/or full `measures` list)

#### Example Request Option A (Patching Edited Notes by ID):
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

#### Example Request Option B (Submitting Updated Measures):
```json
{
  "tuning": ["E2", "A2", "D3", "G3", "B3", "E4"],
  "capo": 0,
  "difficulty": "Intermediate",
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
          "string": 5,
          "fret": 10,
          "midi": 55,
          "note_name": "G3",
          "confidence": 1.0,
          "technique": "slide"
        }
      ]
    }
  ]
}
```

#### Validation & Processing Rules:
1. Validate `job_id` exists (`404` if not found).
2. Validate every edited note has `1 <= string <= 6` (`1 = High E4`, `6 = Low E2`), `0 <= fret <= 24`, and `technique` in `["normal", "hammer-on", "pull-off", "slide", "bend"]` (`422` / `400` if out of range).
3. Recompute `midi` and `note_name` from `(tuning, capo, string, fret)` so pitch metadata stays physically consistent with fretboard edits.
4. Regenerate the 6-line `ascii_tab` string from the updated measures and notes (rendering articulation markers such as `h` for hammer-on, `p` for pull-off, `/` for slide, `b` for bend).
5. Save the updated job in `analyzer_service` and return the complete updated `AnalysisResponse` (`200 OK`).

---

## 4. Standard Error Envelope

All API errors follow a structured error envelope (`ErrorEnvelope` in `packages/shared-types`):

```json
{
  "error": {
    "code": "INVALID_TAB_NOTE",
    "message": "Fret position must be between 0 and 24.",
    "details": {
      "note_id": "note-1",
      "field": "fret",
      "received": 29
    }
  }
}
```

| HTTP Status | Error Code | Description |
| :--- | :--- | :--- |
| `400 Bad Request` | `INVALID_AUDIO_FORMAT` | Unsupported audio extension or MIME type |
| `404 Not Found` | `JOB_NOT_FOUND` | Requested `job_id` was not found in store |
| `413 Payload Too Large` | `FILE_TOO_LARGE` | Uploaded file exceeds 25MB limit |
| `422 Unprocessable Entity` | `VALIDATION_ERROR` | Invalid `string` (1-6), `fret` (0-24), or `technique` |
| `500 Internal Server Error` | `INTERNAL_ERROR` | Unexpected server processing failure |
