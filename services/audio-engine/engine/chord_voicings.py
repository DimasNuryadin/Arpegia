"""Guitar chord voicing and fretboard diagram generator."""

from typing import List, Dict, Any, Optional, Tuple
import re


class ChordVoicingGenerator:
    """Generates accurate 6-string guitar chord voicing diagrams (frets, fingers, base_fret)."""

    # Note name to semitone offset from C (C=0, C#=1, ..., B=11)
    NOTE_TO_SEMITONE = {
        "C": 0, "C#": 1, "DB": 1,
        "D": 2, "D#": 3, "EB": 3,
        "E": 4, "FB": 4, "E#": 5,
        "F": 5, "F#": 6, "GB": 6,
        "G": 7, "G#": 8, "AB": 8,
        "A": 9, "A#": 10, "BB": 10,
        "B": 11, "CB": 11, "B#": 0,
    }

    SEMITONE_TO_NOTE = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    # Canonical open and standard guitar chord shapes:
    # frets: [Low E (6), A (5), D (4), G (3), B (2), High E (1)]
    # fingers: [Low E (6), A (5), D (4), G (3), B (2), High E (1)]
    VOICING_LIBRARY: Dict[str, Dict[str, Any]] = {
        # --- C Roots ---
        "C": {"frets": [-1, 3, 2, 0, 1, 0], "fingers": [0, 3, 2, 0, 1, 0], "base_fret": 1},
        "Cm": {"frets": [-1, 3, 5, 5, 4, 3], "fingers": [0, 1, 3, 4, 2, 1], "base_fret": 3},
        "C7": {"frets": [-1, 3, 2, 3, 1, 0], "fingers": [0, 3, 2, 4, 1, 0], "base_fret": 1},
        "Cmaj7": {"frets": [-1, 3, 2, 0, 0, 0], "fingers": [0, 3, 2, 0, 0, 0], "base_fret": 1},
        "Cm7": {"frets": [-1, 3, 5, 3, 4, 3], "fingers": [0, 1, 3, 1, 2, 1], "base_fret": 3},
        "Cadd9": {"frets": [-1, 3, 2, 0, 3, 0], "fingers": [0, 2, 1, 0, 3, 0], "base_fret": 1},
        "Csus4": {"frets": [-1, 3, 3, 0, 1, 0], "fingers": [0, 3, 4, 0, 1, 0], "base_fret": 1},
        "Csus2": {"frets": [-1, 3, 0, 0, 1, 0], "fingers": [0, 3, 0, 0, 1, 0], "base_fret": 1},
        "C6": {"frets": [-1, 3, 2, 2, 1, 0], "fingers": [0, 3, 2, 2, 1, 0], "base_fret": 1},
        "C6/9": {"frets": [-1, 3, 2, 2, 3, 3], "fingers": [0, 2, 1, 1, 3, 4], "base_fret": 1},
        "Cmaj9": {"frets": [-1, 3, 2, 4, 3, -1], "fingers": [0, 2, 1, 4, 3, 0], "base_fret": 1},
        "C9": {"frets": [-1, 3, 2, 3, 3, 3], "fingers": [0, 2, 1, 3, 3, 3], "base_fret": 1},
        "Cm9": {"frets": [-1, 3, 1, 3, 3, 3], "fingers": [0, 2, 1, 3, 3, 3], "base_fret": 1},
        "C5": {"frets": [-1, 3, 5, 5, -1, -1], "fingers": [0, 1, 3, 4, 0, 0], "base_fret": 3},

        # --- D Roots ---
        "D": {"frets": [-1, -1, 0, 2, 3, 2], "fingers": [0, 0, 0, 1, 3, 2], "base_fret": 1},
        "Dm": {"frets": [-1, -1, 0, 2, 3, 1], "fingers": [0, 0, 0, 2, 3, 1], "base_fret": 1},
        "D7": {"frets": [-1, -1, 0, 2, 1, 2], "fingers": [0, 0, 0, 2, 1, 3], "base_fret": 1},
        "Dmaj7": {"frets": [-1, -1, 0, 2, 2, 2], "fingers": [0, 0, 0, 1, 1, 1], "base_fret": 1},
        "Dm7": {"frets": [-1, -1, 0, 2, 1, 1], "fingers": [0, 0, 0, 2, 1, 1], "base_fret": 1},
        "Dadd9": {"frets": [-1, -1, 0, 2, 3, 0], "fingers": [0, 0, 0, 1, 2, 0], "base_fret": 1},
        "Dsus4": {"frets": [-1, -1, 0, 2, 3, 3], "fingers": [0, 0, 0, 1, 2, 3], "base_fret": 1},
        "Dsus2": {"frets": [-1, -1, 0, 2, 3, 0], "fingers": [0, 0, 0, 1, 2, 0], "base_fret": 1},
        "D6": {"frets": [-1, -1, 0, 2, 0, 2], "fingers": [0, 0, 0, 1, 0, 2], "base_fret": 1},
        "D6/9": {"frets": [-1, 5, 4, 4, 5, 5], "fingers": [0, 2, 1, 1, 3, 4], "base_fret": 4},
        "Dmaj9": {"frets": [-1, 5, 4, 6, 5, -1], "fingers": [0, 2, 1, 4, 3, 0], "base_fret": 4},
        "D9": {"frets": [-1, 5, 4, 5, 5, 5], "fingers": [0, 2, 1, 3, 3, 3], "base_fret": 4},
        "Dm9": {"frets": [-1, 5, 3, 5, 5, 5], "fingers": [0, 2, 1, 3, 3, 3], "base_fret": 3},
        "D5": {"frets": [-1, -1, 0, 2, 3, -1], "fingers": [0, 0, 0, 1, 2, 0], "base_fret": 1},

        # --- E Roots ---
        "E": {"frets": [0, 2, 2, 1, 0, 0], "fingers": [0, 2, 3, 1, 0, 0], "base_fret": 1},
        "Em": {"frets": [0, 2, 2, 0, 0, 0], "fingers": [0, 2, 3, 0, 0, 0], "base_fret": 1},
        "E7": {"frets": [0, 2, 0, 1, 0, 0], "fingers": [0, 2, 0, 1, 0, 0], "base_fret": 1},
        "Emaj7": {"frets": [0, 2, 1, 1, 0, 0], "fingers": [0, 3, 1, 2, 0, 0], "base_fret": 1},
        "Em7": {"frets": [0, 2, 0, 0, 0, 0], "fingers": [0, 1, 0, 0, 0, 0], "base_fret": 1},
        "Eadd9": {"frets": [0, 2, 4, 1, 0, 0], "fingers": [0, 2, 4, 1, 0, 0], "base_fret": 1},
        "Esus4": {"frets": [0, 2, 2, 2, 0, 0], "fingers": [0, 2, 3, 4, 0, 0], "base_fret": 1},
        "Esus2": {"frets": [0, 2, 4, 4, 0, 0], "fingers": [0, 1, 3, 4, 0, 0], "base_fret": 1},
        "E6": {"frets": [0, 2, 2, 1, 2, 0], "fingers": [0, 2, 3, 1, 4, 0], "base_fret": 1},
        "E6/9": {"frets": [0, 2, 2, 1, 2, 2], "fingers": [0, 2, 3, 1, 4, 4], "base_fret": 1},
        "Em9": {"frets": [0, 2, 0, 0, 0, 2], "fingers": [0, 1, 0, 0, 0, 2], "base_fret": 1},
        "Em11": {"frets": [0, 0, 0, 0, 0, 0], "fingers": [0, 0, 0, 0, 0, 0], "base_fret": 1},
        "E9": {"frets": [0, 2, 0, 1, 0, 2], "fingers": [0, 2, 0, 1, 0, 3], "base_fret": 1},
        "E5": {"frets": [0, 2, 2, -1, -1, -1], "fingers": [0, 1, 2, 0, 0, 0], "base_fret": 1},

        # --- F Roots ---
        "F": {"frets": [1, 3, 3, 2, 1, 1], "fingers": [1, 3, 4, 2, 1, 1], "base_fret": 1},
        "Fm": {"frets": [1, 3, 3, 1, 1, 1], "fingers": [1, 3, 4, 1, 1, 1], "base_fret": 1},
        "F7": {"frets": [1, 3, 1, 2, 1, 1], "fingers": [1, 3, 1, 2, 1, 1], "base_fret": 1},
        "Fmaj7": {"frets": [-1, -1, 3, 2, 1, 0], "fingers": [0, 0, 3, 2, 1, 0], "base_fret": 1},
        "Fm7": {"frets": [1, 3, 1, 1, 1, 1], "fingers": [1, 3, 1, 1, 1, 1], "base_fret": 1},
        "Fsus4": {"frets": [1, 3, 3, 3, 1, 1], "fingers": [1, 3, 4, 4, 1, 1], "base_fret": 1},
        "Fadd9": {"frets": [-1, -1, 3, 2, 1, 3], "fingers": [0, 0, 3, 2, 1, 4], "base_fret": 1},
        "F5": {"frets": [1, 3, 3, -1, -1, -1], "fingers": [1, 3, 4, 0, 0, 0], "base_fret": 1},

        # --- G Roots ---
        "G": {"frets": [3, 2, 0, 0, 0, 3], "fingers": [2, 1, 0, 0, 0, 3], "base_fret": 1},
        "Gm": {"frets": [3, 5, 5, 3, 3, 3], "fingers": [1, 3, 4, 1, 1, 1], "base_fret": 3},
        "G7": {"frets": [3, 2, 0, 0, 0, 1], "fingers": [3, 2, 0, 0, 0, 1], "base_fret": 1},
        "Gmaj7": {"frets": [3, 2, 0, 0, 0, 2], "fingers": [3, 2, 0, 0, 0, 1], "base_fret": 1},
        "Gm7": {"frets": [3, 5, 3, 3, 3, 3], "fingers": [1, 3, 1, 1, 1, 1], "base_fret": 3},
        "Gadd9": {"frets": [3, 2, 0, 2, 0, 3], "fingers": [2, 1, 0, 3, 0, 4], "base_fret": 1},
        "Gsus4": {"frets": [3, 3, 0, 0, 1, 3], "fingers": [2, 3, 0, 0, 1, 4], "base_fret": 1},
        "Gsus2": {"frets": [3, 0, 0, 0, 3, 3], "fingers": [1, 0, 0, 0, 3, 4], "base_fret": 1},
        "G6": {"frets": [3, 2, 0, 0, 0, 0], "fingers": [2, 1, 0, 0, 0, 0], "base_fret": 1},
        "G6/9": {"frets": [3, 2, 0, 2, 0, 0], "fingers": [2, 1, 0, 3, 0, 0], "base_fret": 1},
        "Gmaj9": {"frets": [3, -1, 0, 2, 0, 2], "fingers": [2, 0, 0, 1, 0, 3], "base_fret": 1},
        "G9": {"frets": [3, 2, 0, 2, 0, 1], "fingers": [3, 2, 0, 4, 0, 1], "base_fret": 1},
        "Gm9": {"frets": [3, 5, 3, 3, 3, 5], "fingers": [1, 3, 1, 1, 1, 4], "base_fret": 3},
        "G13": {"frets": [3, -1, 3, 4, 5, -1], "fingers": [1, 0, 1, 2, 3, 0], "base_fret": 3},
        "G5": {"frets": [3, 5, 5, -1, -1, -1], "fingers": [1, 3, 4, 0, 0, 0], "base_fret": 3},

        # --- A Roots ---
        "A": {"frets": [-1, 0, 2, 2, 2, 0], "fingers": [0, 0, 1, 2, 3, 0], "base_fret": 1},
        "Am": {"frets": [-1, 0, 2, 2, 1, 0], "fingers": [0, 0, 2, 3, 1, 0], "base_fret": 1},
        "A7": {"frets": [-1, 0, 2, 0, 2, 0], "fingers": [0, 0, 2, 0, 3, 0], "base_fret": 1},
        "Amaj7": {"frets": [-1, 0, 2, 1, 2, 0], "fingers": [0, 0, 2, 1, 3, 0], "base_fret": 1},
        "Am7": {"frets": [-1, 0, 2, 0, 1, 0], "fingers": [0, 0, 2, 0, 1, 0], "base_fret": 1},
        "Aadd9": {"frets": [-1, 0, 2, 4, 2, 0], "fingers": [0, 0, 1, 3, 2, 0], "base_fret": 1},
        "Asus4": {"frets": [-1, 0, 2, 2, 3, 0], "fingers": [0, 0, 1, 2, 3, 0], "base_fret": 1},
        "Asus2": {"frets": [-1, 0, 2, 2, 0, 0], "fingers": [0, 0, 1, 2, 0, 0], "base_fret": 1},
        "A6": {"frets": [-1, 0, 2, 2, 2, 2], "fingers": [0, 0, 1, 1, 1, 1], "base_fret": 1},
        "A6/9": {"frets": [-1, 0, 2, 4, 2, 2], "fingers": [0, 0, 1, 4, 2, 3], "base_fret": 1},
        "Amaj9": {"frets": [-1, 0, 2, 1, 0, 0], "fingers": [0, 0, 2, 1, 0, 0], "base_fret": 1},
        "A9": {"frets": [-1, 0, 2, 4, 2, 3], "fingers": [0, 0, 1, 3, 1, 2], "base_fret": 1},
        "Am9": {"frets": [-1, 0, 2, 4, 1, 0], "fingers": [0, 0, 2, 4, 1, 0], "base_fret": 1},
        "Am11": {"frets": [-1, 0, 0, 0, 1, 0], "fingers": [0, 0, 0, 0, 1, 0], "base_fret": 1},
        "A5": {"frets": [-1, 0, 2, 2, -1, -1], "fingers": [0, 0, 1, 2, 0, 0], "base_fret": 1},

        # --- B Roots ---
        "B": {"frets": [-1, 2, 4, 4, 4, 2], "fingers": [0, 1, 2, 3, 4, 1], "base_fret": 2},
        "Bm": {"frets": [-1, 2, 4, 4, 3, 2], "fingers": [0, 1, 3, 4, 2, 1], "base_fret": 2},
        "B7": {"frets": [-1, 2, 1, 2, 0, 2], "fingers": [0, 2, 1, 3, 0, 4], "base_fret": 1},
        "Bmaj7": {"frets": [-1, 2, 4, 3, 4, 2], "fingers": [0, 1, 3, 2, 4, 1], "base_fret": 2},
        "Bm7": {"frets": [-1, 2, 4, 2, 3, 2], "fingers": [0, 1, 3, 1, 2, 1], "base_fret": 2},
        "Bsus4": {"frets": [-1, 2, 4, 4, 5, 2], "fingers": [0, 1, 2, 3, 4, 1], "base_fret": 2},
        "Bsus2": {"frets": [-1, 2, 4, 4, 2, 2], "fingers": [0, 1, 3, 4, 1, 1], "base_fret": 2},
        "B5": {"frets": [-1, 2, 4, 4, -1, -1], "fingers": [0, 1, 3, 4, 0, 0], "base_fret": 2},

        # --- Common Slash Chords ---
        "C/E": {"frets": [0, 3, 2, 0, 1, 0], "fingers": [0, 3, 2, 0, 1, 0], "base_fret": 1},
        "C/G": {"frets": [3, 3, 2, 0, 1, 0], "fingers": [3, 4, 2, 0, 1, 0], "base_fret": 1},
        "G/B": {"frets": [-1, 2, 0, 0, 0, 3], "fingers": [0, 1, 0, 0, 0, 3], "base_fret": 1},
        "D/F#": {"frets": [2, 0, 0, 2, 3, 2], "fingers": [1, 0, 0, 2, 4, 3], "base_fret": 1},
        "F/A": {"frets": [-1, 0, 3, 2, 1, 1], "fingers": [0, 0, 3, 2, 1, 1], "base_fret": 1},
        "Am/G": {"frets": [3, 0, 2, 2, 1, 0], "fingers": [3, 0, 1, 2, 1, 0], "base_fret": 1},
    }

    def __init__(self):
        pass

    def _clean_chord_symbol(self, chord_str: str) -> str:
        """Strip annotations, comments, and arrows from chord string."""
        if not chord_str:
            return "C"
        s = chord_str.strip()
        # Remove parenthetical descriptions like (add9), (open voicing), (open drone)
        # Note: if it's (add9), we want to retain add9
        s = re.sub(r"\(open.*?\)", "", s, flags=re.IGNORECASE)
        s = re.sub(r"\(.*?drone.*?\)", "", s, flags=re.IGNORECASE)
        # Convert (add9) -> add9
        s = s.replace("(add9)", "add9").replace("(add11)", "add11")
        # Strip arrows e.g. "sus4 -> G" -> "sus4"
        if "->" in s:
            s = s.split("->")[0].strip()
        return s.strip()

    def _parse_root_and_suffix(self, chord_str: str) -> Tuple[str, str, Optional[str]]:
        """Parse chord string into root, suffix/quality, and optional bass note."""
        cleaned = self._clean_chord_symbol(chord_str)

        # Check for slash chord
        bass = None
        if "/" in cleaned:
            parts = cleaned.split("/")
            # E.g. 6/9 is not a slash chord!
            if parts[0].endswith("6") and parts[1].startswith("9"):
                pass  # It's a 6/9 chord
            elif len(parts) == 2 and re.match(r"^[A-G][#b]?", parts[1]):
                cleaned = parts[0]
                bass = parts[1].strip()

        match = re.match(r"^([A-G][#b]?)(.*)$", cleaned)
        if not match:
            return "C", "major", bass

        root = match.group(1).upper()
        suffix = match.group(2).strip()

        # Normalize flats to sharps for consistent indexing
        flat_map = {"DB": "C#", "EB": "D#", "GB": "F#", "AB": "G#", "BB": "A#"}
        root = flat_map.get(root, root)

        return root, suffix, bass

    def _generate_barre_chord(self, root: str, quality: str) -> Dict[str, Any]:
        """Generate movable CAGED barre chord shape based on root semitone."""
        root_semi = self.NOTE_TO_SEMITONE.get(root, 0)

        # 6th string root (E-shape barre): Low E is E2 (semitone 4)
        fret_6 = (root_semi - 4) % 12
        if fret_6 == 0:
            fret_6 = 12

        # 5th string root (A-shape barre): A string is A2 (semitone 9)
        fret_5 = (root_semi - 9) % 12
        if fret_5 == 0:
            fret_5 = 12

        # Choose lower, more playable fret position
        q = quality.lower()
        if "m" in q and "maj" not in q:
            # Minor quality
            if fret_6 <= fret_5 and fret_6 <= 10:
                frets = [fret_6, fret_6 + 2, fret_6 + 2, fret_6, fret_6, fret_6]
                fingers = [1, 3, 4, 1, 1, 1]
                base_fret = max(1, fret_6)
            else:
                frets = [-1, fret_5, fret_5 + 2, fret_5 + 2, fret_5 + 1, fret_5]
                fingers = [0, 1, 3, 4, 2, 1]
                base_fret = max(1, fret_5)
        elif "7" in q and "maj" not in q and "m" not in q:
            # Dominant 7th
            if fret_6 <= fret_5 and fret_6 <= 10:
                frets = [fret_6, fret_6 + 2, fret_6, fret_6 + 1, fret_6, fret_6]
                fingers = [1, 3, 1, 2, 1, 1]
                base_fret = max(1, fret_6)
            else:
                frets = [-1, fret_5, fret_5 + 2, fret_5, fret_5 + 2, fret_5]
                fingers = [0, 1, 3, 1, 4, 1]
                base_fret = max(1, fret_5)
        elif "maj7" in q:
            # Major 7th
            if fret_5 <= 10:
                frets = [-1, fret_5, fret_5 + 2, fret_5 + 1, fret_5 + 2, fret_5]
                fingers = [0, 1, 3, 2, 4, 1]
                base_fret = max(1, fret_5)
            else:
                frets = [fret_6, fret_6 + 2, fret_6 + 1, fret_6 + 1, fret_6, fret_6]
                fingers = [1, 3, 2, 2, 1, 1]
                base_fret = max(1, fret_6)
        elif "sus4" in q:
            frets = [-1, fret_5, fret_5 + 2, fret_5 + 2, fret_5 + 3, fret_5]
            fingers = [0, 1, 2, 3, 4, 1]
            base_fret = max(1, fret_5)
        else:
            # Major
            if fret_6 <= fret_5 and fret_6 <= 10:
                frets = [fret_6, fret_6 + 2, fret_6 + 2, fret_6 + 1, fret_6, fret_6]
                fingers = [1, 3, 4, 2, 1, 1]
                base_fret = max(1, fret_6)
            else:
                frets = [-1, fret_5, fret_5 + 2, fret_5 + 2, fret_5 + 2, fret_5]
                fingers = [0, 1, 2, 3, 4, 1]
                base_fret = max(1, fret_5)

        # Clamp frets to max 24
        frets = [min(24, f) if f >= 0 else -1 for f in frets]
        base_fret = min(24, max(1, base_fret))

        return {"frets": frets, "fingers": fingers, "base_fret": base_fret}

    def get_chord_diagram(self, chord_name: str) -> Dict[str, Any]:
        """Generate a complete 6-string guitar chord diagram matching schema contracts."""
        if not chord_name or chord_name == "N":
            chord_name = "C"

        cleaned = self._clean_chord_symbol(chord_name)

        # 1. Direct dictionary match
        if cleaned in self.VOICING_LIBRARY:
            v = self.VOICING_LIBRARY[cleaned]
            return {
                "chord": chord_name,
                "frets": list(v["frets"]),
                "fingers": list(v["fingers"]),
                "base_fret": v.get("base_fret", 1),
            }

        # 2. Parse root, suffix, bass
        root, suffix, bass = self._parse_root_and_suffix(cleaned)
        normalized_chord = f"{root}{suffix}"

        if normalized_chord in self.VOICING_LIBRARY:
            v = self.VOICING_LIBRARY[normalized_chord]
            return {
                "chord": chord_name,
                "frets": list(v["frets"]),
                "fingers": list(v["fingers"]),
                "base_fret": v.get("base_fret", 1),
            }

        # 3. Quality simplification fallback
        simplified_suffixes = []
        if "maj7#11" in suffix or "maj9" in suffix or "maj7" in suffix:
            simplified_suffixes.extend(["maj7", "add9", ""])
        elif "m11" in suffix or "m9" in suffix or "m7" in suffix:
            simplified_suffixes.extend(["m7", "m"])
        elif "6/9" in suffix or "add9" in suffix:
            simplified_suffixes.extend(["add9", ""])
        elif "13" in suffix or "9" in suffix or "7alt" in suffix or "7" in suffix:
            simplified_suffixes.extend(["7", ""])
        elif "sus" in suffix:
            simplified_suffixes.extend(["sus4", "sus2", ""])
        else:
            simplified_suffixes.append("")

        for s in simplified_suffixes:
            cand = f"{root}{s}"
            if cand in self.VOICING_LIBRARY:
                v = self.VOICING_LIBRARY[cand]
                return {
                    "chord": chord_name,
                    "frets": list(v["frets"]),
                    "fingers": list(v["fingers"]),
                    "base_fret": v.get("base_fret", 1),
                }

        # 4. Movable CAGED barre chord generator
        barre = self._generate_barre_chord(root, suffix)
        return {
            "chord": chord_name,
            "frets": barre["frets"],
            "fingers": barre["fingers"],
            "base_fret": barre["base_fret"],
        }

    def generate_diagrams_for_analysis(
        self,
        chords: List[Dict[str, Any]],
        improvisations: Optional[List[Dict[str, Any]]] = None,
    ) -> List[Dict[str, Any]]:
        """Generate chord diagrams for all detected chords and suggested improvisations.

        Eliminates duplicates while preserving chronological discovery order.
        """
        seen_chords = set()
        diagrams: List[Dict[str, Any]] = []

        # 1. Detected progression chords
        for c in chords:
            sym = c.get("chord")
            if sym and sym != "N" and sym not in seen_chords:
                seen_chords.add(sym)
                diagrams.append(self.get_chord_diagram(sym))

        # 2. Improvisation suggestions
        if improvisations:
            for imp in improvisations:
                for sug in imp.get("suggestions", []):
                    if sug and sug not in seen_chords:
                        seen_chords.add(sug)
                        diagrams.append(self.get_chord_diagram(sug))

        # If empty audio or no chords detected, default to C major diagram
        if not diagrams:
            diagrams.append(self.get_chord_diagram("C"))

        return diagrams
