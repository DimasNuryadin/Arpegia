"""Pydantic v2 physical reference contracts for Arpegia Phase 1, Phase 2, Phase 3, Phase 4 & Phase 5.

This module serves as the canonical Python schema contract shared across:
- `apps/api` (FastAPI request/response models)
- `services/audio-engine` (DSP, Arrangement Generator, Multi-Format Exporter, Pipeline & Live Tuner/Chord Detector models)

Mirrors the TypeScript interfaces in `packages/shared-types/index.ts`.
"""

from typing import Any, Dict, List, Literal, Optional, Union
from pydantic import BaseModel, ConfigDict, Field, field_validator

DEFAULT_GUITAR_TUNING: List[str] = ["E2", "A2", "D3", "G3", "B3", "E4"]

TabTechniqueType = Literal["normal", "hammer-on", "pull-off", "slide", "bend"]
DifficultyLevel = Literal["Beginner", "Intermediate", "Advanced"]
TabDifficultyType = DifficultyLevel

ArrangementStyle = Literal[
    "Fingerstyle",
    "Neo Soul",
    "Jazz Chord Melody",
    "Acoustic Strumming",
]
ExportFormat = Literal["midi", "musicxml", "ascii", "pdf"]
VoiceRole = Literal["melody", "bass", "harmony", "percussive"]


# ============================================================================
# Phase 1 Base Models
# ============================================================================


class AnalysisMetadata(BaseModel):
    """Metadata extracted or associated with the audio file."""

    model_config = ConfigDict(extra="ignore")

    filename: str = Field(..., description="Original audio file name")
    duration: float = Field(..., ge=0.0, description="Duration in seconds")
    key: str = Field(..., description="Detected musical key (e.g. 'G Major')")
    bpm: Union[int, float] = Field(..., ge=1, description="Detected tempo in beats per minute")
    time_signature: str = Field(default="4/4", description="Musical time signature (e.g. '4/4')")


class ChordItem(BaseModel):
    """Detected chord event with timestamp boundary and confidence."""

    model_config = ConfigDict(extra="ignore")

    chord: str = Field(..., description="Detected chord symbol (e.g. 'G', 'Cmaj7')")
    start_time: float = Field(..., ge=0.0, description="Start timestamp in seconds")
    end_time: float = Field(..., ge=0.0, description="End timestamp in seconds")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Detection confidence score")


class ImprovisationItem(BaseModel):
    """AI-powered guitar improvisation and reharmonization suggestion."""

    model_config = ConfigDict(extra="ignore")

    original_chord: str = Field(..., description="Original chord from audio analysis")
    style: str = Field(..., description="Musical genre or arrangement style (e.g. 'Neo Soul')")
    suggestions: List[str] = Field(
        default_factory=list, description="Recommended substitution chord voicings"
    )


# Backward-compatible aliases used across services
SongMetadata = AnalysisMetadata
AudioMetadata = AnalysisMetadata
ChordData = ChordItem
ChordEvent = ChordItem
ImprovisationData = ImprovisationItem
ChordImprovisation = ImprovisationItem


# ============================================================================
# Phase 2 Guitar Intelligence Models (Tablature & Chord Diagrams)
# ============================================================================


class TabNote(BaseModel):
    """Single guitar note positioned on a specific string and fret."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(..., description="Unique note identifier (e.g. 'note-1')")
    start_time: float = Field(..., ge=0.0, description="Note onset timestamp in seconds")
    duration: float = Field(..., ge=0.0, description="Note duration in seconds")
    string: int = Field(
        ...,
        ge=1,
        le=6,
        description="Guitar string number (1 to 6, where 1 = High E4 and 6 = Low E2)",
    )
    fret: int = Field(..., ge=0, le=24, description="Fret number (0 to 24, where 0 is open string)")
    midi: int = Field(..., ge=0, le=127, description="MIDI note number (e.g. 40 to 88)")
    note_name: str = Field(..., description="Scientific pitch notation (e.g. 'E4', 'G#3')")
    confidence: float = Field(
        default=1.0, ge=0.0, le=1.0, description="Transcription confidence score (0.0 to 1.0)"
    )
    technique: TabTechniqueType = Field(
        default="normal",
        description="Articulation technique ('normal', 'hammer-on', 'pull-off', 'slide', 'bend')",
    )
    voice: Optional[VoiceRole] = Field(
        default="melody",
        description=(
            "Polyphonic voice role ('melody', 'bass', 'harmony', 'percussive') allowing "
            "Fingerstyle separation between thumb bass notes (strings 4-6) and plucked melody/arpeggio notes (strings 1-3)"
        ),
    )


class TabMeasure(BaseModel):
    """Single musical measure containing chronologically ordered TabNotes."""

    model_config = ConfigDict(extra="ignore")

    measure_number: int = Field(..., ge=1, description="1-based measure index")
    start_time: float = Field(..., ge=0.0, description="Measure start timestamp in seconds")
    end_time: float = Field(..., ge=0.0, description="Measure end timestamp in seconds")
    notes: List[TabNote] = Field(default_factory=list, description="Notes within this measure")


class TablatureData(BaseModel):
    """Complete guitar tablature structure including measures and pre-rendered ASCII tab."""

    model_config = ConfigDict(extra="ignore")

    tuning: List[str] = Field(
        default_factory=lambda: list(DEFAULT_GUITAR_TUNING),
        description="6-string guitar tuning from Low E (string 6) to High E (string 1)",
    )
    capo: int = Field(default=0, ge=0, le=12, description="Capo fret position (0 = no capo)")
    difficulty: DifficultyLevel = Field(
        default="Beginner",
        description="Playability difficulty tier ('Beginner', 'Intermediate', 'Advanced')",
    )
    measures: List[TabMeasure] = Field(
        default_factory=list, description="Measure-segmented guitar tablature notes"
    )
    ascii_tab: str = Field(
        default="",
        description="Pre-rendered 6-line ASCII tablature preview for export/quick view",
    )


class ChordDiagram(BaseModel):
    """6-string guitar chord voicing diagram (Low E to High E)."""

    model_config = ConfigDict(extra="ignore")

    chord: str = Field(..., description="Chord symbol (e.g. 'G', 'Cmaj7')")
    frets: List[int] = Field(
        ...,
        min_length=6,
        max_length=6,
        description="Length 6 array (Low E to High E): -1 for muted string, 0 for open, >=1 for fretted",
    )
    fingers: List[int] = Field(
        ...,
        min_length=6,
        max_length=6,
        description="Length 6 array (Low E to High E): 0 for open/muted, 1-4 for index to pinky",
    )
    base_fret: int = Field(default=1, ge=1, le=24, description="Starting fret of the chord diagram")

    @field_validator("frets")
    @classmethod
    def validate_frets(cls, v: List[int]) -> List[int]:
        if len(v) != 6:
            raise ValueError("frets must contain exactly 6 values (Low E to High E)")
        for fret in v:
            if fret < -1 or fret > 24:
                raise ValueError(f"Each fret must be between -1 and 24, got {fret}")
        return v

    @field_validator("fingers")
    @classmethod
    def validate_fingers(cls, v: List[int]) -> List[int]:
        if len(v) != 6:
            raise ValueError("fingers must contain exactly 6 values (Low E to High E)")
        for finger in v:
            if finger < 0 or finger > 4:
                raise ValueError(f"Each finger must be between 0 and 4, got {finger}")
        return v


# ============================================================================
# Interactive Tab Editor Request Models (PUT /api/v1/analyze/{job_id}/tablature)
# ============================================================================


class TabNoteEdit(BaseModel):
    """Payload item for updating an individual TabNote's string, fret, or technique."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(..., description="Unique note identifier to update")
    string: int = Field(
        ...,
        ge=1,
        le=6,
        description="Updated guitar string (1 to 6, where 1 = High E4 and 6 = Low E2)",
    )
    fret: int = Field(..., ge=0, le=24, description="Updated fret number (0 to 24)")
    technique: TabTechniqueType = Field(
        default="normal",
        description="Updated articulation technique",
    )
    voice: Optional[VoiceRole] = Field(
        default=None,
        description="Optional updated polyphonic voice role ('melody', 'bass', 'harmony', 'percussive')",
    )
    start_time: Optional[float] = Field(
        default=None, ge=0.0, description="Optional updated onset timestamp in seconds"
    )
    duration: Optional[float] = Field(
        default=None, ge=0.0, description="Optional updated duration in seconds"
    )


class TablatureUpdateRequest(BaseModel):
    """Request contract for PUT /api/v1/analyze/{job_id}/tablature."""

    model_config = ConfigDict(extra="ignore")

    tuning: Optional[List[str]] = Field(
        default=None, description="Optional updated 6-string guitar tuning"
    )
    capo: Optional[int] = Field(
        default=None, ge=0, le=12, description="Optional updated capo position"
    )
    difficulty: Optional[DifficultyLevel] = Field(
        default=None, description="Optional updated playability difficulty rating"
    )
    measures: Optional[List[TabMeasure]] = Field(
        default=None,
        description="Full list of updated measures containing edited TabNote objects",
    )
    notes: Optional[List[TabNoteEdit]] = Field(
        default=None,
        description="Flat list of edited TabNote positions (string, fret, technique) to apply by note ID",
    )


# ============================================================================
# Phase 3 AI Music Intelligence Models (Arrangements & Multi-Format Export)
# ============================================================================


class ArrangementVariation(BaseModel):
    """Complete playable guitar arrangement variation for a specific style and difficulty."""

    model_config = ConfigDict(extra="ignore")

    arrangement_id: str = Field(
        ..., description="Unique arrangement variation identifier (e.g. 'arr-fingerstyle-1')"
    )
    title: str = Field(
        ..., description="Human-readable arrangement title (e.g. 'Fingerstyle Solo Arrangement')"
    )
    style: ArrangementStyle = Field(
        ...,
        description="Arrangement style ('Fingerstyle', 'Neo Soul', 'Jazz Chord Melody', 'Acoustic Strumming')",
    )
    difficulty: DifficultyLevel = Field(
        ..., description="Playability difficulty tier ('Beginner', 'Intermediate', 'Advanced')"
    )
    description: str = Field(
        ...,
        description="Summary of voice leading, bassline pattern, and chord substitutions used",
    )
    chords_used: List[str] = Field(
        default_factory=list,
        description="Sequence of reharmonized or arranged chord voicings used in this variation",
    )
    tablature: TablatureData = Field(
        default_factory=TablatureData,
        description="Complete playable 6-string tablature with measures, polyphonic voice notes, and ascii_tab",
    )


class ArrangementRequest(BaseModel):
    """Request payload for POST /api/v1/analyze/{job_id}/arrange."""

    model_config = ConfigDict(extra="ignore")

    style: ArrangementStyle = Field(
        ...,
        description="Target arrangement style ('Fingerstyle', 'Neo Soul', 'Jazz Chord Melody', 'Acoustic Strumming')",
    )
    difficulty: DifficultyLevel = Field(
        ...,
        description="Target playability difficulty ('Beginner', 'Intermediate', 'Advanced')",
    )
    capo: int = Field(
        default=0,
        ge=0,
        le=12,
        description="Capo fret position (0 to 12, default 0)",
    )
    tempo_scale: float = Field(
        default=1.0,
        ge=0.5,
        le=1.5,
        description="Tempo scaling factor (0.5 to 1.5, default 1.0)",
    )


# ============================================================================
# Phase 4 Real-Time Async Pipeline Streaming Models
# ============================================================================


PipelineStage = Literal[
    "queued",
    "separating_stems",
    "detecting_key_tempo",
    "detecting_chords",
    "transcribing_tablature",
    "generating_arrangement",
    "completed",
    "failed",
]

StageStatus = Literal["pending", "in_progress", "completed", "skipped", "failed"]


class PipelineStepInfo(BaseModel):
    """Progress status and detail for an individual pipeline execution stage."""

    model_config = ConfigDict(extra="ignore")

    stage: PipelineStage = Field(..., description="Pipeline execution stage identifier")
    label: str = Field(..., description="Human-readable stage label")
    status: StageStatus = Field(
        default="pending",
        description="Current stage status ('pending', 'in_progress', 'completed', 'skipped', 'failed')",
    )
    progress_percent: int = Field(
        default=0,
        ge=0,
        le=100,
        description="Stage-level completion percentage (0 to 100)",
    )
    detail: Optional[str] = Field(
        default=None,
        description="Optional stage execution details, notes, or diagnostic message",
    )


class JobProgressEvent(BaseModel):
    """Real-time pipeline progress snapshot broadcast over WebSocket and HTTP polling."""

    model_config = ConfigDict(extra="ignore")

    event: Literal["job.progress", "job.completed", "job.failed"] = Field(
        default="job.progress",
        description="Event type name ('job.progress', 'job.completed', 'job.failed')",
    )
    job_id: str = Field(..., description="Unique job identifier")
    status: Literal["queued", "processing", "completed", "failed"] = Field(
        default="processing",
        description="High-level job processing state ('queued', 'processing', 'completed', 'failed')",
    )
    current_stage: PipelineStage = Field(
        ...,
        description="Currently active pipeline stage",
    )
    overall_percent: int = Field(
        default=0,
        ge=0,
        le=100,
        description="Total overall pipeline progress percentage (0 to 100)",
    )
    message: str = Field(
        default="",
        description="Human-readable status summary message",
    )
    steps: List[PipelineStepInfo] = Field(
        default_factory=list,
        description="Detailed list of ordered pipeline step statuses",
    )
    updated_at: str = Field(
        ...,
        description="ISO-8601 formatted timestamp of the event",
    )
    result: Optional["AnalysisResponse"] = Field(
        default=None,
        description="Populated with full AnalysisResponse when status == 'completed'",
    )
    error: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Populated with standard error envelope dict when status == 'failed'",
    )


# ============================================================================
# Top-Level Analysis Response & Error Envelope Contracts
# ============================================================================


class AnalysisOutput(BaseModel):
    """Audio Engine pipeline output contract (Phase 1 + Phase 2 + Phase 3)."""

    model_config = ConfigDict(extra="ignore")

    metadata: AnalysisMetadata
    chords: List[ChordItem] = Field(default_factory=list)
    improvisations: List[ImprovisationItem] = Field(default_factory=list)
    chord_diagrams: List[ChordDiagram] = Field(default_factory=list)
    tablature: TablatureData = Field(default_factory=TablatureData)
    arrangements: List[ArrangementVariation] = Field(default_factory=list)


class AnalysisResponse(BaseModel):
    """Top-level shared data contract for POST/GET /api/v1/analyze and PUT tablature."""

    model_config = ConfigDict(
        extra="ignore",
        json_schema_extra={
            "example": {
                "job_id": "7b084e85-4bc5-4dbb-a639-c1ee824c6020",
                "status": "completed",
                "metadata": {
                    "filename": "song.mp3",
                    "duration": 180.5,
                    "key": "G Major",
                    "bpm": 105,
                    "time_signature": "4/4",
                },
                "chords": [
                    {
                        "chord": "G",
                        "start_time": 0.0,
                        "end_time": 2.4,
                        "confidence": 0.94,
                    }
                ],
                "improvisations": [
                    {
                        "original_chord": "G",
                        "style": "Neo Soul",
                        "suggestions": ["Gmaj7", "G6/9"],
                    }
                ],
                "chord_diagrams": [
                    {
                        "chord": "G",
                        "frets": [3, 2, 0, 0, 0, 3],
                        "fingers": [2, 1, 0, 0, 0, 3],
                        "base_fret": 1,
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
                                    "voice": "bass",
                                }
                            ],
                        }
                    ],
                    "ascii_tab": (
                        "e|-----------------|\n"
                        "B|-----------------|\n"
                        "G|-----------------|\n"
                        "D|-----------------|\n"
                        "A|-----------------|\n"
                        "E|-3---------------|"
                    ),
                },
                "arrangements": [
                    {
                        "arrangement_id": "arr-fingerstyle-default",
                        "title": "Fingerstyle Solo Arrangement",
                        "style": "Fingerstyle",
                        "difficulty": "Intermediate",
                        "description": (
                            "Alternating thumb bass on strings 4-6 with syncopated "
                            "melody and open-string harmonic resonance on strings 1-3."
                        ),
                        "chords_used": ["Gmaj7", "Em9", "Cmaj9", "D11"],
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
                                            "voice": "bass",
                                        },
                                        {
                                            "id": "arr-note-2",
                                            "start_time": 0.6,
                                            "duration": 0.6,
                                            "string": 1,
                                            "fret": 2,
                                            "midi": 66,
                                            "note_name": "F#4",
                                            "confidence": 0.94,
                                            "technique": "normal",
                                            "voice": "melody",
                                        },
                                    ],
                                }
                            ],
                            "ascii_tab": (
                                "e|-----2-----------|\n"
                                "B|-----------------|\n"
                                "G|-----------------|\n"
                                "D|-----------------|\n"
                                "A|-----------------|\n"
                                "E|-3---------------|"
                            ),
                        },
                    }
                ],
            }
        },
    )

    job_id: str = Field(..., description="Unique job or analysis identifier")
    status: Literal["queued", "processing", "completed", "failed"] = Field(
        default="completed",
        description="Current status of the analysis ('queued', 'processing', 'completed', 'failed')",
    )
    metadata: AnalysisMetadata = Field(..., description="Audio file and musical metadata")
    chords: List[ChordItem] = Field(
        default_factory=list, description="Chronological sequence of detected chords"
    )
    improvisations: List[ImprovisationItem] = Field(
        default_factory=list, description="Genre-specific chord substitutions and improvisations"
    )
    chord_diagrams: List[ChordDiagram] = Field(
        default_factory=list, description="6-string guitar chord voicing diagrams"
    )
    tablature: TablatureData = Field(
        default_factory=TablatureData,
        description="Generated guitar tablature with measures, notes, and ASCII preview",
    )
    arrangements: List[ArrangementVariation] = Field(
        default_factory=list,
        description=(
            "Generated guitar arrangements (defaults to at least 1 Fingerstyle arrangement "
            "generated during analysis, plus custom variations generated on demand)"
        ),
    )
    progress: Optional[JobProgressEvent] = Field(
        default=None,
        description="Optional pipeline progress event snapshot",
    )


JobProgressEvent.model_rebuild()
AnalysisResponse.model_rebuild()


class ErrorDetail(BaseModel):
    """Structured error payload inside the standard error envelope."""

    model_config = ConfigDict(extra="ignore")

    code: str = Field(..., description="Machine-readable error code (e.g. 'INVALID_FRET_POSITION')")
    message: str = Field(..., description="Human-readable error description")
    details: Any = Field(default=None, description="Additional contextual error details")


class ErrorEnvelope(BaseModel):
    """Standard API error envelope: { 'error': { 'code': str, 'message': str, 'details': any } }."""

    model_config = ConfigDict(extra="ignore")

    error: ErrorDetail = Field(..., description="Structured error information")


# ============================================================================
# Phase 5 Live Microphone Guitar Tuner & Real-Time Mic Chord Detector Models
# ============================================================================


TuningPresetId = Literal["standard", "drop_d", "half_step_down", "open_g", "dadgad"]
TuningStatus = Literal["flat", "in_tune", "sharp"]


class TuningStringTarget(BaseModel):
    """Target tuning frequency and MIDI pitch for an individual guitar string."""

    model_config = ConfigDict(extra="ignore")

    string: int = Field(
        ...,
        ge=1,
        le=6,
        description="Guitar string number (1 to 6, where 1 = High E and 6 = Low E)",
    )
    note: str = Field(..., description="Target note name with octave (e.g. 'E2', 'A2', 'E4')")
    frequency_hz: float = Field(
        ..., gt=0.0, description="Exact target frequency in Hertz (e.g. 82.41, 110.00)"
    )
    midi: int = Field(..., ge=0, le=127, description="Target MIDI note number (e.g. 40, 45, 64)")


class TuningPreset(BaseModel):
    """Complete 6-string guitar tuning preset specification."""

    model_config = ConfigDict(extra="ignore")

    id: TuningPresetId = Field(..., description="Canonical tuning preset identifier")
    name: str = Field(
        ..., description="Human-readable tuning preset name (e.g. 'Standard (E A D G B E)')"
    )
    description: str = Field(..., description="Musical description and context for this tuning")
    reference_a4_hz: float = Field(
        default=440.0, gt=0.0, description="Reference concert pitch frequency in Hz (default 440.0)"
    )
    strings: List[TuningStringTarget] = Field(
        ...,
        min_length=6,
        max_length=6,
        description="List of 6 string tuning targets ordered from string 6 (Low) to string 1 (High)",
    )

    @field_validator("strings")
    @classmethod
    def validate_strings(cls, v: List[TuningStringTarget]) -> List[TuningStringTarget]:
        if len(v) != 6:
            raise ValueError(
                "strings must contain exactly 6 string targets (String 6 Low to String 1 High)"
            )
        return v


class TunerPitchResult(BaseModel):
    """Evaluation result comparing a detected microphone pitch against guitar tuning targets."""

    model_config = ConfigDict(extra="ignore")

    detected_frequency_hz: float = Field(
        ..., ge=0.0, description="Detected pitch frequency in Hertz"
    )
    detected_note: str = Field(..., description="Identified note name (e.g. 'E2')")
    closest_string: int = Field(
        ...,
        ge=1,
        le=6,
        description="Closest matched guitar string (1 to 6, where 1 = High E, 6 = Low E)",
    )
    target_note: str = Field(..., description="Target note name for the closest string")
    target_frequency_hz: float = Field(
        ..., gt=0.0, description="Target frequency in Hertz for the string"
    )
    cents_deviation: float = Field(
        ...,
        ge=-50.0,
        le=50.0,
        description="Deviation from target pitch in cents (-50.0 to +50.0, where 0.0 is perfectly in tune)",
    )
    tuning_status: TuningStatus = Field(
        ...,
        description="Tuning status: 'in_tune' when abs(cents_deviation) <= 3.5, else 'flat' or 'sharp'",
    )
    confidence: float = Field(
        default=1.0, ge=0.0, le=1.0, description="Pitch detection confidence score (0.0 to 1.0)"
    )


class LiveChordFrameRequest(BaseModel):
    """Live microphone audio or chromagram frame sent for real-time chord detection."""

    model_config = ConfigDict(extra="ignore")

    chroma: Optional[List[float]] = Field(
        default=None,
        description="12-element pitch class energy vector [C, C#, D, D#, E, F, F#, G, G#, A, A#, B]",
    )
    pcm_samples: Optional[List[float]] = Field(
        default=None,
        description="Optional downsampled mono audio PCM buffer",
    )
    sample_rate: int = Field(
        default=22050,
        ge=8000,
        le=96000,
        description="Audio sample rate in Hertz (default 22050)",
    )
    tuning_preset: TuningPresetId = Field(
        default="standard",
        description="Guitar tuning preset identifier (default 'standard')",
    )


class LiveChordDetectionResult(BaseModel):
    """Real-time microphone chord detection result with SVG chord voicing diagram."""

    model_config = ConfigDict(extra="ignore")

    chord: str = Field(
        ...,
        description="Detected chord symbol (e.g. 'Cmaj7', 'Am', 'G7', or 'N' when silence/unrecognized)",
    )
    root: str = Field(..., description="Chord root note (e.g. 'C', 'A', 'G')")
    quality: str = Field(..., description="Chord harmonic quality (e.g. 'maj7', 'minor', 'dom7')")
    confidence: float = Field(
        ..., ge=0.0, le=1.0, description="Chord recognition confidence score (0.0 to 1.0)"
    )
    voicing: Optional[ChordDiagram] = Field(
        default=None,
        description="6-string SVG chord diagram voicing for the detected chord",
    )
    notes_detected: List[str] = Field(
        default_factory=list,
        description="Musical pitch classes detected in the frame (e.g. ['C', 'E', 'G', 'B'])",
    )
    timestamp_ms: int = Field(..., ge=0, description="Frame timestamp or offset in milliseconds")


LiveChordDetectionResult.model_rebuild()

