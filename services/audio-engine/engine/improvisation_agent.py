"""Rule-based and AI-driven chord improvisation and substitution agent."""

from typing import List, Dict, Any, Optional
import os
import re


class ImprovisationAgent:
    """Generates style-based harmonic chord substitutions (Neo Soul, Jazz, Pop, Fingerstyle)."""

    PITCHES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

    # Enharmonic mapping for clean guitar notation
    ENHARMONIC = {
        "Db": "C#", "Eb": "D#", "Gb": "F#", "Ab": "G#", "Bb": "A#",
    }

    SUPPORTED_STYLES = ["Neo Soul", "Jazz", "Pop", "Fingerstyle"]

    def __init__(self, use_llm: bool = False, model_name: Optional[str] = None):
        self.use_llm = use_llm
        self.model_name = model_name

    def _parse_chord(self, chord_str: str) -> Dict[str, str]:
        """Parse a chord symbol like 'G', 'Am', 'Cmaj7', 'F#7', 'Gsus4' into root and quality."""
        if not chord_str or chord_str == "N":
            return {"root": "C", "quality": "major", "raw": chord_str}

        # Match root (e.g., C, C#, Bb) and suffix
        pattern = r"^([A-G][#b]?)(.*)$"
        match = re.match(pattern, chord_str.strip())
        if not match:
            return {"root": "C", "quality": "major", "raw": chord_str}

        root, suffix = match.groups()
        # Normalize root to sharp representation if flat
        root = self.ENHARMONIC.get(root, root)

        suffix = suffix.strip()
        if suffix in ["", "maj", "M", "Maj"]:
            quality = "major"
        elif suffix in ["m", "min", "Min"]:
            quality = "minor"
        elif suffix in ["7", "dom7"]:
            quality = "7"
        elif suffix in ["maj7", "Maj7", "M7", "Δ7"]:
            quality = "maj7"
        elif suffix in ["m7", "min7", "-7"]:
            quality = "m7"
        elif suffix in ["sus4", "sus", "4"]:
            quality = "sus4"
        else:
            quality = suffix

        return {"root": root, "quality": quality, "raw": chord_str}

    def _get_interval_note(self, root: str, semitones: int) -> str:
        """Find the note name at a given semitone interval above the root."""
        norm_root = self.ENHARMONIC.get(root, root)
        if norm_root in self.PITCHES:
            idx = (self.PITCHES.index(norm_root) + semitones) % 12
            return self.PITCHES[idx]
        return root

    def generate_substitutions_for_chord(
        self,
        chord: str,
        style: str,
        key: Optional[str] = None,
    ) -> List[str]:
        """Generate stylistic substitutions for a single chord based on music theory.

        Args:
            chord: Chord symbol (e.g. 'G', 'Am', 'Cmaj7').
            style: Target musical style ('Neo Soul', 'Jazz', 'Pop', 'Fingerstyle').
            key: Overall musical key context (e.g. 'G Major').

        Returns:
            List of suggested replacement chords.
        """
        parsed = self._parse_chord(chord)
        root = parsed["root"]
        quality = parsed["quality"]

        maj_third = self._get_interval_note(root, 4)
        min_third = self._get_interval_note(root, 3)
        tritone = self._get_interval_note(root, 6)

        style_clean = style.strip()

        if style_clean.lower() == "neo soul":
            if quality == "major":
                return [f"{root}maj7", f"{root}6/9", f"{root}maj9", f"{root}add9"]
            elif quality == "minor":
                return [f"{root}m9", f"{root}m11", f"{root}m7", f"{root}m(add9)"]
            elif quality == "7":
                return [f"{root}9", f"{root}13", f"{root}7#9", f"{root}7b13"]
            elif quality == "maj7":
                return [f"{root}maj9", f"{root}6/9", f"{root}maj7#11"]
            elif quality == "m7":
                return [f"{root}m9", f"{root}m11", f"{root}m7(add11)"]
            elif quality == "sus4":
                return [f"{root}9sus4", f"{root}7sus4", f"{root}13sus4"]
            else:
                return [f"{root}maj7", f"{root}6/9"]

        elif style_clean.lower() == "jazz":
            if quality == "major":
                return [f"{root}maj7", f"{root}6", f"{root}maj9", f"{root}maj7#11"]
            elif quality == "minor":
                return [f"{root}m7", f"{root}m6", f"{root}m(maj7)", f"{root}m9"]
            elif quality == "7":
                return [f"{root}13", f"{root}7alt", f"{root}7b9", f"{tritone}7"]
            elif quality == "maj7":
                return [f"{root}maj9", f"{root}6/9", f"{root}maj7#11"]
            elif quality == "m7":
                return [f"{root}m9", f"{root}m6", f"{root}11"]
            elif quality == "sus4":
                return [f"{root}13sus4", f"{root}9sus4"]
            else:
                return [f"{root}maj7", f"{root}7"]

        elif style_clean.lower() == "pop":
            if quality == "major":
                return [f"{root}add9", f"{root}sus2", f"{root}/{maj_third}", f"{root}5"]
            elif quality == "minor":
                return [f"{root}sus2", f"{root}m7", f"{root}m(add9)"]
            elif quality == "7":
                return [f"{root}", f"{root}sus4", f"{root}7"]
            elif quality == "maj7":
                return [f"{root}add9", f"{root}", f"{root}maj7"]
            elif quality == "m7":
                return [f"{root}m", f"{root}m7", f"{root}m(add9)"]
            elif quality == "sus4":
                return [f"{root}sus2", f"{root}"]
            else:
                return [f"{root}add9", f"{root}sus2"]

        elif style_clean.lower() == "fingerstyle":
            if quality == "major":
                return [f"{root}(add9)", f"{root}6", f"{root}/{maj_third}", f"{root}maj7"]
            elif quality == "minor":
                return [f"{root}m7", f"{root}m(add9)", f"{root}m9"]
            elif quality == "7":
                return [f"{root}7", f"{root}/{maj_third}", f"{root}sus4"]
            elif quality == "maj7":
                return [f"{root}maj7 (open voicing)", f"{root}6/9", f"{root}maj9"]
            elif quality == "m7":
                return [f"{root}m7 (open drone)", f"{root}m9"]
            elif quality == "sus4":
                return [f"{root}sus2", f"{root}sus4 -> {root}"]
            else:
                return [f"{root}(add9)", f"{root}6"]

        # Default fallback
        return [f"{root}maj7", f"{root}add9"]

    def generate_improvisations(
        self,
        chords: List[Dict[str, Any]],
        key: str,
        styles: Optional[List[str]] = None,
    ) -> List[Dict[str, Any]]:
        """Generate style-based improvisations for chords detected in the progression.

        Args:
            chords: List of chord event dicts (e.g. [{"chord": "G", ...}]).
            key: Musical key (e.g. "G Major").
            styles: Styles to generate substitutions for. If None, defaults to ["Neo Soul"].

        Returns:
            List of dicts:
            [
                {
                    "original_chord": "G",
                    "style": "Neo Soul",
                    "suggestions": ["Gmaj7", "G6/9"]
                }
            ]
        """
        target_styles = styles if styles is not None else ["Neo Soul"]
        # Extract unique chords in chronological order
        seen_chords = []
        for c in chords:
            chord_name = c.get("chord")
            if chord_name and chord_name != "N" and chord_name not in seen_chords:
                seen_chords.append(chord_name)

        if not seen_chords:
            # Fallback to key tonic
            root = key.split()[0] if key else "G"
            seen_chords = [root]

        improvisations: List[Dict[str, Any]] = []

        # Try LLM if configured and available
        if self.use_llm:
            try:
                llm_results = self._generate_with_llm(seen_chords, key, target_styles)
                if llm_results:
                    return llm_results
            except Exception:
                # Silently fallback to rule-based engine on any LLM failure/timeout
                pass

        # Rule-based music theory engine
        for chord in seen_chords:
            for style in target_styles:
                suggestions = self.generate_substitutions_for_chord(chord, style, key)
                improvisations.append({
                    "original_chord": chord,
                    "style": style,
                    "suggestions": suggestions[:4],  # Top stylistic suggestions
                })

        return improvisations

    def _generate_with_llm(
        self,
        chords: List[str],
        key: str,
        styles: List[str],
    ) -> Optional[List[Dict[str, Any]]]:
        """Optional LLM hook for advanced dynamic voicing generation."""
        # Requires API key in environment
        api_key = os.environ.get("OPENAI_API_KEY") or os.environ.get("GEMINI_API_KEY")
        if not api_key:
            return None

        # Placeholder for external LLM call if environment provides keys
        return None
