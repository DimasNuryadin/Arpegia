"""Test suite verifying end-to-end audio DSP and LangGraph orchestrator pipeline."""

import os
import sys
import tempfile
import json
import subprocess
import pytest
import numpy as np
import soundfile as sf

# Ensure services/audio-engine is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ENGINE_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if ENGINE_ROOT not in sys.path:
    sys.path.insert(0, ENGINE_ROOT)

from engine.audio_processor import AudioProcessor
from engine.key_detector import KeyDetector
from engine.chord_detector import ChordDetector
from engine.improvisation_agent import ImprovisationAgent
from engine.orchestrator import run_pipeline, AnalysisOutput


def generate_sine_wave(frequency: float, duration: float, sr: int = 22050) -> np.ndarray:
    """Generate a pure sine wave at a specific frequency."""
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)
    return np.sin(2 * np.pi * frequency * t)


def create_c_major_triad(duration: float = 3.0, sr: int = 22050) -> np.ndarray:
    """Generate a synthetic C Major triad (C4, E4, G4) using numpy."""
    c4 = 261.63  # C4
    e4 = 329.63  # E4
    g4 = 392.00  # G4

    wave_c = generate_sine_wave(c4, duration, sr)
    wave_e = generate_sine_wave(e4, duration, sr)
    wave_g = generate_sine_wave(g4, duration, sr)

    # Superpose with equal weighting and normalize
    combined = (wave_c + wave_e + wave_g) / 3.0
    return combined.astype(np.float32)


def create_chord_progression_wave(sr: int = 22050) -> np.ndarray:
    """Generate a 2-chord progression: C Major (2.0s) -> G Major (2.0s)."""
    # C Major: C4 (261.63), E4 (329.63), G4 (392.00)
    c_chord = create_c_major_triad(duration=2.0, sr=sr)

    # G Major: G3 (196.00), B3 (246.94), D4 (293.66)
    g3 = generate_sine_wave(196.00, 2.0, sr)
    b3 = generate_sine_wave(246.94, 2.0, sr)
    d4 = generate_sine_wave(293.66, 2.0, sr)
    g_chord = ((g3 + b3 + d4) / 3.0).astype(np.float32)

    return np.concatenate([c_chord, g_chord])


@pytest.fixture
def c_major_audio_file():
    """Fixture to generate a temporary WAV file containing a C Major triad."""
    sr = 22050
    audio_data = create_c_major_triad(duration=3.0, sr=sr)
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = tmp.name
    tmp.close()

    sf.write(tmp_path, audio_data, sr)

    try:
        yield tmp_path
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


@pytest.fixture
def progression_audio_file():
    """Fixture to generate a temporary WAV file containing C Major -> G Major progression."""
    sr = 22050
    audio_data = create_chord_progression_wave(sr=sr)
    tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
    tmp_path = tmp.name
    tmp.close()

    sf.write(tmp_path, audio_data, sr)

    try:
        yield tmp_path
    finally:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass


class TestAudioProcessor:
    """Unit tests for DSP audio feature extraction."""

    def test_load_audio_and_duration(self, c_major_audio_file):
        processor = AudioProcessor(sample_rate=22050)
        y, sr = processor.load_audio(c_major_audio_file)
        assert sr == 22050
        assert len(y) > 0

        duration = processor.get_duration(y, sr)
        assert pytest.approx(duration, abs=0.1) == 3.0

    def test_chromagram_extraction(self, c_major_audio_file):
        processor = AudioProcessor(sample_rate=22050)
        y, sr = processor.load_audio(c_major_audio_file)
        chroma = processor.extract_chromagram(y, sr, method="cqt")

        # Chroma should have 12 pitch classes
        assert chroma.shape[0] == 12
        assert chroma.shape[1] > 0

        # C Major has C (0), E (4), G (7)
        mean_chroma = np.mean(chroma, axis=1)
        # Top 3 pitch classes should be C, E, G
        top_indices = np.argsort(mean_chroma)[::-1][:3]
        expected_pitch_classes = {0, 4, 7}
        assert set(top_indices) == expected_pitch_classes


class TestKeyDetector:
    """Unit tests for Krumhansl-Schmuckler key detection."""

    def test_detect_c_major_key(self, c_major_audio_file):
        processor = AudioProcessor(sample_rate=22050)
        y, sr = processor.load_audio(c_major_audio_file)
        chroma = processor.extract_chromagram(y, sr, method="cqt")

        detector = KeyDetector()
        result = detector.detect_key_from_chroma(chroma)

        assert result["key"] == "C Major"
        assert result["root"] == "C"
        assert result["mode"] == "Major"
        assert result["confidence"] > 0.5


class TestChordDetector:
    """Unit tests for template-based chord detection."""

    def test_detect_c_major_chord(self, c_major_audio_file):
        processor = AudioProcessor(sample_rate=22050)
        y, sr = processor.load_audio(c_major_audio_file)
        chroma = processor.extract_chromagram(y, sr, method="cqt")
        duration = processor.get_duration(y, sr)

        detector = ChordDetector()
        chords = detector.detect_chords(chroma, duration)

        assert len(chords) >= 1
        # Primary detected chord should be "C"
        main_chord = chords[0]
        assert main_chord["chord"] == "C"
        assert main_chord["confidence"] >= 0.75
        assert main_chord["start_time"] == 0.0
        assert pytest.approx(main_chord["end_time"], abs=0.1) == 3.0

    def test_detect_progression(self, progression_audio_file):
        processor = AudioProcessor(sample_rate=22050)
        y, sr = processor.load_audio(progression_audio_file)
        chroma = processor.extract_chromagram(y, sr, method="cqt")
        duration = processor.get_duration(y, sr)

        detector = ChordDetector()
        chords = detector.detect_chords(chroma, duration)

        chord_names = [c["chord"] for c in chords]
        assert "C" in chord_names
        assert "G" in chord_names


class TestImprovisationAgent:
    """Unit tests for style-based harmonic substitution engine."""

    def test_neo_soul_suggestions(self):
        agent = ImprovisationAgent()
        chords = [{"chord": "G", "start_time": 0.0, "end_time": 2.4, "confidence": 0.94}]
        result = agent.generate_improvisations(chords, key="G Major", styles=["Neo Soul"])

        assert len(result) == 1
        assert result[0]["original_chord"] == "G"
        assert result[0]["style"] == "Neo Soul"
        # Should suggest extended Neo Soul voicings like Gmaj7, G6/9
        suggestions = result[0]["suggestions"]
        assert "Gmaj7" in suggestions
        assert "G6/9" in suggestions

    def test_multi_style_suggestions(self):
        agent = ImprovisationAgent()
        chords = [{"chord": "C", "start_time": 0.0, "end_time": 3.0, "confidence": 0.9}]
        styles = ["Jazz", "Pop", "Fingerstyle"]
        result = agent.generate_improvisations(chords, key="C Major", styles=styles)

        assert len(result) == 3
        returned_styles = {r["style"] for r in result}
        assert returned_styles == set(styles)


class TestOrchestratorPipeline:
    """End-to-end integration tests for LangGraph StateGraph pipeline."""

    def test_end_to_end_c_major(self, c_major_audio_file):
        output = run_pipeline(c_major_audio_file, styles=["Neo Soul"])

        # 1. Verify top-level structure
        assert "metadata" in output
        assert "chords" in output
        assert "improvisations" in output

        # 2. Verify metadata schema & accuracy
        meta = output["metadata"]
        assert meta["filename"] == os.path.basename(c_major_audio_file)
        assert pytest.approx(meta["duration"], abs=0.1) == 3.0
        assert meta["key"] == "C Major"
        assert meta["time_signature"] == "4/4"
        assert isinstance(meta["bpm"], (int, float))

        # 3. Verify chords structure & content
        chords = output["chords"]
        assert len(chords) >= 1
        assert chords[0]["chord"] == "C"
        assert chords[0]["start_time"] == 0.0
        assert chords[0]["confidence"] >= 0.75

        # 4. Verify improvisations structure & content
        improvisations = output["improvisations"]
        assert len(improvisations) >= 1
        assert improvisations[0]["original_chord"] == "C"
        assert improvisations[0]["style"] == "Neo Soul"
        assert "Cmaj7" in improvisations[0]["suggestions"]

        # 5. Verify valid serialization to clean JSON
        json_str = json.dumps(output)
        assert len(json_str) > 0
        deserialized = json.loads(json_str)
        assert deserialized["metadata"]["key"] == "C Major"

        # 6. Strict validation against Pydantic model
        validated = AnalysisOutput.model_validate(output)
        assert validated.metadata.key == "C Major"


class TestCLI:
    """CLI runner standalone integration test."""

    def test_cli_execution(self, c_major_audio_file):
        cli_script = os.path.join(ENGINE_ROOT, "cli.py")
        python_exe = sys.executable

        result = subprocess.run(
            [python_exe, cli_script, c_major_audio_file, "--styles", "Neo Soul"],
            capture_output=True,
            text=True,
            check=True,
        )

        assert result.returncode == 0
        output_json = json.loads(result.stdout)
        assert output_json["metadata"]["key"] == "C Major"
        assert output_json["chords"][0]["chord"] == "C"
        assert output_json["improvisations"][0]["style"] == "Neo Soul"
