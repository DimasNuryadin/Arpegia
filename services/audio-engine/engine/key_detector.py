"""Musical key detection using the Krumhansl-Schmuckler key-finding algorithm."""

from typing import Dict, Any, Optional, Tuple
import numpy as np


class KeyDetector:
    """Detects musical key (tonic + mode) using Krumhansl-Schmuckler cognitive key profiles."""

    PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    # Krumhansl-Kessler key profiles for major and minor keys
    MAJOR_PROFILE = np.array(
        [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88],
        dtype=np.float64,
    )
    MINOR_PROFILE = np.array(
        [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17],
        dtype=np.float64,
    )

    def __init__(self):
        # Pre-normalize profiles for Pearson correlation
        self._major_mean = np.mean(self.MAJOR_PROFILE)
        self._major_std = np.std(self.MAJOR_PROFILE)
        self._minor_mean = np.mean(self.MINOR_PROFILE)
        self._minor_std = np.std(self.MINOR_PROFILE)

    def _pearson_correlation(self, x: np.ndarray, y: np.ndarray) -> float:
        """Compute Pearson correlation coefficient between two 1D vectors."""
        x_diff = x - np.mean(x)
        y_diff = y - np.mean(y)
        numerator = np.sum(x_diff * y_diff)
        denominator = np.sqrt(np.sum(x_diff ** 2) * np.sum(y_diff ** 2))
        if denominator == 0:
            return 0.0
        return float(numerator / denominator)

    def detect_key_from_chroma(self, chromagram: np.ndarray) -> Dict[str, Any]:
        """Detect the musical key from a 12xT chromagram.

        Args:
            chromagram: 12xT numpy array of chroma features.

        Returns:
            Dict containing:
                - key: str, e.g. "G Major", "E Minor"
                - root: str, e.g. "G"
                - mode: str, e.g. "Major" or "Minor"
                - confidence: float between 0.0 and 1.0
                - correlations: dict of all 24 keys and their correlation scores
        """
        if chromagram is None or chromagram.size == 0:
            return {
                "key": "C Major",
                "root": "C",
                "mode": "Major",
                "confidence": 0.0,
                "correlations": {},
            }

        # Sum chroma across time frames to get overall pitch class distribution
        chroma_vector = np.sum(chromagram, axis=1)

        # If silence or flat zeros
        if np.all(chroma_vector == 0) or np.std(chroma_vector) == 0:
            return {
                "key": "C Major",
                "root": "C",
                "mode": "Major",
                "confidence": 0.0,
                "correlations": {},
            }

        best_key = "C Major"
        best_root = "C"
        best_mode = "Major"
        best_corr = -1.0
        correlations: Dict[str, float] = {}

        # Evaluate each pitch class as root (0 to 11)
        for i, pitch in enumerate(self.PITCH_CLASSES):
            # Major candidate: shift major profile so its tonic is at pitch class i
            rolled_major = np.roll(self.MAJOR_PROFILE, i)
            corr_major = self._pearson_correlation(chroma_vector, rolled_major)
            key_name_maj = f"{pitch} Major"
            correlations[key_name_maj] = round(corr_major, 4)

            if corr_major > best_corr:
                best_corr = corr_major
                best_key = key_name_maj
                best_root = pitch
                best_mode = "Major"

            # Minor candidate: shift minor profile so its tonic is at pitch class i
            rolled_minor = np.roll(self.MINOR_PROFILE, i)
            corr_minor = self._pearson_correlation(chroma_vector, rolled_minor)
            key_name_min = f"{pitch} Minor"
            correlations[key_name_min] = round(corr_minor, 4)

            if corr_minor > best_corr:
                best_corr = corr_minor
                best_key = key_name_min
                best_root = pitch
                best_mode = "Minor"

        # Normalize correlation coefficient (-1..1) to [0..1] confidence score
        confidence = max(0.0, min(1.0, round((best_corr + 1.0) / 2.0, 2)))

        return {
            "key": best_key,
            "root": best_root,
            "mode": best_mode,
            "confidence": confidence,
            "correlations": correlations,
        }
