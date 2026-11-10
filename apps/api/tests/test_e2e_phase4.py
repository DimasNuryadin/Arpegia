"""End-to-End (E2E) Test Suite for Phase 4 Real-Time Pipeline Progress Streaming.

Verifies the complete Phase 1 through 4 integrated lifecycle:
a. Synchronous Backward-Compatibility Check:
   POST /api/v1/analyze (default async_mode=false) with a synthetic guitar WAV file ->
   asserts 200 OK, status == 'completed', and verifies presence of chords,
   chord_diagrams, tablature, arrangements, and progress.overall_percent == 100.
b. Async + Polling Flow:
   POST /api/v1/analyze?async_mode=true -> captures job_id, polls
   GET /api/v1/analyze/{job_id}/progress until status == 'completed', and asserts that all
   5 steps ('separating_stems', 'detecting_key_tempo', 'detecting_chords',
   'transcribing_tablature', 'generating_arrangement') reached 'completed' or 'skipped'
   and result contains valid Phase 1–3 data.
c. WebSocket Real-Time Streaming Flow:
   Connects to WS /ws/analyze/{job_id} via FastAPI TestClient.websocket_connect,
   verifies receipt of structured JobProgressEvent frames (event in ['job.progress', 'job.completed']),
   and confirms non-decreasing overall_percent culminating in 100% with full result.
"""

import asyncio
import io
import time
import wave
from typing import List
import numpy as np
import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.main import app
from app.services.analyzer_service import ORDERED_PIPELINE_STAGES


def create_synthetic_guitar_arpeggio_wav(
    frequencies: List[float] = [164.81, 196.00, 246.94, 329.63],  # E3, G3, B3, E4
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
async def test_e2e_sync_mode_backward_compatibility(client: AsyncClient) -> None:
    """Requirement 3a: Synchronous Backward-Compatibility Check.

    POST /api/v1/analyze (default async_mode=false) with a synthetic guitar WAV file ->
    asserts 200 OK, status == 'completed', and verifies presence of chords, chord_diagrams,
    tablature, arrangements, and progress.overall_percent == 100.
    """
    wav_bytes = create_synthetic_guitar_arpeggio_wav()
    files = {"file": ("e2e_guitar_sync.wav", wav_bytes, "audio/wav")}

    # Default synchronous call (async_mode omitted)
    resp = await client.post("/api/v1/analyze", files=files)
    assert resp.status_code == 200, f"Sync analyze failed: {resp.text}"
    data = resp.json()

    # Verify status and identifier
    assert data["status"] == "completed"
    assert "job_id" in data
    job_id = data["job_id"]
    assert data["metadata"]["filename"] == "e2e_guitar_sync.wav"
    assert data["metadata"]["duration"] > 0

    # Verify presence of Phase 1-3 musical structures
    assert "chords" in data and len(data["chords"]) > 0
    assert "chord_diagrams" in data and len(data["chord_diagrams"]) > 0
    assert "tablature" in data and len(data["tablature"]["measures"]) > 0
    assert "arrangements" in data and len(data["arrangements"]) > 0

    # Verify progress telemetry populated at 100%
    assert "progress" in data and data["progress"] is not None
    progress = data["progress"]
    assert progress["status"] == "completed"
    assert progress["overall_percent"] == 100
    assert progress["event"] == "job.completed"
    assert len(progress["steps"]) == 5
    for step in progress["steps"]:
        assert step["status"] in ("completed", "skipped")
        assert step["progress_percent"] == 100

    # Verify polling snapshot for synchronously analyzed job returns completed event
    poll_resp = await client.get(f"/api/v1/analyze/{job_id}/progress")
    assert poll_resp.status_code == 200
    poll_data = poll_resp.json()
    assert poll_data["job_id"] == job_id
    assert poll_data["status"] == "completed"
    assert poll_data["overall_percent"] == 100


@pytest.mark.anyio
async def test_e2e_async_mode_and_polling_flow(client: AsyncClient) -> None:
    """Requirement 3b: Async + Polling Flow.

    POST /api/v1/analyze?async_mode=true -> captures job_id, polls GET /api/v1/analyze/{job_id}/progress
    until status == 'completed', and asserts that all 5 steps reached 'completed' or 'skipped'
    and result contains valid Phase 1–3 data.
    """
    wav_bytes = create_synthetic_guitar_arpeggio_wav()
    files = {"file": ("e2e_guitar_async.wav", wav_bytes, "audio/wav")}

    resp = await client.post("/api/v1/analyze?async_mode=true", files=files)
    assert resp.status_code in (200, 202), f"Async upload failed: {resp.text}"
    init_data = resp.json()

    assert "job_id" in init_data
    job_id = init_data["job_id"]
    assert init_data["status"] == "processing"
    assert init_data["current_stage"] == "separating_stems"
    assert init_data["overall_percent"] >= 5
    assert len(init_data["steps"]) == 5

    canonical_stages = [s for s, _ in ORDERED_PIPELINE_STAGES]
    actual_stages = [step["stage"] for step in init_data["steps"]]
    assert actual_stages == canonical_stages

    # Poll GET /api/v1/analyze/{job_id}/progress until completed
    max_wait_seconds = 35.0
    start_time = time.time()
    final_data = None
    last_poll = None

    while time.time() - start_time < max_wait_seconds:
        poll_resp = await client.get(f"/api/v1/analyze/{job_id}/progress")
        assert poll_resp.status_code == 200
        poll_json = poll_resp.json()
        assert poll_json["job_id"] == job_id
        assert len(poll_json["steps"]) == 5

        if poll_json["status"] == "completed":
            final_data = poll_json
            break
        last_poll = poll_json
        await asyncio.sleep(0.2)

    assert final_data is not None, f"Async job {job_id} did not complete within {max_wait_seconds}s (last={last_poll})"
    assert final_data["status"] == "completed"
    assert final_data["overall_percent"] == 100
    assert final_data["event"] == "job.completed"
    assert final_data["current_stage"] == "completed"

    # All 5 canonical steps must be marked completed (or skipped if Demucs/ML bypassed)
    for step in final_data["steps"]:
        assert step["status"] in ("completed", "skipped")
        assert step["progress_percent"] == 100

    # Result payload assertions
    assert final_data["result"] is not None
    result = final_data["result"]
    assert result["job_id"] == job_id
    assert result["status"] == "completed"
    assert result["metadata"]["filename"] == "e2e_guitar_async.wav"
    assert len(result["chords"]) > 0
    assert len(result["chord_diagrams"]) > 0
    assert len(result["tablature"]["measures"]) > 0
    assert len(result["arrangements"]) > 0


def test_e2e_websocket_realtime_streaming_flow() -> None:
    """Requirement 3c: WebSocket Real-Time Streaming Flow.

    Connects to WS /ws/analyze/{job_id} via FastAPI TestClient.websocket_connect,
    verifies receipt of structured JobProgressEvent frames (event in ['job.progress', 'job.completed']),
    and confirms non-decreasing overall_percent culminating in 100% with full result.
    """
    with TestClient(app) as test_client:
        wav_bytes = create_synthetic_guitar_arpeggio_wav()
        files = {"file": ("e2e_guitar_ws.wav", wav_bytes, "audio/wav")}

        # Launch async job
        post_resp = test_client.post("/api/v1/analyze?async_mode=true", files=files)
        assert post_resp.status_code in (200, 202)
        job_id = post_resp.json()["job_id"]

        received_events = []
        with test_client.websocket_connect(f"/ws/analyze/{job_id}") as ws:
            while True:
                msg = ws.receive_json()
                received_events.append(msg)
                assert msg["job_id"] == job_id
                assert msg["event"] in ["job.progress", "job.completed", "job.failed"]
                assert "steps" in msg
                assert len(msg["steps"]) == 5
                assert "overall_percent" in msg
                assert 0 <= msg["overall_percent"] <= 100

                if msg["event"] == "job.completed" or msg["status"] == "completed":
                    break

        assert len(received_events) >= 1
        # Confirm non-decreasing overall_percent
        percentages = [e["overall_percent"] for e in received_events]
        for i in range(len(percentages) - 1):
            assert percentages[i] <= percentages[i + 1], (
                f"Progress percent decreased: {percentages[i]} > {percentages[i+1]}"
            )

        final_event = received_events[-1]
        assert final_event["event"] == "job.completed"
        assert final_event["status"] == "completed"
        assert final_event["overall_percent"] == 100
        assert final_event["result"] is not None
        assert final_event["result"]["job_id"] == job_id
        assert len(final_event["result"]["chords"]) > 0
        assert len(final_event["result"]["tablature"]["measures"]) > 0
