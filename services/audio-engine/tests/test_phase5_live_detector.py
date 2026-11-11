"""Unit tests verifying Phase 5 Live Guitar Tuner, Multi-Preset Generator, and Real-Time Chord Detector.

Verifies:
1. `get_tuning_presets()` returns all 5 presets with 6 strings each, matching reference frequencies.
2. `evaluate_tuner_pitch()` accurately classifies in_tune, flat, sharp states, clamps cents, and supports auto/locked string.
3. `detect_live_chord_from_frame()` recognizes chords from both synthetic chroma and PCM multi-sine audio, returns voicings, and returns "N" on silence.
4. Full conformance with Phase 5 Pydantic schemas in `packages/shared-types/schemas.py`.
"""

import os
import sys
import math
import time
import pytest
import numpy as np

# Ensure services/audio-engine and packages/shared-types are in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ENGINE_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
REPO_ROOT = os.path.abspath(os.path.join(ENGINE_ROOT, "..", ".."))
SHARED_TYPES_DIR = os.path.join(REPO_ROOT, "packages", "shared-types")

if ENGINE_ROOT not in sys.path:
    sys.path.insert(0, ENGINE_ROOT)
if SHARED_TYPES_DIR not in sys.path:
    sys.path.insert(0, SHARED_TYPES_DIR)

from engine.live_detector import (
    get_tuning_presets,
    evaluate_tuner_pitch,
    evaluate_tuner_pitch_from_pcm,
    detect_live_chord_from_frame,
    LiveChordDetector,
    CANONICAL_TUNING_PRESETS,
    midi_to_frequency,
)
from schemas import (
    TuningPreset,
    TuningStringTarget,
    TunerPitchResult,
    LiveChordDetectionResult,
    ChordDiagram,
)


# ============================================================================
# 1. Tuning Presets Tests
# ============================================================================

class TestTuningPresets:
    """Verifies get_tuning_presets() structure, string order, and physical frequencies."""

    def test_canonical_presets_count_and_keys(self):
        presets = get_tuning_presets(reference_a4_hz=440.0)
        assert len(presets) == 5

        preset_ids = [p["id"] for p in presets]
        assert preset_ids == ["standard", "drop_d", "half_step_down", "open_g", "dadgad"]

    def test_standard_preset_frequencies_and_string_order(self):
        presets = get_tuning_presets(reference_a4_hz=440.0)
        standard = next(p for p in presets if p["id"] == "standard")

        assert standard["name"] == "Standard (E A D G B E)"
        assert len(standard["strings"]) == 6

        # Order must be string 6 (Low E) to string 1 (High E)
        string_nums = [s["string"] for s in standard["strings"]]
        assert string_nums == [6, 5, 4, 3, 2, 1]

        notes = [s["note"] for s in standard["strings"]]
        assert notes == ["E2", "A2", "D3", "G3", "B3", "E4"]

        midis = [s["midi"] for s in standard["strings"]]
        assert midis == [40, 45, 50, 55, 59, 64]

        # String 6: E2 = 82.41 Hz
        assert standard["strings"][0]["frequency_hz"] == 82.41
        # String 5: A2 = 110.00 Hz
        assert standard["strings"][1]["frequency_hz"] == 110.00
        # String 4: D3 = 146.83 Hz
        assert standard["strings"][2]["frequency_hz"] == 146.83
        # String 3: G3 = 196.00 Hz
        assert standard["strings"][3]["frequency_hz"] == 196.00
        # String 2: B3 = 246.94 Hz
        assert standard["strings"][4]["frequency_hz"] == 246.94
        # String 1: E4 = 329.63 Hz
        assert standard["strings"][5]["frequency_hz"] == 329.63

    def test_alternate_presets_exact_frequencies(self):
        presets = get_tuning_presets(reference_a4_hz=440.0)

        # Drop D: D2 (73.42), A2 (110.00), D3 (146.83), G3 (196.00), B3 (246.94), E4 (329.63)
        drop_d = next(p for p in presets if p["id"] == "drop_d")
        assert drop_d["strings"][0]["note"] == "D2"
        assert drop_d["strings"][0]["frequency_hz"] == 73.42
        assert drop_d["strings"][5]["note"] == "E4"
        assert drop_d["strings"][5]["frequency_hz"] == 329.63

        # Half Step Down: Eb2 (77.78) ... Eb4 (311.13)
        half_step = next(p for p in presets if p["id"] == "half_step_down")
        assert half_step["strings"][0]["note"] == "Eb2"
        assert half_step["strings"][0]["frequency_hz"] == 77.78
        assert half_step["strings"][5]["note"] == "Eb4"
        assert half_step["strings"][5]["frequency_hz"] == 311.13

        # Open G: D2 (73.42), G2 (98.00), D3 (146.83), G3 (196.00), B3 (246.94), D4 (293.66)
        open_g = next(p for p in presets if p["id"] == "open_g")
        assert open_g["strings"][0]["frequency_hz"] == 73.42
        assert open_g["strings"][1]["frequency_hz"] == 98.00
        assert open_g["strings"][5]["frequency_hz"] == 293.66

        # DADGAD: D2 (73.42), A2 (110.00), D3 (146.83), G3 (196.00), A3 (220.00), D4 (293.66)
        dadgad = next(p for p in presets if p["id"] == "dadgad")
        assert dadgad["strings"][0]["frequency_hz"] == 73.42
        assert dadgad["strings"][4]["note"] == "A3"
        assert dadgad["strings"][4]["frequency_hz"] == 220.00
        assert dadgad["strings"][5]["frequency_hz"] == 293.66

    def test_custom_reference_a4_scaling(self):
        # A4 = 432 Hz concert pitch
        presets_432 = get_tuning_presets(reference_a4_hz=432.0)
        standard_432 = next(p for p in presets_432 if p["id"] == "standard")

        # Standard A2 is MIDI 45 (2 octaves below A4) -> 432 / 4 = 108.0 Hz
        a2_target = next(s for s in standard_432["strings"] if s["note"] == "A2")
        assert a2_target["frequency_hz"] == 108.0

    def test_all_presets_conform_to_pydantic_schema(self):
        presets = get_tuning_presets(reference_a4_hz=440.0)
        for p in presets:
            validated = TuningPreset(**p)
            assert validated.id in ["standard", "drop_d", "half_step_down", "open_g", "dadgad"]
            assert len(validated.strings) == 6


# ============================================================================
# 2. Tuner Pitch Evaluator Tests
# ============================================================================

class TestTunerPitchEvaluator:
    """Verifies evaluate_tuner_pitch() cents calculations, status determination, and string selection."""

    def test_in_tune_exact_pitch(self):
        # E2 exact pitch at 82.41 Hz
        res = evaluate_tuner_pitch(frequency_hz=82.41, preset_id="standard")
        assert res["detected_note"] == "E2"
        assert res["closest_string"] == 6
        assert res["target_note"] == "E2"
        assert res["target_frequency_hz"] == 82.41
        assert res["cents_deviation"] == 0.0
        assert res["tuning_status"] == "in_tune"

        validated = TunerPitchResult(**res)
        assert validated.tuning_status == "in_tune"

    def test_in_tune_within_tolerance(self):
        # 82.50 Hz is ~+1.89 cents from 82.41 Hz (<= 3.5 cents -> in_tune)
        res = evaluate_tuner_pitch(frequency_hz=82.50, preset_id="standard")
        assert res["closest_string"] == 6
        assert abs(res["cents_deviation"]) <= 3.5
        assert res["tuning_status"] == "in_tune"

        # 82.30 Hz is ~-2.31 cents from 82.41 Hz (<= 3.5 cents -> in_tune)
        res_flat_tune = evaluate_tuner_pitch(frequency_hz=82.30, preset_id="standard")
        assert res_flat_tune["closest_string"] == 6
        assert abs(res_flat_tune["cents_deviation"]) <= 3.5
        assert res_flat_tune["tuning_status"] == "in_tune"

    def test_flat_status_detection(self):
        # 80.0 Hz against E2 (82.41 Hz) is ~-51 cents -> clamped to -50.0 cents -> flat
        res = evaluate_tuner_pitch(frequency_hz=80.0, preset_id="standard", target_string=6)
        assert res["cents_deviation"] < -3.5
        assert res["cents_deviation"] == -50.0  # Clamped to minimum
        assert res["tuning_status"] == "flat"

        # 81.5 Hz is ~-19.2 cents -> flat
        res_moderate = evaluate_tuner_pitch(frequency_hz=81.5, preset_id="standard", target_string=6)
        assert res_moderate["cents_deviation"] < -3.5
        assert res_moderate["tuning_status"] == "flat"

    def test_sharp_status_detection(self):
        # 85.0 Hz against E2 (82.41 Hz) is ~+53.5 cents -> clamped to +50.0 cents -> sharp
        res = evaluate_tuner_pitch(frequency_hz=85.0, preset_id="standard", target_string=6)
        assert res["cents_deviation"] > 3.5
        assert res["cents_deviation"] == 50.0  # Clamped to maximum
        assert res["tuning_status"] == "sharp"

        # 83.0 Hz against E2 is ~+12.3 cents -> sharp
        res_moderate = evaluate_tuner_pitch(frequency_hz=83.0, preset_id="standard", target_string=6)
        assert res_moderate["cents_deviation"] > 3.5
        assert res_moderate["tuning_status"] == "sharp"

    def test_auto_string_detection_across_strings(self):
        # Test auto-matching each of the 6 strings in standard tuning
        test_pitches = [
            (82.41, 6, "E2"),
            (110.00, 5, "A2"),
            (146.83, 4, "D3"),
            (196.00, 3, "G3"),
            (246.94, 2, "B3"),
            (329.63, 1, "E4"),
        ]
        for freq, expected_str, expected_note in test_pitches:
            res = evaluate_tuner_pitch(frequency_hz=freq, preset_id="standard", target_string=None)
            assert res["closest_string"] == expected_str
            assert res["target_note"] == expected_note
            assert res["tuning_status"] == "in_tune"

    def test_locked_target_string_overrides_closest(self):
        # Even though 82.41 Hz is String 6 (E2), if target_string=1 (E4 = 329.63 Hz) is locked:
        res = evaluate_tuner_pitch(
            frequency_hz=82.41,
            preset_id="standard",
            target_string=1,
        )
        assert res["closest_string"] == 1
        assert res["target_note"] == "E4"
        assert res["target_frequency_hz"] == 329.63
        assert res["cents_deviation"] == -50.0  # Clamped maximum flat
        assert res["tuning_status"] == "flat"

    def test_drop_d_preset_pitch_evaluation(self):
        # In Drop D, string 6 is D2 = 73.42 Hz
        res = evaluate_tuner_pitch(frequency_hz=73.42, preset_id="drop_d")
        assert res["closest_string"] == 6
        assert res["target_note"] == "D2"
        assert res["target_frequency_hz"] == 73.42
        assert res["tuning_status"] == "in_tune"

    def test_invalid_parameters_raise_value_error(self):
        with pytest.raises(ValueError, match="Unknown tuning preset"):
            evaluate_tuner_pitch(frequency_hz=100.0, preset_id="unknown_preset")

        with pytest.raises(ValueError, match="target_string must be between 1 and 6"):
            evaluate_tuner_pitch(frequency_hz=100.0, preset_id="standard", target_string=7)

        with pytest.raises(ValueError, match="target_string must be between 1 and 6"):
            evaluate_tuner_pitch(frequency_hz=100.0, preset_id="standard", target_string=0)

    def test_zero_or_negative_frequency_handling(self):
        res = evaluate_tuner_pitch(frequency_hz=0.0, preset_id="standard")
        assert res["cents_deviation"] == -50.0
        assert res["tuning_status"] == "flat"
        assert TunerPitchResult(**res)


# ============================================================================
# 3. Live Chord Detector Tests
# ============================================================================

class TestLiveChordDetector:
    """Verifies detect_live_chord_from_frame() with synthetic chroma, PCM audio, and silence."""

    def test_synthetic_chroma_cmaj7(self):
        # Synthetic Cmaj7 chroma vector: C, E, G, B active
        chroma = [0.95, 0.05, 0.1, 0.05, 0.88, 0.08, 0.02, 0.91, 0.04, 0.05, 0.06, 0.82]
        res = detect_live_chord_from_frame(chroma=chroma)

        assert res["chord"] == "Cmaj7"
        assert res["root"] == "C"
        assert res["quality"] == "maj7"
        assert res["confidence"] >= 0.85
        assert "C" in res["notes_detected"]
        assert "E" in res["notes_detected"]
        assert "G" in res["notes_detected"]
        assert "B" in res["notes_detected"]

        # Voicing must be valid ChordDiagram
        voicing = res["voicing"]
        assert voicing is not None
        assert voicing["chord"] == "Cmaj7"
        assert len(voicing["frets"]) == 6
        assert len(voicing["fingers"]) == 6
        assert ChordDiagram(**voicing)

        # Validate top-level schema
        assert LiveChordDetectionResult(**res)

    def test_synthetic_chroma_various_qualities(self):
        # Test synthetic clean chroma for Major, Minor, Dom7, Dim, Aug
        classes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

        test_cases = [
            ("Am", 9, [0, 3, 7]),       # A minor: A, C, E
            ("G7", 7, [0, 4, 7, 10]),   # G7: G, B, D, F
            ("Dm7", 2, [0, 3, 7, 10]),  # Dm7: D, F, A, C
            ("Fsus4", 5, [0, 5, 7]),    # Fsus4: F, Bb, C
            ("Asus2", 9, [0, 2, 7]),    # Asus2: A, B, E
            ("Cdim", 0, [0, 3, 6]),     # Cdim: C, Eb, Gb
            ("Eaug", 4, [0, 4, 8]),     # Eaug: E, G#, C
        ]

        for expected_chord, root_idx, intervals in test_cases:
            vec = [0.0] * 12
            for iv in intervals:
                vec[(root_idx + iv) % 12] = 1.0 if iv == 0 else 0.85
            res = detect_live_chord_from_frame(chroma=vec)
            assert res["chord"] == expected_chord
            assert res["confidence"] >= 0.85
            assert res["voicing"] is not None
            assert LiveChordDetectionResult(**res)

    def test_pcm_samples_a_minor_chord(self):
        # Multi-sine synthesized A Minor: A2 (110.0), E3 (164.81), A3 (220.0), C4 (261.63), E4 (329.63)
        sr = 22050
        duration = 0.5
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)
        frequencies = [110.0, 164.81, 220.0, 261.63, 329.63]
        pcm = sum(np.sin(2 * np.pi * f * t) for f in frequencies).astype(np.float32)

        res = detect_live_chord_from_frame(pcm_samples=pcm.tolist(), sample_rate=sr)
        assert res["chord"] == "Am"
        assert res["root"] == "A"
        assert res["quality"] == "minor"
        assert res["confidence"] >= 0.85
        assert res["voicing"] is not None
        assert res["voicing"]["chord"] == "Am"
        assert LiveChordDetectionResult(**res)

    def test_pcm_samples_cmaj7_chord(self):
        # Multi-sine synthesized Cmaj7: C3 (130.81), G3 (196.00), B3 (246.94), C4 (261.63), E4 (329.63)
        sr = 22050
        duration = 0.5
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)
        frequencies = [130.81, 196.00, 246.94, 261.63, 329.63]
        pcm = sum(np.sin(2 * np.pi * f * t) for f in frequencies).astype(np.float32)

        res = detect_live_chord_from_frame(pcm_samples=pcm.tolist(), sample_rate=sr)
        assert res["chord"] == "Cmaj7"
        assert res["root"] == "C"
        assert res["quality"] == "maj7"
        assert res["confidence"] >= 0.85
        assert res["voicing"] is not None
        assert LiveChordDetectionResult(**res)

    def test_pcm_samples_g7_chord(self):
        # Multi-sine synthesized G7: G2 (98.00), D3 (146.83), F3 (174.61), B3 (246.94), G4 (392.00)
        sr = 22050
        duration = 0.5
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)
        frequencies = [98.00, 146.83, 174.61, 246.94, 392.00]
        pcm = sum(np.sin(2 * np.pi * f * t) for f in frequencies).astype(np.float32)

        res = detect_live_chord_from_frame(pcm_samples=pcm.tolist(), sample_rate=sr)
        assert res["chord"] == "G7"
        assert res["root"] == "G"
        assert res["quality"] == "dom7"
        assert res["confidence"] >= 0.85
        assert res["voicing"] is not None
        assert LiveChordDetectionResult(**res)

    def test_silence_handling(self):
        # 1. No input
        res1 = detect_live_chord_from_frame()
        assert res1["chord"] == "N"
        assert res1["root"] == ""
        assert res1["quality"] == ""
        assert res1["confidence"] == 0.0
        assert res1["voicing"] is None
        assert res1["notes_detected"] == []
        assert LiveChordDetectionResult(**res1)

        # 2. Zero-value PCM
        res2 = detect_live_chord_from_frame(pcm_samples=[0.0] * 2048)
        assert res2["chord"] == "N"
        assert res2["confidence"] == 0.0
        assert res2["voicing"] is None

        # 3. Near-zero RMS PCM (< 1e-3)
        res3 = detect_live_chord_from_frame(pcm_samples=[1e-5] * 2048)
        assert res3["chord"] == "N"
        assert res3["confidence"] == 0.0

        # 4. Zero chroma
        res4 = detect_live_chord_from_frame(chroma=[0.0] * 12)
        assert res4["chord"] == "N"
        assert res4["confidence"] == 0.0

    def test_sub_50ms_latency(self):
        # Live microphone audio frames must be analyzed well under 50ms (typically < 10ms)
        sr = 22050
        duration = 2048 / sr
        t = np.linspace(0, duration, 2048, endpoint=False)
        pcm = sum(np.sin(2 * np.pi * f * t) for f in [110.0, 164.81, 220.0, 261.63, 329.63]).astype(np.float32)

        # Warmup
        _ = detect_live_chord_from_frame(pcm_samples=pcm.tolist())

        t_start = time.perf_counter()
        _ = detect_live_chord_from_frame(pcm_samples=pcm.tolist())
        elapsed_ms = (time.perf_counter() - t_start) * 1000.0

        assert elapsed_ms < 50.0, f"Execution took {elapsed_ms:.2f}ms, expected < 50ms"
