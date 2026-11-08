"""Audio transcription engine converting raw waveforms into note event sequences."""

from typing import List, Dict, Any
from pydantic import BaseModel, Field

from engine.audio_processor import AudioProcessor
from engine.tab_transcriber import TabTranscriber


class NoteEvent(BaseModel):
    """Note event with pitch, onset, duration, and velocity."""
    pitch_midi: int = Field(..., ge=0, le=127, description="MIDI note number (e.g. 60 = C4)")
    pitch_name: str = Field(..., description="Note name with octave (e.g. 'C4')")
    start_time: float = Field(..., description="Onset time in seconds")
    duration: float = Field(..., description="Note duration in seconds")
    velocity: float = Field(..., ge=0.0, le=1.0, description="Estimated note intensity")


class AudioTranscriber:
    """Performs polyphonic pitch transcription and musical feature extraction."""

    def __init__(self, sample_rate: int = 22050):
        self.sample_rate = sample_rate
        self.processor = AudioProcessor(sample_rate=sample_rate)
        self.transcriber = TabTranscriber(sample_rate=sample_rate)

    def transcribe(self, audio_path: str) -> List[NoteEvent]:
        """Transcribe audio into discrete NoteEvent items.

        Args:
            audio_path: Path to the target audio file (WAV/MP3).

        Returns:
            List of detected NoteEvent items.
        """
        y, sr = self.processor.load_audio(audio_path, target_sr=self.sample_rate)
        duration = self.processor.get_duration(y, sr)
        raw_notes = self.transcriber.extract_notes_from_audio(y=y, sr=sr, duration=duration)

        events: List[NoteEvent] = []
        for n in raw_notes:
            events.append(
                NoteEvent(
                    pitch_midi=n["midi"],
                    pitch_name=n["note_name"],
                    start_time=n["start_time"],
                    duration=n["duration"],
                    velocity=n.get("confidence", 0.8),
                )
            )
        return events
