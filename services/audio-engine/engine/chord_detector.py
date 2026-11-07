"""Chord detection engine leveraging chromagram analysis and template matching."""

from typing import List, Dict, Any, Optional, Tuple
import numpy as np
import librosa


class ChordDetector:
    """Detects timestamped chords by segmenting chromagrams and matching template profiles."""

    PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    # Base intervals for chord qualities: (quality_name, interval_semitones, name_suffix)
    CHORD_TYPES = [
        ("major", [0, 4, 7], ""),            # e.g., "C", "G"
        ("minor", [0, 3, 7], "m"),           # e.g., "Cm", "Am"
        ("7", [0, 4, 7, 10], "7"),           # e.g., "C7", "G7"
        ("maj7", [0, 4, 7, 11], "maj7"),     # e.g., "Cmaj7", "Gmaj7"
        ("m7", [0, 3, 7, 10], "m7"),         # e.g., "Cm7", "Am7"
        ("sus4", [0, 5, 7], "sus4"),         # e.g., "Csus4", "Gsus4"
    ]

    def __init__(self, sample_rate: int = 22050, hop_length: int = 512, min_segment_duration: float = 0.25):
        self.sample_rate = sample_rate
        self.hop_length = hop_length
        self.min_segment_duration = min_segment_duration
        self.templates, self.template_names = self._generate_templates()

    def _generate_templates(self) -> Tuple[np.ndarray, List[str]]:
        """Pre-compute normalized 12-bin template vectors for all 72 chords (12 roots x 6 qualities)."""
        templates_list = []
        names_list = []

        for root_idx, root_name in enumerate(self.PITCH_CLASSES):
            for quality, intervals, suffix in self.CHORD_TYPES:
                vec = np.zeros(12, dtype=np.float64)
                for interval in intervals:
                    pitch_idx = (root_idx + interval) % 12
                    vec[pitch_idx] = 1.0

                # L2 normalize template vector
                norm = np.linalg.norm(vec)
                if norm > 0:
                    vec = vec / norm

                chord_name = f"{root_name}{suffix}"
                templates_list.append(vec)
                names_list.append(chord_name)

        # templates matrix shape: (num_templates, 12)
        templates_matrix = np.array(templates_list)
        return templates_matrix, names_list

    def _match_chroma_vector(self, chroma_vector: np.ndarray) -> Tuple[str, float]:
        """Match a single 12-dimensional chroma vector against chord templates using cosine similarity.

        Returns:
            Tuple of (best_chord_name, confidence_score)
        """
        norm = np.linalg.norm(chroma_vector)
        if norm <= 1e-6:
            return "N", 0.0

        normalized_chroma = chroma_vector / norm
        # Cosine similarity is dot product with normalized templates
        similarities = np.dot(self.templates, normalized_chroma)

        best_idx = int(np.argmax(similarities))
        best_sim = float(similarities[best_idx])
        best_chord = self.template_names[best_idx]

        confidence = max(0.0, min(1.0, round(best_sim, 2)))
        return best_chord, confidence

    def detect_chords(
        self,
        chromagram: np.ndarray,
        duration: float,
        beat_times: Optional[np.ndarray] = None,
    ) -> List[Dict[str, Any]]:
        """Segment chromagram across time frames and match templates to return timestamped chords.

        Args:
            chromagram: 12xT numpy array of chroma features.
            duration: Total audio duration in seconds.
            beat_times: Optional array of beat timestamps for beat-synchronous segmentation.

        Returns:
            List of dicts: [{"chord": "G", "start_time": 0.0, "end_time": 2.4, "confidence": 0.94}, ...]
        """
        n_bins, n_frames = chromagram.shape
        if n_frames == 0 or duration <= 0:
            return []

        frame_times = librosa.frames_to_time(
            np.arange(n_frames),
            sr=self.sample_rate,
            hop_length=self.hop_length,
        )

        # Build segments: prefer beat-synchronous boundaries if available and realistic
        boundaries = [0.0]
        if beat_times is not None and len(beat_times) >= 2:
            for bt in beat_times:
                if 0.0 < bt < duration:
                    boundaries.append(float(bt))
        else:
            # Fallback: regular window segmentation (e.g. 0.5s windows)
            step = max(self.min_segment_duration, 0.5)
            curr = step
            while curr < duration:
                boundaries.append(round(curr, 2))
                curr += step

        boundaries.append(duration)
        boundaries = sorted(list(set(boundaries)))

        raw_segments: List[Dict[str, Any]] = []

        for i in range(len(boundaries) - 1):
            t_start = boundaries[i]
            t_end = boundaries[i + 1]
            if t_end - t_start < 0.05:
                continue

            # Find frames in this time window
            mask = (frame_times >= t_start) & (frame_times <= t_end)
            if not np.any(mask):
                # If window is very short, pick closest frame
                frame_idx = min(int((t_start + t_end) / 2 / duration * n_frames), n_frames - 1)
                vec = chromagram[:, frame_idx]
            else:
                vec = np.mean(chromagram[:, mask], axis=1)

            chord, conf = self._match_chroma_vector(vec)

            # If segment is completely silent or no-chord, fallback or retain best guess
            if chord == "N":
                # Find argmax of raw chroma if energy exists
                if np.sum(vec) > 0:
                    chord, conf = self._match_chroma_vector(vec + 1e-4)

            raw_segments.append({
                "chord": chord,
                "start_time": round(t_start, 2),
                "end_time": round(t_end, 2),
                "confidence": conf,
            })

        if not raw_segments:
            # Fallback for whole audio as one segment
            mean_vec = np.mean(chromagram, axis=1)
            chord, conf = self._match_chroma_vector(mean_vec)
            return [{
                "chord": chord,
                "start_time": 0.0,
                "end_time": round(duration, 2),
                "confidence": conf,
            }]

        # Post-processing: Merge consecutive identical chords
        merged_segments: List[Dict[str, Any]] = []
        current = raw_segments[0].copy()
        current_confs = [current["confidence"]]
        current_durations = [current["end_time"] - current["start_time"]]

        for seg in raw_segments[1:]:
            if seg["chord"] == current["chord"]:
                # Extend current segment
                current["end_time"] = seg["end_time"]
                current_confs.append(seg["confidence"])
                current_durations.append(seg["end_time"] - seg["start_time"])
            else:
                # Calculate weighted average confidence
                total_dur = sum(current_durations)
                if total_dur > 0:
                    avg_conf = sum(c * d for c, d in zip(current_confs, current_durations)) / total_dur
                else:
                    avg_conf = sum(current_confs) / len(current_confs)
                current["confidence"] = round(avg_conf, 2)
                merged_segments.append(current)

                current = seg.copy()
                current_confs = [current["confidence"]]
                current_durations = [current["end_time"] - current["start_time"]]

        # Append last segment
        total_dur = sum(current_durations)
        if total_dur > 0:
            avg_conf = sum(c * d for c, d in zip(current_confs, current_durations)) / total_dur
        else:
            avg_conf = sum(current_confs) / len(current_confs)
        current["confidence"] = round(avg_conf, 2)
        merged_segments.append(current)

        # Smooth out tiny isolated flicker segments (< min_segment_duration) if surrounded by chords
        smoothed_segments: List[Dict[str, Any]] = []
        for i, seg in enumerate(merged_segments):
            dur = seg["end_time"] - seg["start_time"]
            if dur < self.min_segment_duration and len(smoothed_segments) > 0 and i < len(merged_segments) - 1:
                # Merge into preceding segment
                smoothed_segments[-1]["end_time"] = seg["end_time"]
            else:
                smoothed_segments.append(seg)

        # Final pass: merge any newly adjacent identical chords after smoothing
        final_segments: List[Dict[str, Any]] = []
        for seg in smoothed_segments:
            if not final_segments:
                final_segments.append(seg)
            elif final_segments[-1]["chord"] == seg["chord"]:
                final_segments[-1]["end_time"] = seg["end_time"]
                final_segments[-1]["confidence"] = round(
                    (final_segments[-1]["confidence"] + seg["confidence"]) / 2, 2
                )
            else:
                final_segments.append(seg)

        # Ensure start_time of first is 0.0 and end_time of last is duration
        if final_segments:
            final_segments[0]["start_time"] = 0.0
            final_segments[-1]["end_time"] = round(duration, 2)

        return final_segments
