"""Test suite verifying Phase 3 AI Arrangement Engine, Multi-Format Exporters,
and LangGraph Orchestrator integration against `packages/shared-types/schemas.py`.
"""

import os
import sys
import tempfile
import json
import xml.etree.ElementTree as ET
import pytest
import numpy as np
import soundfile as sf

# Ensure services/audio-engine and packages/shared-types are importable for verification
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
ENGINE_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, ".."))
REPO_ROOT = os.path.abspath(os.path.join(ENGINE_ROOT, "..", ".."))
SHARED_TYPES_DIR = os.path.join(REPO_ROOT, "packages", "shared-types")

if ENGINE_ROOT not in sys.path:
    sys.path.insert(0, ENGINE_ROOT)
if SHARED_TYPES_DIR not in sys.path:
    sys.path.insert(0, SHARED_TYPES_DIR)

from engine.arrangement_generator import (
    ArrangementGenerator,
    generate_arrangement,
    VALID_STYLES,
    VALID_DIFFICULTIES,
)
from engine.exporters import (
    export_to_midi_bytes,
    export_to_musicxml,
    export_to_pdf_bytes,
    export_to_ascii,
    export_arrangement,
)
from engine.orchestrator import (
    run_pipeline,
    generate_custom_arrangement,
    export_job_score,
    AnalysisOutput,
    ArrangementVariation,
    TabNote,
)
import schemas as shared_schemas


@pytest.fixture
def sample_analysis_fixture():
    """Provide canonical sample metadata, chords, and base tablature for deterministic tests."""
    metadata = {
        "filename": "progression.wav",
        "duration": 9.6,
        "key": "G Major",
        "bpm": 100,
        "time_signature": "4/4",
    }
    chords = [
        {"chord": "G", "start_time": 0.0, "end_time": 2.4, "confidence": 0.94},
        {"chord": "Em", "start_time": 2.4, "end_time": 4.8, "confidence": 0.91},
        {"chord": "C", "start_time": 4.8, "end_time": 7.2, "confidence": 0.89},
        {"chord": "D", "start_time": 7.2, "end_time": 9.6, "confidence": 0.92},
    ]
    base_tablature = {
        "tuning": ["E2", "A2", "D3", "G3", "B3", "E4"],
        "capo": 0,
        "difficulty": "Beginner",
        "measures": [
            {
                "measure_number": 1,
                "start_time": 0.0,
                "end_time": 2.4,
                "notes": [
                    {
                        "id": "note-1",
                        "start_time": 0.0,
                        "duration": 0.6,
                        "string": 6,
                        "fret": 3,
                        "midi": 43,
                        "note_name": "G2",
                        "confidence": 0.95,
                        "technique": "normal",
                        "voice": "bass",
                    },
                    {
                        "id": "note-2",
                        "start_time": 1.2,
                        "duration": 0.6,
                        "string": 1,
                        "fret": 3,
                        "midi": 67,
                        "note_name": "G4",
                        "confidence": 0.93,
                        "technique": "normal",
                        "voice": "melody",
                    },
                ],
            }
        ],
        "ascii_tab": (
            "e|-----3-----------|\n"
            "B|-----------------|\n"
            "G|-----------------|\n"
            "D|-----------------|\n"
            "A|-----------------|\n"
            "E|-3---------------|"
        ),
    }
    return metadata, chords, base_tablature


class TestPhase3ArrangementGenerator:
    """Verify AI Fingerstyle & Style Arrangement Engine across all styles, difficulties, capo, and tempo_scale."""

    @pytest.mark.parametrize("style", VALID_STYLES)
    @pytest.mark.parametrize("difficulty", VALID_DIFFICULTIES)
    def test_all_styles_and_difficulties_produce_valid_arrangements(
        self, sample_analysis_fixture, style, difficulty
    ):
        metadata, chords, base_tab = sample_analysis_fixture
        arr = generate_arrangement(
            metadata=metadata,
            chords=chords,
            base_tablature=base_tab,
            style=style,
            difficulty=difficulty,
            capo=0,
            tempo_scale=1.0,
        )

        # Validate against both local and shared-types Pydantic models
        validated_local = ArrangementVariation.model_validate(arr)
        validated_shared = shared_schemas.ArrangementVariation.model_validate(arr)
        assert validated_local.style == style
        assert validated_shared.difficulty == difficulty
        assert len(arr["chords_used"]) >= 1

        tab = arr["tablature"]
        assert tab["difficulty"] == difficulty
        assert len(tab["measures"]) >= 1

        # Verify 6-line ASCII tab format
        ascii_lines = tab["ascii_tab"].strip().split("\n")
        assert len(ascii_lines) == 6
        for line, prefix in zip(ascii_lines, ["e|", "B|", "G|", "D|", "A|", "E|"]):
            assert line.startswith(prefix)
            assert line.endswith("|")

        # Verify notes have valid playable frets (0..24), strings (1..6), and voice roles
        all_notes = [n for m in tab["measures"] for n in m["notes"]]
        assert len(all_notes) >= 4
        valid_voices = {"melody", "bass", "harmony", "percussive"}
        voices_present = set()

        for n in all_notes:
            assert 1 <= n["string"] <= 6
            assert 0 <= n["fret"] <= 24
            assert 40 <= n["midi"] <= 88
            assert n["voice"] in valid_voices
            voices_present.add(n["voice"])
            shared_schemas.TabNote.model_validate(n)

        # Every style arrangement must include polyphonic voice separation (at least bass + melody/harmony)
        assert "bass" in voices_present
        assert ("melody" in voices_present) or ("harmony" in voices_present)
        if style == "Neo Soul":
            assert "percussive" in voices_present

    def test_four_styles_are_distinct(self, sample_analysis_fixture):
        metadata, chords, base_tab = sample_analysis_fixture
        variations = {}
        for style in VALID_STYLES:
            arr = generate_arrangement(
                metadata=metadata,
                chords=chords,
                base_tablature=base_tab,
                style=style,
                difficulty="Intermediate",
            )
            variations[style] = arr

        # Verify distinct arrangement IDs, titles, descriptions, and note patterns
        ids = {v["arrangement_id"] for v in variations.values()}
        titles = {v["title"] for v in variations.values()}
        tabs = {v["tablature"]["ascii_tab"] for v in variations.values()}
        assert len(ids) == 4
        assert len(titles) == 4
        assert len(tabs) >= 3

    def test_capo_and_tempo_scale_adjustments(self, sample_analysis_fixture):
        metadata, chords, base_tab = sample_analysis_fixture
        arr_open = generate_arrangement(
            metadata=metadata,
            chords=chords,
            base_tablature=base_tab,
            style="Neo Soul",
            difficulty="Advanced",
            capo=0,
            tempo_scale=1.0,
        )
        arr_capo_slow = generate_arrangement(
            metadata=metadata,
            chords=chords,
            base_tablature=base_tab,
            style="Neo Soul",
            difficulty="Advanced",
            capo=3,
            tempo_scale=0.8,
        )

        assert arr_capo_slow["tablature"]["capo"] == 3
        assert "Capo 3" in arr_capo_slow["description"]
        assert "0.8x tempo" in arr_capo_slow["description"]

        # Slower tempo_scale (0.8x) stretches measure end_time (9.6 / 0.8 = 12.0s)
        open_end = arr_open["tablature"]["measures"][-1]["end_time"]
        slow_end = arr_capo_slow["tablature"]["measures"][-1]["end_time"]
        assert slow_end > open_end

        # All frets remain within 0..24 under Capo 3
        for m in arr_capo_slow["tablature"]["measures"]:
            for n in m["notes"]:
                assert 0 <= n["fret"] <= 24


class TestPhase3SymbolicExporters:
    """Verify pure-Python MIDI, MusicXML 4.0, PDF 1.4, and ASCII exporters."""

    def test_export_to_midi_bytes_valid_header_and_tracks(self, sample_analysis_fixture):
        metadata, chords, base_tab = sample_analysis_fixture
        arr = generate_arrangement(
            metadata=metadata,
            chords=chords,
            base_tablature=base_tab,
            style="Fingerstyle",
            difficulty="Intermediate",
        )
        midi_bytes = export_to_midi_bytes(metadata=metadata, chords=chords, tablature=arr)

        assert isinstance(midi_bytes, bytes)
        assert midi_bytes.startswith(b"MThd")
        assert b"MTrk" in midi_bytes
        assert midi_bytes.endswith(b"\xFF\x2F\x00")
        assert len(midi_bytes) > 64

    def test_export_to_musicxml_valid_structure(self, sample_analysis_fixture):
        metadata, chords, base_tab = sample_analysis_fixture
        arr = generate_arrangement(
            metadata=metadata,
            chords=chords,
            base_tablature=base_tab,
            style="Fingerstyle",
            difficulty="Intermediate",
        )
        xml_str = export_to_musicxml(metadata=metadata, chords=chords, tablature=arr)

        assert isinstance(xml_str, str)
        assert "<score-partwise" in xml_str
        assert "<staff-details>" in xml_str
        assert "<string>" in xml_str
        assert "<fret>" in xml_str
        assert "<hammer-on" in xml_str or "<slide" in xml_str

        # Verify well-formed XML via ElementTree
        root = ET.fromstring(xml_str)
        assert root.tag == "score-partwise"
        frets = root.findall(".//fret")
        strings = root.findall(".//string")
        assert len(frets) > 0
        assert len(strings) == len(frets)

    def test_export_to_pdf_bytes_valid_binary_pdf(self, sample_analysis_fixture):
        metadata, chords, base_tab = sample_analysis_fixture
        arr = generate_arrangement(
            metadata=metadata,
            chords=chords,
            base_tablature=base_tab,
            style="Jazz Chord Melody",
            difficulty="Intermediate",
        )
        pdf_bytes = export_to_pdf_bytes(metadata=metadata, chords=chords, tablature=arr)

        assert isinstance(pdf_bytes, bytes)
        assert pdf_bytes.startswith(b"%PDF-1.4")
        assert b"%%EOF" in pdf_bytes
        assert b"/BaseFont /Courier" in pdf_bytes
        assert b"G Major" in pdf_bytes

    def test_export_to_ascii_formatted_sheet(self, sample_analysis_fixture):
        metadata, chords, base_tab = sample_analysis_fixture
        ascii_sheet = export_to_ascii(metadata=metadata, chords=chords, tablature=base_tab)

        assert isinstance(ascii_sheet, str)
        assert "ARPEGIA GUITAR SCORE & TABLATURE" in ascii_sheet
        assert "G Major" in ascii_sheet
        assert "e|" in ascii_sheet
        assert "E|" in ascii_sheet


class TestPhase3EndToEndOrchestrator:
    """Verify LangGraph StateGraph includes ArrangementGeneratorNode and helpers."""

    def test_run_pipeline_includes_default_fingerstyle_arrangement(self):
        sr = 22050
        t = np.linspace(0, 2.0, int(sr * 2.0), endpoint=False)
        # Synthesize G Major chord wave (G3, B3, D4)
        wave = (
            np.sin(2 * np.pi * 196.00 * t)
            + np.sin(2 * np.pi * 246.94 * t)
            + np.sin(2 * np.pi * 293.66 * t)
        ) / 3.0

        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        tmp_path = tmp.name
        tmp.close()
        sf.write(tmp_path, wave.astype(np.float32), sr)

        try:
            output = run_pipeline(tmp_path, styles=["Neo Soul", "Fingerstyle"])
        finally:
            if os.path.exists(tmp_path):
                os.remove(tmp_path)

        # Verify Phase 1 + Phase 2 + Phase 3 fields
        assert "metadata" in output
        assert "chords" in output
        assert "improvisations" in output
        assert "chord_diagrams" in output
        assert "tablature" in output
        assert "arrangements" in output

        arrangements = output["arrangements"]
        assert len(arrangements) >= 1
        default_arr = arrangements[0]
        assert default_arr["style"] == "Fingerstyle"
        assert default_arr["arrangement_id"] == "arr-fingerstyle-default"

        # Validate against canonical `packages/shared-types/schemas.py`
        validated = shared_schemas.AnalysisOutput.model_validate(output)
        assert len(validated.arrangements) >= 1

        # Verify on-demand helpers used by apps/api
        custom_arr = generate_custom_arrangement(
            output, style="Neo Soul", difficulty="Advanced", capo=2, tempo_scale=0.9
        )
        assert custom_arr["style"] == "Neo Soul"
        assert custom_arr["difficulty"] == "Advanced"
        assert custom_arr["tablature"]["capo"] == 2
        output["arrangements"].append(custom_arr)

        midi_out = export_job_score(
            output, export_format="midi", arrangement_id=custom_arr["arrangement_id"]
        )
        assert isinstance(midi_out, bytes) and midi_out.startswith(b"MThd")

        xml_out = export_job_score(output, export_format="musicxml")
        assert isinstance(xml_out, str) and "<score-partwise" in xml_out

        pdf_out = export_job_score(output, export_format="pdf")
        assert isinstance(pdf_out, bytes) and pdf_out.startswith(b"%PDF-")
