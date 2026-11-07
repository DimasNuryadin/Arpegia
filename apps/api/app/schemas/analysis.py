"""Pydantic v2 schemas defining the Arpegia chord analysis contract."""

from typing import List, Union
from pydantic import BaseModel, Field, ConfigDict


class AnalysisMetadata(BaseModel):
    """Metadata extracted or associated with the audio file."""
    model_config = ConfigDict(extra="ignore")

    filename: str = Field(..., description="Original audio file name")
    duration: float = Field(..., ge=0.0, description="Duration in seconds")
    key: str = Field(..., description="Detected musical key (e.g. 'G Major')")
    bpm: Union[int, float] = Field(..., ge=1, description="Detected tempo in beats per minute")
    time_signature: str = Field(..., description="Musical time signature (e.g. '4/4')")


class ChordItem(BaseModel):
    """Detected chord event with timestamp boundary and confidence."""
    model_config = ConfigDict(extra="ignore")

    chord: str = Field(..., description="Detected chord symbol (e.g. 'G', 'Cmaj7')")
    start_time: float = Field(..., ge=0.0, description="Start timestamp in seconds")
    end_time: float = Field(..., ge=0.0, description="End timestamp in seconds")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Detection confidence score")


class ImprovisationItem(BaseModel):
    """AI-powered guitar improvisation and reharmonization suggestion."""
    model_config = ConfigDict(extra="ignore")

    original_chord: str = Field(..., description="Original chord from audio analysis")
    style: str = Field(..., description="Musical genre or arrangement style (e.g. 'Neo Soul')")
    suggestions: List[str] = Field(..., description="Recommended substitution chord voicings")


class AnalysisResponse(BaseModel):
    """Top-level shared data contract for analysis response."""
    model_config = ConfigDict(
        extra="ignore",
        json_schema_extra={
            "example": {
                "job_id": "7b084e85-4bc5-4dbb-a639-c1ee824c6020",
                "status": "completed",
                "metadata": {
                    "filename": "song.mp3",
                    "duration": 180.5,
                    "key": "G Major",
                    "bpm": 105,
                    "time_signature": "4/4",
                },
                "chords": [
                    {
                        "chord": "G",
                        "start_time": 0.0,
                        "end_time": 2.4,
                        "confidence": 0.94,
                    }
                ],
                "improvisations": [
                    {
                        "original_chord": "G",
                        "style": "Neo Soul",
                        "suggestions": ["Gmaj7", "G6/9"],
                    }
                ],
            }
        },
    )

    job_id: str = Field(..., description="Unique job or analysis identifier")
    status: str = Field(..., description="Current status of the analysis ('completed', 'processing', etc.)")
    metadata: AnalysisMetadata = Field(..., description="Audio file and musical metadata")
    chords: List[ChordItem] = Field(default_factory=list, description="Chronological sequence of detected chords")
    improvisations: List[ImprovisationItem] = Field(
        default_factory=list, description="Genre-specific chord substitutions and improvisations"
    )
