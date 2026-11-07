"""Chord analysis and job retrieval API endpoints."""

from fastapi import APIRouter, File, HTTPException, UploadFile, status

from app.schemas.analysis import AnalysisResponse
from app.services.analyzer_service import analyzer_service

router = APIRouter(prefix="/analyze", tags=["Chord Analysis"])


@router.post(
    "",
    response_model=AnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Upload audio and analyze chords",
    description="Accepts an MP3 or WAV audio file (max 25MB), runs chord detection & improvisation pipeline, and returns structured musical analysis.",
)
async def analyze_audio(
    file: UploadFile = File(..., description="Audio file to analyze (.mp3 or .wav, max 25MB)"),
) -> AnalysisResponse:
    """Handle audio upload and trigger chord analysis."""
    return await analyzer_service.process_audio_upload(file)


@router.get(
    "/{job_id}",
    response_model=AnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Get analysis job status and results",
    description="Retrieves the analysis result for a given job ID.",
)
async def get_analysis_job(job_id: str) -> AnalysisResponse:
    """Retrieve an existing chord analysis result by its unique job_id."""
    job = analyzer_service.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Analysis job '{job_id}' not found.",
        )
    return job
