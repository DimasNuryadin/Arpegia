"""Chord detection engine leveraging chromagram analysis and template matching."""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
import re

from engine.audio_processor import AudioProcessor
from engine.chord_detector import ChordDetector as CoreChordDetector


class ChordDetectionResult(BaseModel):
    """Structured representation of a detected chord in time."""
    start_time: float = Field(..., description="Start timestamp in seconds")
    end_time: float = Field(..., description="End timestamp in seconds")
    chord_name: str = Field(..., description="Full chord symbol, e.g., 'Cmaj7', 'Am'")
    root: str = Field(..., description="Root note (e.g., 'C', 'A')")
    quality: str = Field(..., description="Chord quality (e.g., 'major', 'minor', '7')")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Detection confidence score")


class ChordDetector:
    """Extracts chord progressions and timestamps from audio waveforms."""

    def __init__(self, sample_rate: int = 22050, hop_length: int = 512):
        self.sample_rate = sample_rate
        self.hop_length = hop_length
        self.processor = AudioProcessor(sample_rate=sample_rate, hop_length=hop_length)
        self.core_detector = CoreChordDetector(sample_rate=sample_rate, hop_length=hop_length)

    def _parse_root_quality(self, chord_name: str) -> tuple[str, str]:
        match = re.match(r"^([A-G][#b]?)(.*)$", chord_name)
        if not match:
            return chord_name, "major"
        root, suffix = match.groups()
        suffix = suffix.strip()
        quality_map = {
            "": "major",
            "m": "minor",
            "7": "7",
            "maj7": "maj7",
            "m7": "m7",
            "sus4": "sus4",
        }
        quality = quality_map.get(suffix, suffix or "major")
        return root, quality

    def detect_chords(self, audio_path: str) -> List[ChordDetectionResult]:
        """Analyze an audio file and return chronological chord events.

        Args:
            audio_path: Path to the target audio file (WAV/MP3).

        Returns:
            List of detected ChordDetectionResult items.
        """
        y, sr = self.processor.load_audio(audio_path, target_sr=self.sample_rate)
        duration = self.processor.get_duration(y, sr)
        bpm, beat_frames, beat_times = self.processor.detect_beats(y, sr)
        chroma = self.processor.extract_chromagram(y, sr, method="cqt")

        raw_chords = self.core_detector.detect_chords(
            chromagram=chroma,
            duration=duration,
            beat_times=beat_times,
        )

        results = []
        for c in raw_chords:
            root, quality = self._parse_root_quality(c["chord"])
            results.append(
                ChordDetectionResult(
                    start_time=c["start_time"],
                    end_time=c["end_time"],
                    chord_name=c["chord"],
                    root=root,
                    quality=quality,
                    confidence=c["confidence"],
                )
            )
        return results
