"""Demucs 4-stem source separation engine for Arpegia audio processing pipeline."""

from typing import Dict, Any, Optional
import os
import sys
import shutil
import tempfile
import subprocess
import importlib.util
import numpy as np
import librosa
import soundfile as sf


class DemucsStemSeparator:
    """Demucs 4-stem source separation runner with graceful runtime fallback.

    Extracts vocals, drums, bass, and other (guitar) stems.
    Generates a weighted harmonic mix (65% other + 35% bass) for Key and Chord detection,
    and isolates other.wav (guitar_stem) for guitar tablature transcription.
    """

    _created_temp_dirs: set[str] = set()

    def __init__(self, model_name: str = "htdemucs", device: str = "cpu"):
        self.model_name = model_name
        self.device = device

    @classmethod
    def is_available(cls) -> bool:
        """Check whether Demucs is enabled and installed in the current environment."""
        enabled = os.getenv("ARPEGIA_ENABLE_DEMUCS", "true").lower() == "true"
        if not enabled:
            return False

        has_binary = bool(shutil.which("demucs"))
        has_module = importlib.util.find_spec("demucs") is not None
        return has_binary or has_module

    def separate(self, audio_path: str) -> Dict[str, Any]:
        """Separate audio into 4 stems using Demucs or cleanly fall back to original audio.

        Returns:
            Dict containing:
                guitar_stem (str): Path to isolated other.wav (or original audio on fallback)
                harmonic_mix (str): Path to 65% other + 35% bass mix (or original audio on fallback)
                bass_stem (str): Path to bass.wav (or original audio on fallback)
                stem_dir (Optional[str]): Path to temporary stem directory to clean up
                is_separated (bool): True if separation succeeded, False if fallback was used
        """
        fallback: Dict[str, Any] = {
            "guitar_stem": audio_path,
            "harmonic_mix": audio_path,
            "bass_stem": audio_path,
            "stem_dir": None,
            "is_separated": False,
        }

        if not audio_path or not os.path.exists(audio_path):
            return fallback

        if not self.is_available():
            return fallback

        temp_dir = tempfile.mkdtemp(prefix="arpegia_demucs_")
        self._created_temp_dirs.add(temp_dir)

        try:
            # Build CLI invocation (prefer CLI executable, fallback to module execution)
            if shutil.which("demucs"):
                cmd = [
                    "demucs",
                    "-n",
                    self.model_name,
                    "-d",
                    self.device,
                    "-o",
                    temp_dir,
                    audio_path,
                ]
            else:
                cmd = [
                    sys.executable,
                    "-m",
                    "demucs.separate",
                    "-n",
                    self.model_name,
                    "-d",
                    self.device,
                    "-o",
                    temp_dir,
                    audio_path,
                ]

            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                check=True,
            )

            # Discover stem files inside temp_dir
            other_path: Optional[str] = None
            bass_path: Optional[str] = None

            for root, _, files in os.walk(temp_dir):
                for f in files:
                    f_lower = f.lower()
                    full_p = os.path.join(root, f)
                    if f_lower.startswith("other."):
                        other_path = full_p
                    elif f_lower.startswith("bass."):
                        bass_path = full_p

            if not other_path or not os.path.exists(other_path):
                shutil.rmtree(temp_dir, ignore_errors=True)
                return fallback

            # Create weighted harmonic mix: 65% other (guitar/keys) + 35% bass
            if bass_path and os.path.exists(bass_path):
                y_other, sr_other = librosa.load(other_path, sr=None, mono=True)
                y_bass, sr_bass = librosa.load(bass_path, sr=sr_other, mono=True)

                min_len = min(len(y_other), len(y_bass))
                if min_len > 0:
                    y_harm = 0.65 * y_other[:min_len] + 0.35 * y_bass[:min_len]
                else:
                    y_harm = y_other if len(y_other) > 0 else y_bass

                peak = float(np.max(np.abs(y_harm))) if len(y_harm) > 0 else 0.0
                if peak > 1.0:
                    y_harm = y_harm / peak

                harmonic_path = os.path.join(os.path.dirname(other_path), "harmonic_mix.wav")
                sf.write(harmonic_path, y_harm, sr_other)
            else:
                harmonic_path = other_path
                bass_path = audio_path

            return {
                "guitar_stem": other_path,
                "harmonic_mix": harmonic_path,
                "bass_stem": bass_path,
                "stem_dir": temp_dir,
                "is_separated": True,
            }

        except Exception:
            if temp_dir and os.path.exists(temp_dir):
                shutil.rmtree(temp_dir, ignore_errors=True)
            return fallback

    @classmethod
    def cleanup(cls, stem_dir: Optional[str]) -> None:
        """Safely remove temporary stem directory."""
        if stem_dir:
            cls._created_temp_dirs.discard(stem_dir)
            if os.path.exists(stem_dir):
                try:
                    shutil.rmtree(stem_dir, ignore_errors=True)
                except Exception:
                    pass

    @classmethod
    def cleanup_all(cls) -> None:
        """Safely remove all tracked active temporary stem directories."""
        for d in list(cls._created_temp_dirs):
            cls.cleanup(d)
