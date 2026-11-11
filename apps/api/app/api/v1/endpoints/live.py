"""Live microphone chord detection REST endpoint (Phase 5)."""

from fastapi import APIRouter, HTTPException, status

from app.schemas.analysis import ErrorEnvelope, LiveChordDetectionResult, LiveChordFrameRequest
from app.services.live_service import live_service

router = APIRouter(prefix="/live", tags=["Real-Time Chord Detection"])


@router.post(
    "/detect-chord",
    response_model=LiveChordDetectionResult,
    status_code=status.HTTP_200_OK,
    responses={
        200: {"model": LiveChordDetectionResult, "description": "Recognized chord symbol, quality, confidence, and voicing"},
        400: {"model": ErrorEnvelope, "description": "Invalid frame missing both chroma and pcm_samples"},
        422: {"model": ErrorEnvelope, "description": "Schema validation failure (e.g. invalid chroma vector length)"},
    },
    summary="Single frame live chord detection (Phase 5)",
    description="Evaluates a live microphone chromagram vector or audio frame and returns detected chord and voicing.",
)
async def detect_live_chord(frame: LiveChordFrameRequest) -> LiveChordDetectionResult:
    """Detect chord from 12-bin chroma vector or mono PCM samples."""
    if frame.chroma is None and not frame.pcm_samples:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "INVALID_LIVE_CHORD_FRAME",
                "message": "At least one of chroma (length 12) or non-empty pcm_samples must be provided.",
                "details": {"chroma": frame.chroma, "pcm_samples": frame.pcm_samples},
            },
        )
    return live_service.detect_chord(frame)
