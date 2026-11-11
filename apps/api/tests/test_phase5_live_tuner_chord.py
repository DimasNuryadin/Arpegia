"""Phase 5 Tests: Guitar Tuner Presets API, Live Chord Detection REST Endpoint, and Real-Time /ws/live-chord WebSocket Stream."""

import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.main import app
from app.schemas.analysis import (
    LiveChordDetectionResult,
    LiveChordFrameRequest,
    TuningPreset,
)
from app.services.live_service import live_service


# ============================================================================
# 1. GET /api/v1/tuner/presets
# ============================================================================


@pytest.mark.anyio
async def test_get_tuner_presets_default_a440(client: AsyncClient) -> None:
    """Verify GET /api/v1/tuner/presets returns all 5 canonical guitar tuning presets
    with 6 TuningStringTarget items ordered string 6 to string 1 and accurate target frequencies.
    """
    response = await client.get("/api/v1/tuner/presets")
    assert response.status_code == 200

    presets_data = response.json()
    assert isinstance(presets_data, list)
    assert len(presets_data) == 5

    preset_ids = [p["id"] for p in presets_data]
    expected_ids = ["standard", "drop_d", "half_step_down", "open_g", "dadgad"]
    assert preset_ids == expected_ids

    # Validate each preset has 6 strings ordered from string 6 to string 1
    for p in presets_data:
        assert p["reference_a4_hz"] == 440.0
        assert len(p["strings"]) == 6
        string_nums = [s["string"] for s in p["strings"]]
        assert string_nums == [6, 5, 4, 3, 2, 1]

    # Validate exact target frequencies for standard tuning (A4 = 440.0 Hz)
    standard = next(p for p in presets_data if p["id"] == "standard")
    assert standard["name"] == "Standard (E A D G B E)"
    expected_standard = [
        {"string": 6, "note": "E2", "frequency_hz": 82.41, "midi": 40},
        {"string": 5, "note": "A2", "frequency_hz": 110.00, "midi": 45},
        {"string": 4, "note": "D3", "frequency_hz": 146.83, "midi": 50},
        {"string": 3, "note": "G3", "frequency_hz": 196.00, "midi": 55},
        {"string": 2, "note": "B3", "frequency_hz": 246.94, "midi": 59},
        {"string": 1, "note": "E4", "frequency_hz": 329.63, "midi": 64},
    ]
    for actual, expected in zip(standard["strings"], expected_standard):
        assert actual["string"] == expected["string"]
        assert actual["note"] == expected["note"]
        assert actual["midi"] == expected["midi"]
        assert pytest.approx(actual["frequency_hz"], abs=0.05) == expected["frequency_hz"]

    # Validate Drop D string 6 is D2 (73.42 Hz, midi 38)
    drop_d = next(p for p in presets_data if p["id"] == "drop_d")
    assert drop_d["strings"][0]["note"] == "D2"
    assert pytest.approx(drop_d["strings"][0]["frequency_hz"], abs=0.05) == 73.42
    assert drop_d["strings"][0]["midi"] == 38

    # Validate Half Step Down string 6 is Eb2 (77.78 Hz, midi 39)
    half_step = next(p for p in presets_data if p["id"] == "half_step_down")
    assert half_step["strings"][0]["note"] == "Eb2"
    assert pytest.approx(half_step["strings"][0]["frequency_hz"], abs=0.05) == 77.78
    assert half_step["strings"][0]["midi"] == 39

    # Validate Open G string 5 is G2 (98.00 Hz, midi 43)
    open_g = next(p for p in presets_data if p["id"] == "open_g")
    assert open_g["strings"][1]["note"] == "G2"
    assert pytest.approx(open_g["strings"][1]["frequency_hz"], abs=0.05) == 98.00
    assert open_g["strings"][1]["midi"] == 43

    # Validate DADGAD string 2 is A3 (220.00 Hz, midi 57)
    dadgad = next(p for p in presets_data if p["id"] == "dadgad")
    assert dadgad["strings"][4]["note"] == "A3"
    assert pytest.approx(dadgad["strings"][4]["frequency_hz"], abs=0.05) == 220.00
    assert dadgad["strings"][4]["midi"] == 57


@pytest.mark.anyio
async def test_get_tuner_presets_custom_reference_a432(client: AsyncClient) -> None:
    """Verify GET /api/v1/tuner/presets scales properly when reference_a4_hz=432.0."""
    response = await client.get("/api/v1/tuner/presets?reference_a4_hz=432.0")
    assert response.status_code == 200

    presets_data = response.json()
    assert len(presets_data) == 5

    standard = next(p for p in presets_data if p["id"] == "standard")
    assert standard["reference_a4_hz"] == 432.0

    # In 432 Hz concert pitch, A2 (string 5, midi 45) is exactly 432 / 4 = 108.00 Hz
    a2_target = next(s for s in standard["strings"] if s["string"] == 5)
    assert a2_target["note"] == "A2"
    assert pytest.approx(a2_target["frequency_hz"], abs=0.05) == 108.00

    # E4 (string 1, midi 64) is 432.0 * 2^(-5/12) ~= 323.63 Hz
    e4_target = next(s for s in standard["strings"] if s["string"] == 1)
    assert pytest.approx(e4_target["frequency_hz"], abs=0.05) == 323.63

    # DADGAD A3 (string 2, midi 57) is exactly 432 / 2 = 216.00 Hz
    dadgad = next(p for p in presets_data if p["id"] == "dadgad")
    a3_target = next(s for s in dadgad["strings"] if s["string"] == 2)
    assert pytest.approx(a3_target["frequency_hz"], abs=0.05) == 216.00


@pytest.mark.anyio
async def test_get_tuner_presets_validation_bounds(client: AsyncClient) -> None:
    """Verify 422 ErrorEnvelope when reference_a4_hz is outside [415.0, 466.0]."""
    # Out-of-bounds low (< 415.0)
    resp_low = await client.get("/api/v1/tuner/presets?reference_a4_hz=400.0")
    assert resp_low.status_code == 422
    data_low = resp_low.json()
    assert "error" in data_low
    assert data_low["error"]["code"] == "VALIDATION_ERROR"

    # Out-of-bounds high (> 466.0)
    resp_high = await client.get("/api/v1/tuner/presets?reference_a4_hz=500.0")
    assert resp_high.status_code == 422
    data_high = resp_high.json()
    assert "error" in data_high
    assert data_high["error"]["code"] == "VALIDATION_ERROR"


# ============================================================================
# 2. POST /api/v1/live/detect-chord
# ============================================================================


@pytest.mark.anyio
async def test_detect_chord_c_major_triad(client: AsyncClient) -> None:
    """Verify POST /api/v1/live/detect-chord with C Major chroma vector detects 'C'
    with valid 6-string voicing diagram and detected notes ['C', 'E', 'G'].
    """
    c_major_chroma = [1.0, 0.0, 0.0, 0.0, 0.9, 0.0, 0.0, 0.85, 0.0, 0.0, 0.0, 0.0]
    payload = {
        "chroma": c_major_chroma,
        "sample_rate": 22050,
        "tuning_preset": "standard",
    }

    response = await client.post("/api/v1/live/detect-chord", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["chord"] == "C"
    assert data["root"] == "C"
    assert data["quality"] in ("major", "")
    assert data["confidence"] > 0.8
    assert isinstance(data["timestamp_ms"], int) and data["timestamp_ms"] > 0

    # Notes detected should identify the active triad pitch classes
    assert "C" in data["notes_detected"]
    assert "E" in data["notes_detected"]
    assert "G" in data["notes_detected"]

    # 6-string voicing diagram validation
    assert data["voicing"] is not None
    voicing = data["voicing"]
    assert voicing["chord"] == "C"
    assert len(voicing["frets"]) == 6
    assert len(voicing["fingers"]) == 6
    assert voicing["frets"] == [-1, 3, 2, 0, 1, 0]


@pytest.mark.anyio
async def test_detect_chord_cmaj7_when_b_is_active(client: AsyncClient) -> None:
    """Verify POST /api/v1/live/detect-chord detects 'Cmaj7' when B (semitone 11) is active."""
    cmaj7_chroma = [1.0, 0.0, 0.0, 0.0, 0.9, 0.0, 0.0, 0.85, 0.0, 0.0, 0.0, 0.8]
    payload = {
        "chroma": cmaj7_chroma,
        "sample_rate": 22050,
        "tuning_preset": "standard",
    }

    response = await client.post("/api/v1/live/detect-chord", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["chord"] == "Cmaj7"
    assert data["root"] == "C"
    assert data["quality"] == "maj7"
    assert data["confidence"] > 0.8
    assert "B" in data["notes_detected"]

    assert data["voicing"] is not None
    assert data["voicing"]["chord"] == "Cmaj7"
    assert data["voicing"]["frets"] == [-1, 3, 2, 0, 0, 0]


@pytest.mark.anyio
async def test_detect_chord_silence_returns_no_chord(client: AsyncClient) -> None:
    """Verify POST /api/v1/live/detect-chord on zero/silent vector returns chord='N', voicing=None."""
    silent_chroma = [0.0] * 12
    payload = {
        "chroma": silent_chroma,
        "sample_rate": 22050,
        "tuning_preset": "standard",
    }

    response = await client.post("/api/v1/live/detect-chord", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["chord"] == "N"
    assert data["root"] == ""
    assert data["quality"] == ""
    assert data["confidence"] == 0.0
    assert data["voicing"] is None
    assert data["notes_detected"] == []


@pytest.mark.anyio
async def test_detect_chord_invalid_chroma_length_returns_error_envelope(client: AsyncClient) -> None:
    """Verify POST /api/v1/live/detect-chord with invalid chroma length (e.g., length 5)
    returns 400 or 422 with the standard error envelope.
    """
    invalid_chroma = [1.0, 0.0, 0.5, 0.0, 0.8]  # Length 5 != 12
    payload = {
        "chroma": invalid_chroma,
        "sample_rate": 22050,
    }

    response = await client.post("/api/v1/live/detect-chord", json=payload)
    assert response.status_code in (400, 422)

    data = response.json()
    assert "error" in data
    assert data["error"]["code"] in ("VALIDATION_ERROR", "INVALID_LIVE_CHORD_FRAME")
    assert "message" in data["error"]


@pytest.mark.anyio
async def test_detect_chord_missing_both_chroma_and_pcm_returns_400(client: AsyncClient) -> None:
    """Verify POST /api/v1/live/detect-chord without chroma and pcm_samples returns 400/422."""
    payload = {
        "sample_rate": 22050,
        "tuning_preset": "standard",
    }

    response = await client.post("/api/v1/live/detect-chord", json=payload)
    assert response.status_code in (400, 422)

    data = response.json()
    assert "error" in data
    assert data["error"]["code"] in ("INVALID_LIVE_CHORD_FRAME", "VALIDATION_ERROR")


# ============================================================================
# 3. WS /ws/live-chord (Real-Time Live Chord Jamming WebSocket)
# ============================================================================


def test_ws_live_chord_heartbeat_ping_pong() -> None:
    """Verify WS /ws/live-chord responds to {"type": "ping"} with {"type": "pong"}."""
    with TestClient(app) as test_client:
        with test_client.websocket_connect("/ws/live-chord") as ws:
            ws.send_json({"type": "ping"})
            resp = ws.receive_json()
            assert resp == {"type": "pong"}


def test_ws_live_chord_streaming_multiple_frames() -> None:
    """Verify WS /ws/live-chord streams valid LiveChordDetectionResult responses across consecutive frames."""
    with TestClient(app) as test_client:
        with test_client.websocket_connect("/ws/live-chord") as ws:
            # Frame 1: C Major triad
            c_major_chroma = [1.0, 0.0, 0.0, 0.0, 0.9, 0.0, 0.0, 0.85, 0.0, 0.0, 0.0, 0.0]
            ws.send_json({"chroma": c_major_chroma, "tuning_preset": "standard"})
            frame1 = ws.receive_json()
            assert frame1["chord"] == "C"
            assert frame1["root"] == "C"
            assert frame1["voicing"] is not None
            assert frame1["voicing"]["chord"] == "C"

            # Frame 2: Cmaj7 with B active
            cmaj7_chroma = [1.0, 0.0, 0.0, 0.0, 0.9, 0.0, 0.0, 0.85, 0.0, 0.0, 0.0, 0.85]
            ws.send_json({"chroma": cmaj7_chroma, "tuning_preset": "standard"})
            frame2 = ws.receive_json()
            assert frame2["chord"] == "Cmaj7"
            assert frame2["root"] == "C"
            assert frame2["voicing"] is not None
            assert frame2["voicing"]["chord"] == "Cmaj7"

            # Frame 3: Silence
            ws.send_json({"chroma": [0.0] * 12})
            frame3 = ws.receive_json()
            assert frame3["chord"] == "N"
            assert frame3["confidence"] == 0.0
            assert frame3["voicing"] is None


def test_ws_live_chord_invalid_frame_non_fatal_error() -> None:
    """Verify WS /ws/live-chord emits a structured error frame on invalid payload without crashing the socket."""
    with TestClient(app) as test_client:
        with test_client.websocket_connect("/ws/live-chord") as ws:
            # Send invalid chroma (length 4)
            ws.send_json({"chroma": [1.0, 0.0, 0.5, 0.0]})
            err_frame = ws.receive_json()
            assert "error" in err_frame
            assert err_frame["error"]["code"] in ("VALIDATION_ERROR", "INVALID_LIVE_CHORD_FRAME")

            # Verify the socket is still healthy by sending a valid frame
            c_chroma = [1.0, 0.0, 0.0, 0.0, 0.9, 0.0, 0.0, 0.85, 0.0, 0.0, 0.0, 0.0]
            ws.send_json({"chroma": c_chroma})
            valid_resp = ws.receive_json()
            assert valid_resp["chord"] == "C"
            assert valid_resp["voicing"] is not None


def test_ws_live_chord_v1_alias_endpoint() -> None:
    """Verify API v1 alias WS /api/v1/ws/live-chord accepts connections and streams detections."""
    with TestClient(app) as test_client:
        with test_client.websocket_connect("/api/v1/ws/live-chord") as ws:
            ws.send_json({"type": "ping"})
            resp = ws.receive_json()
            assert resp == {"type": "pong"}

            c_chroma = [1.0, 0.0, 0.0, 0.0, 0.9, 0.0, 0.0, 0.85, 0.0, 0.0, 0.0, 0.0]
            ws.send_json({"chroma": c_chroma})
            frame = ws.receive_json()
            assert frame["chord"] == "C"
            assert frame["root"] == "C"

