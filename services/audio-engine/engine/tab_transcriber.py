"""Audio-to-MIDI transcription, guitar fretboard pathfinding, and ASCII tablature engine."""

from typing import List, Dict, Any, Optional, Tuple, Literal
import math
import numpy as np
import librosa


# Standard 6-string guitar tuning from High E (string 1) to Low E (string 6)
# String 1 = E4 (MIDI 64)
# String 2 = B3 (MIDI 59)
# String 3 = G3 (MIDI 55)
# String 4 = D3 (MIDI 50)
# String 5 = A2 (MIDI 45)
# String 6 = E2 (MIDI 40)
DEFAULT_TUNING_PITCHES = {
    1: 64,  # High E4
    2: 59,  # B3
    3: 55,  # G3
    4: 50,  # D3
    5: 45,  # A2
    6: 40,  # Low E2
}

DEFAULT_GUITAR_TUNING = ["E2", "A2", "D3", "G3", "B3", "E4"]


class TabTranscriber:
    """Extracts note events from audio, computes optimal guitar fretboard path,

    segments into measures, and renders 6-line ASCII tablature.
    """

    def __init__(self, sample_rate: int = 22050, hop_length: int = 512):
        self.sample_rate = sample_rate
        self.hop_length = hop_length

    # =========================================================================
    # 1. Audio-to-MIDI Transcription
    # =========================================================================

    def extract_notes_from_audio(
        self,
        y: np.ndarray,
        sr: int,
        duration: float,
    ) -> List[Dict[str, Any]]:
        """Extract note onsets, durations, and fundamental pitches from audio."""
        if y is None or len(y) == 0 or duration <= 0:
            return []

        # Peak normalization
        max_val = np.max(np.abs(y))
        if max_val > 0:
            y_norm = y / max_val
        else:
            return []

        # 1. Onset detection with moderate debounce
        onset_env = librosa.onset.onset_strength(y=y_norm, sr=sr, hop_length=self.hop_length)
        onset_frames = librosa.onset.onset_detect(
            onset_envelope=onset_env,
            sr=sr,
            hop_length=self.hop_length,
            backtrack=True,
            pre_max=3,
            post_max=3,
            pre_avg=3,
            post_avg=3,
            delta=0.08,
            wait=8,
        )

        onset_times = librosa.frames_to_time(onset_frames, sr=sr, hop_length=self.hop_length)

        # 2. Fundamental frequency tracking via pYIN
        fmin = float(librosa.note_to_hz("E2")) * 0.9  # ~74 Hz
        fmax = float(librosa.note_to_hz("E6")) * 1.1  # ~1450 Hz

        try:
            f0, voiced_flag, voiced_probs = librosa.pyin(
                y_norm,
                fmin=fmin,
                fmax=fmax,
                sr=sr,
                hop_length=self.hop_length,
                frame_length=2048,
            )
            f0_times = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=self.hop_length)
        except Exception:
            f0 = np.full(len(onset_env), np.nan)
            voiced_flag = np.zeros(len(onset_env), dtype=bool)
            f0_times = librosa.frames_to_time(np.arange(len(f0)), sr=sr, hop_length=self.hop_length)

        # Build initial note boundary windows
        note_windows: List[Tuple[float, float]] = []
        if len(onset_times) == 0:
            # Fallback: check if continuous voiced audio exists without sharp onsets
            if np.any(voiced_flag):
                note_windows.append((0.0, duration))
        else:
            # Ensure start from beginning if initial sound exists
            first_onset = float(onset_times[0])
            if first_onset > 0.15 and np.any(voiced_flag[f0_times < first_onset]):
                note_windows.append((0.0, first_onset))

            for i in range(len(onset_times)):
                t_start = float(onset_times[i])
                if i < len(onset_times) - 1:
                    t_end = min(float(onset_times[i + 1]), duration)
                else:
                    t_end = duration

                dur = t_end - t_start
                if dur < 0.06:
                    continue
                note_windows.append((t_start, t_end))

        raw_notes: List[Dict[str, Any]] = []

        for idx, (t_start, t_end) in enumerate(note_windows):
            mask = (f0_times >= t_start) & (f0_times <= t_end)
            seg_f0 = f0[mask]
            seg_voiced = voiced_flag[mask]
            valid_pitches = seg_f0[seg_voiced & (~np.isnan(seg_f0))]

            pitch_hz = 0.0
            confidence = 0.8
            pitch_trajectory: List[float] = []

            if len(valid_pitches) > 0:
                pitch_hz = float(np.median(valid_pitches))
                pitch_trajectory = valid_pitches.tolist()
                confidence = float(np.mean(seg_voiced))
            else:
                # Fallback: FFT spectral peak analysis on slice
                i_start = int(t_start * sr)
                i_end = min(len(y_norm), int(t_end * sr))
                y_slice = y_norm[i_start:i_end]

                if len(y_slice) >= 512:
                    fft_res = np.abs(np.fft.rfft(y_slice * np.hanning(len(y_slice))))
                    freqs = np.fft.rfftfreq(len(y_slice), d=1.0 / sr)
                    band_mask = (freqs >= 75.0) & (freqs <= 1400.0)
                    if np.any(band_mask):
                        peak_idx = np.argmax(fft_res[band_mask])
                        pitch_hz = float(freqs[band_mask][peak_idx])
                        confidence = 0.65

            if pitch_hz <= 0.0:
                continue

            # Convert frequency to MIDI number
            midi_float = librosa.hz_to_midi(pitch_hz)
            midi_note = int(round(midi_float))

            # Clamp / octave shift to playable guitar range E2 (40) to E6 (88)
            while midi_note < 40:
                midi_note += 12
            while midi_note > 88:
                midi_note -= 12

            note_name = librosa.midi_to_note(midi_note)
            duration_val = round(max(0.08, t_end - t_start), 2)

            # Heuristic for internal pitch bend
            initial_technique = "normal"
            if len(pitch_trajectory) >= 4:
                first_half = np.median(pitch_trajectory[: len(pitch_trajectory) // 2])
                second_half = np.median(pitch_trajectory[len(pitch_trajectory) // 2 :])
                semi_diff = librosa.hz_to_midi(second_half) - librosa.hz_to_midi(first_half)
                if semi_diff >= 0.8:
                    initial_technique = "bend"

            raw_notes.append({
                "id": f"note-{len(raw_notes) + 1}",
                "start_time": round(t_start, 2),
                "duration": duration_val,
                "midi": midi_note,
                "note_name": note_name,
                "confidence": round(min(1.0, max(0.0, confidence)), 2),
                "technique": initial_technique,
            })

        # Merge contiguous identical notes (e.g. sustained notes fragmented by onset detector)
        if len(raw_notes) > 1:
            merged_notes: List[Dict[str, Any]] = [raw_notes[0]]
            for n in raw_notes[1:]:
                prev = merged_notes[-1]
                gap = n["start_time"] - (prev["start_time"] + prev["duration"])
                if n["midi"] == prev["midi"] and gap <= 0.08:
                    # Extend previous note
                    new_dur = round(n["start_time"] + n["duration"] - prev["start_time"], 2)
                    prev["duration"] = new_dur
                    prev["confidence"] = round((prev["confidence"] + n["confidence"]) / 2, 2)
                else:
                    merged_notes.append(n)
            # Re-index ids
            for i, n in enumerate(merged_notes):
                n["id"] = f"note-{i + 1}"
            return merged_notes

        return raw_notes

    # =========================================================================
    # 2. Guitar Fretboard Pathfinding Algorithm (Viterbi DP)
    # =========================================================================

    def _get_string_open_pitch(self, string_num: int, tuning: Optional[List[str]] = None, capo: int = 0) -> int:
        """Get MIDI pitch of an open guitar string (string 1=High E, string 6=Low E)."""
        if tuning and len(tuning) == 6:
            # Tuning is [Low E (6), A (5), D (4), G (3), B (2), High E (1)]
            tuning_idx = 6 - string_num
            base_midi = int(librosa.note_to_midi(tuning[tuning_idx]))
        else:
            base_midi = DEFAULT_TUNING_PITCHES.get(string_num, 64)

        return base_midi + capo

    def get_candidate_positions(
        self,
        midi_note: int,
        tuning: Optional[List[str]] = None,
        capo: int = 0,
    ) -> List[Tuple[int, int]]:
        """Return all valid (string: 1..6, fret: 0..24) pairs for a target MIDI pitch."""
        candidates = []
        for s in range(1, 7):
            open_pitch = self._get_string_open_pitch(s, tuning=tuning, capo=capo)
            fret = midi_note - open_pitch
            if 0 <= fret <= 24:
                candidates.append((s, fret))
        return candidates

    def map_notes_to_fretboard(
        self,
        notes: List[Dict[str, Any]],
        tuning: Optional[List[str]] = None,
        capo: int = 0,
    ) -> List[Dict[str, Any]]:
        """Map each MIDI note to an optimal (string: 1..6, fret: 0..24) position.

        Minimizes hand position shifts across consecutive notes using Dynamic Programming.
        """
        if not notes:
            return []

        # Find candidates for each note
        candidates_per_note: List[List[Tuple[int, int]]] = []
        for n in notes:
            cands = self.get_candidate_positions(n["midi"], tuning=tuning, capo=capo)
            if not cands:
                # Extreme pitch fallback: clamp to string 1 or 6
                if n["midi"] > 64:
                    cands = [(1, min(24, max(0, n["midi"] - 64)))]
                else:
                    cands = [(6, min(24, max(0, n["midi"] - 40)))]
            candidates_per_note.append(cands)

        K = len(notes)
        dp: List[List[float]] = []
        parent: List[List[int]] = []

        # Initialize note 0
        dp0 = []
        for s, f in candidates_per_note[0]:
            # Favor open string (f=0) or comfortable lower frets
            if f == 0:
                cost = 0.0
            else:
                cost = 0.05 * f
            dp0.append(cost)
        dp.append(dp0)
        parent.append([-1] * len(dp0))

        # Viterbi forward pass
        for i in range(1, K):
            curr_cands = candidates_per_note[i]
            prev_cands = candidates_per_note[i - 1]
            t_curr = notes[i]["start_time"]
            t_prev = notes[i - 1]["start_time"]
            dur_prev = notes[i - 1]["duration"]
            is_overlapping = t_curr < (t_prev + dur_prev - 0.04)

            dp_i = []
            parent_i = []

            for curr_s, curr_f in curr_cands:
                best_cost = float("inf")
                best_prev_idx = 0

                for prev_idx, (prev_s, prev_f) in enumerate(prev_cands):
                    prev_cost = dp[i - 1][prev_idx]

                    # Transition cost
                    trans_cost = 0.0

                    # 1. Polyphony constraint: cannot play two simultaneous notes on same string
                    if is_overlapping and curr_s == prev_s:
                        trans_cost += 500.0

                    # 2. Hand shift cost
                    if curr_s == prev_s and curr_f == prev_f:
                        # Exact same note position repeated
                        trans_cost += 0.0
                    elif curr_f == 0:
                        # Playing an open string does not shift hand position
                        trans_cost += 0.01
                    elif prev_f == 0:
                        # Moving from open string to fretted note
                        trans_cost += 0.05 * curr_f
                    else:
                        fret_dist = abs(curr_f - prev_f)
                        if fret_dist <= 4:
                            # Within 4-fret hand box
                            trans_cost += 0.10 * fret_dist
                        else:
                            # Hand position jump
                            trans_cost += 1.0 + 0.5 * (fret_dist - 4)

                    # 3. String distance
                    if not (curr_s == prev_s and curr_f == prev_f):
                        trans_cost += 0.10 * abs(curr_s - prev_s)

                    # 4. Ergonomic preference for lower frets unless higher register
                    if curr_f > 0:
                        trans_cost += 0.02 * curr_f

                    total_cost = prev_cost + trans_cost
                    if total_cost < best_cost:
                        best_cost = total_cost
                        best_prev_idx = prev_idx

                dp_i.append(best_cost)
                parent_i.append(best_prev_idx)

            dp.append(dp_i)
            parent.append(parent_i)

        # Backtrack optimal path
        best_end_idx = int(np.argmin(dp[-1]))
        optimal_positions: List[Tuple[int, int]] = [candidates_per_note[-1][best_end_idx]]

        curr_idx = best_end_idx
        for i in range(K - 1, 0, -1):
            curr_idx = parent[i][curr_idx]
            optimal_positions.append(candidates_per_note[i - 1][curr_idx])

        optimal_positions.reverse()

        # Update notes with string and fret
        fretted_notes: List[Dict[str, Any]] = []
        for i, n in enumerate(notes):
            s, f = optimal_positions[i]
            item = dict(n)
            item["string"] = int(s)
            item["fret"] = int(f)
            fretted_notes.append(item)

        return fretted_notes

    # =========================================================================
    # 3. Articulation Technique Heuristics
    # =========================================================================

    def detect_techniques(self, notes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Apply technique heuristics (hammer-on, pull-off, slide, bend) across notes."""
        if not notes:
            return []

        annotated: List[Dict[str, Any]] = []
        for i, curr in enumerate(notes):
            item = dict(curr)

            # Preserve bend if detected during f0 extraction
            if item.get("technique") == "bend":
                annotated.append(item)
                continue

            technique = "normal"
            if i > 0:
                prev = notes[i - 1]
                dt = curr["start_time"] - prev["start_time"]

                # Fast transition or legato on the same string
                if dt <= 0.40 and curr["string"] == prev["string"]:
                    f_diff = curr["fret"] - prev["fret"]
                    if f_diff > 0:
                        # Ascending pitch on same string
                        if 1 <= f_diff <= 3:
                            technique = "hammer-on"
                        else:
                            technique = "slide"
                    elif f_diff < 0:
                        # Descending pitch on same string
                        if 1 <= abs(f_diff) <= 3:
                            technique = "pull-off"
                        else:
                            technique = "slide"

            item["technique"] = technique
            annotated.append(item)

        return annotated

    # =========================================================================
    # 4. Measure Segmentation & Difficulty Estimation
    # =========================================================================

    def segment_into_measures(
        self,
        notes: List[Dict[str, Any]],
        duration: float,
        bpm: float = 120.0,
        time_signature: str = "4/4",
    ) -> List[Dict[str, Any]]:
        """Group notes chronologically into time-aligned TabMeasure buckets."""
        beats_per_measure = 4
        if "3" in time_signature:
            beats_per_measure = 3

        seconds_per_beat = 60.0 / max(1.0, float(bpm))
        measure_duration = beats_per_measure * seconds_per_beat

        total_measures = max(1, int(math.ceil(duration / measure_duration)))

        measures: List[Dict[str, Any]] = []
        for m in range(total_measures):
            m_start = round(m * measure_duration, 2)
            m_end = round(min(duration, (m + 1) * measure_duration), 2)
            measures.append({
                "measure_number": m + 1,
                "start_time": m_start,
                "end_time": m_end,
                "notes": [],
            })

        for n in notes:
            m_idx = min(total_measures - 1, max(0, int(n["start_time"] // measure_duration)))
            measures[m_idx]["notes"].append(n)

        # Sort notes within each measure chronologically
        for m in measures:
            m["notes"].sort(key=lambda x: x["start_time"])

        return measures

    def estimate_difficulty(self, notes: List[Dict[str, Any]], duration: float) -> str:
        """Estimate playability tier ('Beginner', 'Intermediate', 'Advanced')."""
        if not notes:
            return "Beginner"

        frets = [n["fret"] for n in notes]
        max_fret = max(frets) if frets else 0

        # Non-zero frets span
        fretted = [f for f in frets if f > 0]
        fret_span = (max(fretted) - min(fretted)) if len(fretted) >= 2 else 0

        note_density = len(notes) / max(1.0, duration)
        techniques = [n.get("technique", "normal") for n in notes]

        score = 0
        if max_fret >= 12:
            score += 2
        elif max_fret >= 7:
            score += 1

        if fret_span >= 6:
            score += 2
        elif fret_span >= 4:
            score += 1

        if note_density >= 4.0:
            score += 3
        elif note_density >= 2.0:
            score += 1

        if "bend" in techniques or "slide" in techniques:
            score += 1
        if techniques.count("hammer-on") + techniques.count("pull-off") >= 2:
            score += 1

        if score >= 5:
            return "Advanced"
        elif score >= 2:
            return "Intermediate"
        return "Beginner"

    # =========================================================================
    # 5. ASCII Tablature Generator
    # =========================================================================

    def render_ascii_tab(
        self,
        measures: List[Dict[str, Any]],
        tuning: Optional[List[str]] = None,
    ) -> str:
        """Render a clean 6-line ASCII tablature string with measure bars and technique indicators.

        String order:
        e| (string 1, High E)
        B| (string 2, B)
        G| (string 3, G)
        D| (string 4, D)
        A| (string 5, A)
        E| (string 6, Low E)
        """
        line_labels = ["e|", "B|", "G|", "D|", "A|", "E|"]

        if not measures:
            lines = [f"{label}-----------------|" for label in line_labels]
            return "\n".join(lines)

        rendered_measures_lines: List[List[str]] = []

        for m in measures:
            notes = m.get("notes", [])
            m_duration = max(0.1, m["end_time"] - m["start_time"])

            if not notes:
                empty_bar = ["-----------------|" for _ in range(6)]
                rendered_measures_lines.append(empty_bar)
                continue

            time_events: List[float] = []
            for n in notes:
                t = round(n["start_time"], 2)
                if not any(abs(t - te) < 0.05 for te in time_events):
                    time_events.append(t)
            time_events.sort()

            str_lines = ["-" for _ in range(6)]

            for t_ev in time_events:
                col_notes = [n for n in notes if abs(round(n["start_time"], 2) - t_ev) < 0.05]
                col_entries = {}

                for cn in col_notes:
                    s_idx = cn["string"] - 1  # 0 = High E, 5 = Low E
                    f_str = str(cn["fret"])
                    tech = cn.get("technique", "normal")
                    if tech == "hammer-on":
                        f_str += "h"
                    elif tech == "pull-off":
                        f_str += "p"
                    elif tech == "slide":
                        f_str += "/"
                    elif tech == "bend":
                        f_str += "b"
                    col_entries[s_idx] = f_str

                max_w = max(len(v) for v in col_entries.values()) if col_entries else 1
                col_width = max(max_w, 1)

                for s in range(6):
                    if s in col_entries:
                        val = col_entries[s]
                        pad = "-" * (col_width - len(val))
                        str_lines[s] += val + pad + "---"
                    else:
                        str_lines[s] += ("-" * col_width) + "---"

            min_width = 16
            curr_w = len(str_lines[0])
            if curr_w < min_width:
                add_dashes = "-" * (min_width - curr_w)
                for s in range(6):
                    str_lines[s] += add_dashes

            for s in range(6):
                str_lines[s] += "|"

            rendered_measures_lines.append(str_lines)

        total_lines = [line_labels[s] for s in range(6)]
        for m_lines in rendered_measures_lines:
            for s in range(6):
                total_lines[s] += m_lines[s]

        return "\n".join(total_lines)

    # =========================================================================
    # 6. Full Transcription Entrypoint
    # =========================================================================

    def transcribe(
        self,
        y: np.ndarray,
        sr: int,
        duration: float,
        bpm: float = 120.0,
        time_signature: str = "4/4",
        tuning: Optional[List[str]] = None,
        capo: int = 0,
    ) -> Dict[str, Any]:
        """Execute full tablature transcription pipeline and return TablatureData dictionary."""
        effective_tuning = tuning if tuning is not None else list(DEFAULT_GUITAR_TUNING)

        # 1. Pitch & onset extraction
        raw_notes = self.extract_notes_from_audio(y=y, sr=sr, duration=duration)

        # 2. Optimal fretboard pathfinding
        fretted_notes = self.map_notes_to_fretboard(raw_notes, tuning=effective_tuning, capo=capo)

        # 3. Articulation technique detection
        annotated_notes = self.detect_techniques(fretted_notes)

        # 4. Measure segmentation
        measures = self.segment_into_measures(
            notes=annotated_notes,
            duration=duration,
            bpm=bpm,
            time_signature=time_signature,
        )

        # 5. Difficulty estimation
        difficulty = self.estimate_difficulty(annotated_notes, duration=duration)

        # 6. ASCII tablature rendering
        ascii_tab = self.render_ascii_tab(measures, tuning=effective_tuning)

        return {
            "tuning": effective_tuning,
            "capo": capo,
            "difficulty": difficulty,
            "measures": measures,
            "ascii_tab": ascii_tab,
        }
