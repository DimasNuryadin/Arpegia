"""LangGraph orchestration pipeline for audio analysis, guitar intelligence, chord voicings, tablature transcription, AI style arrangements, and multi-format symbolic exports."""

from typing import TypedDict, List, Dict, Any, Optional, Union, Literal
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


# ============================================================================
# LangGraph Pipeline State
# ============================================================================

class PipelineState(TypedDict, total=False):
    """Internal StateGraph state container."""
    file_path: str
    filename: str
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

def audio_loader_node(state: PipelineState) -> Dict[str, Any]:
    """Node 1: AudioLoaderNode - Loads audio file, extracts duration and basic stats."""
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
    }


def stem_separation_node(state: PipelineState) -> Dict[str, Any]:
    """Node 2: StemSeparationNode - Demucs 4-stem source separation and harmonic mix routing."""
    file_path = state["file_path"]
    separator = DemucsStemSeparator()
    sep_result = separator.separate(file_path)

    return {
        "guitar_stem": sep_result["guitar_stem"],
        "harmonic_mix": sep_result["harmonic_mix"],
        "bass_stem": sep_result["bass_stem"],
        "stem_dir": sep_result["stem_dir"],
        "is_separated": sep_result["is_separated"],
    }


def key_and_tempo_node(state: PipelineState) -> Dict[str, Any]:
    """Node 3: KeyAndTempoNode - Computes BPM, beat grid, and detects musical key."""
    y = state["y"]
    sr = state["sr"]

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

    return {
        "bpm": formatted_bpm,
        "time_signature": time_sig,
        "chroma": chroma,
        "beat_times": beat_times,
        "key": key_result["key"],
        "key_confidence": key_result["confidence"],
    }


def chord_detection_node(state: PipelineState) -> Dict[str, Any]:
    """Node 3: ChordDetectionNode - Segments chromagram and matches chord templates."""
    chroma = state["chroma"]
    duration = state["duration"]
    beat_times = state.get("beat_times")

    chord_detector = ChordDetector()
    chords = chord_detector.detect_chords(
        chromagram=chroma,
        duration=duration,
        beat_times=beat_times,
    )

    return {"chords": chords}


def improvisation_node(state: PipelineState) -> Dict[str, Any]:
    """Node 4: ImprovisationNode - Generates style-based substitutions."""
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
    """Node 5: ChordDiagramNode - Resolves 6-string guitar chord voicing diagrams."""
    chords = state.get("chords") or []
    improvisations = state.get("improvisations") or []

    generator = ChordVoicingGenerator()
    diagrams = generator.generate_diagrams_for_analysis(
        chords=chords,
        improvisations=improvisations,
    )

    return {"chord_diagrams": diagrams}


def tab_transcription_node(state: PipelineState) -> Dict[str, Any]:
    """Node 7: TabTranscriptionNode - Transcribes notes, solves fretboard path, builds measures and ASCII tab."""
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

    return {"tablature": tablature}


def arrangement_generator_node(state: PipelineState) -> Dict[str, Any]:
    """Node 8: ArrangementGeneratorNode - Synthesizes default Fingerstyle solo arrangement (Phase 3)."""
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
    }


def output_validator_node(state: PipelineState) -> Dict[str, Any]:
    """Node 9: OutputValidatorNode - Validates schema and compiles final payload."""
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
        "arrangements": state.get("arrangements") or [],
    }

    # Validate strictly via Pydantic model
    validated = AnalysisOutput.model_validate(payload)
    output_dict = validated.model_dump()

    return {"output": output_dict}


# ============================================================================
# Graph Builder & Direct On-Demand Helpers for apps/api
# ============================================================================

def create_orchestrator():
    """Build and compile the LangGraph StateGraph pipeline."""
    graph = StateGraph(PipelineState)

    # Register nodes
    graph.add_node("AudioLoaderNode", audio_loader_node)
    graph.add_node("StemSeparationNode", stem_separation_node)
    graph.add_node("KeyAndTempoNode", key_and_tempo_node)
    graph.add_node("ChordDetectionNode", chord_detection_node)
    graph.add_node("ImprovisationNode", improvisation_node)
    graph.add_node("ChordDiagramNode", chord_diagram_node)
    graph.add_node("TabTranscriptionNode", tab_transcription_node)
    graph.add_node("ArrangementGeneratorNode", arrangement_generator_node)
    graph.add_node("OutputValidatorNode", output_validator_node)

    # Wire linear pipeline edges
    graph.add_edge(START, "AudioLoaderNode")
    graph.add_edge("AudioLoaderNode", "StemSeparationNode")
    graph.add_edge("StemSeparationNode", "KeyAndTempoNode")
    graph.add_edge("KeyAndTempoNode", "ChordDetectionNode")
    graph.add_edge("ChordDetectionNode", "ImprovisationNode")
    graph.add_edge("ImprovisationNode", "ChordDiagramNode")
    graph.add_edge("ChordDiagramNode", "TabTranscriptionNode")
    graph.add_edge("TabTranscriptionNode", "ArrangementGeneratorNode")
    graph.add_edge("ArrangementGeneratorNode", "OutputValidatorNode")
    graph.add_edge("OutputValidatorNode", END)

    return graph.compile()


def run_pipeline(
    file_path: str,
    styles: Optional[List[str]] = None,
    filename: Optional[str] = None,
) -> Dict[str, Any]:
    """Execute the full audio analysis pipeline on a target audio file.

    Args:
        file_path: Path to MP3/WAV audio file.
        styles: Optional list of styles (e.g. ['Neo Soul', 'Jazz', 'Pop', 'Fingerstyle']).
        filename: Optional original filename to preserve in output metadata.

    Returns:
        Clean, serialized dictionary matching the Phase 1 + Phase 2 + Phase 3 output specification.
    """
    app = create_orchestrator()
    initial_state: PipelineState = {
        "file_path": file_path,
        "styles": styles if styles is not None else ["Neo Soul"],
    }
    if filename:
        initial_state["filename"] = filename

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
