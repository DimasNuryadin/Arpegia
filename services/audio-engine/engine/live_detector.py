"""High-Precision Guitar Tuner Pitch Evaluator & Low-Latency Live Chord Detector (Phase 5).

Provides sub-50ms deterministic real-time audio evaluation:
1. Multi-Preset Guitar Tuning Generator (`get_tuning_presets`)
2. Microtonal Tuner Pitch Evaluator (`evaluate_tuner_pitch`)
3. Live Microphone Chord Detector (`detect_live_chord_from_frame`)

Conforms strictly to Phase 5 Pydantic contracts in packages/shared-types/schemas.py:
- TuningPreset, TuningStringTarget, TunerPitchResult
- LiveChordFrameRequest, LiveChordDetectionResult, ChordDiagram
"""

from typing import List, Dict, Any, Optional, Tuple, Union
import math
import time
import numpy as np
import librosa

from .chord_voicings import ChordVoicingGenerator


# ============================================================================
# Canonical Musical Constants
# ============================================================================

PITCH_CLASSES: List[str] = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Canonical 5 Guitar Tuning Presets
# Strings ordered strictly from String 6 (Low) to String 1 (High)
# Tuple format: (string_number, note_name, midi_pitch)
CANONICAL_TUNING_PRESETS: Dict[str, Dict[str, Any]] = {
    "standard": {
        "id": "standard",
        "name": "Standard (E A D G B E)",
        "description": "Standard guitar tuning (E2 A2 D3 G3 B3 E4)",
        "strings": [
            (6, "E2", 40),
            (5, "A2", 45),
            (4, "D3", 50),
            (3, "G3", 55),
            (2, "B3", 59),
            (1, "E4", 64),
        ],
    },
    "drop_d": {
        "id": "drop_d",
        "name": "Drop D (D A D G B E)",
        "description": "Drop D tuning with string 6 lowered a whole step to D2",
        "strings": [
            (6, "D2", 38),
            (5, "A2", 45),
            (4, "D3", 50),
            (3, "G3", 55),
            (2, "B3", 59),
            (1, "E4", 64),
        ],
    },
    "half_step_down": {
        "id": "half_step_down",
        "name": "Half Step Down (Eb Ab Db Gb Bb Eb)",
        "description": "All 6 strings tuned down one semitone",
        "strings": [
            (6, "Eb2", 39),
            (5, "Ab2", 44),
            (4, "Db3", 49),
            (3, "Gb3", 54),
            (2, "Bb3", 58),
            (1, "Eb4", 63),
        ],
    },
    "open_g": {
        "id": "open_g",
        "name": "Open G (D G D G B D)",
        "description": "Open G chord tuning popular in blues and slide guitar",
        "strings": [
            (6, "D2", 38),
            (5, "G2", 43),
            (4, "D3", 50),
            (3, "G3", 55),
            (2, "B3", 59),
            (1, "D4", 62),
        ],
    },
    "dadgad": {
        "id": "dadgad",
        "name": "DADGAD (D A D G A D)",
        "description": "Celtic / folk modal open tuning",
        "strings": [
            (6, "D2", 38),
            (5, "A2", 45),
            (4, "D3", 50),
            (3, "G3", 55),
            (2, "A3", 57),
            (1, "D4", 62),
        ],
    },
}

# 9 Canonical Chord Qualities covering Major, Minor, 7, maj7, m7, sus4, sus2, dim, aug
# Tuple format: (quality_name, interval_semitones, suffix, quality_label)
CHORD_QUALITIES: List[Tuple[str, List[int], str, str]] = [
    ("major", [0, 4, 7], "", "major"),
    ("minor", [0, 3, 7], "m", "minor"),
    ("dom7", [0, 4, 7, 10], "7", "dom7"),
    ("maj7", [0, 4, 7, 11], "maj7", "maj7"),
    ("minor7", [0, 3, 7, 10], "m7", "minor7"),
    ("sus4", [0, 5, 7], "sus4", "sus4"),
    ("sus2", [0, 2, 7], "sus2", "sus2"),
    ("dim", [0, 3, 6], "dim", "diminished"),
    ("aug", [0, 4, 8], "aug", "augmented"),
]


# ============================================================================
# DSP Pitch & Frequency Calculations
# ============================================================================

def midi_to_frequency(midi: int, reference_a4_hz: float = 440.0) -> float:
    """Calculates exact pitch frequency in Hz from MIDI note number."""
    return round(float(reference_a4_hz * (2.0 ** ((midi - 69) / 12.0))), 2)


def frequency_to_midi_and_note(frequency_hz: float, reference_a4_hz: float = 440.0) -> Tuple[int, str]:
    """Converts a fundamental frequency in Hz to nearest MIDI number and scientific note name."""
    if frequency_hz <= 0.0:
        return 40, "E2"
    midi_float = 69.0 + 12.0 * math.log2(frequency_hz / reference_a4_hz)
    nearest_midi = int(round(midi_float))
    octave = (nearest_midi // 12) - 1
    pitch_name = PITCH_CLASSES[nearest_midi % 12]
    return nearest_midi, f"{pitch_name}{octave}"


def calculate_cents_deviation(detected_hz: float, target_hz: float) -> float:
    """Calculates cents deviation between detected and target pitch, clamped to [-50.0, 50.0]."""
    if detected_hz <= 0.0 or target_hz <= 0.0:
        return -50.0
    raw_cents = 1200.0 * math.log2(detected_hz / target_hz)
    clamped_cents = max(-50.0, min(50.0, round(raw_cents, 2)))
    return clamped_cents


def determine_tuning_status(cents_deviation: float) -> str:
    """Determines whether detected pitch is in_tune, flat, or sharp."""
    if abs(cents_deviation) <= 3.5:
        return "in_tune"
    elif cents_deviation < -3.5:
        return "flat"
    else:
        return "sharp"


# ============================================================================
# 1. Tuning Presets Generator
# ============================================================================

def get_tuning_presets(reference_a4_hz: float = 440.0) -> list[dict]:
    """Retrieves all 5 canonical guitar tuning presets with exact physical target frequencies.

    Args:
        reference_a4_hz: Reference concert pitch in Hertz (default 440.0).

    Returns:
        list[dict]: 5 canonical presets conforming to TuningPreset schema:
            - standard (E2, A2, D3, G3, B3, E4)
            - drop_d (D2, A2, D3, G3, B3, E4)
            - half_step_down (Eb2, Ab2, Db3, Gb3, Bb3, Eb4)
            - open_g (D2, G2, D3, G3, B3, D4)
            - dadgad (D2, A2, D3, G3, A3, D4)
            Ordered from String 6 (Low) to String 1 (High).
    """
    ref_hz = float(reference_a4_hz)
    presets: List[Dict[str, Any]] = []

    for preset_id, info in CANONICAL_TUNING_PRESETS.items():
        string_targets: List[Dict[str, Any]] = []
        for s_num, note, midi in info["strings"]:
            freq = midi_to_frequency(midi, ref_hz)
            string_targets.append({
                "string": s_num,
                "note": note,
                "frequency_hz": freq,
                "midi": midi,
            })

        presets.append({
            "id": preset_id,
            "name": info["name"],
            "description": info["description"],
            "reference_a4_hz": ref_hz,
            "strings": string_targets,
        })

    return presets


# ============================================================================
# 2. Tuner Pitch Evaluator
# ============================================================================

def evaluate_tuner_pitch(
    frequency_hz: float,
    preset_id: str = "standard",
    target_string: Optional[int] = None,
    reference_a4_hz: float = 440.0,
    confidence: float = 0.95,
) -> dict:
    """Evaluates a detected microphone fundamental frequency against guitar tuning targets.

    Args:
        frequency_hz: Detected fundamental frequency (f0) in Hertz.
        preset_id: Canonical preset ID ('standard', 'drop_d', 'half_step_down', 'open_g', 'dadgad').
        target_string: Optional manual string lock (1 to 6). If None, automatically detects
            the closest string minimizing absolute cents deviation.
        reference_a4_hz: Reference concert pitch in Hertz (default 440.0).
        confidence: Detection confidence score (0.0 to 1.0, default 0.95).

    Returns:
        dict: Conforming to TunerPitchResult schema:
            - detected_frequency_hz: float
            - detected_note: str
            - closest_string: int (1 to 6)
            - target_note: str
            - target_frequency_hz: float
            - cents_deviation: float in [-50.0, 50.0]
            - tuning_status: 'in_tune' | 'flat' | 'sharp'
            - confidence: float in [0.0, 1.0]
    """
    clean_preset_id = (preset_id or "standard").lower().strip()
    if clean_preset_id not in CANONICAL_TUNING_PRESETS:
        raise ValueError(
            f"Unknown tuning preset '{preset_id}'. Expected one of: {list(CANONICAL_TUNING_PRESETS.keys())}"
        )

    ref_hz = float(reference_a4_hz)
    preset_info = CANONICAL_TUNING_PRESETS[clean_preset_id]
    string_specs = preset_info["strings"]

    # Build target string list for this preset
    preset_targets = [
        {
            "string": s_num,
            "note": note,
            "frequency_hz": midi_to_frequency(midi, ref_hz),
            "midi": midi,
        }
        for s_num, note, midi in string_specs
    ]

    # Select target string
    if target_string is not None:
        if target_string < 1 or target_string > 6:
            raise ValueError(f"target_string must be between 1 and 6, got {target_string}")
        selected = next((s for s in preset_targets if s["string"] == target_string), preset_targets[0])
    else:
        # Auto-detect closest string by minimizing absolute cents deviation
        if frequency_hz > 0.0:
            selected = min(
                preset_targets,
                key=lambda s: abs(1200.0 * math.log2(frequency_hz / s["frequency_hz"])),
            )
        else:
            selected = preset_targets[0]

    # Compute microtonal cents deviation
    cents_deviation = calculate_cents_deviation(frequency_hz, selected["frequency_hz"])
    status = determine_tuning_status(cents_deviation)

    # Determine scientific pitch name for detected frequency
    if frequency_hz > 0.0:
        _, detected_note = frequency_to_midi_and_note(frequency_hz, ref_hz)
    else:
        detected_note = selected["note"]

    return {
        "detected_frequency_hz": round(float(frequency_hz), 2),
        "detected_note": detected_note,
        "closest_string": selected["string"],
        "target_note": selected["note"],
        "target_frequency_hz": selected["frequency_hz"],
        "cents_deviation": cents_deviation,
        "tuning_status": status,
        "confidence": max(0.0, min(1.0, round(float(confidence), 2))),
    }


def extract_pitch_from_pcm(
    pcm_samples: Union[List[float], np.ndarray],
    sample_rate: int = 22050,
    fmin: float = 65.0,
    fmax: float = 400.0,
) -> Tuple[float, float]:
    """Extracts fundamental pitch (f0) and confidence from raw mono PCM buffer using YIN/autocorrelation.

    Returns:
        Tuple[float, float]: (fundamental_frequency_hz, confidence_score)
    """
    samples = np.asarray(pcm_samples, dtype=np.float32)
    if len(samples) < 256:
        return 0.0, 0.0

    rms = float(np.sqrt(np.mean(samples ** 2)))
    if rms < 1e-3:
        return 0.0, 0.0

    try:
        f0 = librosa.yin(
            samples,
            fmin=fmin,
            fmax=fmax,
            sr=sample_rate,
        )
        valid_f0 = f0[~np.isnan(f0)]
        if len(valid_f0) == 0:
            return 0.0, 0.0
        median_hz = float(np.median(valid_f0))
        # Confidence based on pitch stability and signal RMS
        std_hz = float(np.std(valid_f0)) if len(valid_f0) > 1 else 0.0
        conf = max(0.0, min(1.0, 1.0 - (std_hz / max(1.0, median_hz))))
        return round(median_hz, 2), round(conf, 2)
    except Exception:
        return 0.0, 0.0


def evaluate_tuner_pitch_from_pcm(
    pcm_samples: Union[List[float], np.ndarray],
    sample_rate: int = 22050,
    preset_id: str = "standard",
    target_string: Optional[int] = None,
    reference_a4_hz: float = 440.0,
) -> dict:
    """Evaluates microphone tuning directly from a raw audio PCM buffer using YIN pitch tracking."""
    freq_hz, conf = extract_pitch_from_pcm(pcm_samples, sample_rate)
    return evaluate_tuner_pitch(
        frequency_hz=freq_hz,
        preset_id=preset_id,
        target_string=target_string,
        reference_a4_hz=reference_a4_hz,
        confidence=conf,
    )


# ============================================================================
# 3. Live Chord Detector Engine
# ============================================================================

class LiveChordDetector:
    """Low-latency real-time chord detection engine matching chroma frames against comprehensive templates."""

    def __init__(self):
        self.templates_matrix, self.binary_matrix, self.template_metadata = self._build_templates()
        self.voicing_generator = ChordVoicingGenerator()

    def _build_templates(self) -> Tuple[np.ndarray, np.ndarray, List[Dict[str, Any]]]:
        """Precomputes normalized 12-bin template vectors for all 108 chords (12 roots x 9 qualities)."""
        templates: List[np.ndarray] = []
        binary_templates: List[np.ndarray] = []
        metadata: List[Dict[str, Any]] = []

        for root_idx, root_name in enumerate(PITCH_CLASSES):
            for quality_name, intervals, suffix, quality_label in CHORD_QUALITIES:
                vec = np.zeros(12, dtype=np.float64)
                bvec = np.zeros(12, dtype=np.float64)
                for interval in intervals:
                    pitch_idx = (root_idx + interval) % 12
                    # Root has priority weight 1.2, 5th has 1.0, 3rd/7th/sus has 0.9
                    w = 1.2 if interval == 0 else (1.0 if interval == 7 else 0.9)
                    vec[pitch_idx] = w
                    bvec[pitch_idx] = 1.0

                norm = float(np.linalg.norm(vec))
                if norm > 0:
                    vec = vec / norm

                chord_symbol = f"{root_name}{suffix}"
                templates.append(vec)
                binary_templates.append(bvec)
                metadata.append({
                    "chord": chord_symbol,
                    "root": root_name,
                    "quality": quality_label,
                    "intervals": intervals,
                    "root_idx": root_idx,
                })

        return np.array(templates), np.array(binary_templates), metadata

    def extract_chroma_from_pcm(
        self,
        samples: np.ndarray,
        sample_rate: int = 22050,
        n_fft: int = 4096,
    ) -> np.ndarray:
        """Extracts 12-bin chromagram vector via Gaussian-weighted FFT harmonic summation in < 3ms."""
        if len(samples) < n_fft:
            padded_samples = np.pad(samples, (0, n_fft - len(samples)))
        else:
            padded_samples = samples[:n_fft]

        fft_vals = np.abs(np.fft.rfft(padded_samples, n=n_fft))
        freqs = np.fft.rfftfreq(n_fft, 1.0 / sample_rate)
        chroma = np.zeros(12, dtype=np.float64)

        # Focus on musical guitar range: C2 (65.4 Hz) to C7 (2093 Hz)
        valid_mask = (freqs >= 65.4) & (freqs <= 2100.0)
        v_freqs = freqs[valid_mask]
        v_fft = fft_vals[valid_mask]

        if len(v_freqs) == 0:
            return chroma

        midi_vals = 69.0 + 12.0 * np.log2(v_freqs / 440.0)
        round_midi = np.round(midi_vals).astype(int)
        pitch_classes = round_midi % 12
        deviations = np.abs(midi_vals - round_midi)

        # Narrow Gaussian window (sigma = 0.20 semitones) prevents adjacent-bin leakage
        weights = np.exp(-0.5 * (deviations / 0.20) ** 2)
        np.add.at(chroma, pitch_classes, v_fft * weights)

        max_c = float(np.max(chroma))
        if max_c > 0:
            chroma = chroma / max_c

        # Adaptive thresholding: eliminate noise and binarize clear chord harmonics
        chroma = np.where(chroma >= 0.30, 1.0, 0.0)
        return chroma

    def detect_chord(
        self,
        chroma: Optional[List[float]] = None,
        pcm_samples: Optional[List[float]] = None,
        sample_rate: int = 22050,
        tuning_preset: str = "standard",
    ) -> Dict[str, Any]:
        """Detects chord from live audio frame or precomputed 12-bin chromagram vector."""
        timestamp_ms = int(time.time() * 1000)

        # 1. Process PCM samples if chroma vector is absent
        if chroma is None and pcm_samples is not None:
            samples = np.asarray(pcm_samples, dtype=np.float32)
            if len(samples) == 0:
                return self._silent_result(timestamp_ms)

            rms = float(np.sqrt(np.mean(samples ** 2)))
            if rms < 1e-3:
                return self._silent_result(timestamp_ms)

            chroma_vec = self.extract_chroma_from_pcm(samples, sample_rate=sample_rate)
            chroma = chroma_vec.tolist()

        # 2. Check chroma presence and energy
        if chroma is None:
            return self._silent_result(timestamp_ms)

        chroma_arr = np.asarray(chroma, dtype=np.float64)
        if len(chroma_arr) != 12:
            if len(chroma_arr) < 12:
                chroma_arr = np.pad(chroma_arr, (0, 12 - len(chroma_arr)))
            else:
                chroma_arr = chroma_arr[:12]

        sum_energy = float(np.sum(chroma_arr))
        max_energy = float(np.max(chroma_arr))
        if sum_energy < 1e-3 or max_energy < 1e-3:
            return self._silent_result(timestamp_ms)

        # 3. Normalize chroma vector
        norm = float(np.linalg.norm(chroma_arr))
        if norm <= 1e-6:
            return self._silent_result(timestamp_ms)
        norm_chroma = chroma_arr / norm

        # 4. Cosine similarity template matching with active uncovered energy penalty
        cos_sims = np.dot(self.templates_matrix, norm_chroma)
        uncovered = np.dot(1.0 - self.binary_matrix, norm_chroma)
        effective_scores = cos_sims - 0.25 * uncovered

        best_idx = int(np.argmax(effective_scores))
        best_sim = float(cos_sims[best_idx])
        chord_meta = self.template_metadata[best_idx]

        # If best match similarity is negligible, classify as unrecognized noise
        if best_sim < 0.35:
            return self._silent_result(timestamp_ms)

        confidence = max(0.0, min(1.0, round(best_sim, 2)))
        chord_name = chord_meta["chord"]
        root_name = chord_meta["root"]
        quality_label = chord_meta["quality"]

        # 5. Extract detected pitch classes
        threshold = max(0.20, 0.35 * max_energy)
        notes_detected = [PITCH_CLASSES[i] for i in range(12) if chroma_arr[i] >= threshold]
        if not notes_detected:
            notes_detected = [
                PITCH_CLASSES[(chord_meta["root_idx"] + iv) % 12]
                for iv in chord_meta["intervals"]
            ]

        # 6. Attach 6-string ChordDiagram voicing
        voicing = self.voicing_generator.get_chord_diagram(chord_name)

        return {
            "chord": chord_name,
            "root": root_name,
            "quality": quality_label,
            "confidence": confidence,
            "voicing": voicing,
            "notes_detected": notes_detected,
            "timestamp_ms": timestamp_ms,
        }

    def _silent_result(self, timestamp_ms: int) -> Dict[str, Any]:
        """Returns empty/silence detection result conforming to LiveChordDetectionResult."""
        return {
            "chord": "N",
            "root": "",
            "quality": "",
            "confidence": 0.0,
            "voicing": None,
            "notes_detected": [],
            "timestamp_ms": timestamp_ms,
        }


# Global singleton instance for high-throughput sub-50ms execution
_LIVE_CHORD_DETECTOR = LiveChordDetector()


def detect_live_chord_from_frame(
    chroma: Optional[list[float]] = None,
    pcm_samples: Optional[list[float]] = None,
    sample_rate: int = 22050,
    tuning_preset: str = "standard",
) -> dict:
    """Recognizes a chord in real time from a live audio frame or pre-computed chromagram.

    Args:
        chroma: Optional 12-element normalized pitch class energy vector [C, C#, D, D#, E, F, F#, G, G#, A, A#, B].
        pcm_samples: Optional raw mono PCM audio buffer (e.g. 2048 or 4096 samples).
        sample_rate: Sample rate in Hz (default 22050).
        tuning_preset: Tuning preset ID (default 'standard').

    Returns:
        dict: Conforming to LiveChordDetectionResult schema:
            - chord: str (e.g. "Cmaj7", "Am", "G7", or "N" when silence/unrecognized)
            - root: str (e.g. "C", "A", "G")
            - quality: str (e.g. "maj7", "minor", "dom7")
            - confidence: float in [0.0, 1.0]
            - voicing: Optional[ChordDiagram] matching the detected chord
            - notes_detected: list[str] (e.g. ["C", "E", "G", "B"])
            - timestamp_ms: int
    """
    return _LIVE_CHORD_DETECTOR.detect_chord(
        chroma=chroma,
        pcm_samples=pcm_samples,
        sample_rate=sample_rate,
        tuning_preset=tuning_preset,
    )
