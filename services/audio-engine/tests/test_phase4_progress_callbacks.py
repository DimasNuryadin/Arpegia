"""Test suite verifying Phase 4 real-time progress callbacks, stage telemetry, and fault-tolerance."""

import os
import sys
import tempfile
import pytest
import numpy as np
import soundfile as sf
from unittest.mock import MagicMock

# Ensure services/audio-engine is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ENGINE_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
REPO_ROOT = os.path.abspath(os.path.join(ENGINE_ROOT, "..", ".."))
SHARED_TYPES_DIR = os.path.join(REPO_ROOT, "packages", "shared-types")

if ENGINE_ROOT not in sys.path:
    sys.path.insert(0, ENGINE_ROOT)
if SHARED_TYPES_DIR not in sys.path:
    sys.path.insert(0, SHARED_TYPES_DIR)

from engine.orchestrator import (
    run_pipeline,
    AnalysisOutput,
    PipelineStepInfo,
    CANONICAL_PIPELINE_STAGES,
    CANONICAL_STAGE_LABELS,
)
from engine.stem_separator import DemucsStemSeparator


@pytest.fixture
def synthetic_guitar_audio():
    """Create a temporary 2-second WAV file with synthetic chord harmony."""
    sr = 22050
    duration = 2.0
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    # Synthesize C Major triad: C4 (261.63), E4 (329.63), G4 (392.00)
    wave = (
        np.sin(2 * np.pi * 261.63 * t)
        + np.sin(2 * np.pi * 329.63 * t)
        + np.sin(2 * np.pi * 392.00 * t)
    ) / 3.0

    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
        tmp_path = tmp.name

    sf.write(tmp_path, wave.astype(np.float32), sr)

    try:
        yield tmp_path
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


class TestPhase4ProgressCallbacks:
    """Tests for Phase 4 real-time progress emissions and step telemetry."""

    def test_progress_callback_non_decreasing_order_and_stages(self, synthetic_guitar_audio):
        """Verify callback receives strictly non-decreasing percentages, covers all 5 canonical stages,

        and completes at 100% with informative detail strings.
        """
        recorded_events = []

        def progress_collector(stage: str, percent: int, message: str, detail=None):
            recorded_events.append({
                "stage": stage,
                "percent": percent,
                "message": message,
                "detail": detail,
            })

        output = run_pipeline(
            audio_path=synthetic_guitar_audio,
            filename="synthetic_test.wav",
            progress_callback=progress_collector,
        )

        assert len(recorded_events) >= 6, f"Expected at least 6 milestone events, got: {len(recorded_events)}"

        # 1. Verify strictly non-decreasing percentage sequence
        percentages = [e["percent"] for e in recorded_events]
        for i in range(len(percentages) - 1):
            assert percentages[i] <= percentages[i + 1], (
                f"Percentages not non-decreasing at index {i}: {percentages[i]} > {percentages[i+1]} "
                f"(Event: {recorded_events[i]} -> {recorded_events[i+1]})"
            )

        # 2. Percentage range boundaries
        assert percentages[0] >= 0
        assert percentages[-1] == 100

        # 3. Stage coverage: all 5 canonical stages + completed must be visited
        visited_stages = [e["stage"] for e in recorded_events]
        for canonical_stage in CANONICAL_PIPELINE_STAGES:
            assert canonical_stage in visited_stages, f"Missing canonical stage: {canonical_stage}"
        assert visited_stages[-1] == "completed"

        # 4. Final completion milestone check
        final_event = recorded_events[-1]
        assert final_event["stage"] == "completed"
        assert final_event["percent"] == 100
        assert "complete" in final_event["message"].lower()
        assert final_event["detail"] is not None and len(final_event["detail"]) > 0

        # 5. Detail strings are populated and human-readable
        details_by_stage = {e["stage"]: e["detail"] for e in recorded_events if e["detail"]}
        assert "separating_stems" in details_by_stage
        assert "status=" in details_by_stage["separating_stems"]

        assert "detecting_key_tempo" in details_by_stage
        assert "BPM" in details_by_stage["detecting_key_tempo"]

        assert "detecting_chords" in details_by_stage
        assert "chord" in details_by_stage["detecting_chords"].lower()

        assert "transcribing_tablature" in details_by_stage
        assert "notes" in details_by_stage["transcribing_tablature"].lower()

        # 6. Verify pipeline_steps telemetry list in output
        assert "pipeline_steps" in output
        steps = output["pipeline_steps"]
        assert len(steps) == len(CANONICAL_PIPELINE_STAGES)

        step_stages = [s["stage"] for s in steps]
        assert step_stages == CANONICAL_PIPELINE_STAGES

        for s in steps:
            assert s["status"] in ["completed", "skipped"]
            assert s["progress_percent"] == 100
            assert s["detail"] is not None
            # Validate through Pydantic
            PipelineStepInfo.model_validate(s)

    def test_faulty_callback_never_crashes_pipeline(self, synthetic_guitar_audio):
        """A faulty callback that raises RuntimeError must NEVER crash audio DSP pipeline."""
        call_count = 0

        def faulty_callback(stage: str, percent: int, message: str, detail=None):
            nonlocal call_count
            call_count += 1
            raise RuntimeError(f"Simulated UI WebSocket crash at stage {stage} ({percent}%)")

        output = run_pipeline(
            audio_path=synthetic_guitar_audio,
            filename="crash_test.wav",
            progress_callback=faulty_callback,
        )

        assert call_count > 0, "Callback was never invoked"
        assert output is not None
        assert "metadata" in output
        assert "chords" in output
        assert "tablature" in output
        assert "arrangements" in output
        assert "pipeline_steps" in output

        # Strict validation
        validated = AnalysisOutput.model_validate(output)
        assert validated.metadata.filename == "crash_test.wav"

    def test_backward_compatibility_without_callback(self, synthetic_guitar_audio):
        """Calling run_pipeline() without progress_callback operates identically to Phases 1-3."""
        # Signature: run_pipeline(audio_path, filename)
        output = run_pipeline(synthetic_guitar_audio, filename="compat_test.wav")

        assert "metadata" in output
        assert "chords" in output
        assert "tablature" in output
        assert "arrangements" in output
        assert output["metadata"]["filename"] == "compat_test.wav"

        # Also test legacy positional calling: run_pipeline(file_path, styles)
        legacy_output = run_pipeline(synthetic_guitar_audio, ["Neo Soul"])
        assert "metadata" in legacy_output
        assert len(legacy_output["arrangements"]) >= 1

    def test_demucs_performed_vs_skipped_detail(self, synthetic_guitar_audio, monkeypatch):
        """Verify that Demucs fast-skip produces status='skipped' in 25% milestone and telemetry."""
        monkeypatch.setenv("ARPEGIA_ENABLE_DEMUCS", "false")

        events = []

        def collector(stage, percent, message, detail=None):
            if stage == "separating_stems":
                events.append((percent, detail))

        output = run_pipeline(synthetic_guitar_audio, progress_callback=collector)

        # Look for 25% event
        milestone_25 = next((d for p, d in events if p == 25), None)
        assert milestone_25 is not None
        assert "status='skipped'" in milestone_25

        # Check telemetry in output
        sep_step = next(s for s in output["pipeline_steps"] if s["stage"] == "separating_stems")
        assert sep_step["status"] == "skipped"
        assert "status='skipped'" in sep_step["detail"]
