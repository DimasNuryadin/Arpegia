"""Test suite verifying Demucs stem separation fallback, Basic Pitch transcription, and Viterbi fretboard DP."""

import os
import sys
import tempfile
import shutil
import subprocess
from unittest.mock import patch, MagicMock
import pytest
import numpy as np
import soundfile as sf

# Ensure services/audio-engine is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ENGINE_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if ENGINE_ROOT not in sys.path:
    sys.path.insert(0, ENGINE_ROOT)

from engine.viterbi_fretboard import (
    assign_optimal_fretboard_path,
    get_candidate_positions,
    get_string_open_pitch,
)
from engine.polyphonic_transcriber import (
    transcribe_polyphonic_guitar,
    classify_pitch_bend_technique,
    is_basic_pitch_available,
)
from engine.stem_separator import DemucsStemSeparator
from engine.orchestrator import run_pipeline, AnalysisOutput


class TestViterbiFretboard:
    """Test suite for Viterbi DP fretboard pathfinding, polyphonic constraints, and articulation heuristics."""

    def test_polyphony_simultaneous_notes_never_share_string(self):
        """Simultaneous notes (chords/dyads with dt == 0.0) MUST never be mapped to the same string."""
        # C Major Triad: C3 (48), E3 (52), G3 (55), C4 (60)
        chord_notes = [
            {"id": "c1", "start_time": 0.0, "duration": 1.0, "midi": 48, "note_name": "C3", "confidence": 0.95},
            {"id": "c2", "start_time": 0.0, "duration": 1.0, "midi": 52, "note_name": "E3", "confidence": 0.95},
            {"id": "c3", "start_time": 0.0, "duration": 1.0, "midi": 55, "note_name": "G3", "confidence": 0.95},
            {"id": "c4", "start_time": 0.0, "duration": 1.0, "midi": 60, "note_name": "C4", "confidence": 0.95},
        ]

        mapped = assign_optimal_fretboard_path(chord_notes)
        assert len(mapped) == 4

        assigned_strings = [n["string"] for n in mapped]
        # Assert each note gets a UNIQUE string
        assert len(assigned_strings) == len(set(assigned_strings)), f"Duplicate strings assigned: {assigned_strings}"

        for n in mapped:
            assert 1 <= n["string"] <= 6
            assert 0 <= n["fret"] <= 24

    def test_articulation_heuristics_hammer_on_pull_off_and_slide(self):
        """Rapid consecutive notes on the same string (0.04s <= dt <= 0.22s) are accurately labeled."""
        # 1. Hammer-on: String 3 fret 2 (A3, MIDI 57) -> fret 4 (B3, MIDI 59)
        # 2. Pull-off: String 3 fret 4 (B3, MIDI 59) -> fret 2 (A3, MIDI 57)
        # 3. Slide: String 2 fret 3 (D4, MIDI 62) -> fret 8 (G4, MIDI 67) (diff = +5 > 3)
        rapid_notes = [
            # Hammer-on pair on G string (MIDI 57 -> 59)
            {"id": "n1", "start_time": 0.00, "duration": 0.10, "midi": 57, "note_name": "A3", "confidence": 0.9},
            {"id": "n2", "start_time": 0.10, "duration": 0.10, "midi": 59, "note_name": "B3", "confidence": 0.9},
            # Pull-off pair on G string (MIDI 59 -> 57)
            {"id": "n3", "start_time": 0.50, "duration": 0.10, "midi": 59, "note_name": "B3", "confidence": 0.9},
            {"id": "n4", "start_time": 0.60, "duration": 0.10, "midi": 57, "note_name": "A3", "confidence": 0.9},
            # Slide pair on B string (MIDI 62 -> 67, fret 3 to 8)
            {"id": "n5", "start_time": 1.00, "duration": 0.10, "midi": 62, "note_name": "D4", "confidence": 0.9},
            {"id": "n6", "start_time": 1.10, "duration": 0.10, "midi": 67, "note_name": "G4", "confidence": 0.9},
        ]

        mapped = assign_optimal_fretboard_path(rapid_notes)
        assert len(mapped) == 6

        # Check hammer-on on n2
        if mapped[0]["string"] == mapped[1]["string"]:
            assert mapped[1]["technique"] == "hammer-on"

        # Check pull-off on n4
        if mapped[2]["string"] == mapped[3]["string"]:
            assert mapped[3]["technique"] == "pull-off"

        # Check slide on n6
        if mapped[4]["string"] == mapped[5]["string"]:
            assert mapped[5]["technique"] == "slide"

    def test_voice_role_assignment(self):
        """Voice roles match Phase 3 specification: string >= 5 -> bass, 3..4 -> harmony, <= 2 -> melody."""
        test_notes = [
            {"id": "v1", "start_time": 0.0, "duration": 0.5, "midi": 40, "note_name": "E2"},  # Low E string 6
            {"id": "v2", "start_time": 0.0, "duration": 0.5, "midi": 50, "note_name": "D3"},  # D string 4
            {"id": "v3", "start_time": 0.0, "duration": 0.5, "midi": 64, "note_name": "E4"},  # High E string 1
        ]
        mapped = assign_optimal_fretboard_path(test_notes)
        for n in mapped:
            s = n["string"]
            if s >= 5:
                assert n["voice"] == "bass"
            elif s in (3, 4):
                assert n["voice"] == "harmony"
            elif s <= 2:
                assert n["voice"] == "melody"


class TestPolyphonicTranscriber:
    """Test suite for Spotify Basic Pitch polyphonic transcription and pitch-bend classification."""

    def test_pitch_bend_classification_heuristics(self):
        """Verify pitch bend curve correctly distinguishes bends, slides, and normal articulations."""
        # Normal (subtle vibrato or flat)
        assert classify_pitch_bend_technique([0.0, 0.1, -0.1, 0.0]) == "normal"
        assert classify_pitch_bend_technique([]) == "normal"
        assert classify_pitch_bend_technique(None) == "normal"

        # Bend (peak in middle >= 1.5 semitones)
        bend_curve = [0.0, 0.8, 2.0, 1.1, 0.1]
        assert classify_pitch_bend_technique(bend_curve) == "bend"

        # Slide (monotonic glide)
        slide_up = [0.0, 0.5, 1.0, 1.5, 2.0]
        assert classify_pitch_bend_technique(slide_up) == "slide"

        slide_down = [0.0, -0.4, -0.8, -1.2]
        assert classify_pitch_bend_technique(slide_down) == "slide"

    def test_mocked_basic_pitch_predict_and_range_filtering(self, monkeypatch):
        """Mock basic_pitch.inference.predict and verify note parsing and range filtering."""
        synthetic_events = [
            # In range normal note: MIDI 60 (C4)
            (0.0, 0.5, 60.0, 0.9, [0.0, 0.1, 0.0]),
            # In range bend note: MIDI 64 (E4)
            (0.6, 1.1, 64.0, 0.85, [0.0, 1.0, 2.1, 0.9, 0.0]),
            # In range slide note: MIDI 67 (G4)
            (1.2, 1.7, 67.0, 0.88, [0.0, 0.6, 1.2, 1.8]),
            # Out of range low: MIDI 35 (< 40)
            (2.0, 2.5, 35.0, 0.9, [0.0, 0.0]),
            # Out of range high: MIDI 95 (> 88)
            (2.6, 3.0, 95.0, 0.9, [0.0, 0.0]),
        ]

        def mock_predict(*args, **kwargs):
            return None, None, synthetic_events

        # Mock predict and enable flag
        monkeypatch.setattr("engine.polyphonic_transcriber.HAS_BASIC_PITCH", True)
        monkeypatch.setattr("engine.polyphonic_transcriber.predict", mock_predict)
        monkeypatch.setenv("ARPEGIA_ENABLE_BASIC_PITCH", "true")

        # Create dummy existing file
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            notes = transcribe_polyphonic_guitar(tmp_path)
            # Only the 3 in-range notes should survive
            assert len(notes) == 3

            # Check techniques
            assert notes[0]["midi"] == 60
            assert notes[0]["initial_technique"] == "normal"

            assert notes[1]["midi"] == 64
            assert notes[1]["initial_technique"] == "bend"

            assert notes[2]["midi"] == 67
            assert notes[2]["initial_technique"] == "slide"

            # Check MIDI range
            for n in notes:
                assert 40 <= n["midi"] <= 88
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def test_disabled_basic_pitch_returns_empty(self, monkeypatch):
        """When ARPEGIA_ENABLE_BASIC_PITCH=false, returns clean empty list for fallback."""
        monkeypatch.setenv("ARPEGIA_ENABLE_BASIC_PITCH", "false")
        result = transcribe_polyphonic_guitar("nonexistent.wav")
        assert result == []


class TestDemucsStemSeparator:
    """Test suite for Demucs 4-stem separation fallback and temporary directory cleanup."""

    def test_fallback_when_disabled(self, monkeypatch):
        """When Demucs is disabled via env var, safely returns original path with is_separated=False."""
        monkeypatch.setenv("ARPEGIA_ENABLE_DEMUCS", "false")
        separator = DemucsStemSeparator()

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            res = separator.separate(tmp_path)
            assert res["is_separated"] is False
            assert res["guitar_stem"] == tmp_path
            assert res["harmonic_mix"] == tmp_path
            assert res["bass_stem"] == tmp_path
            assert res["stem_dir"] is None
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

    def test_mocked_demucs_execution_and_harmonic_mix(self, monkeypatch):
        """Mock Demucs subprocess execution and verify 65/35 harmonic mix synthesis."""
        sr = 22050
        duration = 1.0
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)
        dummy_other = (0.5 * np.sin(2 * np.pi * 440 * t)).astype(np.float32)
        dummy_bass = (0.5 * np.sin(2 * np.pi * 110 * t)).astype(np.float32)

        # Temp input audio
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_in:
            in_path = tmp_in.name
        sf.write(in_path, dummy_other, sr)

        real_run = subprocess.run

        def mock_subprocess_run(cmd, *args, **kwargs):
            # cmd includes -o <temp_dir>
            if isinstance(cmd, (list, tuple)) and "-o" in cmd:
                out_idx = cmd.index("-o") + 1
                out_dir = cmd[out_idx]
                stem_dir = os.path.join(out_dir, "htdemucs", "test_track")
                os.makedirs(stem_dir, exist_ok=True)
                sf.write(os.path.join(stem_dir, "other.wav"), dummy_other, sr)
                sf.write(os.path.join(stem_dir, "bass.wav"), dummy_bass, sr)
                mock_res = MagicMock()
                mock_res.returncode = 0
                return mock_res
            return real_run(cmd, *args, **kwargs)

        monkeypatch.setenv("ARPEGIA_ENABLE_DEMUCS", "true")
        monkeypatch.setattr(DemucsStemSeparator, "is_available", classmethod(lambda cls: True))
        monkeypatch.setattr("subprocess.run", mock_subprocess_run)

        separator = DemucsStemSeparator()
        res = separator.separate(in_path)

        created_stem_dir = res["stem_dir"]
        try:
            assert res["is_separated"] is True
            assert os.path.exists(res["guitar_stem"])
            assert os.path.exists(res["harmonic_mix"])
            assert os.path.exists(res["bass_stem"])
            assert "harmonic_mix.wav" in res["harmonic_mix"]

            # Verify harmonic mix audio content
            y_harm, sr_harm = sf.read(res["harmonic_mix"])
            assert len(y_harm) > 0
            assert sr_harm == sr
        finally:
            if created_stem_dir:
                separator.cleanup(created_stem_dir)
                assert not os.path.exists(created_stem_dir)
            if os.path.exists(in_path):
                os.remove(in_path)

    def test_pipeline_cleans_up_stem_dir_in_finally_block(self, monkeypatch):
        """Verify that orchestrator.run_pipeline cleans up stem_dir inside finally block."""
        sr = 22050
        duration = 1.0
        t = np.linspace(0, duration, int(sr * duration), endpoint=False)
        test_wave = (0.5 * np.sin(2 * np.pi * 261.63 * t)).astype(np.float32)  # C4 sine

        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp_in:
            in_path = tmp_in.name
        sf.write(in_path, test_wave, sr)

        captured_stem_dirs = []

        real_mkdtemp = tempfile.mkdtemp

        def instrumented_mkdtemp(*args, **kwargs):
            td = real_mkdtemp(*args, **kwargs)
            if "arpegia_demucs_" in td:
                captured_stem_dirs.append(td)
            return td

        real_run = subprocess.run

        def mock_subprocess_run(cmd, *args, **kwargs):
            if isinstance(cmd, (list, tuple)) and "-o" in cmd:
                out_idx = cmd.index("-o") + 1
                out_dir = cmd[out_idx]
                stem_dir = os.path.join(out_dir, "htdemucs", "audio")
                os.makedirs(stem_dir, exist_ok=True)
                sf.write(os.path.join(stem_dir, "other.wav"), test_wave, sr)
                sf.write(os.path.join(stem_dir, "bass.wav"), test_wave, sr)
                mock_res = MagicMock()
                mock_res.returncode = 0
                return mock_res
            return real_run(cmd, *args, **kwargs)

        monkeypatch.setenv("ARPEGIA_ENABLE_DEMUCS", "true")
        monkeypatch.setattr(DemucsStemSeparator, "is_available", classmethod(lambda cls: True))
        monkeypatch.setattr("tempfile.mkdtemp", instrumented_mkdtemp)
        monkeypatch.setattr("subprocess.run", mock_subprocess_run)

        try:
            output = run_pipeline(in_path)
            assert "metadata" in output
            assert "tablature" in output

            # Assert any created stem directories were cleaned up and do NOT exist on disk
            assert len(captured_stem_dirs) >= 1
            for d in captured_stem_dirs:
                assert not os.path.exists(d), f"Stem directory leaked on disk: {d}"
        finally:
            if os.path.exists(in_path):
                os.remove(in_path)
            for d in captured_stem_dirs:
                if os.path.exists(d):
                    shutil.rmtree(d, ignore_errors=True)
