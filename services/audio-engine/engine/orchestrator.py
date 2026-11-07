"""LangGraph orchestration pipeline for audio analysis and guitar intelligence."""

from typing import TypedDict, List, Dict, Any, Optional, Union
import os
import json
import numpy as np
from pydantic import BaseModel, Field

from langgraph.graph import StateGraph, START, END

from .audio_processor import AudioProcessor
from .key_detector import KeyDetector
from .chord_detector import ChordDetector
from .improvisation_agent import ImprovisationAgent


# ============================================================================
# Pydantic Output Validation Models
# ============================================================================

class AudioMetadata(BaseModel):
    """Metadata describing analyzed audio file."""
    filename: str = Field(..., description="Audio file name")
    duration: float = Field(..., description="Duration in seconds")
    key: str = Field(..., description="Estimated musical key, e.g. 'G Major'")
    bpm: Union[int, float] = Field(..., description="Tempo in beats per minute")
    time_signature: str = Field(default="4/4", description="Estimated musical meter")


class ChordEvent(BaseModel):
    """Timestamped chord detection event."""
    chord: str = Field(..., description="Detected chord label, e.g. 'G', 'Am'")
    start_time: float = Field(..., ge=0.0, description="Start timestamp in seconds")
    end_time: float = Field(..., ge=0.0, description="End timestamp in seconds")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Confidence score")


class ChordImprovisation(BaseModel):
    """Style-based chord substitution suggestions."""
    original_chord: str = Field(..., description="Original detected chord")
    style: str = Field(..., description="Musical style name, e.g. 'Neo Soul'")
    suggestions: List[str] = Field(default_factory=list, description="Substitutions")


class AnalysisOutput(BaseModel):
    """Strict final output schema matching Phase 1 MVP requirements."""
    metadata: AudioMetadata
    chords: List[ChordEvent]
    improvisations: List[ChordImprovisation]


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


def output_validator_node(state: PipelineState) -> Dict[str, Any]:
    """Node 5: OutputValidatorNode - Validates schema and compiles final payload."""
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
    graph.add_node("OutputValidatorNode", output_validator_node)

    # Wire linear pipeline edges
    graph.add_edge(START, "AudioLoaderNode")
    graph.add_edge("AudioLoaderNode", "KeyAndTempoNode")
    graph.add_edge("KeyAndTempoNode", "ChordDetectionNode")
    graph.add_edge("ChordDetectionNode", "ImprovisationNode")
    graph.add_edge("ImprovisationNode", "OutputValidatorNode")
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
        Clean, serialized dictionary matching the exact MVP output specification.
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
