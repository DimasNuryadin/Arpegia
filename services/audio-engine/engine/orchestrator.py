"""LangGraph orchestration pipeline for audio analysis, guitar intelligence, chord voicings, tablature transcription, AI style arrangements, and multi-format symbolic exports."""

from typing import TypedDict, List, Dict, Any, Optional, Union, Literal, Callable
import os
import json
import numpy as np
from pydantic import BaseModel, Field, ConfigDict, field_validator

from langgraph.graph import StateGraph, START, END

from .audio_processor import AudioProcessor
from .key_detector import KeyDetector
from .chord_detector import ChordDetector
from .improvisation_agent import ImprovisationAgent
from .chord_voicings import ChordVoicingGenerator
from .tab_transcriber import TabTranscriber
from .arrangement_generator import ArrangementGenerator, generate_arrangement
from .stem_separator import DemucsStemSeparator
from .polyphonic_transcriber import transcribe_polyphonic_guitar
from .viterbi_fretboard import assign_optimal_fretboard_path
from .exporters import (
    export_to_midi_bytes,
    export_to_musicxml,
    export_to_pdf_bytes,
    export_to_ascii,
    export_arrangement,
)


# ============================================================================
# Pydantic Output Validation Models (Phase 1, Phase 2 & Phase 3 Schema Lock)
# ============================================================================

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


CANONICAL_PIPELINE_STAGES: List[str] = [
    "separating_stems",
    "detecting_key_tempo",
    "detecting_chords",
    "transcribing_tablature",
    "generating_arrangement",
]

CANONICAL_STAGE_LABELS: Dict[str, str] = {
    "separating_stems": "Separating Audio Stems (Demucs)",
    "detecting_key_tempo": "Detecting Musical Key & Tempo",
    "detecting_chords": "Recognizing Chords & Improvisations",
    "transcribing_tablature": "Transcribing Guitar Tablature (Basic Pitch + Viterbi)",
    "generating_arrangement": "Generating Fingerstyle Arrangement",
}


def create_initial_pipeline_steps() -> List[Dict[str, Any]]:
    """Return default pending telemetry list for all 5 canonical stages."""
    return [
        {
            "stage": stage,
            "label": CANONICAL_STAGE_LABELS[stage],
            "status": "pending",
            "progress_percent": 0,
            "detail": None,
        }
        for stage in CANONICAL_PIPELINE_STAGES
    ]


def safe_emit_progress(
    callback: Optional[Callable[[str, int, str, Optional[str]], None]],
    stage: str,
    percent: int,
    message: str,
    detail: Optional[str] = None,
) -> None:
    """Safely invoke progress callback, ignoring any callback exception."""
    if callback is not None:
        try:
            callback(stage, percent, message, detail)
        except Exception:
            # UI callback errors must never crash audio DSP analysis
            pass


def update_step_telemetry(
    steps: Optional[List[Dict[str, Any]]],
    stage: str,
    status: str,
    progress_percent: int,
    detail: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """Return updated copy of pipeline step telemetry with updated status, percent, and detail."""
    current = [dict(s) for s in (steps or create_initial_pipeline_steps())]
    for step in current:
        if step.get("stage") == stage:
            step["status"] = status
            step["progress_percent"] = progress_percent
            if detail is not None:
                step["detail"] = detail
            break
    return current


class AudioMetadata(BaseModel):
    """Metadata describing analyzed audio file."""
    model_config = ConfigDict(extra="ignore")

    filename: str = Field(..., description="Audio file name")
    duration: float = Field(..., description="Duration in seconds")
    key: str = Field(..., description="Estimated musical key, e.g. 'G Major'")
    bpm: Union[int, float] = Field(..., description="Tempo in beats per minute")
    time_signature: str = Field(default="4/4", description="Estimated musical meter")


class ChordEvent(BaseModel):
    """Timestamped chord detection event."""
    model_config = ConfigDict(extra="ignore")

    chord: str = Field(..., description="Detected chord label, e.g. 'G', 'Am'")
    start_time: float = Field(..., ge=0.0, description="Start timestamp in seconds")
    end_time: float = Field(..., ge=0.0, description="End timestamp in seconds")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score")


class ChordImprovisation(BaseModel):
    """Style-based chord substitution suggestions."""
    model_config = ConfigDict(extra="ignore")

    original_chord: str = Field(..., description="Original detected chord")
    style: str = Field(..., description="Musical style name, e.g. 'Neo Soul'")
    suggestions: List[str] = Field(default_factory=list, description="Substitutions")


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
        default_factory=lambda: ["E2", "A2", "D3", "G3", "B3", "E4"],
        description="6-string guitar tuning from Low E (string 6) to High E (string 1)",
    )
    capo: int = Field(default=0, ge=0, le=12, description="Capo fret position (0 = no capo)")
    difficulty: TabDifficultyType = Field(
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


class ArrangementVariation(BaseModel):
    """Complete playable guitar arrangement variation for a specific style and difficulty."""
    model_config = ConfigDict(extra="ignore")

    arrangement_id: str = Field(
        ..., description="Unique arrangement variation identifier (e.g. 'arr-fingerstyle-default')"
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
    """Request payload for generating a custom arrangement variation."""
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


class AnalysisOutput(BaseModel):
    """Strict final output schema matching Phase 1 + Phase 2 + Phase 3 contracts."""
    model_config = ConfigDict(extra="ignore")

    metadata: AudioMetadata
    chords: List[ChordEvent] = Field(default_factory=list)
    improvisations: List[ChordImprovisation] = Field(default_factory=list)
    chord_diagrams: List[ChordDiagram] = Field(default_factory=list)
    tablature: TablatureData = Field(default_factory=TablatureData)
    arrangements: List[ArrangementVariation] = Field(default_factory=list)
    pipeline_steps: Optional[List[Dict[str, Any]]] = Field(default=None)


# ============================================================================
# LangGraph Pipeline State
# ============================================================================

class PipelineState(TypedDict, total=False):
    """Internal StateGraph state container."""
    file_path: str
    filename: str
    progress_callback: Optional[Callable[[str, int, str, Optional[str]], None]]
    pipeline_steps: List[Dict[str, Any]]
    y: Any
    sr: int
    duration: float
    bpm: Union[int, float]
    time_signature: str
    stem_dir: Optional[str]
    guitar_stem: Optional[str]
    harmonic_mix: Optional[str]
    bass_stem: Optional[str]
    is_separated: bool
    chroma: Any
    beat_times: Any
    key: str
    key_confidence: float
    chords: List[Dict[str, Any]]
    styles: List[str]
    improvisations: List[Dict[str, Any]]
    chord_diagrams: List[Dict[str, Any]]
    tablature: Dict[str, Any]
    arrangements: List[Dict[str, Any]]
    output: Dict[str, Any]
    error: Optional[str]


# ============================================================================
# Pipeline Nodes
# ============================================================================

def stem_separation_node(state: PipelineState) -> Dict[str, Any]:
    """Node 1: StemSeparationNode - Demucs 4-stem source separation and harmonic mix routing."""
    cb = state.get("progress_callback")
    steps = state.get("pipeline_steps")

    # Milestone 1: 10%
    safe_emit_progress(
        cb,
        stage="separating_stems",
        percent=10,
        message="Separating audio stems...",
        detail="Isolating guitar and bass tracks...",
    )
    steps = update_step_telemetry(
        steps,
        stage="separating_stems",
        status="in_progress",
        progress_percent=40,
        detail="Isolating guitar and bass tracks...",
    )

    file_path = state["file_path"]
    separator = DemucsStemSeparator()
    sep_result = separator.separate(file_path)

    is_sep = bool(sep_result.get("is_separated", False))
    stem_status = "completed" if is_sep else "skipped"
    stem_detail = (
        "Demucs 4-stem separation performed (status='completed')"
        if is_sep
        else "Demucs 4-stem separation fast-skipped (status='skipped')"
    )

    # Milestone 2: 25%
    safe_emit_progress(
        cb,
        stage="separating_stems",
        percent=25,
        message="Audio stems separated" if is_sep else "Audio stems processed",
        detail=stem_detail,
    )
    steps = update_step_telemetry(
        steps,
        stage="separating_stems",
        status=stem_status,
        progress_percent=100,
        detail=stem_detail,
    )

    return {
        "guitar_stem": sep_result["guitar_stem"],
        "harmonic_mix": sep_result["harmonic_mix"],
        "bass_stem": sep_result["bass_stem"],
        "stem_dir": sep_result["stem_dir"],
        "is_separated": is_sep,
        "pipeline_steps": steps,
    }


def audio_loader_node(state: PipelineState) -> Dict[str, Any]:
    """Node 2: AudioLoaderNode - Loads audio file, extracts duration and basic stats."""
    cb = state.get("progress_callback")
    steps = state.get("pipeline_steps")

    # Milestone 3: 30%
    safe_emit_progress(
        cb,
        stage="detecting_key_tempo",
        percent=30,
        message="Analyzing audio signal, tempo, and musical key...",
        detail="Loading audio waveform and analyzing audio signal...",
    )
    steps = update_step_telemetry(
        steps,
        stage="detecting_key_tempo",
        status="in_progress",
        progress_percent=25,
        detail="Loading audio waveform and analyzing audio signal...",
    )

    file_path = state["file_path"]
    filename = state.get("filename") or os.path.basename(file_path)

    processor = AudioProcessor()
    y, sr = processor.load_audio(file_path)
    if y is None or len(y) == 0:
        raise ValueError(f"Audio file '{filename}' contains no decodable audio samples.")

    duration = processor.get_duration(y, sr)
    if duration <= 0:
        raise ValueError(f"Audio file '{filename}' has zero duration.")

    return {
        "filename": filename,
        "y": y,
        "sr": sr,
        "duration": round(duration, 2),
        "pipeline_steps": steps,
    }


def key_and_tempo_node(state: PipelineState) -> Dict[str, Any]:
    """Node 3: KeyAndTempoNode - Computes BPM, beat grid, and detects musical key."""
    cb = state.get("progress_callback")
    steps = state.get("pipeline_steps")

    y = state["y"]
    sr = state["sr"]
    duration = state.get("duration", 0.0)

    processor = AudioProcessor(sample_rate=sr)
    bpm, beat_frames, beat_times = processor.detect_beats(y, sr)
    time_sig = processor.estimate_time_signature(y, sr)

    # Route harmonic_mix to key and chord detection if source separation occurred
    harmonic_mix_path = state.get("harmonic_mix")
    chroma_y, chroma_sr = y, sr
    if harmonic_mix_path and state.get("is_separated") and os.path.exists(harmonic_mix_path):
        try:
            y_harm, sr_harm = processor.load_audio(harmonic_mix_path)
            if y_harm is not None and len(y_harm) > 0:
                chroma_y, chroma_sr = y_harm, sr_harm
        except Exception:
            chroma_y, chroma_sr = y, sr

    # Extract chromagram for key and chord detection from harmonic signal
    chroma = processor.extract_chromagram(chroma_y, chroma_sr, method="cqt")

    key_detector = KeyDetector()
    key_result = key_detector.detect_key_from_chroma(chroma)

    # Format BPM cleanly as integer for consistent UI and API schema contract
    formatted_bpm = max(1, int(round(bpm)))
    key_str = key_result["key"]

    # Milestone 4: 40%
    key_detail = f"Detected {key_str} at {formatted_bpm} BPM ({duration}s)"
    safe_emit_progress(
        cb,
        stage="detecting_key_tempo",
        percent=40,
        message="Key and tempo analysis complete",
        detail=key_detail,
    )
    steps = update_step_telemetry(
        steps,
        stage="detecting_key_tempo",
        status="completed",
        progress_percent=100,
        detail=key_detail,
    )

    return {
        "bpm": formatted_bpm,
        "time_signature": time_sig,
        "chroma": chroma,
        "beat_times": beat_times,
        "key": key_result["key"],
        "key_confidence": key_result["confidence"],
        "pipeline_steps": steps,
    }


def chord_detection_node(state: PipelineState) -> Dict[str, Any]:
    """Node 4: ChordDetectionNode - Segments chromagram and matches chord templates."""
    cb = state.get("progress_callback")
    steps = state.get("pipeline_steps")

    # Milestone 5: 45%
    safe_emit_progress(
        cb,
        stage="detecting_chords",
        percent=45,
        message="Recognizing chord progression and voicings...",
        detail="Segmenting chromagram and matching guitar chord templates...",
    )
    steps = update_step_telemetry(
        steps,
        stage="detecting_chords",
        status="in_progress",
        progress_percent=25,
        detail="Segmenting chromagram and matching guitar chord templates...",
    )

    chroma = state["chroma"]
    duration = state["duration"]
    beat_times = state.get("beat_times")

    chord_detector = ChordDetector()
    chords = chord_detector.detect_chords(
        chromagram=chroma,
        duration=duration,
        beat_times=beat_times,
    )

    return {"chords": chords, "pipeline_steps": steps}


def improvisation_node(state: PipelineState) -> Dict[str, Any]:
    """Node 5: ImprovisationNode - Generates style-based substitutions."""
    chords = state["chords"]
    key = state["key"]
    styles = state.get("styles") or ["Neo Soul"]

    agent = ImprovisationAgent()
    improvisations = agent.generate_improvisations(
        chords=chords,
        key=key,
        styles=styles,
    )

    return {"improvisations": improvisations}


def chord_diagram_node(state: PipelineState) -> Dict[str, Any]:
    """Node 6: ChordDiagramNode - Resolves 6-string guitar chord voicing diagrams."""
    cb = state.get("progress_callback")
    steps = state.get("pipeline_steps")

    chords = state.get("chords") or []
    improvisations = state.get("improvisations") or []

    generator = ChordVoicingGenerator()
    diagrams = generator.generate_diagrams_for_analysis(
        chords=chords,
        improvisations=improvisations,
    )

    # Milestone 6: 60%
    chord_detail = f"Detected {len(chords)} chord segments and style voicings"
    safe_emit_progress(
        cb,
        stage="detecting_chords",
        percent=60,
        message="Chord progression and voicings recognized",
        detail=chord_detail,
    )
    steps = update_step_telemetry(
        steps,
        stage="detecting_chords",
        status="completed",
        progress_percent=100,
        detail=chord_detail,
    )

    return {"chord_diagrams": diagrams, "pipeline_steps": steps}


def tab_transcription_node(state: PipelineState) -> Dict[str, Any]:
    """Node 7: TabTranscriptionNode - Transcribes notes, solves fretboard path, builds measures and ASCII tab."""
    cb = state.get("progress_callback")
    steps = state.get("pipeline_steps")

    # Milestone 7: 65%
    safe_emit_progress(
        cb,
        stage="transcribing_tablature",
        percent=65,
        message="Transcribing guitar tablature and mapping fretboard...",
        detail="Extracting polyphonic notes and solving Viterbi fretboard paths...",
    )
    steps = update_step_telemetry(
        steps,
        stage="transcribing_tablature",
        status="in_progress",
        progress_percent=20,
        detail="Extracting polyphonic notes and solving Viterbi fretboard paths...",
    )

    y = state["y"]
    sr = state["sr"]
    duration = state["duration"]
    bpm = state.get("bpm", 120)
    time_signature = state.get("time_signature", "4/4")
    guitar_stem = state.get("guitar_stem") or state.get("file_path")

    # If source separation succeeded, attempt to load audio from guitar_stem for DSP fallback
    y_target, sr_target = y, sr
    if guitar_stem and state.get("is_separated") and os.path.exists(guitar_stem):
        try:
            processor = AudioProcessor(sample_rate=sr)
            y_stem, sr_stem = processor.load_audio(guitar_stem)
            if y_stem is not None and len(y_stem) > 0:
                y_target, sr_target = y_stem, sr_stem
        except Exception:
            y_target, sr_target = y, sr

    transcriber = TabTranscriber(sample_rate=sr_target)
    tablature = transcriber.transcribe(
        y=y_target,
        sr=sr_target,
        duration=duration,
        bpm=bpm,
        time_signature=time_signature,
        audio_path=guitar_stem,
    )

    measures = tablature.get("measures", [])
    total_notes = sum(len(m.get("notes", [])) for m in measures)
    difficulty = tablature.get("difficulty", "Beginner")

    # Milestone 8: 85%
    tab_detail = f"Mapped {total_notes} notes across {len(measures)} measures ({difficulty})"
    safe_emit_progress(
        cb,
        stage="transcribing_tablature",
        percent=85,
        message="Guitar tablature transcribed",
        detail=tab_detail,
    )
    steps = update_step_telemetry(
        steps,
        stage="transcribing_tablature",
        status="completed",
        progress_percent=100,
        detail=tab_detail,
    )

    return {"tablature": tablature, "pipeline_steps": steps}


def arrangement_generator_node(state: PipelineState) -> Dict[str, Any]:
    """Node 8: ArrangementGeneratorNode - Synthesizes default Fingerstyle solo arrangement (Phase 3)."""
    cb = state.get("progress_callback")
    steps = state.get("pipeline_steps")

    # Milestone 9: 90%
    safe_emit_progress(
        cb,
        stage="generating_arrangement",
        percent=90,
        message="Generating polyphonic Fingerstyle arrangement...",
        detail="Synthesizing alternating thumb bassline and chord melody...",
    )
    steps = update_step_telemetry(
        steps,
        stage="generating_arrangement",
        status="in_progress",
        progress_percent=50,
        detail="Synthesizing alternating thumb bassline and chord melody...",
    )

    metadata = {
        "filename": state.get("filename", "audio.wav"),
        "duration": state.get("duration", 4.8),
        "key": state.get("key", "G Major"),
        "bpm": state.get("bpm", 120),
        "time_signature": state.get("time_signature", "4/4"),
    }
    chords = state.get("chords") or []
    base_tablature = state.get("tablature") or {}

    default_fingerstyle = generate_arrangement(
        metadata=metadata,
        chords=chords,
        base_tablature=base_tablature,
        style="Fingerstyle",
        difficulty="Intermediate",
        capo=0,
        tempo_scale=1.0,
        arrangement_id="arr-fingerstyle-default",
    )

    # Also ensure chord_diagrams covers any newly reharmonized chords in the default arrangement
    voicing_gen = ChordVoicingGenerator()
    existing_diagrams = list(state.get("chord_diagrams") or [])
    seen_chords = {d.get("chord") for d in existing_diagrams if d.get("chord")}
    for c_sym in default_fingerstyle.get("chords_used", []):
        if c_sym and c_sym not in seen_chords:
            seen_chords.add(c_sym)
            existing_diagrams.append(voicing_gen.get_chord_diagram(c_sym))

    return {
        "arrangements": [default_fingerstyle],
        "chord_diagrams": existing_diagrams,
        "pipeline_steps": steps,
    }


def output_validator_node(state: PipelineState) -> Dict[str, Any]:
    """Node 9: OutputValidatorNode - Validates schema, compiles final payload, and emits completion."""
    cb = state.get("progress_callback")
    steps = state.get("pipeline_steps")

    arrangements = state.get("arrangements") or []
    arr_count = len(arrangements)
    arr_detail = f"Synthesized {arr_count} playable arrangement variation(s)"
    steps = update_step_telemetry(
        steps,
        stage="generating_arrangement",
        status="completed",
        progress_percent=100,
        detail=arr_detail,
    )

    payload = {
        "metadata": {
            "filename": state["filename"],
            "duration": state["duration"],
            "key": state["key"],
            "bpm": state["bpm"],
            "time_signature": state["time_signature"],
        },
        "chords": state["chords"],
        "improvisations": state["improvisations"],
        "chord_diagrams": state.get("chord_diagrams") or [],
        "tablature": state.get("tablature") or {},
        "arrangements": arrangements,
        "pipeline_steps": steps,
    }

    # Validate strictly via Pydantic model
    validated = AnalysisOutput.model_validate(payload)
    output_dict = validated.model_dump()
    output_dict["pipeline_steps"] = steps

    # Milestone 10: 100% completed
    completed_detail = f"Audio analysis complete with {arr_count} arrangement(s) ready"
    safe_emit_progress(
        cb,
        stage="completed",
        percent=100,
        message="Audio analysis complete",
        detail=completed_detail,
    )

    return {"output": output_dict, "pipeline_steps": steps}


# ============================================================================
# Graph Builder & Direct On-Demand Helpers for apps/api
# ============================================================================

def create_orchestrator():
    """Build and compile the LangGraph StateGraph pipeline."""
    graph = StateGraph(PipelineState)

    # Register nodes
    graph.add_node("StemSeparationNode", stem_separation_node)
    graph.add_node("AudioLoaderNode", audio_loader_node)
    graph.add_node("KeyAndTempoNode", key_and_tempo_node)
    graph.add_node("ChordDetectionNode", chord_detection_node)
    graph.add_node("ImprovisationNode", improvisation_node)
    graph.add_node("ChordDiagramNode", chord_diagram_node)
    graph.add_node("TabTranscriptionNode", tab_transcription_node)
    graph.add_node("ArrangementGeneratorNode", arrangement_generator_node)
    graph.add_node("OutputValidatorNode", output_validator_node)

    # Wire linear pipeline edges (Phase 4 canonical stage order):
    # 1. separating_stems (0% -> 25%)
    # 2. detecting_key_tempo (25% -> 40%)
    # 3. detecting_chords (40% -> 60%)
    # 4. transcribing_tablature (60% -> 85%)
    # 5. generating_arrangement (85% -> 100%)
    # 6. completed (100%)
    graph.add_edge(START, "StemSeparationNode")
    graph.add_edge("StemSeparationNode", "AudioLoaderNode")
    graph.add_edge("AudioLoaderNode", "KeyAndTempoNode")
    graph.add_edge("KeyAndTempoNode", "ChordDetectionNode")
    graph.add_edge("ChordDetectionNode", "ImprovisationNode")
    graph.add_edge("ImprovisationNode", "ChordDiagramNode")
    graph.add_edge("ChordDiagramNode", "TabTranscriptionNode")
    graph.add_edge("TabTranscriptionNode", "ArrangementGeneratorNode")
    graph.add_edge("ArrangementGeneratorNode", "OutputValidatorNode")
    graph.add_edge("OutputValidatorNode", END)

    return graph.compile()


def run_pipeline(
    audio_path: Optional[str] = None,
    filename: Union[str, List[str], None] = "upload.mp3",
    progress_callback: Optional[Callable[[str, int, str, Optional[str]], None]] = None,
    styles: Optional[List[str]] = None,
    file_path: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Execute the full audio analysis pipeline with real-time stage progress reporting.

    Args:
        audio_path: Path to MP3/WAV audio file.
        filename: Original file name or display name (defaults to 'upload.mp3').
        progress_callback: Optional callback invoked across pipeline milestones:
            callback(stage: str, progress_percent: int, message: str, detail: Optional[str])
        styles: Optional list of guitar styles for improvisation (e.g. ['Neo Soul']).
        file_path: Backward-compatible alias for audio_path.

    Returns:
        Clean, serialized dictionary matching the Phase 1, Phase 2, Phase 3 & Phase 4 output specifications.
    """
    target_path = audio_path or file_path or kwargs.get("path")
    if not target_path:
        raise ValueError("Audio path must be provided to run_pipeline.")

    # Backward compatibility: if styles was passed positionally as 2nd arg: run_pipeline(path, ["Neo Soul"])
    if isinstance(filename, list):
        styles = filename
        filename = None

    if progress_callback is None and "callback" in kwargs:
        progress_callback = kwargs["callback"]

    # If filename is omitted or default "upload.mp3", preserve target_path basename if non-empty
    resolved_filename: str
    if filename is None:
        resolved_filename = os.path.basename(target_path) or "upload.mp3"
    elif filename == "upload.mp3" and os.path.basename(target_path) not in ("", "upload.mp3"):
        resolved_filename = os.path.basename(target_path)
    else:
        resolved_filename = str(filename)

    app = create_orchestrator()
    initial_steps = create_initial_pipeline_steps()

    initial_state: PipelineState = {
        "file_path": target_path,
        "filename": resolved_filename,
        "styles": styles if styles is not None else ["Neo Soul"],
        "progress_callback": progress_callback,
        "pipeline_steps": initial_steps,
    }

    stem_dir_to_clean: Optional[str] = None
    try:
        final_state = app.invoke(initial_state)
        stem_dir_to_clean = final_state.get("stem_dir")
        return final_state["output"]
    finally:
        if stem_dir_to_clean:
            DemucsStemSeparator.cleanup(stem_dir_to_clean)
        DemucsStemSeparator.cleanup_all()


def generate_custom_arrangement(
    analysis_data: Dict[str, Any],
    style: str = "Fingerstyle",
    difficulty: str = "Intermediate",
    capo: int = 0,
    tempo_scale: float = 1.0,
) -> Dict[str, Any]:
    """Direct helper for `apps/api` (`POST /api/v1/analyze/{job_id}/arrange`) to generate

    and validate a custom style/difficulty `ArrangementVariation` from an existing job dict.
    """
    metadata = analysis_data.get("metadata") or {}
    chords = analysis_data.get("chords") or []
    base_tablature = analysis_data.get("tablature") or {}

    raw_variation = generate_arrangement(
        metadata=metadata,
        chords=chords,
        base_tablature=base_tablature,
        style=style,
        difficulty=difficulty,
        capo=capo,
        tempo_scale=tempo_scale,
    )
    validated = ArrangementVariation.model_validate(raw_variation)
    return validated.model_dump()


def export_job_score(
    analysis_data: Dict[str, Any],
    export_format: str,
    arrangement_id: Optional[str] = None,
) -> Union[bytes, str]:
    """Direct helper for `apps/api` (`GET /api/v1/analyze/{job_id}/export`) to export

    a job's primary tablature or a specific `arrangement_id` in `midi`, `musicxml`, `ascii`, or `pdf`.
    """
    metadata = analysis_data.get("metadata") or {}
    chords = analysis_data.get("chords") or []

    target_tab_or_arr: Dict[str, Any]
    if arrangement_id:
        arrangements = analysis_data.get("arrangements") or []
        matched = next(
            (a for a in arrangements if a.get("arrangement_id") == arrangement_id),
            None,
        )
        if matched is None:
            raise KeyError(f"Arrangement '{arrangement_id}' not found on job.")
        target_tab_or_arr = matched
    else:
        target_tab_or_arr = analysis_data.get("tablature") or {}

    return export_arrangement(
        export_format=export_format,
        metadata=metadata,
        chords=chords,
        tablature=target_tab_or_arr,
    )
