"""Chord analysis, job retrieval, and interactive tablature editor API endpoints."""

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.schemas.analysis import (
    AnalysisResponse,
    ErrorEnvelope,
    TablatureUpdateRequest,
)
from app.services.analyzer_service import analyzer_service

router = APIRouter(prefix="/analyze", tags=["Guitar Intelligence & Chord Analysis"])


@router.post(
    "",
    response_model=AnalysisResponse,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorEnvelope, "description": "Invalid audio format or MIME type"},
        413: {"model": ErrorEnvelope, "description": "Uploaded file exceeds 25MB limit"},
    },
    summary="Upload audio and run Guitar Intelligence pipeline",
    description=(
        "Accepts an MP3 or WAV audio file (max 25MB), executes chord detection, "
        "style improvisations, chord voicing diagrams, and guitar tablature generation."
    ),
)
async def analyze_audio(
    file: UploadFile = File(..., description="Audio file to analyze (.mp3 or .wav, max 25MB)"),
) -> AnalysisResponse:
    """Handle audio upload and trigger chord & tablature analysis."""
    return await analyzer_service.process_audio_upload(file)


@router.get(
    "/{job_id}",
    response_model=AnalysisResponse,
    status_code=status.HTTP_200_OK,
    responses={
        404: {"model": ErrorEnvelope, "description": "Analysis job not found"},
    },
    summary="Get analysis job status and results",
    description="Retrieves the analysis result (including chord_diagrams and tablature) for a given job ID.",
)
async def get_analysis_job(job_id: str) -> AnalysisResponse:
    """Retrieve an existing chord and tablature analysis result by its unique job_id."""
    job = analyzer_service.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Analysis job '{job_id}' not found.",
        )
    return job


@router.put(
    "/{job_id}/tablature",
    response_model=AnalysisResponse,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorEnvelope, "description": "Invalid tablature edit request"},
        404: {"model": ErrorEnvelope, "description": "Analysis job not found"},
        422: {
            "model": ErrorEnvelope,
            "description": "Validation error (out-of-range string, fret, or technique)",
        },
    },
    summary="Update tablature notes/measures and regenerate ASCII tab",
    description=(
        "Validates and persists edited TabNote positions (string 1-6, fret 0-24, technique) "
        "or updated measures, recalculates MIDI pitch and note_name, and regenerates the 6-line ascii_tab."
    ),
)
async def update_analysis_tablature(
    job_id: str,
    payload: TablatureUpdateRequest,
) -> AnalysisResponse:
    """Update tablature for an existing analysis job and regenerate ASCII tab."""
    return analyzer_service.update_tablature(job_id, payload)
