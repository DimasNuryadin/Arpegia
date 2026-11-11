"""Real-time guitar tuner presets and live microphone chord detection service (Phase 5).

Provides:
- 5 canonical guitar tuning presets with exact frequencies (standard, drop_d, half_step_down, open_g, dadgad)
- Pitch deviation evaluation against preset target frequencies
- Live 12-bin chromagram and PCM audio chord recognition
- Delegation to `services/audio-engine/engine/live_detector.py` with complete deterministic local fallback.
"""

import logging
import math
import os
import sys
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from app.schemas.analysis import (
    ChordDiagram,
    LiveChordDetectionResult,
    LiveChordFrameRequest,
    TunerPitchResult,
    TuningPreset,
    TuningPresetId,
    TuningStatus,
    TuningStringTarget,
)
from app.services.analyzer_service import _ensure_audio_engine_path, resolve_chord_diagram

logger = logging.getLogger(__name__)

# Chromatic scale pitch class names
PITCH_NAMES: List[str] = [
    "C",
    "C#",
    "D",
    "D#",
    "E",
    "F",
    "F#",
    "G",
    "G#",
    "A",
    "A#",
    "B",
]

# Canonical 5 Guitar Tuning Presets (ordered string 6 Low to string 1 High)
CANONICAL_TUNING_PRESETS: List[Dict[str, Any]] = [
    {
        "id": "standard",
        "name": "Standard (E A D G B E)",
        "description": "Standard guitar tuning (E2 A2 D3 G3 B3 E4)",
        "strings": [
            {"string": 6, "note": "E2", "midi": 40},
            {"string": 5, "note": "A2", "midi": 45},
            {"string": 4, "note": "D3", "midi": 50},
            {"string": 3, "note": "G3", "midi": 55},
            {"string": 2, "note": "B3", "midi": 59},
            {"string": 1, "note": "E4", "midi": 64},
        ],
    },
    {
        "id": "drop_d",
        "name": "Drop D (D A D G B E)",
        "description": "Drop D tuning with string 6 lowered a whole step to D2",
        "strings": [
            {"string": 6, "note": "D2", "midi": 38},
            {"string": 5, "note": "A2", "midi": 45},
            {"string": 4, "note": "D3", "midi": 50},
            {"string": 3, "note": "G3", "midi": 55},
            {"string": 2, "note": "B3", "midi": 59},
            {"string": 1, "note": "E4", "midi": 64},
        ],
    },
    {
        "id": "half_step_down",
        "name": "Half Step Down (Eb Ab Db Gb Bb Eb)",
        "description": "All 6 strings tuned down one semitone",
        "strings": [
            {"string": 6, "note": "Eb2", "midi": 39},
            {"string": 5, "note": "Ab2", "midi": 44},
            {"string": 4, "note": "Db3", "midi": 49},
            {"string": 3, "note": "Gb3", "midi": 54},
            {"string": 2, "note": "Bb3", "midi": 58},
            {"string": 1, "note": "Eb4", "midi": 63},
        ],
    },
    {
        "id": "open_g",
        "name": "Open G (D G D G B D)",
        "description": "Open G chord tuning popular in blues and slide guitar",
        "strings": [
            {"string": 6, "note": "D2", "midi": 38},
            {"string": 5, "note": "G2", "midi": 43},
            {"string": 4, "note": "D3", "midi": 50},
            {"string": 3, "note": "G3", "midi": 55},
            {"string": 2, "note": "B3", "midi": 59},
            {"string": 1, "note": "D4", "midi": 62},
        ],
    },
    {
        "id": "dadgad",
        "name": "DADGAD (D A D G A D)",
        "description": "Celtic / folk modal open tuning",
        "strings": [
            {"string": 6, "note": "D2", "midi": 38},
            {"string": 5, "note": "A2", "midi": 45},
            {"string": 4, "note": "D3", "midi": 50},
            {"string": 3, "note": "G3", "midi": 55},
            {"string": 2, "note": "A3", "midi": 57},
            {"string": 1, "note": "D4", "midi": 62},
        ],
    },
]


def _calculate_frequency(midi: int, reference_a4_hz: float) -> float:
    """Calculate exact equal-temperament frequency in Hz from MIDI note number."""
    return round(reference_a4_hz * (2.0 ** ((midi - 69) / 12.0)), 2)


class LiveService:
    """Service handling guitar tuner presets, live pitch evaluation, and mic chord detection."""

    def get_tuning_presets(self, reference_a4_hz: float = 440.0) -> List[TuningPreset]:
        """Retrieve all 5 canonical guitar tuning presets with exact frequencies.

        Attempts to call `get_tuning_presets` from `services/audio-engine/engine/live_detector.py`
        first, falling back cleanly to the built-in mathematical model.
        """
        try:
            _ensure_audio_engine_path()
            from engine.live_detector import get_tuning_presets as engine_get_presets  # type: ignore

            raw_presets = engine_get_presets(reference_a4_hz)
            if raw_presets and len(raw_presets) == 5:
                return [TuningPreset.model_validate(p) for p in raw_presets]
        except Exception as exc:
            logger.debug("services/audio-engine get_tuning_presets unavailable (%s); using built-in model.", exc)

        presets: List[TuningPreset] = []
        for raw in CANONICAL_TUNING_PRESETS:
            targets = [
                TuningStringTarget(
                    string=s["string"],
                    note=s["note"],
                    frequency_hz=_calculate_frequency(s["midi"], reference_a4_hz),
                    midi=s["midi"],
                )
                for s in raw["strings"]
            ]
            presets.append(
                TuningPreset(
                    id=raw["id"],
                    name=raw["name"],
                    description=raw["description"],
                    reference_a4_hz=reference_a4_hz,
                    strings=targets,
                )
            )
        return presets

    def evaluate_tuner_pitch(
        self,
        frequency_hz: float,
        preset_id: str = "standard",
        target_string: Optional[int] = None,
        reference_a4_hz: float = 440.0,
    ) -> TunerPitchResult:
        """Evaluate detected microphone pitch frequency against guitar tuning targets."""
        try:
            _ensure_audio_engine_path()
            from engine.live_detector import evaluate_tuner_pitch as engine_eval  # type: ignore

            raw = engine_eval(frequency_hz, preset_id, target_string)
            if raw:
                return TunerPitchResult.model_validate(raw)
        except Exception as exc:
            logger.debug("services/audio-engine evaluate_tuner_pitch unavailable (%s); using fallback.", exc)

        presets = {p.id: p for p in self.get_tuning_presets(reference_a4_hz)}
        preset = presets.get(preset_id, presets["standard"])

        if target_string is not None and 1 <= target_string <= 6:
            target = next((s for s in preset.strings if s.string == target_string), preset.strings[0])
        else:
            target = min(
                preset.strings,
                key=lambda s: abs(1200.0 * math.log2(frequency_hz / s.frequency_hz))
                if frequency_hz > 0
                else 999999.0,
            )

        if frequency_hz <= 0:
            cents = -50.0
        else:
            cents = 1200.0 * math.log2(frequency_hz / target.frequency_hz)
        cents_clamped = max(-50.0, min(50.0, round(cents, 2)))

        if abs(cents_clamped) <= 3.5:
            status: TuningStatus = "in_tune"
        elif cents_clamped < 0:
            status = "flat"
        else:
            status = "sharp"

        if frequency_hz > 0:
            detected_midi = int(round(69 + 12 * math.log2(frequency_hz / reference_a4_hz)))
            octave = (detected_midi // 12) - 1
            semitone = detected_midi % 12
            detected_note = f"{PITCH_NAMES[semitone]}{octave}"
        else:
            detected_note = target.note

        return TunerPitchResult(
            detected_frequency_hz=round(frequency_hz, 2),
            detected_note=detected_note,
            closest_string=target.string,
            target_note=target.note,
            target_frequency_hz=target.frequency_hz,
            cents_deviation=cents_clamped,
            tuning_status=status,
            confidence=1.0,
        )

    def detect_chord(self, frame: LiveChordFrameRequest) -> LiveChordDetectionResult:
        """Recognize chord from 12-bin chromagram pitch vector or mono PCM samples."""
        # 1. Attempt to delegate to services/audio-engine if available
        try:
            _ensure_audio_engine_path()
            from engine.live_detector import detect_live_chord_from_frame as engine_detect  # type: ignore

            raw_res = engine_detect(
                chroma=frame.chroma,
                pcm_samples=frame.pcm_samples,
                sample_rate=frame.sample_rate,
            )
            if raw_res and isinstance(raw_res, dict):
                if "timestamp_ms" not in raw_res:
                    raw_res["timestamp_ms"] = int(time.time() * 1000)
                return LiveChordDetectionResult.model_validate(raw_res)
        except Exception as exc:
            logger.debug("services/audio-engine detect_live_chord_from_frame unavailable (%s); using fallback.", exc)

        # 2. Local Fallback Chord Detector
        now_ms = int(time.time() * 1000)

        # Resolve or compute 12-bin chroma vector
        chroma = self._resolve_chroma(frame)
        if chroma is None or len(chroma) != 12:
            return LiveChordDetectionResult(
                chord="N",
                root="",
                quality="",
                confidence=0.0,
                voicing=None,
                notes_detected=[],
                timestamp_ms=now_ms,
            )

        # Silence or non-musical noise check
        max_val = max(chroma)
        sum_val = sum(chroma)
        if max_val < 0.15 or sum_val < 0.2:
            return LiveChordDetectionResult(
                chord="N",
                root="",
                quality="",
                confidence=0.0,
                voicing=None,
                notes_detected=[],
                timestamp_ms=now_ms,
            )

        # Identify notes detected based on relative energy
        note_threshold = max(0.25, 0.4 * max_val)
        notes_detected = [PITCH_NAMES[i] for i in range(12) if chroma[i] >= note_threshold]

        # Match chroma against chord templates
        chord, root, quality, confidence = self._match_chord_template(chroma)

        # Resolve 6-string SVG voicing diagram
        voicing: Optional[ChordDiagram] = None
        if chord != "N":
            try:
                voicing = resolve_chord_diagram(chord)
            except Exception as v_exc:
                logger.debug("Voicing diagram resolution failed for '%s': %s", chord, v_exc)
                voicing = None

        return LiveChordDetectionResult(
            chord=chord,
            root=root,
            quality=quality,
            confidence=round(confidence, 2),
            voicing=voicing,
            notes_detected=notes_detected,
            timestamp_ms=now_ms,
        )

    def _resolve_chroma(self, frame: LiveChordFrameRequest) -> Optional[List[float]]:
        """Extract or normalize 12-element chroma vector."""
        if frame.chroma is not None and len(frame.chroma) == 12:
            return [float(v) for v in frame.chroma]

        if frame.pcm_samples and len(frame.pcm_samples) > 0:
            try:
                import librosa

                samples = np.array(frame.pcm_samples, dtype=np.float32)
                if np.max(np.abs(samples)) > 1e-4:
                    n_fft = min(2048, len(samples))
                    if n_fft >= 128:
                        fb = librosa.feature.chroma_stft(y=samples, sr=frame.sample_rate, n_fft=n_fft)
                        mean_vec = np.mean(fb, axis=1)
                        norm_max = np.max(mean_vec)
                        if norm_max > 0:
                            return (mean_vec / norm_max).tolist()
            except Exception as exc:
                logger.debug("PCM chroma extraction failed (%s); using zeros.", exc)

        return None

    def _match_chord_template(self, chroma: List[float]) -> Tuple[str, str, str, float]:
        """Perform harmonic template matching using cosine similarity and root prominence."""
        c_arr = np.array(chroma, dtype=np.float32)
        c_norm = np.linalg.norm(c_arr)
        if c_norm <= 1e-6:
            return "N", "", "", 0.0

        # Define chord templates (semitone offsets from root)
        # quality_name -> (offsets, label, quality_code)
        template_specs = [
            ("major", [0, 4, 7], "", "major"),
            ("minor", [0, 3, 7], "m", "minor"),
            ("maj7", [0, 4, 7, 11], "maj7", "maj7"),
            ("dom7", [0, 4, 7, 10], "7", "dom7"),
            ("min7", [0, 3, 7, 10], "m7", "min7"),
        ]

        best_score = -1.0
        best_chord = "N"
        best_root = ""
        best_quality = ""

        for root_idx in range(12):
            root_name = PITCH_NAMES[root_idx]
            for t_type, offsets, suffix, quality_code in template_specs:
                t_vec = np.zeros(12, dtype=np.float32)
                for off in offsets:
                    t_vec[(root_idx + off) % 12] = 1.0

                t_norm = np.linalg.norm(t_vec)
                cos_sim = float(np.dot(c_arr, t_vec) / (c_norm * t_norm))

                # Boost root prominence
                root_weight = c_arr[root_idx] / max_val if (max_val := np.max(c_arr)) > 0 else 0.0
                score = cos_sim * 0.85 + root_weight * 0.15

                if score > best_score:
                    best_score = score
                    best_chord = f"{root_name}{suffix}"
                    best_root = root_name
                    best_quality = quality_code

        confidence = max(0.0, min(1.0, best_score))
        if confidence < 0.35:
            return "N", "", "", 0.0

        return best_chord, best_root, best_quality, confidence


live_service = LiveService()
