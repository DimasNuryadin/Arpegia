"""Arpegia Audio Engine (Phase 1, Phase 2 & Phase 3)."""

from .audio_processor import AudioProcessor
from .key_detector import KeyDetector
from .chord_detector import ChordDetector
from .improvisation_agent import ImprovisationAgent
from .chord_voicings import ChordVoicingGenerator
from .tab_transcriber import TabTranscriber
from .arrangement_generator import ArrangementGenerator, generate_arrangement
from .exporters import (
    export_to_midi_bytes,
    export_to_musicxml,
    export_to_pdf_bytes,
    export_to_ascii,
    export_arrangement,
)
from .stem_separator import DemucsStemSeparator
from .polyphonic_transcriber import transcribe_polyphonic_guitar
from .viterbi_fretboard import assign_optimal_fretboard_path
from .orchestrator import (
    create_orchestrator,
    run_pipeline,
    generate_custom_arrangement,
    export_job_score,
)
from .live_detector import (
    get_tuning_presets,
    evaluate_tuner_pitch,
    evaluate_tuner_pitch_from_pcm,
    detect_live_chord_from_frame,
    LiveChordDetector,
    CANONICAL_TUNING_PRESETS,
)

__all__ = [
    "AudioProcessor",
    "KeyDetector",
    "ChordDetector",
    "ImprovisationAgent",
    "ChordVoicingGenerator",
    "TabTranscriber",
    "DemucsStemSeparator",
    "transcribe_polyphonic_guitar",
    "assign_optimal_fretboard_path",
    "ArrangementGenerator",
    "generate_arrangement",
    "export_to_midi_bytes",
    "export_to_musicxml",
    "export_to_pdf_bytes",
    "export_to_ascii",
    "export_arrangement",
    "create_orchestrator",
    "run_pipeline",
    "generate_custom_arrangement",
    "export_job_score",
    "get_tuning_presets",
    "evaluate_tuner_pitch",
    "evaluate_tuner_pitch_from_pcm",
    "detect_live_chord_from_frame",
    "LiveChordDetector",
    "CANONICAL_TUNING_PRESETS",
]
