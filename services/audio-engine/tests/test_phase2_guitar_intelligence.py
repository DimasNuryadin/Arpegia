"""Test suite verifying Phase 2 Guitar Intelligence modules:

TabTranscriber, Fretboard Pathfinding, Chord Voicing Diagrams, and Orchestrator integration.
"""

import os
import sys
import tempfile
import json
import pytest
import numpy as np
import soundfile as sf

# Ensure services/audio-engine is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ENGINE_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
if ENGINE_ROOT not in sys.path:
    sys.path.insert(0, ENGINE_ROOT)

from engine.chord_voicings import ChordVoicingGenerator
from engine.tab_transcriber import TabTranscriber, DEFAULT_TUNING_PITCHES
from engine.orchestrator import run_pipeline, AnalysisOutput, TabNote, TabMeasure, TablatureData, ChordDiagram


def synthesize_guitar_arpeggio(sr: int = 22050) -> np.ndarray:
    """Synthesize a 4-note guitar arpeggio: E4 (329.63) -> G3 (196.00) -> B3 (246.94) -> E4 (329.63).

    Each note lasts 0.5s with natural pluck exponential decay.
    """
    frequencies = [329.63, 196.00, 246.94, 329.63]
    note_dur = 0.5
    note_samples = int(sr * note_dur)
    t = np.linspace(0, note_dur, note_samples, endpoint=False)

    wave_chunks = []
    for freq in frequencies:
        # Fundamental sine wave with slight 2nd harmonic for realistic string timbre
        decay = np.exp(-3.0 * t)  # Pluck envelope
        fundamental = np.sin(2 * np.pi * freq * t)
        second_harm = 0.3 * np.sin(2 * np.pi * 2 * freq * t)
        chunk = (fundamental + second_harm) * decay
        wave_chunks.append(chunk.astype(np.float32))

    return np.concatenate(wave_chunks)


@pytest.fixture
def arpeggio_audio_file():
    """Fixture to generate a temporary WAV file containing E4 -> G3 -> B3 -> E4 arpeggio."""
    sr = 22050
    audio_data = synthesize_guitar_arpeggio(sr=sr)
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


class TestChordVoicingGenerator:
    """Unit tests for 6-string guitar chord voicing diagram generation."""

    def test_open_chords_structure(self):
        generator = ChordVoicingGenerator()
        for chord_name in ["G", "C", "D", "Em", "Am", "F"]:
            diag = generator.get_chord_diagram(chord_name)
            assert diag["chord"] == chord_name
            assert len(diag["frets"]) == 6
            assert len(diag["fingers"]) == 6
            assert 1 <= diag["base_fret"] <= 24

            for fret in diag["frets"]:
                assert -1 <= fret <= 24
            for finger in diag["fingers"]:
                assert 0 <= finger <= 4

    def test_extended_and_improvisation_voicings(self):
        generator = ChordVoicingGenerator()
        extended_chords = ["Gmaj7", "Em9", "Cadd9", "A6/9", "D7", "Csus4", "Am7"]
        for chord in extended_chords:
            diag = generator.get_chord_diagram(chord)
            assert len(diag["frets"]) == 6
            assert len(diag["fingers"]) == 6
            # Validates against Pydantic schema directly
            validated = ChordDiagram.model_validate(diag)
            assert validated.chord == chord

    def test_slash_chords(self):
        generator = ChordVoicingGenerator()
        for slash in ["C/E", "G/B", "D/F#"]:
            diag = generator.get_chord_diagram(slash)
            assert len(diag["frets"]) == 6
            assert len(diag["fingers"]) == 6
            validated = ChordDiagram.model_validate(diag)
            assert validated.chord == slash

    def test_fallback_uncommon_chords(self):
        generator = ChordVoicingGenerator()
        # Rare or complex chords should not raise errors and generate valid movable shapes
        rare_chords = ["F#7#9", "Bbm(maj7)", "G13sus4", "Abmaj7"]
        for chord in rare_chords:
            diag = generator.get_chord_diagram(chord)
            assert len(diag["frets"]) == 6
            assert len(diag["fingers"]) == 6
            validated = ChordDiagram.model_validate(diag)
            assert validated.chord == chord

    def test_generate_diagrams_for_analysis_deduplication(self):
        generator = ChordVoicingGenerator()
        chords = [
            {"chord": "G", "start_time": 0.0, "end_time": 2.4, "confidence": 0.9},
            {"chord": "G", "start_time": 2.4, "end_time": 4.8, "confidence": 0.9},
            {"chord": "Em", "start_time": 4.8, "end_time": 7.2, "confidence": 0.85},
        ]
        improvisations = [
            {"original_chord": "G", "style": "Neo Soul", "suggestions": ["Gmaj7", "G6/9"]},
            {"original_chord": "Em", "style": "Neo Soul", "suggestions": ["Em9", "Gmaj7"]},  # Duplicate Gmaj7
        ]
        diagrams = generator.generate_diagrams_for_analysis(chords, improvisations)
        symbols = [d["chord"] for d in diagrams]

        # No duplicate diagrams
        assert len(symbols) == len(set(symbols))
        assert "G" in symbols
        assert "Em" in symbols
        assert "Gmaj7" in symbols
        assert "G6/9" in symbols
        assert "Em9" in symbols


class TestTabTranscriber:
    """Unit tests for audio-to-MIDI transcription and fretboard pathfinding."""

    def test_transcribe_synthetic_arpeggio(self, arpeggio_audio_file):
        transcriber = TabTranscriber(sample_rate=22050)
        processor_y, sr = sf.read(arpeggio_audio_file)
        duration = float(len(processor_y) / sr)

        tab = transcriber.transcribe(
            y=processor_y,
            sr=sr,
            duration=duration,
            bpm=120,
            time_signature="4/4",
        )

        # 1. Structure verification
        assert "tuning" in tab
        assert "capo" in tab
        assert "difficulty" in tab
        assert "measures" in tab
        assert "ascii_tab" in tab

        # 2. Measures and TabNote validation
        measures = tab["measures"]
        assert len(measures) >= 1

        all_notes = []
        for m in measures:
            assert m["measure_number"] >= 1
            assert m["start_time"] >= 0.0
            assert m["end_time"] > m["start_time"]
            all_notes.extend(m["notes"])

        assert len(all_notes) >= 3  # Should transcribe the arpeggio notes

        valid_techniques = {"normal", "hammer-on", "pull-off", "slide", "bend"}
        for note in all_notes:
            # Physical fretboard constraints
            assert 1 <= note["string"] <= 6
            assert 0 <= note["fret"] <= 24
            assert 40 <= note["midi"] <= 88
            assert note["start_time"] >= 0.0
            assert note["duration"] > 0.0
            assert 0.0 <= note["confidence"] <= 1.0
            assert note["technique"] in valid_techniques

            # Validate against TabNote Pydantic model
            validated_note = TabNote.model_validate(note)
            assert validated_note.id == note["id"]

        # 3. ASCII tab verification
        ascii_tab = tab["ascii_tab"]
        lines = ascii_tab.strip().split("\n")
        assert len(lines) == 6

        # Check all 6 guitar string labels are present in order
        expected_prefixes = ["e|", "B|", "G|", "D|", "A|", "E|"]
        for line, prefix in zip(lines, expected_prefixes):
            assert line.startswith(prefix)
            assert line.endswith("|")

        # Check all lines have equal character length
        line_lengths = [len(l) for l in lines]
        assert len(set(line_lengths)) == 1

        # 4. Difficulty rating
        assert tab["difficulty"] in ["Beginner", "Intermediate", "Advanced"]

    def test_empty_audio_handling(self):
        transcriber = TabTranscriber(sample_rate=22050)
        empty_y = np.zeros(22050, dtype=np.float32)
        tab = transcriber.transcribe(empty_y, sr=22050, duration=1.0)

        assert tab["difficulty"] == "Beginner"
        assert len(tab["measures"]) >= 1
        lines = tab["ascii_tab"].strip().split("\n")
        assert len(lines) == 6
        for line, prefix in zip(lines, ["e|", "B|", "G|", "D|", "A|", "E|"]):
            assert line.startswith(prefix)


class TestPhase2EndToEndOrchestrator:
    """Integration test verifying LangGraph pipeline returns all Phase 1 + Phase 2 fields."""

    def test_pipeline_output_phase2_contract(self, arpeggio_audio_file):
        output = run_pipeline(arpeggio_audio_file, styles=["Neo Soul"])

        # 1. Phase 1 fields exist
        assert "metadata" in output
        assert "chords" in output
        assert "improvisations" in output

        # 2. Phase 2 fields exist
        assert "chord_diagrams" in output
        assert "tablature" in output

        # 3. Chord diagrams schema validation
        diagrams = output["chord_diagrams"]
        assert len(diagrams) >= 1
        for d in diagrams:
            assert len(d["frets"]) == 6
            assert len(d["fingers"]) == 6
            assert 1 <= d["base_fret"] <= 24
            ChordDiagram.model_validate(d)

        # 4. Tablature schema validation
        tab = output["tablature"]
        assert "tuning" in tab
        assert "capo" in tab
        assert "difficulty" in tab
        assert "measures" in tab
        assert "ascii_tab" in tab

        lines = tab["ascii_tab"].strip().split("\n")
        assert len(lines) == 6

        # 5. Strict Pydantic model validation of full payload
        validated = AnalysisOutput.model_validate(output)
        assert validated.metadata.filename == os.path.basename(arpeggio_audio_file)
        assert len(validated.chord_diagrams) >= 1
        assert len(validated.tablature.measures) >= 1

        # 6. JSON serializability test
        serialized = json.dumps(output)
        assert len(serialized) > 0
        deserialized = json.loads(serialized)
        assert "chord_diagrams" in deserialized
        assert "tablature" in deserialized
