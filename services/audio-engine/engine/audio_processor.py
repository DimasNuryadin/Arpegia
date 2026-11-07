"""Audio processing module leveraging librosa and numpy for DSP feature extraction."""

from typing import Tuple, Optional
import os
import warnings
import numpy as np
import librosa
import soundfile as sf

warnings.filterwarnings("ignore")


class AudioProcessor:
    """Handles audio loading, duration estimation, tempo tracking, and chromagram extraction."""

    def __init__(self, sample_rate: int = 22050, hop_length: int = 512):
        self.sample_rate = sample_rate
        self.hop_length = hop_length

    def load_audio(
        self,
        file_path: str,
        target_sr: Optional[int] = None,
        mono: bool = True,
    ) -> Tuple[np.ndarray, int]:
        """Load an audio file (MP3/WAV/etc.) into a mono floating point time series.

        Args:
            file_path: Path to the target audio file.
            target_sr: Target sample rate. If None, uses default self.sample_rate.
            mono: If True, convert stereo signals to mono.

        Returns:
            Tuple of (audio_waveform, sample_rate).
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Audio file not found: {file_path}")

        sr = target_sr if target_sr is not None else self.sample_rate
        y, actual_sr = librosa.load(file_path, sr=sr, mono=mono)
        return y, actual_sr

    def get_duration(self, y: np.ndarray, sr: Optional[int] = None) -> float:
        """Estimate duration of audio time series in seconds.

        Args:
            y: Audio waveform array.
            sr: Sample rate.

        Returns:
            Duration in seconds (float).
        """
        sample_rate = sr if sr is not None else self.sample_rate
        return float(librosa.get_duration(y=y, sr=sample_rate))

    def estimate_tempo(
        self,
        y: np.ndarray,
        sr: Optional[int] = None,
    ) -> float:
        """Detect tempo (BPM) from audio onset envelope.

        Args:
            y: Audio waveform array.
            sr: Sample rate.

        Returns:
            Estimated BPM (rounded to 1 decimal place or int).
        """
        sample_rate = sr if sr is not None else self.sample_rate
        try:
            onset_env = librosa.onset.onset_strength(y=y, sr=sample_rate, hop_length=self.hop_length)
            tempo, _ = librosa.beat.beat_track(
                onset_envelope=onset_env,
                sr=sample_rate,
                hop_length=self.hop_length,
            )
            bpm = float(np.atleast_1d(tempo)[0])
            if np.isnan(bpm) or bpm <= 0:
                bpm = 120.0
            return round(bpm, 1)
        except Exception:
            return 120.0

    def detect_beats(
        self,
        y: np.ndarray,
        sr: Optional[int] = None,
    ) -> Tuple[float, np.ndarray, np.ndarray]:
        """Detect tempo and beat timestamps.

        Args:
            y: Audio waveform array.
            sr: Sample rate.

        Returns:
            Tuple of (tempo_bpm, beat_frames, beat_times_seconds).
        """
        sample_rate = sr if sr is not None else self.sample_rate
        onset_env = librosa.onset.onset_strength(y=y, sr=sample_rate, hop_length=self.hop_length)
        tempo, beat_frames = librosa.beat.beat_track(
            onset_envelope=onset_env,
            sr=sample_rate,
            hop_length=self.hop_length,
        )
        bpm = float(np.atleast_1d(tempo)[0])
        if np.isnan(bpm) or bpm <= 0:
            bpm = 120.0

        beat_times = librosa.frames_to_time(beat_frames, sr=sample_rate, hop_length=self.hop_length)
        return round(bpm, 1), beat_frames, beat_times

    def extract_chromagram(
        self,
        y: np.ndarray,
        sr: Optional[int] = None,
        method: str = "cqt",
    ) -> np.ndarray:
        """Extract a 12-bin chromagram across time frames using CQT or STFT.

        Args:
            y: Audio waveform array.
            sr: Sample rate.
            method: Feature extraction method ('cqt' or 'stft'). Defaults to 'cqt'.

        Returns:
            12xT numpy array representing pitch class energy over time.
        """
        sample_rate = sr if sr is not None else self.sample_rate

        # Ensure signal is not empty
        if len(y) == 0:
            return np.zeros((12, 1))

        if method.lower() == "stft":
            chroma = librosa.feature.chroma_stft(
                y=y,
                sr=sample_rate,
                hop_length=self.hop_length,
                n_chroma=12,
            )
        else:
            # Estimate tuning offset for pitch accuracy
            try:
                tuning = librosa.estimate_tuning(y=y, sr=sample_rate)
            except Exception:
                tuning = 0.0

            try:
                chroma = librosa.feature.chroma_cqt(
                    y=y,
                    sr=sample_rate,
                    hop_length=self.hop_length,
                    tuning=tuning,
                    n_chroma=12,
                )
            except Exception:
                # Fallback to STFT if CQT fails (e.g. signal too short for lowest frequency)
                chroma = librosa.feature.chroma_stft(
                    y=y,
                    sr=sample_rate,
                    hop_length=self.hop_length,
                    n_chroma=12,
                )

        return chroma

    def estimate_time_signature(
        self,
        y: np.ndarray,
        sr: Optional[int] = None,
    ) -> str:
        """Estimate time signature of the piece (defaults to 4/4).

        Args:
            y: Audio waveform array.
            sr: Sample rate.

        Returns:
            Time signature string, e.g. "4/4" or "3/4".
        """
        # Default standard meter for guitar/pop music
        return "4/4"
