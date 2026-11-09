"""Spotify Basic Pitch polyphonic audio-to-MIDI transcription and pitch-bend analysis."""

from typing import List, Dict, Any, Optional
import os
import numpy as np
import librosa

# Guard import of optional heavy ML library Spotify Basic Pitch
try:
    from basic_pitch.inference import predict
    from basic_pitch import ICASSP_2022_MODEL_PATH
    HAS_BASIC_PITCH = True
except (ImportError, Exception):
    predict = None
    ICASSP_2022_MODEL_PATH = None
    HAS_BASIC_PITCH = False


def is_basic_pitch_available() -> bool:
    """Check if Basic Pitch inference engine is installed and enabled via environment."""
    if not HAS_BASIC_PITCH or predict is None:
        return False
    enabled = os.getenv("ARPEGIA_ENABLE_BASIC_PITCH", "true").lower() != "false"
    return enabled


def classify_pitch_bend_technique(pitch_bends: Optional[Any]) -> str:
    """Classify guitar articulation technique from Spotify Basic Pitch note pitch bends.

    Rules:
    - Peak bend in the middle of the note (max(abs(b)) >= 1.5) -> "bend"
    - Monotonic pitch glide -> "slide"
    - Otherwise -> "normal"
    """
    if pitch_bends is None:
        return "normal"

    try:
        b = np.asarray(pitch_bends, dtype=float).flatten()
    except Exception:
        return "normal"

    if len(b) < 2:
        return "normal"

    max_abs = float(np.max(np.abs(b)))
    if max_abs < 0.5:
        return "normal"

    diffs = np.diff(b)
    total_change = abs(float(b[-1] - b[0]))

    # Monotonic pitch glide: consistent ascending or descending progression with noticeable net change
    is_mono_inc = bool(np.all(diffs >= -0.15) and total_change >= 0.8)
    is_mono_dec = bool(np.all(diffs <= 0.15) and total_change >= 0.8)
    is_monotonic_glide = is_mono_inc or is_mono_dec

    peak_idx = int(np.argmax(np.abs(b)))
    is_interior_peak = 0 < peak_idx < len(b) - 1

    if is_monotonic_glide and not is_interior_peak:
        return "slide"
    elif max_abs >= 1.5:
        return "bend"
    elif is_monotonic_glide:
        return "slide"

    return "normal"


def transcribe_polyphonic_guitar(
    audio_path: str,
    onset_threshold: float = 0.5,
    frame_threshold: float = 0.3,
    minimum_note_length: float = 58,
    minimum_frequency: Optional[float] = None,
    maximum_frequency: Optional[float] = None,
) -> List[Dict[str, Any]]:
    """Perform polyphonic audio-to-MIDI transcription on isolated guitar stem using Spotify Basic Pitch.

    Returns:
        List of note dictionaries with keys:
            start_time (float): Onset time in seconds
            duration (float): Note duration in seconds
            midi (int): MIDI note number (filtered to 40..88)
            note_name (str): Scientific pitch name (e.g. 'E2', 'A4')
            confidence (float): Transcription confidence (0.0 to 1.0)
            initial_technique (str): Articulation technique ('normal', 'bend', 'slide')
    """
    if not is_basic_pitch_available():
        return []

    if not audio_path or not os.path.exists(audio_path):
        return []

    try:
        kwargs: Dict[str, Any] = {
            "include_pitch_bends": True,
            "onset_threshold": onset_threshold,
            "frame_threshold": frame_threshold,
            "minimum_note_length": minimum_note_length,
        }
        if minimum_frequency is not None:
            kwargs["minimum_frequency"] = minimum_frequency
        if maximum_frequency is not None:
            kwargs["maximum_frequency"] = maximum_frequency

        if ICASSP_2022_MODEL_PATH is not None:
            _, _, note_events = predict(
                audio_path,
                ICASSP_2022_MODEL_PATH,
                **kwargs,
            )
        else:
            _, _, note_events = predict(
                audio_path,
                **kwargs,
            )
    except Exception:
        return []

    if not note_events:
        return []

    notes: List[Dict[str, Any]] = []

    for ev in note_events:
        # Basic pitch returns tuples: (start_time_s, end_time_s, pitch_midi, amplitude, pitch_bends)
        if isinstance(ev, (list, tuple)):
            t_start = float(ev[0])
            t_end = float(ev[1])
            midi_pitch = int(round(float(ev[2])))
            confidence = float(ev[3]) if len(ev) > 3 else 1.0
            pitch_bends = ev[4] if len(ev) > 4 else None
        elif isinstance(ev, dict):
            t_start = float(ev.get("start_time", 0.0))
            t_end = float(ev.get("end_time", t_start + ev.get("duration", 0.1)))
            midi_pitch = int(round(float(ev.get("pitch", ev.get("midi", 60)))))
            confidence = float(ev.get("amplitude", ev.get("confidence", 1.0)))
            pitch_bends = ev.get("pitch_bends")
        else:
            t_start = float(getattr(ev, "start_time", 0.0))
            t_end = float(getattr(ev, "end_time", t_start + getattr(ev, "duration", 0.1)))
            midi_pitch = int(round(float(getattr(ev, "pitch", getattr(ev, "midi", 60)))))
            confidence = float(getattr(ev, "amplitude", getattr(ev, "confidence", 1.0)))
            pitch_bends = getattr(ev, "pitch_bends", None)

        # Filter notes to playable guitar MIDI range: 40 (Low E2) to 88 (High E6)
        if midi_pitch < 40 or midi_pitch > 88:
            continue

        duration = max(0.05, round(t_end - t_start, 2))
        initial_technique = classify_pitch_bend_technique(pitch_bends)
        note_name = librosa.midi_to_note(midi_pitch)

        notes.append({
            "id": f"note-{len(notes) + 1}",
            "start_time": round(t_start, 2),
            "duration": duration,
            "midi": midi_pitch,
            "note_name": note_name,
            "confidence": round(min(1.0, max(0.0, confidence)), 2),
            "initial_technique": initial_technique,
            "technique": initial_technique,
        })

    # Time-sorted list
    notes.sort(key=lambda n: (n["start_time"], n["midi"]))
    for i, n in enumerate(notes):
        n["id"] = f"note-{i + 1}"

    return notes
