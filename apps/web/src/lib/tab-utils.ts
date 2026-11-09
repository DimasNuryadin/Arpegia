import {
  DEFAULT_GUITAR_TUNING,
  TabMeasure,
  TabNote,
  TabTechnique,
  TablatureData,
  TablatureUpdateRequest,
  VoiceRole,
} from "../types";

const PITCH_CLASSES = [
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
];

// Open string MIDI numbers by tuning note name (e.g., E2 = 40, A2 = 45, D3 = 50, G3 = 55, B3 = 59, E4 = 64)
export function parseNoteNameToMidi(noteName: string, fallbackMidi: number): number {
  const match = noteName.trim().match(/^([A-Ga-g][#b]?)(-?\d+)$/);
  if (!match) return fallbackMidi;
  const rawPitch = match[1].toUpperCase();
  const octave = parseInt(match[2], 10);

  const flatToSharp: Record<string, string> = {
    DB: "C#",
    EB: "D#",
    GB: "F#",
    AB: "G#",
    BB: "A#",
  };
  const pitch = flatToSharp[rawPitch] || rawPitch;
  const semitone = PITCH_CLASSES.indexOf(pitch);
  if (semitone === -1) return fallbackMidi;
  return (octave + 1) * 12 + semitone;
}

export function midiToNoteName(midi: number): string {
  const clamped = Math.max(0, Math.min(127, Math.round(midi)));
  const pitch = PITCH_CLASSES[clamped % 12];
  const octave = Math.floor(clamped / 12) - 1;
  return `${pitch}${octave}`;
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Computes MIDI pitch, scientific pitch name, and frequency in Hz from
 * guitar string (1 = High E4 .. 6 = Low E2), fret (0..24), tuning, and capo.
 */
export function computeMidiAndNoteName(
  stringNum: number,
  fret: number,
  tuning: string[] = DEFAULT_GUITAR_TUNING,
  capo = 0
): { midi: number; note_name: string; frequency: number } {
  const clampedString = Math.max(1, Math.min(6, Math.round(stringNum)));
  const clampedFret = Math.max(0, Math.min(24, Math.round(fret)));
  const clampedCapo = Math.max(0, Math.min(12, Math.round(capo)));

  // tuning is ordered from string 6 (Low E2, index 0) to string 1 (High E4, index 5)
  const defaultOpenMidis = [40, 45, 50, 55, 59, 64];
  const tuningIndex = 6 - clampedString;
  const openNoteStr =
    tuning[tuningIndex] || DEFAULT_GUITAR_TUNING[tuningIndex] || "E2";
  const openMidi = parseNoteNameToMidi(
    openNoteStr,
    defaultOpenMidis[tuningIndex] ?? 40
  );

  const midi = openMidi + clampedCapo + clampedFret;
  const note_name = midiToNoteName(midi);
  const frequency = midiToFrequency(midi);

  return { midi, note_name, frequency };
}

export function getTechniqueSymbol(technique: TabTechnique): string {
  switch (technique) {
    case "hammer-on":
      return "h";
    case "pull-off":
      return "p";
    case "slide":
      return "/";
    case "bend":
      return "b";
    default:
      return "";
  }
}

export function getTechniqueLabel(technique: TabTechnique): string {
  switch (technique) {
    case "hammer-on":
      return "Hammer-On (h)";
    case "pull-off":
      return "Pull-Off (p)";
    case "slide":
      return "Slide (/)";
    case "bend":
      return "Bend (b)";
    default:
      return "Normal";
  }
}

export function resolveNoteVoice(note: Pick<TabNote, "voice" | "string">): VoiceRole {
  if (
    note.voice === "bass" ||
    note.voice === "melody" ||
    note.voice === "harmony" ||
    note.voice === "percussive"
  ) {
    return note.voice;
  }
  if (note.string >= 5) return "bass";
  if (note.string <= 2) return "melody";
  return "harmony";
}

export function getVoiceLabel(voice?: VoiceRole): string {
  switch (voice) {
    case "bass":
      return "Bass (Thumb)";
    case "harmony":
      return "Harmony (Inner)";
    case "percussive":
      return "Percussive";
    case "melody":
    default:
      return "Melody (Lead)";
  }
}

/**
 * Generates a clean 6-line ASCII guitar tablature string from measures and tuning.
 * Matches docs/api-contract.md specification:
 * Top line is string 1 (e), bottom line is string 6 (E).
 */
export function generateAsciiTab(
  measures: TabMeasure[],
  tuning: string[] = DEFAULT_GUITAR_TUNING
): string {
  // String headers from string 1 (top) to string 6 (bottom)
  const getLabel = (strIdxFromLow: number, fallback: string) => {
    const raw = tuning[strIdxFromLow] || fallback;
    const letter = raw.replace(/\d+$/, "");
    return strIdxFromLow === 5 ? letter.toLowerCase() : letter;
  };

  const labels = [
    getLabel(5, "e"), // string 1
    getLabel(4, "B"), // string 2
    getLabel(3, "G"), // string 3
    getLabel(2, "D"), // string 4
    getLabel(1, "A"), // string 5
    getLabel(0, "E"), // string 6
  ];

  const lines: string[] = labels.map((l) => `${l.padEnd(2, " ").slice(0, 2).trim()}|`);

  if (!measures || measures.length === 0) {
    return lines.map((l) => `${l}-----------------|`).join("\n");
  }

  for (const measure of measures) {
    const sortedNotes = [...measure.notes].sort(
      (a, b) => a.start_time - b.start_time
    );

    if (sortedNotes.length === 0) {
      for (let s = 0; s < 6; s++) {
        lines[s] += "-----------------|";
      }
      continue;
    }

    // Group simultaneous notes (within 35ms) into columns
    const columns: TabNote[][] = [];
    for (const note of sortedNotes) {
      const lastCol = columns[columns.length - 1];
      if (
        lastCol &&
        Math.abs(note.start_time - lastCol[0].start_time) < 0.035
      ) {
        lastCol.push(note);
      } else {
        columns.push([note]);
      }
    }

    // Pad start of measure
    for (let s = 0; s < 6; s++) {
      lines[s] += "-";
    }

    for (const col of columns) {
      // Determine cell token for each string (1..6)
      const tokens: Record<number, string> = {};
      let maxTokenLen = 1;

      for (const n of col) {
        const techSym = getTechniqueSymbol(n.technique);
        const token = `${techSym}${n.fret}`;
        tokens[n.string] = token;
        if (token.length > maxTokenLen) {
          maxTokenLen = token.length;
        }
      }

      const cellWidth = Math.max(3, maxTokenLen + 2);
      for (let stringNum = 1; stringNum <= 6; stringNum++) {
        const lineIdx = stringNum - 1;
        const tok = tokens[stringNum];
        if (tok !== undefined) {
          lines[lineIdx] += tok.padEnd(cellWidth, "-");
        } else {
          lines[lineIdx] += "-".repeat(cellWidth);
        }
      }
    }

    // Ensure measure bar ends cleanly
    for (let s = 0; s < 6; s++) {
      lines[s] += "|";
    }
  }

  return lines.join("\n");
}

/**
 * Applies a TablatureUpdateRequest optimistically to an existing TablatureData object,
 * recalculating midi, note_name, and regenerating ascii_tab.
 */
export function applyTablatureUpdate(
  currentTab: TablatureData,
  update: TablatureUpdateRequest
): TablatureData {
  const nextTuning = update.tuning ?? currentTab.tuning ?? DEFAULT_GUITAR_TUNING;
  const nextCapo = update.capo ?? currentTab.capo ?? 0;
  const nextDifficulty = update.difficulty ?? currentTab.difficulty ?? "Beginner";

  const baseMeasures = update.measures
    ? update.measures.map((m) => ({
        ...m,
        notes: m.notes.map((n) => ({ ...n })),
      }))
    : currentTab.measures.map((m) => ({
        ...m,
        notes: m.notes.map((n) => ({ ...n })),
      }));

  // Apply individual note patches if provided
  const editsById = new Map(
    (update.notes ?? []).map((edit) => [edit.id, edit])
  );

  const updatedMeasures: TabMeasure[] = baseMeasures.map((measure) => {
    const updatedNotes = measure.notes.map((note) => {
      const edit = editsById.get(note.id);
      const nextString = Math.max(
        1,
        Math.min(6, edit?.string ?? note.string)
      );
      const nextFret = Math.max(0, Math.min(24, edit?.fret ?? note.fret));
      const nextTechnique: TabTechnique =
        edit?.technique ?? note.technique ?? "normal";
      const nextVoice: VoiceRole =
        edit?.voice ?? resolveNoteVoice({ voice: note.voice, string: nextString });
      const nextStartTime = edit?.start_time ?? note.start_time;
      const nextDuration = edit?.duration ?? note.duration;

      const { midi, note_name } = computeMidiAndNoteName(
        nextString,
        nextFret,
        nextTuning,
        nextCapo
      );

      return {
        ...note,
        string: nextString,
        fret: nextFret,
        technique: nextTechnique,
        voice: nextVoice,
        start_time: nextStartTime,
        duration: nextDuration,
        midi,
        note_name,
      };
    });

    return {
      ...measure,
      notes: updatedNotes.sort((a, b) => a.start_time - b.start_time),
    };
  });

  const nextAsciiTab = generateAsciiTab(updatedMeasures, nextTuning);

  return {
    tuning: nextTuning,
    capo: nextCapo,
    difficulty: nextDifficulty,
    measures: updatedMeasures,
    ascii_tab: nextAsciiTab,
  };
}
