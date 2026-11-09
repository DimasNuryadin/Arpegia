# Arpegia API & Data Contract Specification (Phase 1, Phase 2 & Phase 3)

> **Status:** LOCKED (Gate 1 Physical Contract — Phase 3)  
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

## 2. Physical Data Models (Phase 1 + Phase 2 + Phase 3)

### 2.1 Phase 3 Enum / Literal Types
- `ArrangementStyle`: `Literal["Fingerstyle", "Neo Soul", "Jazz Chord Melody", "Acoustic Strumming"]`
- `DifficultyLevel`: `Literal["Beginner", "Intermediate", "Advanced"]`
- `ExportFormat`: `Literal["midi", "musicxml", "ascii", "pdf"]`
- `VoiceRole`: `Literal["melody", "bass", "harmony", "percussive"]`

### 2.2 `TabNote`
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

### 2.3 `TabMeasure`
- `measure_number`: `int` — 1-based measure index (`>= 1`).
- `start_time`: `float` — Measure start time in seconds.
- `end_time`: `float` — Measure end time in seconds.
- `notes`: `List[TabNote]` — Chronologically ordered notes within the measure.

### 2.4 `TablatureData`
- `tuning`: `List[str]` — 6-string tuning from Low E (string 6) to High E (string 1), default `["E2", "A2", "D3", "G3", "B3", "E4"]`.
- `capo`: `int` — Capo fret position (default `0`, range `0..12`).
- `difficulty`: `DifficultyLevel` (`Literal["Beginner", "Intermediate", "Advanced"]`) — Estimated playability tier.
- `measures`: `List[TabMeasure]` — Measure-by-measure tablature breakdown.
- `ascii_tab`: `str` — Pre-rendered 6-line ASCII tablature preview for quick view and `.txt` export.

### 2.5 `ChordDiagram`
- `chord`: `str` — Chord symbol (e.g., `"G"`, `"Cmaj7"`).
- `frets`: `List[int]` — Length 6 (Low E to High E): `-1` for muted string, `0` for open string, `1..24` for fretted string.
- `fingers`: `List[int]` — Length 6 (Low E to High E): `0` for open/muted, `1..4` for index to pinky finger.
- `base_fret`: `int` — Starting fret of the diagram (default `1`).

### 2.6 `ArrangementVariation` (Phase 3)
Represents a complete playable style arrangement generated during initial analysis or on demand:
- `arrangement_id`: `str` — Unique identifier for the arrangement variation (e.g., `"arr-fingerstyle-default"`).
- `title`: `str` — Human-readable title (e.g., `"Fingerstyle Solo Arrangement"`).
- `style`: `ArrangementStyle` — `"Fingerstyle"` | `"Neo Soul"` | `"Jazz Chord Melody"` | `"Acoustic Strumming"`.
- `difficulty`: `DifficultyLevel` — `"Beginner"` | `"Intermediate"` | `"Advanced"`.
- `description`: `str` — Summary of voice leading, bassline pattern, and chord substitutions used.
- `chords_used`: `List[str]` — Sequence of reharmonized or arranged chord symbols used in the variation.
- `tablature`: `TablatureData` — Complete playable 6-string tab with `measures`, polyphonic `notes` (with `voice`), and `ascii_tab`.

### 2.7 `ArrangementRequest` (Phase 3)
Request payload for generating a custom arrangement variation (`POST /api/v1/analyze/{job_id}/arrange`):
- `style`: `ArrangementStyle` — Target style (`"Fingerstyle"`, `"Neo Soul"`, `"Jazz Chord Melody"`, `"Acoustic Strumming"`).
- `difficulty`: `DifficultyLevel` — Target difficulty (`"Beginner"`, `"Intermediate"`, `"Advanced"`).
- `capo`: `int` — Capo fret position (default `0`, range `0` to `12`).
- `tempo_scale`: `float` — Tempo scaling multiplier (default `1.0`, range `0.5` to `1.5`).

---

## 3. REST Endpoints (`apps/api` — Port `8000`)

### 3.1 `POST /api/v1/analyze` — Upload Audio & Run Guitar Intelligence Pipeline

Accepts an MP3 or WAV audio file (`multipart/form-data`, field `file`, max 25MB), executes the audio engine pipeline (key/BPM detection, chord timeline, style improvisations, chord voicing diagrams, polyphonic/monophonic guitar tablature generation, and at least 1 default `"Fingerstyle"` arrangement in `arrangements`), stores the job, and returns an `AnalysisResponse`.

- **Method:** `POST`
- **URL:** `http://localhost:8000/api/v1/analyze`
- **Content-Type:** `multipart/form-data`
- **Form Field:** `file` (`.mp3` or `.wav`)
- **Response (`200 OK`):** `AnalysisResponse`

#### Complete `AnalysisResponse` JSON Example (Phase 1 + Phase 2 + Phase 3):

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
            "technique": "normal",
            "voice": "bass"
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
            "technique": "normal",
            "voice": "harmony"
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
            "technique": "normal",
            "voice": "melody"
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
            "technique": "normal",
            "voice": "melody"
          }
        ]
      }
    ],
    "ascii_tab": "e|-----------------|\nB|-------------0---|\nG|---------0-------|\nD|-----0-----------|\nA|-----------------|\nE|-3---------------|"
  },
  "arrangements": [
    {
      "arrangement_id": "arr-fingerstyle-default",
      "title": "Fingerstyle Solo Arrangement",
      "style": "Fingerstyle",
      "difficulty": "Intermediate",
      "description": "Alternating thumb bass on strings 4-6 with syncopated melody and open-string harmonic resonance on strings 1-3.",
      "chords_used": ["Gadd9", "Em7", "Cmaj7", "Dsus4"],
      "tablature": {
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
                "id": "arr-note-1",
                "start_time": 0.0,
                "duration": 1.2,
                "string": 6,
                "fret": 3,
                "midi": 43,
                "note_name": "G2",
                "confidence": 0.96,
                "technique": "normal",
                "voice": "bass"
              },
              {
                "id": "arr-note-2",
                "start_time": 0.6,
                "duration": 0.6,
                "string": 3,
                "fret": 2,
                "midi": 57,
                "note_name": "A3",
                "confidence": 0.94,
                "technique": "hammer-on",
                "voice": "harmony"
              },
              {
                "id": "arr-note-3",
                "start_time": 1.2,
                "duration": 1.2,
                "string": 1,
                "fret": 3,
                "midi": 67,
                "note_name": "G4",
                "confidence": 0.95,
                "technique": "normal",
                "voice": "melody"
              }
            ]
          }
        ],
        "ascii_tab": "e|---------3-------|\nB|-----------------|\nG|-----2h----------|\nD|-----------------|\nA|-----------------|\nE|-3---------------|"
      }
    }
  ]
}
```

---

### 3.2 `GET /api/v1/analyze/{job_id}` — Retrieve Analysis Job

Retrieves an existing `AnalysisResponse` (including `chord_diagrams`, `tablature`, and `arrangements`) by `job_id`.

- **Method:** `GET`
- **URL:** `http://localhost:8000/api/v1/analyze/{job_id}`
- **Response (`200 OK`):** `AnalysisResponse`
- **Error (`404 Not Found`):** Job ID does not exist (`ErrorEnvelope` with `JOB_NOT_FOUND`).

---

### 3.3 `PUT /api/v1/analyze/{job_id}/tablature` — Update Tablature & Regenerate ASCII Tab

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
4. Regenerate the 6-line `ascii_tab` string from the updated measures and notes (rendering articulation markers such as `h` for hammer-on, `p` for pull-off, `/` for slide, `b` for bend).
5. Save the updated job in `analyzer_service` and return the complete updated `AnalysisResponse` (`200 OK`).

---

### 3.4 `POST /api/v1/analyze/{job_id}/arrange` — Generate Style & Fingerstyle Arrangement (Phase 3)

Synthesizes a new playable guitar arrangement variation (`ArrangementVariation`) for an existing analysis job using AI music intelligence (polyphonic thumb-bass + melody voice separation, style-specific re-harmonization, capo transposition, and tempo scaling), appends/updates it in the stored job's `arrangements` list, and returns the generated `ArrangementVariation`.

- **Method:** `POST`
- **URL:** `http://localhost:8000/api/v1/analyze/{job_id}/arrange`
- **Content-Type:** `application/json`
- **Request Schema:** `ArrangementRequest`
- **Response (`200 OK`):** `ArrangementVariation`

#### Example `ArrangementRequest` Payload:
```json
{
  "style": "Neo Soul",
  "difficulty": "Advanced",
  "capo": 2,
  "tempo_scale": 0.9
}
```

#### Example `200 OK` Response (`ArrangementVariation`):
```json
{
  "arrangement_id": "arr-neo-soul-advanced-capo2",
  "title": "Neo Soul Extended Voicing Arrangement",
  "style": "Neo Soul",
  "difficulty": "Advanced",
  "description": "Extended 9th/11th Neo Soul substitutions with syncopated thumb bass on strings 5-6, inner voice harmony on strings 3-4, and embellished melody slides on strings 1-2 (Capo 2, 0.9x tempo).",
  "chords_used": ["Gmaj9", "Em11", "Cmaj9#11", "D13sus4"],
  "tablature": {
    "tuning": ["E2", "A2", "D3", "G3", "B3", "E4"],
    "capo": 2,
    "difficulty": "Advanced",
    "measures": [
      {
        "measure_number": 1,
        "start_time": 0.0,
        "end_time": 2.67,
        "notes": [
          {
            "id": "arr-ns-1",
            "start_time": 0.0,
            "duration": 1.33,
            "string": 6,
            "fret": 1,
            "midi": 43,
            "note_name": "G2",
            "confidence": 0.96,
            "technique": "normal",
            "voice": "bass"
          },
          {
            "id": "arr-ns-2",
            "start_time": 0.67,
            "duration": 0.67,
            "string": 2,
            "fret": 5,
            "midi": 66,
            "note_name": "F#4",
            "confidence": 0.94,
            "technique": "slide",
            "voice": "melody"
          }
        ]
      }
    ],
    "ascii_tab": "e|-----------------|\nB|-----5/----------|\nG|-----------------|\nD|-----------------|\nA|-----------------|\nE|-1---------------|"
  }
}
```

#### Validation & Processing Rules:
1. Validate `job_id` exists (`404 Not Found` with `ErrorEnvelope` code `JOB_NOT_FOUND` if missing).
2. Validate `style` in `["Fingerstyle", "Neo Soul", "Jazz Chord Melody", "Acoustic Strumming"]`, `difficulty` in `["Beginner", "Intermediate", "Advanced"]`, `0 <= capo <= 12`, and `0.5 <= tempo_scale <= 1.5` (`400` / `422` if invalid).
3. Invoke the arrangement generator in `services/audio-engine` (or deterministic fallback) to produce a biomechanically playable `ArrangementVariation` with `TabNote.voice` roles (`"melody"`, `"bass"`, `"harmony"`, `"percussive"`).
4. Append or update the `ArrangementVariation` inside the job's `arrangements` list so subsequent `GET /api/v1/analyze/{job_id}` and `GET /api/v1/analyze/{job_id}/export?arrangement_id=...` calls can access it.
5. Return the newly generated `ArrangementVariation` (`200 OK`).

---

### 3.5 `GET /api/v1/analyze/{job_id}/export` — Multi-Format Tablature & Score Export (Phase 3)

Exports the job's primary `tablature` or a specific `ArrangementVariation` (`arrangement_id`) into a downloadable file stream in **MIDI** (`.mid`), **MusicXML** (`.musicxml` compatible with GuitarPro / MuseScore), **ASCII Tab** (`.txt`), or **PDF** (`.pdf`).

- **Method:** `GET`
- **URL:** `http://localhost:8000/api/v1/analyze/{job_id}/export?format={format}&arrangement_id={arrangement_id}`
- **Query Parameters:**
  - `format` (**required**): `ExportFormat` (`midi` | `musicxml` | `ascii` | `pdf`)
  - `arrangement_id` (*optional*): `str` — If provided, exports the matching `ArrangementVariation.tablature` from `job.arrangements`; if omitted, exports the job's primary `tablature`.
- **Response (`200 OK`):** Binary or text file stream with format-specific headers:

| `format` Query Param | File Extension (`<ext>`) | `Content-Type` Header | `Content-Disposition` Header |
| :--- | :--- | :--- | :--- |
| `midi` | `mid` | `audio/midi` | `attachment; filename="arpegia-<job_id>.mid"` |
| `musicxml` | `musicxml` | `application/vnd.recordare.musicxml+xml` | `attachment; filename="arpegia-<job_id>.musicxml"` |
| `ascii` | `txt` | `text/plain; charset=utf-8` | `attachment; filename="arpegia-<job_id>.txt"` |
| `pdf` | `pdf` | `application/pdf` | `attachment; filename="arpegia-<job_id>.pdf"` |

#### Validation & Processing Rules:
1. Validate `job_id` exists (`404 Not Found` with `ErrorEnvelope` code `JOB_NOT_FOUND` if missing).
2. If `arrangement_id` is provided and does not match any item in `job.arrangements`, return `404 Not Found` with `ErrorEnvelope` code `ARRANGEMENT_NOT_FOUND`.
3. If `format` is missing or not one of `["midi", "musicxml", "ascii", "pdf"]`, return `400 Bad Request` or `422 Unprocessable Entity` with `ErrorEnvelope` code `UNSUPPORTED_EXPORT_FORMAT`.

---

## 4. Standard Error Envelope

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
| `422 Unprocessable Entity` | `VALIDATION_ERROR` | Invalid `string` (1-6), `fret` (0-24), `capo` (0-12), `tempo_scale` (0.5-1.5), or query/body schema validation failure |
| `500 Internal Server Error` | `INTERNAL_ERROR` | Unexpected server processing failure |
