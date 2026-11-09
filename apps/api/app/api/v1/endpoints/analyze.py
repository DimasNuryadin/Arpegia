"""Chord analysis, job retrieval, interactive tablature editor, AI arrangement generation, and multi-format export API endpoints."""

from typing import Optional
from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile, status

from app.schemas.analysis import (
    AnalysisResponse,
    ArrangementRequest,
    ArrangementVariation,
    ErrorEnvelope,
    ExportFormat,
    TablatureUpdateRequest,
)
from app.services.analyzer_service import analyzer_service
from app.services.export_service import export_service

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
        "style improvisations, chord voicing diagrams, guitar tablature generation, "
        "and at least 1 default Fingerstyle arrangement."
    ),
)
async def analyze_audio(
    file: UploadFile = File(..., description="Audio file to analyze (.mp3 or .wav, max 25MB)"),
) -> AnalysisResponse:
    """Handle audio upload and trigger chord, tablature, and default arrangement analysis."""
    return await analyzer_service.process_audio_upload(file)


@router.get(
    "/{job_id}",
    response_model=AnalysisResponse,
    status_code=status.HTTP_200_OK,
    responses={
        404: {"model": ErrorEnvelope, "description": "Analysis job not found"},
    },
    summary="Get analysis job status and results",
    description="Retrieves the analysis result (including chord_diagrams, tablature, and arrangements) for a given job ID.",
)
async def get_analysis_job(job_id: str) -> AnalysisResponse:
    """Retrieve an existing chord and tablature analysis result by its unique job_id."""
    job = analyzer_service.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "JOB_NOT_FOUND",
                "message": f"Analysis job '{job_id}' not found.",
                "details": {"job_id": job_id},
            },
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
        "Validates and persists edited TabNote positions (string 1-6, fret 0-24, technique, voice) "
        "or updated measures, recalculates MIDI pitch and note_name, and regenerates the 6-line ascii_tab."
    ),
)
async def update_analysis_tablature(
    job_id: str,
    payload: TablatureUpdateRequest,
) -> AnalysisResponse:
    """Update tablature for an existing analysis job and regenerate ASCII tab."""
    return analyzer_service.update_tablature(job_id, payload)


@router.post(
    "/{job_id}/arrange",
    response_model=ArrangementVariation,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorEnvelope, "description": "Invalid arrangement parameters"},
        404: {"model": ErrorEnvelope, "description": "Analysis job not found"},
        422: {"model": ErrorEnvelope, "description": "Validation error (invalid style, difficulty, capo, or tempo_scale)"},
    },
    summary="Generate Style & Fingerstyle Arrangement (Phase 3)",
    description=(
        "Synthesizes a playable guitar arrangement variation with polyphonic voice separation "
        "(melody, bass, harmony, percussive), appends/updates it in the job's arrangements list, "
        "and returns the ArrangementVariation."
    ),
)
async def create_arrangement(
    job_id: str,
    payload: ArrangementRequest,
) -> ArrangementVariation:
    """Generate and persist a style/difficulty guitar arrangement variation for a job."""
    return analyzer_service.generate_arrangement(job_id, payload)


@router.get(
    "/{job_id}/export",
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorEnvelope, "description": "Unsupported export format"},
        404: {"model": ErrorEnvelope, "description": "Job or arrangement not found"},
        422: {"model": ErrorEnvelope, "description": "Validation error (invalid format query parameter)"},
    },
    summary="Multi-Format Tablature & Score Export (Phase 3)",
    description=(
        "Exports the job's primary tablature or a specific arrangement_id into MIDI (.mid), "
        "MusicXML 4.0 (.musicxml), ASCII tab (.txt), or PDF (.pdf)."
    ),
)
async def export_analysis_tablature(
    job_id: str,
    format: ExportFormat = Query(
        ...,
        description="Target export format ('midi', 'musicxml', 'ascii', 'pdf')",
    ),
    arrangement_id: Optional[str] = Query(
        default=None,
        description="Optional arrangement variation ID to export instead of primary tablature",
    ),
) -> Response:
    """Stream exported score/tablature in MIDI, MusicXML, ASCII, or PDF format."""
    job = analyzer_service.get_job(job_id)
    if not job:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "JOB_NOT_FOUND",
                "message": f"Analysis job '{job_id}' not found.",
                "details": {"job_id": job_id},
            },
        )

    try:
        payload_bytes, media_type, filename = export_service.export_job(
            job=job,
            export_format=format,
            arrangement_id=arrangement_id,
        )
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "code": "ARRANGEMENT_NOT_FOUND",
                "message": str(exc),
                "details": {"job_id": job_id, "arrangement_id": arrangement_id},
            },
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "UNSUPPORTED_EXPORT_FORMAT",
                "message": str(exc),
                "details": {"field": "format", "received": format},
            },
        ) from exc

    return Response(
        content=payload_bytes,
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
        },
    )
