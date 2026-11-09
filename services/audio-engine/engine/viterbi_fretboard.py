"""Viterbi Dynamic Programming algorithm for optimal guitar fretboard pathfinding and articulation analysis."""

from typing import List, Dict, Any, Optional, Tuple
import numpy as np
import librosa


# Standard 6-string guitar tuning from High E (string 1) to Low E (string 6)
# String 1 = E4 (MIDI 64)
# String 2 = B3 (MIDI 59)
# String 3 = G3 (MIDI 55)
# String 4 = D3 (MIDI 50)
# String 5 = A2 (MIDI 45)
# String 6 = E2 (MIDI 40)
DEFAULT_TUNING_PITCHES: Dict[int, int] = {
    1: 64,  # High E4
    2: 59,  # B3
    3: 55,  # G3
    4: 50,  # D3
    5: 45,  # A2
    6: 40,  # Low E2
}

DEFAULT_GUITAR_TUNING: List[str] = ["E2", "A2", "D3", "G3", "B3", "E4"]


def get_string_open_pitch(
    string_num: int,
    tuning: Optional[List[str]] = None,
    capo: int = 0,
) -> int:
    """Get open MIDI pitch for string_num (1 = High E to 6 = Low E) with capo offset."""
    if tuning and len(tuning) == 6:
        # Tuning is ordered Low E (string 6) to High E (string 1)
        tuning_idx = 6 - string_num
        base_midi = int(librosa.note_to_midi(tuning[tuning_idx]))
    else:
        base_midi = DEFAULT_TUNING_PITCHES.get(string_num, 64)
    return base_midi + capo


def get_candidate_positions(
    midi_note: int,
    tuning: Optional[List[str]] = None,
    capo: int = 0,
) -> List[Tuple[int, int]]:
    """Generate all valid (string: 1..6, fret: 0..24) physical positions for a MIDI note."""
    candidates: List[Tuple[int, int]] = []
    for s in range(1, 7):
        open_pitch = get_string_open_pitch(s, tuning=tuning, capo=capo)
        fret = midi_note - open_pitch
        if 0 <= fret <= 24:
            candidates.append((s, fret))

    if not candidates:
        # Fallback clamping for extreme registers
        if midi_note > 64:
            candidates = [(1, min(24, max(0, midi_note - (64 + capo))))]
        else:
            candidates = [(6, min(24, max(0, midi_note - (40 + capo))))]

    return candidates


def assign_optimal_fretboard_path(
    notes: List[Dict[str, Any]],
    tuning: Optional[List[str]] = None,
    capo: int = 0,
) -> List[Dict[str, Any]]:
    """Solve the globally optimal guitar fretboard path via Viterbi Dynamic Programming.

    Constraints & Cost Factors:
    - Candidate positions: All valid (string: 1..6, fret: 0..24) for each MIDI note.
    - Large fret jumps (abs(curr_fret - prev_fret)) penalized, heavily if inter-onset time dt < 0.18s.
    - Simultaneous polyphonic notes (dt < 0.04s) penalized heavily (+999.0) if assigned same string.
    - Ergonomics: Favors open strings (fret == 0) and lower hand positions (fret <= 12).
    - Post-Viterbi articulation heuristics:
        * Consecutive same-string notes with 0.04s <= dt <= 0.22s:
            - 1 <= fret_diff <= 3  -> "hammer-on"
            - -3 <= fret_diff <= -1 -> "pull-off"
            - abs(fret_diff) > 3   -> "slide"
    - Phase 3 voice role assignment:
        * string >= 5        -> "bass"
        * string in (3, 4)   -> "harmony"
        * string <= 2        -> "melody"

    Returns:
        List of note dictionaries populated with string, fret, technique, and voice.
    """
    if not notes:
        return []

    effective_tuning = tuning if tuning is not None else list(DEFAULT_GUITAR_TUNING)

    # Sort notes chronologically, secondary by MIDI pitch
    sorted_notes: List[Dict[str, Any]] = sorted(
        notes,
        key=lambda n: (float(n.get("start_time", 0.0)), int(n.get("midi", 60))),
    )

    K = len(sorted_notes)
    candidates_per_note: List[List[Tuple[int, int]]] = [
        get_candidate_positions(int(n["midi"]), tuning=effective_tuning, capo=capo)
        for n in sorted_notes
    ]

    dp: List[List[float]] = []
    parent: List[List[int]] = []

    # 1. Base step: Note 0 emission/position cost
    dp0: List[float] = []
    for s, f in candidates_per_note[0]:
        if f == 0:
            cost = 0.0
        elif f <= 12:
            cost = 0.05 * f
        else:
            cost = 0.05 * 12 + 0.20 * (f - 12)
        dp0.append(cost)

    dp.append(dp0)
    parent.append([-1] * len(dp0))

    # 2. Viterbi Forward Pass
    for i in range(1, K):
        curr_cands = candidates_per_note[i]
        prev_cands = candidates_per_note[i - 1]
        t_curr = float(sorted_notes[i].get("start_time", 0.0))
        t_prev = float(sorted_notes[i - 1].get("start_time", 0.0))
        dt = abs(t_curr - t_prev)

        dp_i: List[float] = []
        parent_i: List[int] = []

        for curr_s, curr_f in curr_cands:
            best_cost = float("inf")
            best_prev_idx = 0

            for prev_idx, (prev_s, prev_f) in enumerate(prev_cands):
                prev_cost = dp[i - 1][prev_idx]
                trans_cost = 0.0

                # Polyphonic constraint: simultaneous notes (dt < 0.04s) cannot share the same string
                if dt < 0.04:
                    simultaneous_strings = {prev_s}
                    step_b = i - 1
                    idx_b = prev_idx
                    while step_b > 0 and abs(t_curr - float(sorted_notes[step_b - 1].get("start_time", 0.0))) < 0.04:
                        idx_b = parent[step_b][idx_b]
                        step_b -= 1
                        simultaneous_strings.add(candidates_per_note[step_b][idx_b][0])

                    if curr_s in simultaneous_strings:
                        trans_cost += 999.0

                # Fret jump and hand position costs
                if curr_f == 0 and prev_f == 0:
                    trans_cost += 0.0
                elif curr_f == 0:
                    trans_cost += 0.01  # Playing an open string does not shift hand position
                elif prev_f == 0:
                    trans_cost += 0.04 * min(12, curr_f) + max(0, curr_f - 12) * 0.15
                else:
                    fret_dist = abs(curr_f - prev_f)
                    if fret_dist <= 4:
                        trans_cost += 0.10 * fret_dist
                    else:
                        jump_cost = 1.0 + 0.5 * (fret_dist - 4)
                        if dt < 0.18:
                            # Heavy penalty for fast hand shifts
                            jump_cost *= (2.0 + (0.18 - dt) * 15.0)
                        trans_cost += jump_cost

                # String distance cost (for sequential notes)
                if dt >= 0.04:
                    trans_cost += 0.12 * abs(curr_s - prev_s)

                # Ergonomic preference for open strings and lower frets (fret <= 12)
                if curr_f > 12:
                    trans_cost += 0.15 * (curr_f - 12)
                elif curr_f > 0:
                    trans_cost += 0.02 * curr_f

                total_cost = prev_cost + trans_cost
                if total_cost < best_cost:
                    best_cost = total_cost
                    best_prev_idx = prev_idx

            dp_i.append(best_cost)
            parent_i.append(best_prev_idx)

        dp.append(dp_i)
        parent.append(parent_i)

    # 3. Backtrack optimal path
    best_end_idx = int(np.argmin(dp[-1]))
    optimal_path: List[Tuple[int, int]] = [candidates_per_note[-1][best_end_idx]]

    curr_idx = best_end_idx
    for i in range(K - 1, 0, -1):
        curr_idx = parent[i][curr_idx]
        optimal_path.append(candidates_per_note[i - 1][curr_idx])

    optimal_path.reverse()

    # Assign physical string and fret
    fretted_notes: List[Dict[str, Any]] = []
    for i, n in enumerate(sorted_notes):
        item = dict(n)
        s, f = optimal_path[i]
        item["string"] = int(s)
        item["fret"] = int(f)
        fretted_notes.append(item)

    # 4. Post-Viterbi Articulation Heuristics (0.04s <= dt <= 0.22s on same string)
    for i in range(len(fretted_notes)):
        curr = fretted_notes[i]
        # Preserve bend detected from audio pitch analysis
        if curr.get("technique") == "bend":
            continue

        technique = curr.get("technique", "normal")
        if technique not in ("hammer-on", "pull-off", "slide", "bend"):
            technique = "normal"

        if i > 0:
            prev = fretted_notes[i - 1]
            dt = float(curr["start_time"]) - float(prev["start_time"])
            if 0.04 <= dt <= 0.22 and curr["string"] == prev["string"]:
                fret_diff = curr["fret"] - prev["fret"]
                if 1 <= fret_diff <= 3:
                    technique = "hammer-on"
                elif -3 <= fret_diff <= -1:
                    technique = "pull-off"
                elif abs(fret_diff) > 3:
                    technique = "slide"

        curr["technique"] = technique

    # 5. Assign Phase 3 Voice Role:
    # string >= 5 -> "bass", string in (3, 4) -> "harmony", string <= 2 -> "melody"
    for n in fretted_notes:
        s = n["string"]
        if s >= 5:
            role = "bass"
        elif s in (3, 4):
            role = "harmony"
        else:
            role = "melody"
        n["voice"] = role

    # Ensure IDs are present and sequential
    for i, n in enumerate(fretted_notes):
        if not n.get("id"):
            n["id"] = f"note-{i + 1}"

    return fretted_notes
