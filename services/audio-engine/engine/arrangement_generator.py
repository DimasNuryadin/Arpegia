"""AI Fingerstyle & Style Arrangement Engine (Phase 3).

Generates polyphonic, biomechanically playable guitar arrangements across
4 musical styles ('Fingerstyle', 'Neo Soul', 'Jazz Chord Melody', 'Acoustic Strumming')
and 3 difficulty levels ('Beginner', 'Intermediate', 'Advanced'), complete with
voice role separation ('melody', 'bass', 'harmony', 'percussive'), capo transposition,
tempo scaling, and 6-line ASCII tablature rendering.
"""

from typing import List, Dict, Any, Optional, Tuple
import math
import re

from .chord_voicings import ChordVoicingGenerator
from .improvisation_agent import ImprovisationAgent
from .tab_transcriber import TabTranscriber, DEFAULT_GUITAR_TUNING


# Standard open string MIDI pitches from High E (string 1) to Low E (string 6)
OPEN_STRING_MIDI: Dict[int, int] = {
    1: 64,  # High E4
    2: 59,  # B3
    3: 55,  # G3
    4: 50,  # D3
    5: 45,  # A2
    6: 40,  # Low E2
}

NOTE_NAMES_SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

VALID_STYLES = ("Fingerstyle", "Neo Soul", "Jazz Chord Melody", "Acoustic Strumming")
VALID_DIFFICULTIES = ("Beginner", "Intermediate", "Advanced")


def midi_to_scientific_name(midi_note: int) -> str:
    """Convert MIDI pitch number (0..127) to scientific pitch notation (e.g. 'E4', 'F#3')."""
    clamped = max(0, min(127, int(midi_note)))
    octave = (clamped // 12) - 1
    note = NOTE_NAMES_SHARP[clamped % 12]
    return f"{note}{octave}"


def get_string_open_midi(string_num: int, tuning: Optional[List[str]] = None) -> int:
    """Return open string MIDI pitch (without capo) for string 1..6."""
    if tuning and len(tuning) == 6:
        idx = 6 - string_num
        raw = tuning[idx].strip()
        m = re.match(r"^([A-G][#b]?)(-?\d+)$", raw)
        if m:
            note_part, oct_part = m.group(1).upper(), int(m.group(2))
            flat_map = {"DB": "C#", "EB": "D#", "GB": "F#", "AB": "G#", "BB": "A#"}
            note_part = flat_map.get(note_part, note_part)
            if note_part in NOTE_NAMES_SHARP:
                semi = NOTE_NAMES_SHARP.index(note_part)
                return (oct_part + 1) * 12 + semi
    return OPEN_STRING_MIDI.get(string_num, 64)


class ArrangementGenerator:
    """Synthesizes style-specific polyphonic guitar arrangements with voice separation."""

    def __init__(self):
        self.voicing_gen = ChordVoicingGenerator()
        self.improv_agent = ImprovisationAgent()
        self.tab_transcriber = TabTranscriber()

    # =========================================================================
    # Helper: Fretboard & Voicing Resolution
    # =========================================================================

    def _normalize_chord_symbol(self, chord_sym: str) -> str:
        """Clean annotations from chord symbol so it is a concise musical chord name."""
        if not chord_sym or chord_sym == "N":
            return "C"
        cleaned = re.sub(r"\(open.*?\)", "", chord_sym, flags=re.IGNORECASE).strip()
        cleaned = cleaned.replace("(add9)", "add9").replace("(add11)", "add11")
        if "->" in cleaned:
            cleaned = cleaned.split("->")[0].strip()
        return cleaned or "C"

    def _reharmonize_chord(
        self,
        original_chord: str,
        style: str,
        difficulty: str,
        chord_index: int = 0,
    ) -> str:
        """Select a stylistically appropriate reharmonized chord symbol."""
        base = self._normalize_chord_symbol(original_chord)
        root, suffix, _ = self.voicing_gen._parse_root_and_suffix(base)
        is_minor = ("m" in suffix and "maj" not in suffix)

        if style == "Fingerstyle":
            if difficulty == "Beginner":
                return base
            elif difficulty == "Intermediate":
                if is_minor:
                    return f"{root}m7"
                elif "7" in suffix:
                    return f"{root}7sus4" if chord_index % 2 == 1 else f"{root}add9"
                else:
                    return f"{root}add9" if chord_index % 2 == 0 else f"{root}maj7"
            else:  # Advanced
                if is_minor:
                    return f"{root}m9" if chord_index % 2 == 0 else f"{root}m11"
                else:
                    return f"{root}maj9" if chord_index % 2 == 0 else f"{root}6/9"

        elif style == "Neo Soul":
            if difficulty == "Beginner":
                return f"{root}m7" if is_minor else f"{root}maj7"
            elif difficulty == "Intermediate":
                if is_minor:
                    return f"{root}m9"
                elif "7" in suffix and "maj" not in suffix:
                    return f"{root}9"
                else:
                    return f"{root}maj7" if chord_index % 2 == 0 else f"{root}6/9"
            else:  # Advanced
                if is_minor:
                    return f"{root}m11" if chord_index % 2 == 1 else f"{root}m9"
                elif "7" in suffix and "maj" not in suffix:
                    return f"{root}13"
                else:
                    return f"{root}maj9" if chord_index % 2 == 0 else f"{root}6/9"

        elif style == "Jazz Chord Melody":
            if difficulty == "Beginner":
                return f"{root}m7" if is_minor else f"{root}maj7"
            elif difficulty == "Intermediate":
                if is_minor:
                    return f"{root}m7" if chord_index % 2 == 0 else f"{root}m9"
                elif "7" in suffix and "maj" not in suffix:
                    return f"{root}9"
                else:
                    return f"{root}maj7" if chord_index % 2 == 0 else f"{root}6"
            else:  # Advanced
                if is_minor:
                    return f"{root}m9"
                elif "7" in suffix and "maj" not in suffix:
                    return f"{root}13"
                else:
                    return f"{root}maj9" if chord_index % 2 == 0 else f"{root}6/9"

        elif style == "Acoustic Strumming":
            if difficulty == "Beginner":
                return base
            elif difficulty == "Intermediate":
                if is_minor:
                    return f"{root}m7"
                else:
                    return f"{root}add9" if chord_index % 2 == 0 else f"{root}sus4"
            else:  # Advanced
                if is_minor:
                    return f"{root}m9"
                else:
                    return f"{root}add9" if chord_index % 2 == 0 else f"{root}6/9"

        return base

    def _adjust_fret_for_capo(
        self,
        string_num: int,
        target_midi: int,
        capo: int,
        tuning: List[str],
    ) -> Tuple[int, int, int]:
        """Compute playable (string, relative_fret_0_to_24, sounding_midi) given capo."""
        open_midi = get_string_open_midi(string_num, tuning) + capo
        rel_fret = target_midi - open_midi

        # If target_midi is below open string with capo, shift octave up or adjust
        while rel_fret < 0:
            target_midi += 12
            rel_fret = target_midi - open_midi
        while rel_fret > 24:
            target_midi -= 12
            rel_fret = target_midi - open_midi

        rel_fret = max(0, min(24, rel_fret))
        sounding_midi = max(40, min(88, open_midi + rel_fret))
        return string_num, rel_fret, sounding_midi

    def _get_chord_string_pitches(
        self,
        chord_sym: str,
        capo: int,
        tuning: List[str],
    ) -> Dict[int, Tuple[int, int]]:
        """Resolve a chord symbol into {string_num (1..6): (fret_0_to_24, sounding_midi)}.

        String 6 is Low E, String 1 is High E.
        """
        diag = self.voicing_gen.get_chord_diagram(chord_sym)
        # diag["frets"] is [Low E (6), A (5), D (4), G (3), B (2), High E (1)]
        frets_low_to_high = diag["frets"]
        mapping: Dict[int, Tuple[int, int]] = {}

        for idx, raw_fret in enumerate(frets_low_to_high):
            string_num = 6 - idx  # 6 down to 1
            if raw_fret < 0:
                continue
            base_open = get_string_open_midi(string_num, tuning)
            abs_midi = base_open + raw_fret
            # Convert to capo-relative fret
            _, rel_fret, sounding_midi = self._adjust_fret_for_capo(
                string_num, abs_midi, capo, tuning
            )
            mapping[string_num] = (rel_fret, sounding_midi)

        # Ensure we always have at least a bass string (4..6) and upper strings (1..3)
        if not any(s in mapping for s in (6, 5, 4)):
            _, rel_f, s_midi = self._adjust_fret_for_capo(6, 43, capo, tuning)
            mapping[6] = (rel_f, s_midi)
        if not any(s in mapping for s in (3, 2, 1)):
            _, rel_f, s_midi = self._adjust_fret_for_capo(2, 60, capo, tuning)
            mapping[2] = (rel_f, s_midi)

        return mapping

    def _find_melody_on_upper_strings(
        self,
        target_midi: int,
        capo: int,
        tuning: List[str],
        preferred_strings: Tuple[int, ...] = (1, 2, 3),
    ) -> Tuple[int, int, int]:
        """Map a melody MIDI pitch onto strings 1-3 with comfortable fret position."""
        best_choice: Optional[Tuple[int, int, int]] = None
        best_cost = float("inf")

        # Keep melody in playable upper register
        adj_midi = target_midi
        while adj_midi < 55:
            adj_midi += 12
        while adj_midi > 84:
            adj_midi -= 12

        for s in preferred_strings:
            open_midi = get_string_open_midi(s, tuning) + capo
            fret = adj_midi - open_midi
            if 0 <= fret <= 20:
                # Prefer frets 0..12 on strings 1-2
                cost = fret * 0.4 + (s - 1) * 0.8
                if cost < best_cost:
                    best_cost = cost
                    sounding_midi = max(40, min(88, open_midi + fret))
                    best_choice = (s, fret, sounding_midi)

        if best_choice is not None:
            return best_choice

        return self._adjust_fret_for_capo(1, adj_midi, capo, tuning)

    def _make_note(
        self,
        note_id: str,
        start_time: float,
        duration: float,
        string_num: int,
        fret: int,
        midi_pitch: int,
        voice: str,
        technique: str = "normal",
        confidence: float = 0.94,
    ) -> Dict[str, Any]:
        """Construct a schema-compliant TabNote dictionary."""
        s_clamped = max(1, min(6, int(string_num)))
        f_clamped = max(0, min(24, int(fret)))
        m_clamped = max(0, min(127, int(midi_pitch)))
        return {
            "id": note_id,
            "start_time": round(max(0.0, float(start_time)), 2),
            "duration": round(max(0.05, float(duration)), 2),
            "string": s_clamped,
            "fret": f_clamped,
            "midi": m_clamped,
            "note_name": midi_to_scientific_name(m_clamped),
            "confidence": round(max(0.0, min(1.0, float(confidence))), 2),
            "technique": technique,
            "voice": voice,
        }

    # =========================================================================
    # Style Synthesis Engines
    # =========================================================================

    def _synthesize_measure_notes(
        self,
        style: str,
        difficulty: str,
        measure_idx: int,
        m_start: float,
        m_end: float,
        chord_sym: str,
        base_melody_notes: List[Dict[str, Any]],
        capo: int,
        tuning: List[str],
        beats_per_measure: int,
        note_counter: List[int],
    ) -> List[Dict[str, Any]]:
        """Synthesize polyphonic notes for a single measure according to style and difficulty."""
        m_dur = max(0.2, m_end - m_start)
        beat_dur = m_dur / max(1, beats_per_measure)
        chord_map = self._get_chord_string_pitches(chord_sym, capo, tuning)

        # Identify primary bass string (lowest string present in chord, 6 or 5 or 4)
        bass_strings = [s for s in (6, 5, 4) if s in chord_map]
        primary_bass_s = bass_strings[0] if bass_strings else 6
        alt_bass_s = bass_strings[1] if len(bass_strings) > 1 else max(4, primary_bass_s - 1)

        primary_bass_f, primary_bass_midi = chord_map.get(
            primary_bass_s, self._adjust_fret_for_capo(primary_bass_s, 43, capo, tuning)[1:]
        )
        alt_bass_f, alt_bass_midi = chord_map.get(
            alt_bass_s, self._adjust_fret_for_capo(alt_bass_s, primary_bass_midi + 7, capo, tuning)[1:]
        )

        # Identify inner harmony strings (strings 2, 3, 4)
        harmony_strings = [s for s in (4, 3, 2) if s in chord_map and s != primary_bass_s]
        if not harmony_strings:
            harmony_strings = [3, 2]

        # Extract melody pitches in this measure window from base_tablature if available
        melody_targets: List[int] = [
            int(n.get("midi", 64)) for n in base_melody_notes if "midi" in n
        ]
        if not melody_targets:
            # Derive musical melody pitches from top strings of chord voicing
            top_s = 1 if 1 in chord_map else (2 if 2 in chord_map else 3)
            _, top_midi = chord_map.get(top_s, (0, 64))
            melody_targets = [top_midi, top_midi + 2, top_midi + 4, top_midi]

        generated: List[Dict[str, Any]] = []

        def next_id(prefix: str) -> str:
            note_counter[0] += 1
            return f"{prefix}-{note_counter[0]}"

        # ---------------------------------------------------------------------
        # STYLE 1: FINGERSTYLE
        # Root/fifth thumb bassline on strings 4-6 ("bass"), arpeggiated inner
        # chord tones on strings 2-4 ("harmony"), extracted melody on strings 1-2
        # ("melody"), plus hammer-ons/slides for Intermediate/Advanced.
        # ---------------------------------------------------------------------
        if style == "Fingerstyle":
            prefix = "arr-fs"
            # 1. Alternating Thumb Bass on beats 1 and 3 (or beat 1 for Beginner)
            generated.append(
                self._make_note(
                    next_id(prefix),
                    m_start,
                    beat_dur * 1.8,
                    primary_bass_s,
                    primary_bass_f,
                    primary_bass_midi,
                    voice="bass",
                    technique="normal",
                    confidence=0.96,
                )
            )
            if beats_per_measure >= 3 and difficulty in ("Intermediate", "Advanced"):
                generated.append(
                    self._make_note(
                        next_id(prefix),
                        m_start + 2 * beat_dur,
                        beat_dur * 1.5,
                        alt_bass_s,
                        alt_bass_f,
                        alt_bass_midi,
                        voice="bass",
                        technique="normal",
                        confidence=0.95,
                    )
                )
                if difficulty == "Advanced" and beats_per_measure >= 4:
                    # Extra thumb bass pickup on beat 4
                    generated.append(
                        self._make_note(
                            next_id(prefix),
                            m_start + 3 * beat_dur,
                            beat_dur * 0.9,
                            primary_bass_s,
                            primary_bass_f,
                            primary_bass_midi,
                            voice="bass",
                            technique="normal",
                            confidence=0.93,
                        )
                    )

            # 2. Arpeggiated inner chord tones ("harmony") on strings 2-4
            harm_s1 = harmony_strings[0]
            harm_f1, harm_m1 = chord_map.get(
                harm_s1, self._adjust_fret_for_capo(harm_s1, 55, capo, tuning)[1:]
            )
            harm_tech1 = "hammer-on" if difficulty in ("Intermediate", "Advanced") and harm_f1 > 0 else "normal"
            generated.append(
                self._make_note(
                    next_id(prefix),
                    m_start + 0.5 * beat_dur,
                    beat_dur * 0.9,
                    harm_s1,
                    harm_f1,
                    harm_m1,
                    voice="harmony",
                    technique=harm_tech1,
                    confidence=0.94,
                )
            )

            if difficulty in ("Intermediate", "Advanced"):
                harm_s2 = harmony_strings[-1] if len(harmony_strings) > 1 else 3
                harm_f2, harm_m2 = chord_map.get(
                    harm_s2, self._adjust_fret_for_capo(harm_s2, 59, capo, tuning)[1:]
                )
                generated.append(
                    self._make_note(
                        next_id(prefix),
                        m_start + 1.5 * beat_dur,
                        beat_dur * 0.8,
                        harm_s2,
                        harm_f2,
                        harm_m2,
                        voice="harmony",
                        technique="normal",
                        confidence=0.93,
                    )
                )
                if difficulty == "Advanced":
                    # Cascading harmonic arpeggio on beat 3.5
                    generated.append(
                        self._make_note(
                            next_id(prefix),
                            m_start + 2.5 * beat_dur,
                            beat_dur * 0.6,
                            harm_s1,
                            min(24, harm_f1 + 2),
                            min(88, harm_m1 + 2),
                            voice="harmony",
                            technique="pull-off" if harm_f1 > 0 else "hammer-on",
                            confidence=0.92,
                        )
                    )

            # 3. Plucked Melody on strings 1-2 ("melody")
            mel_pitch_1 = melody_targets[0 % len(melody_targets)]
            ms1, mf1, mm1 = self._find_melody_on_upper_strings(
                mel_pitch_1, capo, tuning, preferred_strings=(1, 2)
            )
            generated.append(
                self._make_note(
                    next_id(prefix),
                    m_start + 1.0 * beat_dur,
                    beat_dur * 1.2,
                    ms1,
                    mf1,
                    mm1,
                    voice="melody",
                    technique="normal",
                    confidence=0.95,
                )
            )

            if beats_per_measure >= 3:
                mel_pitch_2 = melody_targets[(measure_idx + 1) % len(melody_targets)]
                ms2, mf2, mm2 = self._find_melody_on_upper_strings(
                    mel_pitch_2, capo, tuning, preferred_strings=(1, 2)
                )
                mel_tech = "normal"
                if difficulty == "Intermediate":
                    mel_tech = "hammer-on" if mf2 > 0 else "slide"
                elif difficulty == "Advanced":
                    mel_tech = "slide"
                    mf2 = min(24, mf2 + 2)
                    mm2 = min(88, mm2 + 2)

                generated.append(
                    self._make_note(
                        next_id(prefix),
                        m_start + 2.75 * beat_dur if difficulty == "Advanced" else m_start + 2.5 * beat_dur,
                        beat_dur * 1.0,
                        ms2,
                        mf2,
                        mm2,
                        voice="melody",
                        technique=mel_tech,
                        confidence=0.94,
                    )
                )

        # ---------------------------------------------------------------------
        # STYLE 2: NEO SOUL
        # Extended voicings (maj7, m9, 6/9), syncopated thumb slaps/dead notes
        # (voice="percussive"), inner harmony, and double-stop melody slides.
        # ---------------------------------------------------------------------
        elif style == "Neo Soul":
            prefix = "arr-ns"
            # 1. Warm Neo Soul thumb bass on beat 1
            generated.append(
                self._make_note(
                    next_id(prefix),
                    m_start,
                    beat_dur * 1.5,
                    primary_bass_s,
                    primary_bass_f,
                    primary_bass_midi,
                    voice="bass",
                    technique="normal",
                    confidence=0.96,
                )
            )

            # 2. Extended inner harmony block (strings 3-4) on off-beat
            harm_s = harmony_strings[0]
            harm_f, harm_m = chord_map.get(
                harm_s, self._adjust_fret_for_capo(harm_s, 57, capo, tuning)[1:]
            )
            generated.append(
                self._make_note(
                    next_id(prefix),
                    m_start + 0.5 * beat_dur,
                    beat_dur * 1.0,
                    harm_s,
                    harm_f,
                    harm_m,
                    voice="harmony",
                    technique="hammer-on" if difficulty != "Beginner" else "normal",
                    confidence=0.94,
                )
            )

            # 3. Syncopated thumb slap / percussive ghost note on beat 2 & 4 ("percussive")
            slap_time_1 = m_start + 1.0 * beat_dur
            generated.append(
                self._make_note(
                    next_id(prefix),
                    slap_time_1,
                    beat_dur * 0.25,
                    primary_bass_s,
                    primary_bass_f,
                    primary_bass_midi,
                    voice="percussive",
                    technique="normal",
                    confidence=0.92,
                )
            )

            # 4. Double-stop / embellished Neo Soul melody slide on strings 1-2
            mel_pitch = melody_targets[measure_idx % len(melody_targets)] + 2
            ms1, mf1, mm1 = self._find_melody_on_upper_strings(
                mel_pitch, capo, tuning, preferred_strings=(1, 2)
            )
            if difficulty in ("Intermediate", "Advanced") and mf1 < 22:
                mf1 += 2
                mm1 += 2
            generated.append(
                self._make_note(
                    next_id(prefix),
                    m_start + 1.5 * beat_dur,
                    beat_dur * 1.1,
                    ms1,
                    mf1,
                    mm1,
                    voice="melody",
                    technique="slide" if difficulty != "Beginner" else "normal",
                    confidence=0.95,
                )
            )

            if difficulty in ("Intermediate", "Advanced") and beats_per_measure >= 3:
                # Double-stop companion harmony note sliding simultaneously on adjacent string
                ds_s = 2 if ms1 == 1 else 3
                ds_f, ds_m = chord_map.get(
                    ds_s, self._adjust_fret_for_capo(ds_s, mm1 - 5, capo, tuning)[1:]
                )
                generated.append(
                    self._make_note(
                        next_id(prefix),
                        m_start + 1.5 * beat_dur,
                        beat_dur * 1.1,
                        ds_s,
                        ds_f,
                        ds_m,
                        voice="harmony",
                        technique="slide",
                        confidence=0.93,
                    )
                )

                # Syncopated bass anticipation + second percussive slap + upper R&B lick
                generated.append(
                    self._make_note(
                        next_id(prefix),
                        m_start + 2.5 * beat_dur,
                        beat_dur * 0.8,
                        alt_bass_s,
                        alt_bass_f,
                        alt_bass_midi,
                        voice="bass",
                        technique="slide" if difficulty == "Advanced" else "normal",
                        confidence=0.94,
                    )
                )
                generated.append(
                    self._make_note(
                        next_id(prefix),
                        m_start + 3.0 * beat_dur,
                        beat_dur * 0.25,
                        5,
                        alt_bass_f,
                        alt_bass_midi,
                        voice="percussive",
                        technique="normal",
                        confidence=0.91,
                    )
                )
                if difficulty == "Advanced":
                    # Neo Soul 16th-note pull-off run on string 1
                    generated.append(
                        self._make_note(
                            next_id(prefix),
                            m_start + 3.25 * beat_dur,
                            beat_dur * 0.5,
                            1,
                            min(24, mf1 + 3),
                            min(88, mm1 + 3),
                            voice="melody",
                            technique="pull-off",
                            confidence=0.94,
                        )
                    )

        # ---------------------------------------------------------------------
        # STYLE 3: JAZZ CHORD MELODY
        # Walking bass notes on beat 1 & 3 (and 2 & 4 for Advanced) ("bass"),
        # and shell/drop-2 chord voicings beneath the melody note ("harmony" + "melody").
        # ---------------------------------------------------------------------
        elif style == "Jazz Chord Melody":
            prefix = "arr-jcm"
            # Beat 1: Walking bass root + Drop-2 shell harmony + top melody simultaneously
            generated.append(
                self._make_note(
                    next_id(prefix),
                    m_start,
                    beat_dur * 1.6,
                    primary_bass_s,
                    primary_bass_f,
                    primary_bass_midi,
                    voice="bass",
                    technique="normal",
                    confidence=0.97,
                )
            )

            # Shell / Drop-2 chord tones on strings 3 and 4
            for hs in (4, 3):
                if hs != primary_bass_s:
                    hf, hm = chord_map.get(
                        hs, self._adjust_fret_for_capo(hs, 55, capo, tuning)[1:]
                    )
                    generated.append(
                        self._make_note(
                            next_id(prefix),
                            m_start,
                            beat_dur * 1.4,
                            hs,
                            hf,
                            hm,
                            voice="harmony",
                            technique="normal",
                            confidence=0.95,
                        )
                    )
                    if difficulty == "Beginner":
                        break  # Single shell guide tone for Beginner

            # Top chord-melody voice on beat 1
            mel_p1 = melody_targets[0 % len(melody_targets)]
            jms1, jmf1, jmm1 = self._find_melody_on_upper_strings(
                mel_p1, capo, tuning, preferred_strings=(1, 2)
            )
            generated.append(
                self._make_note(
                    next_id(prefix),
                    m_start,
                    beat_dur * 1.4,
                    jms1,
                    jmf1,
                    jmm1,
                    voice="melody",
                    technique="normal",
                    confidence=0.96,
                )
            )

            # Beat 2: Walking bass passing tone (Intermediate/Advanced)
            if difficulty in ("Intermediate", "Advanced") and beats_per_measure >= 3:
                walk_f2 = min(24, primary_bass_f + 2)
                walk_m2 = min(88, primary_bass_midi + 2)
                generated.append(
                    self._make_note(
                        next_id(prefix),
                        m_start + 1.0 * beat_dur,
                        beat_dur * 0.9,
                        primary_bass_s,
                        walk_f2,
                        walk_m2,
                        voice="bass",
                        technique="normal",
                        confidence=0.94,
                    )
                )

            # Beat 3: Walking bass fifth/chromatic approach + re-voiced Drop-2 chord melody
            if beats_per_measure >= 3:
                generated.append(
                    self._make_note(
                        next_id(prefix),
                        m_start + 2.0 * beat_dur,
                        beat_dur * 1.5,
                        alt_bass_s,
                        alt_bass_f,
                        alt_bass_midi,
                        voice="bass",
                        technique="slide" if difficulty == "Advanced" else "normal",
                        confidence=0.95,
                    )
                )

                # Inner harmony voice on beat 3
                hs3 = 3 if jms1 != 3 else 4
                hf3, hm3 = chord_map.get(
                    hs3, self._adjust_fret_for_capo(hs3, 57, capo, tuning)[1:]
                )
                generated.append(
                    self._make_note(
                        next_id(prefix),
                        m_start + 2.0 * beat_dur,
                        beat_dur * 1.2,
                        hs3,
                        hf3,
                        hm3,
                        voice="harmony",
                        technique="normal",
                        confidence=0.94,
                    )
                )

                # Melody resolution on beat 3
                mel_p2 = melody_targets[(measure_idx + 1) % len(melody_targets)]
                jms2, jmf2, jmm2 = self._find_melody_on_upper_strings(
                    mel_p2, capo, tuning, preferred_strings=(1, 2)
                )
                generated.append(
                    self._make_note(
                        next_id(prefix),
                        m_start + 2.0 * beat_dur,
                        beat_dur * 1.2,
                        jms2,
                        jmf2,
                        jmm2,
                        voice="melody",
                        technique="slide" if difficulty in ("Intermediate", "Advanced") else "normal",
                        confidence=0.95,
                    )
                )

            # Beat 4: Chromatic approach bass + octave melody ornament for Advanced
            if difficulty == "Advanced" and beats_per_measure >= 4:
                chrom_f = max(0, min(24, alt_bass_f + 1))
                chrom_m = min(88, alt_bass_midi + 1)
                generated.append(
                    self._make_note(
                        next_id(prefix),
                        m_start + 3.0 * beat_dur,
                        beat_dur * 0.9,
                        alt_bass_s,
                        chrom_f,
                        chrom_m,
                        voice="bass",
                        technique="slide",
                        confidence=0.93,
                    )
                )
                generated.append(
                    self._make_note(
                        next_id(prefix),
                        m_start + 3.5 * beat_dur,
                        beat_dur * 0.45,
                        1,
                        min(24, jmf1 + 3),
                        min(88, jmm1 + 3),
                        voice="melody",
                        technique="hammer-on",
                        confidence=0.92,
                    )
                )

        # ---------------------------------------------------------------------
        # STYLE 4: ACOUSTIC STRUMMING
        # Rhythmic bass-strum patterns aligned with the song's time signature
        # and tempo: Boom-Chuck bass on beats 1 & 3, full chord strums ("harmony"
        # + top voice "melody"), and rhythmic muted chuck ("percussive").
        # ---------------------------------------------------------------------
        else:  # Acoustic Strumming
            prefix = "arr-as"
            # Beat 1: Root bass pick ("bass")
            generated.append(
                self._make_note(
                    next_id(prefix),
                    m_start,
                    beat_dur * 0.95,
                    primary_bass_s,
                    primary_bass_f,
                    primary_bass_midi,
                    voice="bass",
                    technique="normal",
                    confidence=0.97,
                )
            )

            # Beat 2: Down-strum across inner harmony strings ("harmony") and top string ("melody")
            strum_time_1 = m_start + 1.0 * beat_dur
            for s in (4, 3, 2):
                if s in chord_map and s != primary_bass_s:
                    sf_val, sm_val = chord_map[s]
                    generated.append(
                        self._make_note(
                            next_id(prefix),
                            strum_time_1,
                            beat_dur * 0.85,
                            s,
                            sf_val,
                            sm_val,
                            voice="harmony",
                            technique="normal",
                            confidence=0.95,
                        )
                    )
                    if difficulty == "Beginner":
                        break

            top_s = 1 if 1 in chord_map else 2
            top_f, top_m = chord_map.get(
                top_s, self._adjust_fret_for_capo(top_s, 64, capo, tuning)[1:]
            )
            generated.append(
                self._make_note(
                    next_id(prefix),
                    strum_time_1,
                    beat_dur * 0.85,
                    top_s,
                    top_f,
                    top_m,
                    voice="melody",
                    technique="hammer-on" if difficulty == "Advanced" and top_f > 0 else "normal",
                    confidence=0.95,
                )
            )

            # Beat 2.5: Syncopated up-strum (Intermediate/Advanced)
            if difficulty in ("Intermediate", "Advanced"):
                up_time = m_start + 1.5 * beat_dur
                generated.append(
                    self._make_note(
                        next_id(prefix),
                        up_time,
                        beat_dur * 0.45,
                        1,
                        top_f,
                        top_m,
                        voice="melody",
                        technique="normal",
                        confidence=0.93,
                    )
                )
                s2_f, s2_m = chord_map.get(
                    2, self._adjust_fret_for_capo(2, 59, capo, tuning)[1:]
                )
                generated.append(
                    self._make_note(
                        next_id(prefix),
                        up_time,
                        beat_dur * 0.45,
                        2,
                        s2_f,
                        s2_m,
                        voice="harmony",
                        technique="normal",
                        confidence=0.93,
                    )
                )

            # Beat 3: Alternating bass or percussive palm-mute chuck
            if beats_per_measure >= 3:
                beat3_time = m_start + 2.0 * beat_dur
                if difficulty == "Advanced":
                    generated.append(
                        self._make_note(
                            next_id(prefix),
                            beat3_time,
                            beat_dur * 0.35,
                            primary_bass_s,
                            primary_bass_f,
                            primary_bass_midi,
                            voice="percussive",
                            technique="normal",
                            confidence=0.92,
                        )
                    )
                else:
                    generated.append(
                        self._make_note(
                            next_id(prefix),
                            beat3_time,
                            beat_dur * 0.9,
                            alt_bass_s,
                            alt_bass_f,
                            alt_bass_midi,
                            voice="bass",
                            technique="normal",
                            confidence=0.95,
                        )
                    )

            # Beat 3.5 & 4: Final down-up strum pattern
            if beats_per_measure >= 4:
                beat4_time = m_start + 3.0 * beat_dur
                s3_f, s3_m = chord_map.get(
                    3, self._adjust_fret_for_capo(3, 55, capo, tuning)[1:]
                )
                generated.append(
                    self._make_note(
                        next_id(prefix),
                        beat4_time,
                        beat_dur * 0.8,
                        3,
                        s3_f,
                        s3_m,
                        voice="harmony",
                        technique="normal",
                        confidence=0.94,
                    )
                )
                generated.append(
                    self._make_note(
                        next_id(prefix),
                        beat4_time,
                        beat_dur * 0.8,
                        1,
                        top_f,
                        top_m,
                        voice="melody",
                        technique="slide" if difficulty == "Advanced" else "normal",
                        confidence=0.94,
                    )
                )

        # Sort chronologically, then by string (low to high)
        generated.sort(key=lambda n: (n["start_time"], -n["string"]))
        return generated

    # =========================================================================
    # Main Entrypoint
    # =========================================================================

    def generate(
        self,
        metadata: Dict[str, Any],
        chords: List[Dict[str, Any]],
        base_tablature: Optional[Dict[str, Any]] = None,
        style: str = "Fingerstyle",
        difficulty: str = "Intermediate",
        capo: int = 0,
        tempo_scale: float = 1.0,
        arrangement_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate a complete ArrangementVariation dictionary matching Phase 3 contracts."""
        if style not in VALID_STYLES:
            raise ValueError(f"Unsupported style '{style}'. Must be one of {VALID_STYLES}.")
        if difficulty not in VALID_DIFFICULTIES:
            raise ValueError(
                f"Unsupported difficulty '{difficulty}'. Must be one of {VALID_DIFFICULTIES}."
            )

        capo_clamped = max(0, min(12, int(capo)))
        tempo_scale_clamped = max(0.5, min(1.5, float(tempo_scale)))

        tuning = list(DEFAULT_GUITAR_TUNING)
        if base_tablature and isinstance(base_tablature.get("tuning"), list) and len(base_tablature["tuning"]) == 6:
            tuning = list(base_tablature["tuning"])

        raw_duration = float((metadata or {}).get("duration", 4.8) or 4.8)
        raw_bpm = float((metadata or {}).get("bpm", 120) or 120)
        time_sig = str((metadata or {}).get("time_signature", "4/4") or "4/4")
        key_str = str((metadata or {}).get("key", "G Major") or "G Major")

        # Scale timestamps & durations inversely with tempo_scale:
        # tempo_scale < 1.0 (slower) -> longer note durations and timestamps (1 / tempo_scale)
        # tempo_scale > 1.0 (faster) -> shorter note durations and timestamps (1 / tempo_scale)
        time_factor = 1.0 / tempo_scale_clamped
        effective_bpm = raw_bpm * tempo_scale_clamped
        scaled_duration = round(max(1.0, raw_duration * time_factor), 2)

        beats_per_measure = 3 if "3" in time_sig else 4
        seconds_per_beat = 60.0 / max(1.0, effective_bpm)
        measure_duration = beats_per_measure * seconds_per_beat
        total_measures = max(1, int(math.ceil(scaled_duration / measure_duration)))

        # Extract base melody notes mapped to scaled timeline
        base_notes_scaled: List[Dict[str, Any]] = []
        if base_tablature and isinstance(base_tablature.get("measures"), list):
            for bm in base_tablature["measures"]:
                for bn in bm.get("notes", []):
                    scaled_n = dict(bn)
                    scaled_n["start_time"] = float(bn.get("start_time", 0.0)) * time_factor
                    scaled_n["duration"] = float(bn.get("duration", 0.4)) * time_factor
                    base_notes_scaled.append(scaled_n)

        # Ensure chord progression fallback
        effective_chords: List[Dict[str, Any]] = []
        if chords:
            for c in chords:
                if c.get("chord") and c.get("chord") != "N":
                    effective_chords.append({
                        "chord": c["chord"],
                        "start_time": float(c.get("start_time", 0.0)) * time_factor,
                        "end_time": float(c.get("end_time", raw_duration)) * time_factor,
                    })
        if not effective_chords:
            tonic = key_str.split()[0] if key_str else "G"
            effective_chords = [{"chord": tonic, "start_time": 0.0, "end_time": scaled_duration}]

        chords_used: List[str] = []
        measures: List[Dict[str, Any]] = []
        note_counter = [0]

        for m_idx in range(total_measures):
            m_start = round(m_idx * measure_duration, 2)
            m_end = round(min(scaled_duration, (m_idx + 1) * measure_duration), 2)
            if m_end <= m_start:
                m_end = round(m_start + measure_duration, 2)
            m_mid = 0.5 * (m_start + m_end)

            # Find active chord at measure midpoint
            active_orig_chord = effective_chords[m_idx % len(effective_chords)]["chord"]
            for c_item in effective_chords:
                if c_item["start_time"] <= m_mid <= c_item["end_time"]:
                    active_orig_chord = c_item["chord"]
                    break

            reharm_chord = self._reharmonize_chord(
                active_orig_chord, style=style, difficulty=difficulty, chord_index=m_idx
            )
            if not chords_used or chords_used[-1] != reharm_chord:
                chords_used.append(reharm_chord)

            # Filter base melody notes in this measure
            m_base_notes = [
                bn for bn in base_notes_scaled if m_start <= bn["start_time"] < m_end
            ]

            m_notes = self._synthesize_measure_notes(
                style=style,
                difficulty=difficulty,
                measure_idx=m_idx,
                m_start=m_start,
                m_end=m_end,
                chord_sym=reharm_chord,
                base_melody_notes=m_base_notes,
                capo=capo_clamped,
                tuning=tuning,
                beats_per_measure=beats_per_measure,
                note_counter=note_counter,
            )

            measures.append({
                "measure_number": m_idx + 1,
                "start_time": m_start,
                "end_time": m_end,
                "notes": m_notes,
            })

        ascii_tab = self.tab_transcriber.render_ascii_tab(measures, tuning=tuning)

        # Build human-readable title, description, and deterministic ID
        style_slug = style.lower().replace(" ", "-")
        diff_slug = difficulty.lower()
        if not arrangement_id:
            suffix_parts = [style_slug, diff_slug]
            if capo_clamped > 0:
                suffix_parts.append(f"capo{capo_clamped}")
            if abs(tempo_scale_clamped - 1.0) > 1e-3:
                suffix_parts.append(f"tempo{int(round(tempo_scale_clamped * 100))}")
            arrangement_id = "arr-" + "-".join(suffix_parts)

        title_map = {
            "Fingerstyle": "Fingerstyle Solo Arrangement",
            "Neo Soul": "Neo Soul Extended Voicing Arrangement",
            "Jazz Chord Melody": "Jazz Chord Melody Arrangement",
            "Acoustic Strumming": "Acoustic Strumming Pattern Arrangement",
        }
        title = title_map.get(style, f"{style} Guitar Arrangement")

        desc_map = {
            "Fingerstyle": (
                "Alternating root/fifth thumb bass on strings 4-6 with arpeggiated inner "
                "harmony on strings 2-4 and articulated melody on strings 1-2"
            ),
            "Neo Soul": (
                "Extended 7th/9th/11th Neo Soul substitutions with syncopated thumb bass, "
                "percussive slaps, and double-stop melody slides"
            ),
            "Jazz Chord Melody": (
                "Walking bassline on beats 1 & 3 paired with Drop-2 / shell chord voicings "
                "supporting the lead melody on strings 1-2"
            ),
            "Acoustic Strumming": (
                f"Rhythmic bass-strum accompaniment aligned to {time_sig} meter with "
                "root-fifth bass picks and dynamic chord strums"
            ),
        }
        base_desc = desc_map.get(style, f"{style} guitar arrangement")
        modifiers = [f"{difficulty} tier"]
        if capo_clamped > 0:
            modifiers.append(f"Capo {capo_clamped}")
        if abs(tempo_scale_clamped - 1.0) > 1e-3:
            modifiers.append(f"{tempo_scale_clamped:g}x tempo")
        description = f"{base_desc} ({', '.join(modifiers)})."

        return {
            "arrangement_id": arrangement_id,
            "title": title,
            "style": style,
            "difficulty": difficulty,
            "description": description,
            "chords_used": chords_used,
            "tablature": {
                "tuning": tuning,
                "capo": capo_clamped,
                "difficulty": difficulty,
                "measures": measures,
                "ascii_tab": ascii_tab,
            },
        }


def generate_arrangement(
    metadata: Dict[str, Any],
    chords: List[Dict[str, Any]],
    base_tablature: Optional[Dict[str, Any]] = None,
    style: str = "Fingerstyle",
    difficulty: str = "Intermediate",
    capo: int = 0,
    tempo_scale: float = 1.0,
    arrangement_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Functional entrypoint for generating a playable guitar ArrangementVariation."""
    generator = ArrangementGenerator()
    return generator.generate(
        metadata=metadata,
        chords=chords,
        base_tablature=base_tablature,
        style=style,
        difficulty=difficulty,
        capo=capo,
        tempo_scale=tempo_scale,
        arrangement_id=arrangement_id,
    )
