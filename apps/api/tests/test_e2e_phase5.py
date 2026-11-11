"""End-to-End (E2E) Test Suite for Phase 5 Live Microphone Guitar Tuner & Real-Time Mic Chord Detector.

Verifies the complete Phase 5 live workflow:
a. GET /api/v1/tuner/presets -> asserts 200 OK, verifies all 5 presets
   (standard, drop_d, half_step_down, open_g, dadgad), and checks that
   standard string 6 is E2 (82.41 Hz) and string 1 is E4 (329.63 Hz).
b. POST /api/v1/live/detect-chord with C Major 7 chroma vector (C, E, G, B) ->
   asserts 200 OK, verifies chord is "Cmaj7" (or "C"), confidence > 0.5,
   and voicing.frets has length 6.
c. POST /api/v1/live/detect-chord with synthesized PCM samples of an A Minor chord
   (A2 + E3 + A3 + C4 + E4) -> asserts 200 OK and verifies "Am" detection.
d. WS /ws/live-chord -> sends { "type": "ping" } (expects "pong"), then sends
   chroma frames for G, Em, C, D and asserts real-time LiveChordDetectionResult
   JSON responses with valid voicing diagrams.
"""

from typing import List
import numpy as np
import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.main import app
from app.schemas.analysis import (
    ChordDiagram,
    LiveChordDetectionResult,
    TuningPreset,
)


@pytest.mark.anyio
async def test_e2e_phase5_tuner_presets(client: AsyncClient) -> None:
    """Requirement 2a: GET /api/v1/tuner/presets asserts 200 OK, verifies all 5 presets,
    and checks standard string 6 is E2 (82.41 Hz) and string 1 is E4 (329.63 Hz).
    """
    response = await client.get("/api/v1/tuner/presets")
    assert response.status_code == 200, f"GET /tuner/presets failed: {response.text}"

    presets = response.json()
    assert isinstance(presets, list)
    assert len(presets) == 5

    preset_ids = [p["id"] for p in presets]
    assert preset_ids == ["standard", "drop_d", "half_step_down", "open_g", "dadgad"]

    for p in presets:
        validated = TuningPreset.model_validate(p)
        assert len(validated.strings) == 6
        string_nums = [s.string for s in validated.strings]
        assert string_nums == [6, 5, 4, 3, 2, 1]

    # Verify standard preset exact frequencies
    standard = next(p for p in presets if p["id"] == "standard")
    s6 = next(s for s in standard["strings"] if s["string"] == 6)
    s1 = next(s for s in standard["strings"] if s["string"] == 1)

    assert s6["note"] == "E2"
    assert pytest.approx(s6["frequency_hz"], abs=0.05) == 82.41
    assert s6["midi"] == 40

    assert s1["note"] == "E4"
    assert pytest.approx(s1["frequency_hz"], abs=0.05) == 329.63
    assert s1["midi"] == 64


@pytest.mark.anyio
async def test_e2e_phase5_detect_chord_chroma_cmaj7(client: AsyncClient) -> None:
    """Requirement 2b: POST /api/v1/live/detect-chord with C Major 7 chroma vector
    asserts 200 OK, verifies chord is "Cmaj7" (or "C"), confidence > 0.5,
    and voicing.frets has length 6.
    """
    # 12-bin chroma vector: [C, C#, D, D#, E, F, F#, G, G#, A, A#, B]
    chroma_vector: List[float] = [0.0] * 12
    for note_idx in [0, 4, 7, 11]:  # C, E, G, B
        chroma_vector[note_idx] = 1.0

    payload = {
        "chroma": chroma_vector,
        "sample_rate": 22050,
        "tuning_preset": "standard",
    }

    response = await client.post("/api/v1/live/detect-chord", json=payload)
    assert response.status_code == 200, f"POST /live/detect-chord failed: {response.text}"

    data = response.json()
    validated = LiveChordDetectionResult.model_validate(data)

    assert validated.chord in ("Cmaj7", "C")
    assert validated.confidence > 0.5
    assert validated.voicing is not None
    assert len(validated.voicing.frets) == 6
    assert len(validated.voicing.fingers) == 6
    assert validated.voicing.base_fret >= 1
    assert "C" in validated.notes_detected or validated.root == "C"


@pytest.mark.anyio
async def test_e2e_phase5_detect_chord_pcm_am(client: AsyncClient) -> None:
    """Requirement 2c: POST /api/v1/live/detect-chord with synthesized PCM samples
    of an A Minor chord (A2 + E3 + A3 + C4 + E4) asserts 200 OK and verifies "Am" detection.
    """
    sr = 22050
    duration = 0.5
    t = np.linspace(0, duration, int(sr * duration), endpoint=False)

    # A2 (110.0 Hz), E3 (164.81 Hz), A3 (220.0 Hz), C4 (261.63 Hz), E4 (329.63 Hz)
    pcm_wave = (
        np.sin(2 * np.pi * 110.0 * t)
        + np.sin(2 * np.pi * 164.81 * t)
        + np.sin(2 * np.pi * 220.0 * t)
        + np.sin(2 * np.pi * 261.63 * t)
        + np.sin(2 * np.pi * 329.63 * t)
    ) / 5.0

    payload = {
        "pcm_samples": pcm_wave.tolist(),
        "sample_rate": sr,
        "tuning_preset": "standard",
    }

    response = await client.post("/api/v1/live/detect-chord", json=payload)
    assert response.status_code == 200, f"PCM detect-chord failed: {response.text}"

    data = response.json()
    validated = LiveChordDetectionResult.model_validate(data)

    assert validated.chord == "Am"
    assert validated.root == "A"
    assert validated.quality in ("minor", "m")
    assert validated.confidence > 0.5
    assert validated.voicing is not None
    assert len(validated.voicing.frets) == 6


def test_e2e_phase5_websocket_live_chord_stream() -> None:
    """Requirement 2d: WS /ws/live-chord sends { "type": "ping" } (expects "pong"),
    then sends chroma frames for G, Em, C, D and asserts real-time LiveChordDetectionResult
    JSON responses with valid voicing diagrams.
    """
    with TestClient(app) as test_client:
        with test_client.websocket_connect("/ws/live-chord") as ws:
            # 1. Heartbeat Ping / Pong test
            ws.send_json({"type": "ping"})
            pong_msg = ws.receive_json()
            assert pong_msg.get("type") == "pong"

            # 2. Sequential Chord Jamming Frames: G, Em, C, D
            progression_specs = [
                ("G", [7, 11, 2], "G"),      # G, B, D
                ("Em", [4, 7, 11], "Em"),    # E, G, B
                ("C", [0, 4, 7], "C"),       # C, E, G
                ("D", [2, 6, 9], "D"),       # D, F#, A
            ]

            for expected_symbol, pitch_indices, chord_family in progression_specs:
                chroma = [0.0] * 12
                for p_idx in pitch_indices:
                    chroma[p_idx] = 1.0

                frame = {
                    "chroma": chroma,
                    "sample_rate": 22050,
                    "tuning_preset": "standard",
                }
                ws.send_json(frame)

                res_msg = ws.receive_json()
                assert "error" not in res_msg, f"WebSocket returned error: {res_msg}"

                result = LiveChordDetectionResult.model_validate(res_msg)
                assert result.chord.startswith(chord_family) or result.chord == expected_symbol
                assert result.confidence >= 0.5
                assert result.voicing is not None
                assert len(result.voicing.frets) == 6
                assert len(result.voicing.fingers) == 6
                assert result.voicing.base_fret >= 1
