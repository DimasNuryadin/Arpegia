"""End-to-End (E2E) Smoke Test for Phase 1, Phase 2, and Phase 3 Guitar Intelligence Pipeline.

Verifies the complete integrated flow across `apps/api` and `services/audio-engine`:
a. `GET /health` -> asserts `200 OK`.
b. `POST /api/v1/analyze` with a synthesized multi-note guitar WAV file -> asserts `200 OK`,
   verifies `chords`, `improvisations`, `chord_diagrams`, `tablature`, and initial `arrangements`
   (with polyphonic `voice` roles on `TabNote`: 'bass', 'melody', 'harmony', 'percussive').
c. `PUT /api/v1/analyze/{job_id}/tablature` -> edits a note's `fret` and `technique` and verifies
   updated `ascii_tab`.
d. `POST /api/v1/analyze/{job_id}/arrange` with `{ "style": "Neo Soul", "difficulty": "Advanced",
   "capo": 2, "tempo_scale": 0.9 }` -> asserts `200 OK`, verifies the new `arrangement_id` is
   generated with valid measures, notes, and `voice` roles, and persists in `GET /api/v1/analyze/{job_id}`.
e. `GET /api/v1/analyze/{job_id}/export` across all 4 formats (`midi`, `musicxml`, `pdf`, `ascii`)
   for both base tablature and the new `arrangement_id` -> asserts `200 OK`, verifies CORS
   `Content-Disposition` exposure, and validates magic bytes (`MThd` for MIDI, `<?xml` +
   `<score-partwise` for MusicXML, `%PDF-` for PDF, and 6-line staff for ASCII).
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
async def test_phase3_complete_end_to_end_journey(client: AsyncClient) -> None:
    """Execute full Phase 1 + Phase 2 + Phase 3 E2E smoke test flow."""
    # -------------------------------------------------------------------------
    # Step A: GET /health -> asserts 200 OK
    # -------------------------------------------------------------------------
    health_resp = await client.get("/health")
    assert health_resp.status_code == 200
    health_data = health_resp.json()
    assert health_data.get("status") in ("ok", "healthy")
    assert health_data.get("service") == "arpegia-api"

    # -------------------------------------------------------------------------
    # Step B: POST /api/v1/analyze with synthesized multi-note guitar WAV file
    # -------------------------------------------------------------------------
    wav_bytes = create_synthetic_guitar_arpeggio_wav(
        frequencies=[164.81, 196.00, 246.94, 329.63],
        note_duration=0.5,
        sample_rate=22050,
    )
    files = {"file": ("e2e_phase3_guitar.wav", wav_bytes, "audio/wav")}
    analyze_resp = await client.post(
        "/api/v1/analyze",
        files=files,
        headers={"Origin": "http://localhost:3000"},
    )
    assert analyze_resp.status_code == 200, f"POST /analyze failed: {analyze_resp.text}"
    analysis = analyze_resp.json()

    job_id = analysis["job_id"]
    assert isinstance(job_id, str) and len(job_id) > 0
    assert analysis["status"] == "completed"
    assert analysis["metadata"]["filename"] == "e2e_phase3_guitar.wav"
    assert analysis["metadata"]["duration"] >= 1.5

    # Verify Phase 1: chords & improvisations
    assert isinstance(analysis["chords"], list) and len(analysis["chords"]) >= 1
    assert isinstance(analysis["improvisations"], list) and len(analysis["improvisations"]) >= 1

    # Verify Phase 2: chord_diagrams & tablature
    assert isinstance(analysis["chord_diagrams"], list) and len(analysis["chord_diagrams"]) >= 1
    for diag in analysis["chord_diagrams"]:
        assert len(diag["frets"]) == 6
        assert len(diag["fingers"]) == 6

    tab = analysis["tablature"]
    assert tab["tuning"] == ["E2", "A2", "D3", "G3", "B3", "E4"]
    assert len(tab["measures"]) >= 1
    assert len(tab["measures"][0]["notes"]) >= 1
    assert len(tab["ascii_tab"].strip().splitlines()) == 6

    # Verify Phase 3: initial arrangements (default Fingerstyle with polyphonic voice roles)
    assert "arrangements" in analysis
    arrangements = analysis["arrangements"]
    assert isinstance(arrangements, list) and len(arrangements) >= 1
    default_arr = arrangements[0]
    assert default_arr["arrangement_id"] == "arr-fingerstyle-default"
    assert default_arr["style"] == "Fingerstyle"
    assert len(default_arr["tablature"]["measures"]) >= 1
    assert len(default_arr["tablature"]["ascii_tab"].strip().splitlines()) == 6

    initial_voices = {
        n["voice"]
        for m in default_arr["tablature"]["measures"]
        for n in m["notes"]
    }
    assert initial_voices.issubset({"melody", "bass", "harmony", "percussive"})
    assert "bass" in initial_voices
    assert ("melody" in initial_voices) or ("harmony" in initial_voices)

    # -------------------------------------------------------------------------
    # Step C: PUT /api/v1/analyze/{job_id}/tablature -> edit fret and technique
    # -------------------------------------------------------------------------
    first_note = tab["measures"][0]["notes"][0]
    edit_payload = {
        "capo": 0,
        "difficulty": "Intermediate",
        "notes": [
            {
                "id": first_note["id"],
                "string": first_note["string"],
                "fret": 4,
                "technique": "slide",
            }
        ],
    }
    put_resp = await client.put(f"/api/v1/analyze/{job_id}/tablature", json=edit_payload)
    assert put_resp.status_code == 200
    updated_tab = put_resp.json()["tablature"]
    edited_note = next(
        n for n in updated_tab["measures"][0]["notes"] if n["id"] == first_note["id"]
    )
    assert edited_note["fret"] == 4
    assert edited_note["technique"] == "slide"
    assert "4/" in updated_tab["ascii_tab"]

    # -------------------------------------------------------------------------
    # Step D: POST /api/v1/analyze/{job_id}/arrange -> Neo Soul, Advanced, Capo 2, 0.9x
    # -------------------------------------------------------------------------
    arrange_payload = {
        "style": "Neo Soul",
        "difficulty": "Advanced",
        "capo": 2,
        "tempo_scale": 0.9,
    }
    arrange_resp = await client.post(
        f"/api/v1/analyze/{job_id}/arrange", json=arrange_payload
    )
    assert arrange_resp.status_code == 200, f"POST /arrange failed: {arrange_resp.text}"
    neo_soul_arr = arrange_resp.json()

    new_arr_id = neo_soul_arr["arrangement_id"]
    assert isinstance(new_arr_id, str) and len(new_arr_id) > 0
    assert neo_soul_arr["style"] == "Neo Soul"
    assert neo_soul_arr["difficulty"] == "Advanced"
    assert neo_soul_arr["tablature"]["capo"] == 2
    assert neo_soul_arr["tablature"]["difficulty"] == "Advanced"
    assert len(neo_soul_arr["tablature"]["measures"]) >= 1
    assert len(neo_soul_arr["tablature"]["ascii_tab"].strip().splitlines()) == 6

    arr_notes = [n for m in neo_soul_arr["tablature"]["measures"] for n in m["notes"]]
    assert len(arr_notes) >= 4
    arr_voices = {n["voice"] for n in arr_notes}
    assert arr_voices.issubset({"melody", "bass", "harmony", "percussive"})
    assert "bass" in arr_voices
    assert "melody" in arr_voices
    assert "percussive" in arr_voices

    # Verify persistence in GET /api/v1/analyze/{job_id}
    get_job_resp = await client.get(f"/api/v1/analyze/{job_id}")
    assert get_job_resp.status_code == 200
    persisted_job = get_job_resp.json()
    persisted_arr_ids = [a["arrangement_id"] for a in persisted_job["arrangements"]]
    assert new_arr_id in persisted_arr_ids

    # -------------------------------------------------------------------------
    # Step E: GET /api/v1/analyze/{job_id}/export across all 4 formats
    #         (both base tablature and new arrangement_id)
    # -------------------------------------------------------------------------
    for target_arr_id in (None, new_arr_id):
        extra_params = {"arrangement_id": target_arr_id} if target_arr_id else {}

        # 1. MIDI (.mid)
        midi_resp = await client.get(
            f"/api/v1/analyze/{job_id}/export",
            params={"format": "midi", **extra_params},
            headers={"Origin": "http://localhost:3000"},
        )
        assert midi_resp.status_code == 200
        assert midi_resp.headers["content-type"].startswith("audio/midi")
        assert f'filename="arpegia-{job_id}.mid"' in midi_resp.headers["content-disposition"]
        assert "content-disposition" in (
            midi_resp.headers.get("access-control-expose-headers", "").lower()
        )
        assert midi_resp.content.startswith(b"MThd")
        assert b"MTrk" in midi_resp.content

        # 2. MusicXML (.musicxml)
        xml_resp = await client.get(
            f"/api/v1/analyze/{job_id}/export",
            params={"format": "musicxml", **extra_params},
        )
        assert xml_resp.status_code == 200
        assert xml_resp.headers["content-type"].startswith(
            "application/vnd.recordare.musicxml+xml"
        )
        assert f'filename="arpegia-{job_id}.musicxml"' in xml_resp.headers["content-disposition"]
        xml_text = xml_resp.text
        assert xml_text.startswith("<?xml")
        assert "<score-partwise" in xml_text
        assert "<staff-details" in xml_text
        assert "<string>" in xml_text
        assert "<fret>" in xml_text

        # 3. PDF (.pdf)
        pdf_resp = await client.get(
            f"/api/v1/analyze/{job_id}/export",
            params={"format": "pdf", **extra_params},
        )
        assert pdf_resp.status_code == 200
        assert pdf_resp.headers["content-type"].startswith("application/pdf")
        assert f'filename="arpegia-{job_id}.pdf"' in pdf_resp.headers["content-disposition"]
        assert pdf_resp.content.startswith(b"%PDF-")
        assert b"%%EOF" in pdf_resp.content

        # 4. ASCII (.txt)
        ascii_resp = await client.get(
            f"/api/v1/analyze/{job_id}/export",
            params={"format": "ascii", **extra_params},
        )
        assert ascii_resp.status_code == 200
        assert ascii_resp.headers["content-type"].startswith("text/plain")
        assert f'filename="arpegia-{job_id}.txt"' in ascii_resp.headers["content-disposition"]
        staff_lines = [
            line
            for line in ascii_resp.text.splitlines()
            if line.strip().startswith(("e|", "B|", "G|", "D|", "A|", "E|"))
        ]
        assert len(staff_lines) == 6
        assert staff_lines[0].startswith("e|")
        assert staff_lines[5].startswith("E|")
