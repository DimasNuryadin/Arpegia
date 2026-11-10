"""Phase 4 Isolated Self-Test Gate: Asynchronous Job Progress Manager, WebSocket Streaming, and Polling Endpoint."""

import asyncio
import io
import time
import wave
import pytest
from fastapi.testclient import TestClient
from httpx import AsyncClient

from app.main import app
from app.services.analyzer_service import analyzer_service, ORDERED_PIPELINE_STAGES


def create_mock_wav_bytes(duration_seconds: float = 1.0, sample_rate: int = 8000) -> bytes:
    """Generate minimal valid PCM WAV bytes in memory."""
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        num_frames = int(duration_seconds * sample_rate)
        wav_file.writeframes(b"\x00\x00" * num_frames)
    return buf.getvalue()


@pytest.mark.anyio
async def test_sync_mode_backward_compatibility(client: AsyncClient) -> None:
    """Verify default POST /api/v1/analyze (async_mode=False or omitted) executes synchronously.

    Returns 200 OK with full AnalysisResponse, status='completed', and progress populated at 100%.
    """
    wav_bytes = create_mock_wav_bytes(duration_seconds=1.5)
    files = {"file": ("sync_test.wav", wav_bytes, "audio/wav")}

    # 1. Default (omitted query parameter)
    resp = await client.post("/api/v1/analyze", files=files)
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "completed"
    assert "job_id" in data
    assert data["metadata"]["filename"] == "sync_test.wav"
    assert len(data["chords"]) > 0
    assert len(data["chord_diagrams"]) > 0
    assert len(data["tablature"]["measures"]) > 0
    assert len(data["arrangements"]) > 0

    # Progress field assertion on synchronous response
    assert "progress" in data
    assert data["progress"] is not None
    progress = data["progress"]
    assert progress["status"] == "completed"
    assert progress["overall_percent"] == 100
    assert progress["event"] == "job.completed"
    assert len(progress["steps"]) == 5
    for step in progress["steps"]:
        assert step["status"] == "completed"
        assert step["progress_percent"] == 100

    job_id = data["job_id"]

    # 2. Polling endpoint for synchronously analyzed job returns completed event
    poll_resp = await client.get(f"/api/v1/analyze/{job_id}/progress")
    assert poll_resp.status_code == 200
    poll_data = poll_resp.json()
    assert poll_data["job_id"] == job_id
    assert poll_data["status"] == "completed"
    assert poll_data["overall_percent"] == 100
    assert poll_data["event"] == "job.completed"

    # 3. Explicit async_mode=false
    files2 = {"file": ("sync_explicit.wav", wav_bytes, "audio/wav")}
    resp_false = await client.post("/api/v1/analyze?async_mode=false", files=files2)
    assert resp_false.status_code == 200
    assert resp_false.json()["status"] == "completed"
    assert resp_false.json()["progress"]["overall_percent"] == 100


@pytest.mark.anyio
async def test_async_mode_initial_response_and_polling_completion(client: AsyncClient) -> None:
    """Verify POST /api/v1/analyze?async_mode=true returns job_id and GET progress reaches completed at 100%."""
    wav_bytes = create_mock_wav_bytes(duration_seconds=1.0)
    files = {"file": ("async_flow.wav", wav_bytes, "audio/wav")}

    # 1. Async POST request returns initial snapshot immediately
    resp = await client.post("/api/v1/analyze?async_mode=true", files=files)
    assert resp.status_code in (200, 202)
    init_data = resp.json()

    assert "job_id" in init_data
    job_id = init_data["job_id"]
    assert init_data["status"] == "processing"
    assert init_data["current_stage"] == "separating_stems"
    assert init_data["overall_percent"] >= 5
    assert len(init_data["steps"]) == 5

    expected_stages = [s for s, _ in ORDERED_PIPELINE_STAGES]
    actual_stages = [step["stage"] for step in init_data["steps"]]
    assert actual_stages == expected_stages

    # 2. Poll GET /api/v1/analyze/{job_id}/progress until completed
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

    assert final_data is not None, f"Async job {job_id} did not reach 'completed' within {max_wait_seconds}s (last={last_poll})"
    assert final_data["status"] == "completed"
    assert final_data["overall_percent"] == 100
    assert final_data["event"] == "job.completed"
    assert final_data["current_stage"] == "completed"

    for step in final_data["steps"]:
        assert step["status"] == "completed"
        assert step["progress_percent"] == 100

    # Result payload assertions on completed event
    assert final_data["result"] is not None
    result = final_data["result"]
    assert result["job_id"] == job_id
    assert result["status"] == "completed"
    assert result["metadata"]["filename"] == "async_flow.wav"
    assert len(result["chords"]) > 0
    assert len(result["tablature"]["measures"]) > 0

    # 3. Verify GET /api/v1/analyze/{job_id} also returns the completed result
    get_job_resp = await client.get(f"/api/v1/analyze/{job_id}")
    assert get_job_resp.status_code == 200
    assert get_job_resp.json()["job_id"] == job_id
    assert get_job_resp.json()["status"] == "completed"


def test_websocket_progress_streaming_flow() -> None:
    """Verify connecting to WS /ws/analyze/{job_id} streams valid JobProgressEvents and job.completed."""
    with TestClient(app) as test_client:
        wav_bytes = create_mock_wav_bytes(duration_seconds=1.0)
        files = {"file": ("ws_stream.wav", wav_bytes, "audio/wav")}

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
        final_event = received_events[-1]
        assert final_event["event"] == "job.completed"
        assert final_event["status"] == "completed"
        assert final_event["overall_percent"] == 100
        assert final_event["result"] is not None
        assert final_event["result"]["job_id"] == job_id


def test_websocket_unknown_job_id_closes_with_error() -> None:
    """Verify WebSocket connection for unknown job_id sends error frame and closes."""
    with TestClient(app) as test_client:
        with test_client.websocket_connect("/ws/analyze/unknown-job-99999") as ws:
            msg = ws.receive_json()
            assert msg["event"] == "job.failed"
            assert msg["status"] == "failed"
            assert msg["error"]["code"] == "JOB_NOT_FOUND"


@pytest.mark.anyio
async def test_progress_polling_unknown_job_returns_404(client: AsyncClient) -> None:
    """Verify GET /api/v1/analyze/{job_id}/progress returns 404 with ErrorEnvelope for nonexistent job."""
    resp = await client.get("/api/v1/analyze/nonexistent-job-404/progress")
    assert resp.status_code == 404
    data = resp.json()
    assert "error" in data
    assert data["error"]["code"] == "JOB_NOT_FOUND"
    assert "nonexistent-job-404" in data["error"]["message"]
