"""LangGraph orchestration pipeline for audio analysis, guitar intelligence, chord voicings, and tablature transcription."""

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


# ============================================================================
# Pydantic Output Validation Models (Phase 1 & Phase 2 Schema Lock)
# ============================================================================

TabTechniqueType = Literal["normal", "hammer-on", "pull-off", "slide", "bend"]
TabDifficultyType = Literal["Beginner", "Intermediate", "Advanced"]


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


class AnalysisOutput(BaseModel):
    """Strict final output schema matching Phase 1 + Phase 2 contracts."""
    model_config = ConfigDict(extra="ignore")

    metadata: AudioMetadata
    chords: List[ChordEvent] = Field(default_factory=list)
    improvisations: List[ChordImprovisation] = Field(default_factory=list)
    chord_diagrams: List[ChordDiagram] = Field(default_factory=list)
    tablature: TablatureData = Field(default_factory=TablatureData)


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
    chroma: Any
    beat_times: Any
    key: str
    key_confidence: float
    chords: List[Dict[str, Any]]
    styles: List[str]
    improvisations: List[Dict[str, Any]]
    chord_diagrams: List[Dict[str, Any]]
    tablature: Dict[str, Any]
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


def key_and_tempo_node(state: PipelineState) -> Dict[str, Any]:
    """Node 2: KeyAndTempoNode - Computes BPM, beat grid, and detects musical key."""
    y = state["y"]
    sr = state["sr"]

    processor = AudioProcessor(sample_rate=sr)
    bpm, beat_frames, beat_times = processor.detect_beats(y, sr)
    time_sig = processor.estimate_time_signature(y, sr)

    # Extract chromagram for key and chord detection
    chroma = processor.extract_chromagram(y, sr, method="cqt")

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
    """Node 6: TabTranscriptionNode - Transcribes notes, solves fretboard path, builds measures and ASCII tab."""
    y = state["y"]
    sr = state["sr"]
    duration = state["duration"]
    bpm = state.get("bpm", 120)
    time_signature = state.get("time_signature", "4/4")

    transcriber = TabTranscriber(sample_rate=sr)
    tablature = transcriber.transcribe(
        y=y,
        sr=sr,
        duration=duration,
        bpm=bpm,
        time_signature=time_signature,
    )

    return {"tablature": tablature}


def output_validator_node(state: PipelineState) -> Dict[str, Any]:
    """Node 7: OutputValidatorNode - Validates schema and compiles final payload."""
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
    }

    # Validate strictly via Pydantic model
    validated = AnalysisOutput.model_validate(payload)
    output_dict = validated.model_dump()

    return {"output": output_dict}


# ============================================================================
# Graph Builder
# ============================================================================

def create_orchestrator():
    """Build and compile the LangGraph StateGraph pipeline."""
    graph = StateGraph(PipelineState)

    # Register nodes
    graph.add_node("AudioLoaderNode", audio_loader_node)
    graph.add_node("KeyAndTempoNode", key_and_tempo_node)
    graph.add_node("ChordDetectionNode", chord_detection_node)
    graph.add_node("ImprovisationNode", improvisation_node)
    graph.add_node("ChordDiagramNode", chord_diagram_node)
    graph.add_node("TabTranscriptionNode", tab_transcription_node)
    graph.add_node("OutputValidatorNode", output_validator_node)

    # Wire linear pipeline edges
    graph.add_edge(START, "AudioLoaderNode")
    graph.add_edge("AudioLoaderNode", "KeyAndTempoNode")
    graph.add_edge("KeyAndTempoNode", "ChordDetectionNode")
    graph.add_edge("ChordDetectionNode", "ImprovisationNode")
    graph.add_edge("ImprovisationNode", "ChordDiagramNode")
    graph.add_edge("ChordDiagramNode", "TabTranscriptionNode")
    graph.add_edge("TabTranscriptionNode", "OutputValidatorNode")
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
        Clean, serialized dictionary matching the Phase 1 + Phase 2 output specification.
    """
    app = create_orchestrator()
    initial_state: PipelineState = {
        "file_path": file_path,
        "styles": styles if styles is not None else ["Neo Soul"],
    }
    if filename:
        initial_state["filename"] = filename
    final_state = app.invoke(initial_state)
    return final_state["output"]
