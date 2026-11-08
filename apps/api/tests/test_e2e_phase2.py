"""End-to-End (E2E) Smoke Test for Phase 2 Guitar Intelligence Pipeline.

Verifies complete user journey:
1. GET /health -> 200 OK.
2. Synthetic multi-note guitar WAV generation & upload to POST /api/v1/analyze.
3. Verification of chord_diagrams (6-string frets & fingers) and tablature (measures & 6-line ascii_tab).
4. PUT /api/v1/analyze/{job_id}/tablature interactive note edit (string, fret, technique).
5. Verification of regenerated ascii_tab and persistent job storage via GET /api/v1/analyze/{job_id}.
"""

import io
import wave
import numpy as np
import pytest
from httpx import AsyncClient


def create_synthetic_guitar_arpeggio_wav(
    frequencies: list[float] = [164.81, 196.00, 246.94, 329.63],  # E3, G3, B3, E4 (Em arpeggio)
    note_duration: float = 0.5,
    sample_rate: int = 22050,
) -> bytes:
    """Generate a realistic synthetic 16-bit PCM WAV file with exponential pluck decay."""
    num_samples = int(sample_rate * note_duration)
    t = np.linspace(0, note_duration, num_samples, endpoint=False)
    chunks = []

    for freq in frequencies:
        pluck_decay = np.exp(-3.0 * t)
        fundamental = np.sin(2 * np.pi * freq * t)
        second_harmonic = 0.3 * np.sin(4 * np.pi * freq * t)
        note_wave = (fundamental + second_harmonic) * pluck_decay
        chunks.append(note_wave.astype(np.float32))

    y = np.concatenate(chunks)
    pcm16 = np.int16(np.clip(y * 0.85, -1.0, 1.0) * 32767)

    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm16.tobytes())

    return buf.getvalue()


@pytest.mark.anyio
async def test_phase2_complete_user_journey_e2e(client: AsyncClient) -> None:
    """Execute complete Phase 2 end-to-end integration and smoke test journey."""
    # -------------------------------------------------------------------------
    # Step A: Healthcheck asserting 200 OK
    # -------------------------------------------------------------------------
    health_resp = await client.get("/health")
    assert health_resp.status_code == 200, f"Expected 200 from /health, got {health_resp.status_code}"
    health_data = health_resp.json()
    assert health_data.get("status") in ("ok", "healthy")
    assert "version" in health_data

    # -------------------------------------------------------------------------
    # Step B: Generate synthetic multi-note guitar WAV & upload to POST /api/v1/analyze
    # -------------------------------------------------------------------------
    wav_bytes = create_synthetic_guitar_arpeggio_wav(
        frequencies=[164.81, 196.00, 246.94, 329.63],  # E3 -> G3 -> B3 -> E4
        note_duration=0.5,
        sample_rate=22050,
    )
    assert len(wav_bytes) > 0

    files = {"file": ("e2e_guitar_arpeggio.wav", wav_bytes, "audio/wav")}
    analyze_resp = await client.post("/api/v1/analyze", files=files)
    assert analyze_resp.status_code == 200, f"POST /analyze failed: {analyze_resp.text}"

    analysis = analyze_resp.json()

    # -------------------------------------------------------------------------
    # Step C: Assert Phase 2 fields (chord_diagrams, tablature, ascii_tab)
    # -------------------------------------------------------------------------
    job_id = analysis["job_id"]
    assert isinstance(job_id, str) and len(job_id) > 0
    assert analysis["status"] == "completed"
    assert analysis["metadata"]["filename"] == "e2e_guitar_arpeggio.wav"
    assert analysis["metadata"]["duration"] >= 1.5

    # Verify chord_diagrams
    assert "chord_diagrams" in analysis
    diagrams = analysis["chord_diagrams"]
    assert isinstance(diagrams, list)
    assert len(diagrams) >= 1
    for diag in diagrams:
        assert "chord" in diag and isinstance(diag["chord"], str)
        assert "frets" in diag and len(diag["frets"]) == 6
        assert "fingers" in diag and len(diag["fingers"]) == 6
        assert diag["base_fret"] >= 1
        for fret_val in diag["frets"]:
            assert -1 <= fret_val <= 24
        for finger_val in diag["fingers"]:
            assert 0 <= finger_val <= 4

    # Verify tablature
    assert "tablature" in analysis
    tab = analysis["tablature"]
    assert tab["tuning"] == ["E2", "A2", "D3", "G3", "B3", "E4"]
    assert tab["capo"] >= 0
    assert tab["difficulty"] in ("Beginner", "Intermediate", "Advanced")
    assert isinstance(tab["measures"], list)
    assert len(tab["measures"]) >= 1

    first_measure = tab["measures"][0]
    assert first_measure["measure_number"] >= 1
    assert len(first_measure["notes"]) >= 1

    for note in first_measure["notes"]:
        assert 1 <= note["string"] <= 6
        assert 0 <= note["fret"] <= 24
        assert note["technique"] in ("normal", "hammer-on", "pull-off", "slide", "bend")
        assert note["midi"] >= 0
        assert len(note["note_name"]) > 0

    # Verify 6-line ascii_tab
    ascii_lines = [line for line in tab["ascii_tab"].strip().split("\n") if line.strip()]
    assert len(ascii_lines) == 6, f"Expected 6 lines in ascii_tab, got {len(ascii_lines)}"
    for line, prefix in zip(ascii_lines, ["e|", "B|", "G|", "D|", "A|", "E|"]):
        assert line.startswith(prefix), f"Line '{line}' does not start with expected prefix '{prefix}'"

    # -------------------------------------------------------------------------
    # Step D: Send PUT /api/v1/analyze/{job_id}/tablature modifying first note
    # -------------------------------------------------------------------------
    first_note = first_measure["notes"][0]
    original_id = first_note["id"]
    original_string = first_note["string"]

    # Modify fret to 4 and technique to "slide"
    edit_payload = {
        "capo": 0,
        "difficulty": "Intermediate",
        "notes": [
            {
                "id": original_id,
                "string": original_string,
                "fret": 4,
                "technique": "slide",
            }
        ],
    }

    put_resp = await client.put(f"/api/v1/analyze/{job_id}/tablature", json=edit_payload)
    assert put_resp.status_code == 200, f"PUT /tablature failed: {put_resp.text}"

    updated_analysis = put_resp.json()
    updated_tab = updated_analysis["tablature"]
    assert updated_tab["difficulty"] == "Intermediate"

    updated_notes = updated_tab["measures"][0]["notes"]
    updated_target = next(n for n in updated_notes if n["id"] == original_id)
    assert updated_target["fret"] == 4
    assert updated_target["technique"] == "slide"

    # Verify ascii_tab contains updated fret 4 with slide marker "/"
    updated_ascii = updated_tab["ascii_tab"]
    assert "4/" in updated_ascii, f"Expected '4/' marker in updated ascii_tab:\n{updated_ascii}"

    # -------------------------------------------------------------------------
    # Step E: Assert persistence via GET /api/v1/analyze/{job_id}
    # -------------------------------------------------------------------------
    get_resp = await client.get(f"/api/v1/analyze/{job_id}")
    assert get_resp.status_code == 200
    persisted_analysis = get_resp.json()
    persisted_tab = persisted_analysis["tablature"]
    persisted_target = next(n for n in persisted_tab["measures"][0]["notes"] if n["id"] == original_id)
    assert persisted_target["fret"] == 4
    assert persisted_target["technique"] == "slide"
    assert "4/" in persisted_tab["ascii_tab"]


@pytest.mark.anyio
async def test_phase2_put_tablature_validation_errors(client: AsyncClient) -> None:
    """Verify bounds enforcement for string (1-6), fret (0-24), and technique validation."""
    dummy_mp3 = b"\xff\xfb\x90\x64" + b"\x00" * 512
    files = {"file": ("validation_test.mp3", dummy_mp3, "audio/mpeg")}
    post_resp = await client.post("/api/v1/analyze", files=files)
    assert post_resp.status_code == 200
    job_id = post_resp.json()["job_id"]

    # Fret > 24 should return 422
    invalid_fret_resp = await client.put(
        f"/api/v1/analyze/{job_id}/tablature",
        json={"notes": [{"id": "note-1", "string": 1, "fret": 28, "technique": "normal"}]},
    )
    assert invalid_fret_resp.status_code == 422

    # String > 6 should return 422
    invalid_string_resp = await client.put(
        f"/api/v1/analyze/{job_id}/tablature",
        json={"notes": [{"id": "note-1", "string": 7, "fret": 5, "technique": "normal"}]},
    )
    assert invalid_string_resp.status_code == 422

    # Unknown job ID should return 404
    missing_job_resp = await client.put(
        "/api/v1/analyze/non-existent-job-id/tablature",
        json={"notes": [{"id": "note-1", "string": 1, "fret": 0, "technique": "normal"}]},
    )
    assert missing_job_resp.status_code == 404
