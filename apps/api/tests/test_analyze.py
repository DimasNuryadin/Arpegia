"""Tests for audio analysis upload, job retrieval, and Phase 2 interactive tablature endpoints."""

import io
import wave
import pytest
import numpy as np
from httpx import AsyncClient


def create_mock_wav_bytes(duration_seconds: float = 1.0, sample_rate: int = 8000) -> bytes:
    """Generate minimal valid PCM WAV bytes in memory."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        num_frames = int(duration_seconds * sample_rate)
        # Write silence frames (zeros)
        wav_file.writeframes(b"\x00\x00" * num_frames)
    return buf.getvalue()


def create_synthetic_chord_wav_bytes(
    frequencies: list[float] = [261.63, 329.63, 392.00],  # C Major triad: C4, E4, G4
    duration_seconds: float = 3.0,
    sample_rate: int = 22050,
) -> bytes:
    """Generate a synthetic 16-bit PCM WAV file containing a musical chord."""
    t = np.linspace(0, duration_seconds, int(sample_rate * duration_seconds), endpoint=False)
    waveform = sum(np.sin(2 * np.pi * freq * t) for freq in frequencies) / len(frequencies)
    pcm16 = np.int16(np.clip(waveform * 0.85, -1.0, 1.0) * 32767)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm16.tobytes())
    return buf.getvalue()


@pytest.mark.anyio
async def test_analyze_valid_mp3(client: AsyncClient) -> None:
    """Verify successful upload of an MP3 file matches the Phase 1 + Phase 2 shared data contract."""
    dummy_mp3 = b"\xff\xfb\x90\x64" + b"\x00" * 1024  # Standard MP3 frame header + padding
    files = {"file": ("acoustic_riff.mp3", dummy_mp3, "audio/mpeg")}

    response = await client.post("/api/v1/analyze", files=files)
    assert response.status_code == 200

    data = response.json()

    # Shared Data Contract Assertions
    assert "job_id" in data
    assert isinstance(data["job_id"], str)
    assert data["status"] == "completed"

    # Metadata Assertions
    metadata = data["metadata"]
    assert metadata["filename"] == "acoustic_riff.mp3"
    assert isinstance(metadata["duration"], (int, float))
    assert metadata["duration"] > 0
    assert metadata["key"] == "G Major"
    assert metadata["bpm"] == 105
    assert metadata["time_signature"] == "4/4"

    # Chords List Assertions
    assert isinstance(data["chords"], list)
    assert len(data["chords"]) > 0
    first_chord = data["chords"][0]
    assert "chord" in first_chord
    assert "start_time" in first_chord
    assert "end_time" in first_chord
    assert "confidence" in first_chord
    assert 0.0 <= first_chord["confidence"] <= 1.0
    assert first_chord["chord"] == "G"

    # Improvisations List Assertions
    assert isinstance(data["improvisations"], list)
    assert len(data["improvisations"]) > 0
    first_imp = data["improvisations"][0]
    assert first_imp["original_chord"] == "G"
    assert first_imp["style"] == "Neo Soul"
    assert isinstance(first_imp["suggestions"], list)
    assert "Gmaj7" in first_imp["suggestions"]

    # Phase 2: Chord Diagrams Assertions
    assert "chord_diagrams" in data
    assert isinstance(data["chord_diagrams"], list)
    assert len(data["chord_diagrams"]) >= 1
    first_diagram = data["chord_diagrams"][0]
    assert first_diagram["chord"] == "G"
    assert first_diagram["frets"] == [3, 2, 0, 0, 0, 3]
    assert first_diagram["fingers"] == [2, 1, 0, 0, 0, 3]
    assert first_diagram["base_fret"] == 1

    # Phase 2: Tablature Assertions
    assert "tablature" in data
    tab = data["tablature"]
    assert tab["tuning"] == ["E2", "A2", "D3", "G3", "B3", "E4"]
    assert tab["capo"] == 0
    assert tab["difficulty"] in ("Beginner", "Intermediate", "Advanced")
    assert isinstance(tab["measures"], list)
    assert len(tab["measures"]) >= 1

    m1 = tab["measures"][0]
    assert m1["measure_number"] == 1
    assert isinstance(m1["notes"], list)
    assert len(m1["notes"]) >= 1
    n1 = m1["notes"][0]
    assert n1["id"] == "note-1"
    assert n1["string"] == 6
    assert n1["fret"] == 3
    assert n1["midi"] == 43
    assert n1["note_name"] == "G2"
    assert n1["technique"] == "normal"

    # 6-line ASCII tab preview assertions
    ascii_lines = tab["ascii_tab"].strip().split("\n")
    assert len(ascii_lines) == 6
    assert ascii_lines[0].startswith("e|")
    assert ascii_lines[5].startswith("E|-3")


@pytest.mark.anyio
async def test_analyze_valid_wav(client: AsyncClient) -> None:
    """Verify upload of a valid WAV file and duration parsing."""
    wav_bytes = create_mock_wav_bytes(duration_seconds=2.5, sample_rate=8000)
    files = {"file": ("guitar_solo.wav", wav_bytes, "audio/wav")}

    response = await client.post("/api/v1/analyze", files=files)
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "completed"
    assert data["metadata"]["filename"] == "guitar_solo.wav"
    assert data["metadata"]["duration"] == 2.5
    assert len(data["chords"]) > 0
    assert len(data["chord_diagrams"]) > 0
    assert len(data["tablature"]["measures"]) > 0
    assert len(data["tablature"]["ascii_tab"].splitlines()) == 6


@pytest.mark.anyio
async def test_get_analysis_job_by_id(client: AsyncClient) -> None:
    """Verify that a previously analyzed job can be retrieved by its job_id."""
    dummy_mp3 = b"\xff\xfb\x90\x64" + b"\x00" * 512
    files = {"file": ("track.mp3", dummy_mp3, "audio/mpeg")}

    post_resp = await client.post("/api/v1/analyze", files=files)
    assert post_resp.status_code == 200
    job_id = post_resp.json()["job_id"]

    get_resp = await client.get(f"/api/v1/analyze/{job_id}")
    assert get_resp.status_code == 200
    retrieved = get_resp.json()
    assert retrieved["job_id"] == job_id
    assert retrieved["metadata"]["filename"] == "track.mp3"
    assert retrieved["status"] == "completed"
    assert "chord_diagrams" in retrieved
    assert "tablature" in retrieved


@pytest.mark.anyio
async def test_put_tablature_patch_notes_updates_midi_and_ascii_tab(client: AsyncClient) -> None:
    """Verify PUT /api/v1/analyze/{job_id}/tablature updates note string/fret/technique,
    recomputes midi & note_name, and regenerates the 6-line ascii_tab.
    """
    dummy_mp3 = b"\xff\xfb\x90\x64" + b"\x00" * 512
    files = {"file": ("editor_test.mp3", dummy_mp3, "audio/mpeg")}

    post_resp = await client.post("/api/v1/analyze", files=files)
    assert post_resp.status_code == 200
    job_id = post_resp.json()["job_id"]

    # Edit note-1: move from (string=6, fret=3 -> G2/43) to (string=5, fret=10, slide -> G3/55)
    update_payload = {
        "capo": 0,
        "difficulty": "Intermediate",
        "notes": [
            {
                "id": "note-1",
                "string": 5,
                "fret": 10,
                "technique": "slide",
            }
        ],
    }

    put_resp = await client.put(f"/api/v1/analyze/{job_id}/tablature", json=update_payload)
    assert put_resp.status_code == 200
    updated = put_resp.json()

    tab = updated["tablature"]
    assert tab["difficulty"] == "Intermediate"
    n1 = tab["measures"][0]["notes"][0]
    assert n1["id"] == "note-1"
    assert n1["string"] == 5
    assert n1["fret"] == 10
    assert n1["technique"] == "slide"
    assert n1["midi"] == 55  # A2 (45) + 10 = 55 (G3)
    assert n1["note_name"] == "G3"

    # Verify 6-line ascii_tab reflects fret 10 with slide '/' on the A string (line index 4)
    ascii_lines = tab["ascii_tab"].splitlines()
    assert len(ascii_lines) == 6
    assert "10/" in ascii_lines[4]  # A string line

    # Verify persistence via GET /api/v1/analyze/{job_id}
    get_resp = await client.get(f"/api/v1/analyze/{job_id}")
    assert get_resp.status_code == 200
    persisted_tab = get_resp.json()["tablature"]
    assert persisted_tab["measures"][0]["notes"][0]["fret"] == 10
    assert "10/" in persisted_tab["ascii_tab"]


@pytest.mark.anyio
async def test_put_tablature_full_measures_replacement(client: AsyncClient) -> None:
    """Verify PUT /api/v1/analyze/{job_id}/tablature accepts full measures list."""
    dummy_mp3 = b"\xff\xfb\x90\x64" + b"\x00" * 512
    post_resp = await client.post(
        "/api/v1/analyze", files={"file": ("measures.mp3", dummy_mp3, "audio/mpeg")}
    )
    job_id = post_resp.json()["job_id"]

    full_update = {
        "tuning": ["E2", "A2", "D3", "G3", "B3", "E4"],
        "capo": 2,
        "difficulty": "Advanced",
        "measures": [
            {
                "measure_number": 1,
                "start_time": 0.0,
                "end_time": 2.0,
                "notes": [
                    {
                        "id": "note-1",
                        "start_time": 0.0,
                        "duration": 0.5,
                        "string": 1,
                        "fret": 5,
                        "midi": 64,
                        "note_name": "E4",
                        "confidence": 1.0,
                        "technique": "hammer-on",
                    }
                ],
            }
        ],
    }

    put_resp = await client.put(f"/api/v1/analyze/{job_id}/tablature", json=full_update)
    assert put_resp.status_code == 200
    tab = put_resp.json()["tablature"]
    assert tab["capo"] == 2
    assert tab["difficulty"] == "Advanced"
    note = tab["measures"][0]["notes"][0]
    # High E4 (64) + capo 2 + fret 5 = 71 (B4)
    assert note["midi"] == 71
    assert note["note_name"] == "B4"
    assert "5h" in tab["ascii_tab"].splitlines()[0]


@pytest.mark.anyio
async def test_put_tablature_rejects_out_of_range_fret_and_string(client: AsyncClient) -> None:
    """Verify PUT /api/v1/analyze/{job_id}/tablature rejects fret > 24 or string > 6 with 422."""
    dummy_mp3 = b"\xff\xfb\x90\x64" + b"\x00" * 512
    post_resp = await client.post(
        "/api/v1/analyze", files={"file": ("invalid_edit.mp3", dummy_mp3, "audio/mpeg")}
    )
    job_id = post_resp.json()["job_id"]

    # Out-of-range fret (fret = 29 > 24)
    bad_fret_resp = await client.put(
        f"/api/v1/analyze/{job_id}/tablature",
        json={"notes": [{"id": "note-1", "string": 6, "fret": 29, "technique": "normal"}]},
    )
    assert bad_fret_resp.status_code in (400, 422)
    err_data = bad_fret_resp.json()
    assert "error" in err_data
    assert err_data["error"]["code"] == "VALIDATION_ERROR"

    # Out-of-range string (string = 7 > 6)
    bad_string_resp = await client.put(
        f"/api/v1/analyze/{job_id}/tablature",
        json={"notes": [{"id": "note-1", "string": 7, "fret": 5, "technique": "normal"}]},
    )
    assert bad_string_resp.status_code in (400, 422)
    err_data_2 = bad_string_resp.json()
    assert "error" in err_data_2
    assert err_data_2["error"]["code"] == "VALIDATION_ERROR"


@pytest.mark.anyio
async def test_get_nonexistent_job(client: AsyncClient) -> None:
    """Verify 404 response when querying a nonexistent job ID."""
    response = await client.get("/api/v1/analyze/nonexistent-uuid-1234")
    assert response.status_code == 404
    data = response.json()
    assert "detail" in data
    assert "not found" in data["detail"].lower()
    assert data["error"]["code"] == "JOB_NOT_FOUND"


@pytest.mark.anyio
async def test_reject_disallowed_extension(client: AsyncClient) -> None:
    """Verify 400 rejection for unsupported file extensions like .txt, .ogg, .mp4."""
    files = {"file": ("notes.txt", b"Invalid audio content", "text/plain")}
    response = await client.post("/api/v1/analyze", files=files)
    assert response.status_code == 400
    data = response.json()
    assert "unsupported file format" in data["detail"].lower()
    assert data["error"]["code"] == "INVALID_AUDIO_FORMAT"


@pytest.mark.anyio
async def test_reject_disallowed_mime_type(client: AsyncClient) -> None:
    """Verify 400 rejection if an MP3 file has a disallowed MIME type like video/mp4."""
    files = {"file": ("song.mp3", b"test", "video/mp4")}
    response = await client.post("/api/v1/analyze", files=files)
    assert response.status_code == 400
    data = response.json()
    assert "unsupported audio mime type" in data["detail"].lower()
    assert data["error"]["code"] == "INVALID_AUDIO_FORMAT"


@pytest.mark.anyio
async def test_reject_oversized_file(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify 413 Payload Too Large when file exceeds MAX_UPLOAD_SIZE_BYTES."""
    from app.core.config import settings

    # Temporarily set upload limit to 500 bytes for fast test
    monkeypatch.setattr(settings, "MAX_UPLOAD_SIZE_BYTES", 500)

    oversized_data = b"\x00" * 1024  # 1KB > 500 bytes
    files = {"file": ("large_song.mp3", oversized_data, "audio/mpeg")}

    response = await client.post("/api/v1/analyze", files=files)
    assert response.status_code == 413
    data = response.json()
    assert "exceeds" in data["detail"].lower()
    assert data["error"]["code"] == "FILE_TOO_LARGE"


@pytest.mark.anyio
async def test_e2e_synthetic_wav_chord_and_key_detection(client: AsyncClient) -> None:
    """End-to-end verification: generate a synthetic C Major WAV file, send to /api/v1/analyze,
    and verify 200 OK with real LangGraph audio-engine chord, key, chord_diagrams, and tablature output.
    """
    wav_bytes = create_synthetic_chord_wav_bytes(
        frequencies=[261.63, 329.63, 392.00],  # C4, E4, G4 (C Major triad)
        duration_seconds=3.0,
        sample_rate=22050,
    )
    files = {"file": ("synthetic_c_major.wav", wav_bytes, "audio/wav")}

    response = await client.post(
        "/api/v1/analyze",
        files=files,
        headers={"Origin": "http://localhost:3000"},
    )
    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == "http://localhost:3000"

    data = response.json()
    assert data["status"] == "completed"
    assert isinstance(data["job_id"], str) and len(data["job_id"]) > 0

    # Verify real DSP & LangGraph metadata extraction
    meta = data["metadata"]
    assert meta["filename"] == "synthetic_c_major.wav"
    assert pytest.approx(meta["duration"], abs=0.1) == 3.0
    assert meta["key"] == "C Major"
    assert isinstance(meta["bpm"], (int, float)) and meta["bpm"] > 0
    assert meta["time_signature"] == "4/4"

    # Verify real chord detection from audio-engine
    chords = data["chords"]
    assert isinstance(chords, list) and len(chords) >= 1
    assert chords[0]["chord"] == "C"
    assert chords[0]["start_time"] == 0.0
    assert pytest.approx(chords[-1]["end_time"], abs=0.1) == 3.0
    assert chords[0]["confidence"] >= 0.75

    # Verify style-based improvisations generated for C
    improvisations = data["improvisations"]
    assert isinstance(improvisations, list) and len(improvisations) >= 1
    assert improvisations[0]["original_chord"] == "C"
    assert improvisations[0]["style"] == "Neo Soul"
    assert "Cmaj7" in improvisations[0]["suggestions"]

    # Verify Phase 2 chord_diagrams and tablature on real audio-engine output
    assert len(data["chord_diagrams"]) >= 1
    assert data["chord_diagrams"][0]["chord"] == "C"
    assert len(data["chord_diagrams"][0]["frets"]) == 6
    assert len(data["tablature"]["measures"]) >= 1
    assert len(data["tablature"]["ascii_tab"].splitlines()) == 6
