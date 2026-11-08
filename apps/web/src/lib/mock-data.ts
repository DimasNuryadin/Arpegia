import {
  AnalysisResponse,
  ChordDiagram,
  ChordVoicingDetail,
  DEFAULT_GUITAR_TUNING,
  TabMeasure,
} from "../types";
import { computeMidiAndNoteName, generateAsciiTab } from "./tab-utils";

function makeNote(
  id: string,
  start_time: number,
  duration: number,
  stringNum: number,
  fret: number,
  technique: "normal" | "hammer-on" | "pull-off" | "slide" | "bend" = "normal",
  confidence = 0.94,
  tuning: string[] = DEFAULT_GUITAR_TUNING,
  capo = 0
) {
  const { midi, note_name } = computeMidiAndNoteName(
    stringNum,
    fret,
    tuning,
    capo
  );
  return {
    id,
    start_time: Number(start_time.toFixed(2)),
    duration: Number(duration.toFixed(2)),
    string: stringNum,
    fret,
    midi,
    note_name,
    confidence,
    technique,
  };
}

const NEO_SOUL_G_MEASURES: TabMeasure[] = [
  {
    measure_number: 1,
    start_time: 0.0,
    end_time: 2.4,
    notes: [
      makeNote("note-1", 0.0, 0.6, 6, 3, "normal", 0.96),
      makeNote("note-2", 0.6, 0.6, 4, 0, "normal", 0.93),
      makeNote("note-3", 1.2, 0.6, 3, 0, "hammer-on", 0.94),
      makeNote("note-4", 1.8, 0.6, 2, 3, "normal", 0.95),
    ],
  },
  {
    measure_number: 2,
    start_time: 2.4,
    end_time: 4.8,
    notes: [
      makeNote("note-5", 2.4, 0.6, 6, 2, "normal", 0.91),
      makeNote("note-6", 3.0, 0.6, 3, 2, "normal", 0.92),
      makeNote("note-7", 3.6, 0.6, 2, 3, "pull-off", 0.9),
      makeNote("note-8", 4.2, 0.6, 1, 2, "slide", 0.93),
    ],
  },
  {
    measure_number: 3,
    start_time: 4.8,
    end_time: 7.2,
    notes: [
      makeNote("note-9", 4.8, 0.6, 6, 0, "normal", 0.97),
      makeNote("note-10", 5.4, 0.6, 5, 2, "normal", 0.95),
      makeNote("note-11", 6.0, 0.6, 4, 2, "hammer-on", 0.94),
      makeNote("note-12", 6.6, 0.6, 2, 3, "bend", 0.91),
    ],
  },
  {
    measure_number: 4,
    start_time: 7.2,
    end_time: 9.6,
    notes: [
      makeNote("note-13", 7.2, 0.6, 5, 3, "normal", 0.95),
      makeNote("note-14", 7.8, 0.6, 4, 2, "normal", 0.94),
      makeNote("note-15", 8.4, 0.6, 3, 0, "normal", 0.96),
      makeNote("note-16", 9.0, 0.6, 2, 0, "normal", 0.95),
    ],
  },
  {
    measure_number: 5,
    start_time: 9.6,
    end_time: 12.0,
    notes: [
      makeNote("note-17", 9.6, 0.6, 5, 2, "normal", 0.92),
      makeNote("note-18", 10.2, 0.6, 4, 4, "normal", 0.9),
      makeNote("note-19", 10.8, 0.6, 3, 2, "normal", 0.93),
      makeNote("note-20", 11.4, 0.6, 2, 3, "slide", 0.91),
    ],
  },
  {
    measure_number: 6,
    start_time: 12.0,
    end_time: 14.4,
    notes: [
      makeNote("note-21", 12.0, 0.6, 6, 5, "normal", 0.94),
      makeNote("note-22", 12.6, 0.6, 4, 5, "normal", 0.92),
      makeNote("note-23", 13.2, 0.6, 3, 5, "normal", 0.93),
      makeNote("note-24", 13.8, 0.6, 1, 7, "pull-off", 0.91),
    ],
  },
  {
    measure_number: 7,
    start_time: 14.4,
    end_time: 16.8,
    notes: [
      makeNote("note-25", 14.4, 0.6, 4, 0, "normal", 0.96),
      makeNote("note-26", 15.0, 0.6, 3, 2, "normal", 0.94),
      makeNote("note-27", 15.6, 0.6, 2, 1, "normal", 0.92),
      makeNote("note-28", 16.2, 0.6, 1, 3, "pull-off", 0.9),
    ],
  },
  {
    measure_number: 8,
    start_time: 16.8,
    end_time: 19.2,
    notes: [
      makeNote("note-29", 16.8, 0.6, 6, 3, "normal", 0.97),
      makeNote("note-30", 17.4, 0.6, 4, 0, "normal", 0.95),
      makeNote("note-31", 18.0, 0.6, 3, 0, "normal", 0.96),
      makeNote("note-32", 18.6, 0.6, 1, 3, "normal", 0.95),
    ],
  },
];

const ACOUSTIC_C_MEASURES: TabMeasure[] = [
  {
    measure_number: 1,
    start_time: 0.0,
    end_time: 3.2,
    notes: [
      makeNote("ac-note-1", 0.0, 0.8, 5, 3, "normal", 0.96),
      makeNote("ac-note-2", 0.8, 0.8, 4, 2, "normal", 0.95),
      makeNote("ac-note-3", 1.6, 0.8, 3, 0, "normal", 0.96),
      makeNote("ac-note-4", 2.4, 0.8, 2, 1, "hammer-on", 0.94),
    ],
  },
  {
    measure_number: 2,
    start_time: 3.2,
    end_time: 6.4,
    notes: [
      makeNote("ac-note-5", 3.2, 0.8, 5, 2, "normal", 0.94),
      makeNote("ac-note-6", 4.0, 0.8, 4, 0, "normal", 0.95),
      makeNote("ac-note-7", 4.8, 0.8, 3, 0, "normal", 0.96),
      makeNote("ac-note-8", 5.6, 0.8, 2, 3, "pull-off", 0.92),
    ],
  },
  {
    measure_number: 3,
    start_time: 6.4,
    end_time: 9.6,
    notes: [
      makeNote("ac-note-9", 6.4, 0.8, 5, 0, "normal", 0.97),
      makeNote("ac-note-10", 7.2, 0.8, 4, 2, "normal", 0.95),
      makeNote("ac-note-11", 8.0, 0.8, 3, 0, "normal", 0.96),
      makeNote("ac-note-12", 8.8, 0.8, 2, 1, "slide", 0.93),
    ],
  },
  {
    measure_number: 4,
    start_time: 9.6,
    end_time: 12.8,
    notes: [
      makeNote("ac-note-13", 9.6, 0.8, 6, 1, "normal", 0.91),
      makeNote("ac-note-14", 10.4, 0.8, 4, 3, "normal", 0.93),
      makeNote("ac-note-15", 11.2, 0.8, 3, 2, "normal", 0.94),
      makeNote("ac-note-16", 12.0, 0.8, 1, 3, "normal", 0.95),
    ],
  },
];

const JAZZ_MEASURES: TabMeasure[] = [
  {
    measure_number: 1,
    start_time: 0.0,
    end_time: 2.0,
    notes: [
      makeNote("jz-note-1", 0.0, 0.5, 5, 3, "normal", 0.96),
      makeNote("jz-note-2", 0.5, 0.5, 4, 5, "normal", 0.94),
      makeNote("jz-note-3", 1.0, 0.5, 3, 3, "normal", 0.95),
      makeNote("jz-note-4", 1.5, 0.5, 2, 4, "slide", 0.93),
    ],
  },
  {
    measure_number: 2,
    start_time: 2.0,
    end_time: 4.0,
    notes: [
      makeNote("jz-note-5", 2.0, 0.5, 6, 1, "normal", 0.95),
      makeNote("jz-note-6", 2.5, 0.5, 4, 1, "normal", 0.93),
      makeNote("jz-note-7", 3.0, 0.5, 3, 2, "normal", 0.94),
      makeNote("jz-note-8", 3.5, 0.5, 2, 1, "bend", 0.91),
    ],
  },
  {
    measure_number: 3,
    start_time: 4.0,
    end_time: 6.0,
    notes: [
      makeNote("jz-note-9", 4.0, 0.5, 5, 1, "normal", 0.96),
      makeNote("jz-note-10", 4.5, 0.5, 4, 3, "normal", 0.95),
      makeNote("jz-note-11", 5.0, 0.5, 3, 2, "normal", 0.95),
      makeNote("jz-note-12", 5.5, 0.5, 2, 3, "hammer-on", 0.94),
    ],
  },
  {
    measure_number: 4,
    start_time: 6.0,
    end_time: 8.0,
    notes: [
      makeNote("jz-note-13", 6.0, 0.5, 5, 6, "normal", 0.93),
      makeNote("jz-note-14", 6.5, 0.5, 4, 5, "normal", 0.92),
      makeNote("jz-note-15", 7.0, 0.5, 3, 3, "normal", 0.94),
      makeNote("jz-note-16", 7.5, 0.5, 2, 3, "pull-off", 0.92),
    ],
  },
];

// Canonical ChordDiagram dictionary (frets: length 6, Low E to High E, -1 muted, 0 open, 1..24 fretted)
export const CHORD_DIAGRAM_DICTIONARY: Record<string, ChordDiagram> = {
  G: {
    chord: "G",
    frets: [3, 2, 0, 0, 0, 3],
    fingers: [2, 1, 0, 0, 0, 3],
    base_fret: 1,
  },
  "D/F#": {
    chord: "D/F#",
    frets: [2, -1, 0, 2, 3, 2],
    fingers: [1, 0, 0, 2, 4, 3],
    base_fret: 1,
  },
  Em: {
    chord: "Em",
    frets: [0, 2, 2, 0, 0, 0],
    fingers: [0, 2, 3, 0, 0, 0],
    base_fret: 1,
  },
  Em7: {
    chord: "Em7",
    frets: [0, 2, 2, 0, 3, 3],
    fingers: [0, 1, 2, 0, 3, 4],
    base_fret: 1,
  },
  Cmaj7: {
    chord: "Cmaj7",
    frets: [-1, 3, 2, 0, 0, 0],
    fingers: [0, 3, 2, 0, 0, 0],
    base_fret: 1,
  },
  Bm7: {
    chord: "Bm7",
    frets: [-1, 2, 4, 2, 3, 2],
    fingers: [0, 1, 3, 1, 2, 1],
    base_fret: 2,
  },
  Am9: {
    chord: "Am9",
    frets: [5, -1, 5, 5, 5, 7],
    fingers: [1, 0, 2, 3, 3, 4],
    base_fret: 5,
  },
  Am7: {
    chord: "Am7",
    frets: [-1, 0, 2, 0, 1, 0],
    fingers: [0, 0, 2, 0, 1, 0],
    base_fret: 1,
  },
  D7sus4: {
    chord: "D7sus4",
    frets: [-1, -1, 0, 2, 1, 3],
    fingers: [0, 0, 0, 2, 1, 3],
    base_fret: 1,
  },
  D7: {
    chord: "D7",
    frets: [-1, -1, 0, 2, 1, 2],
    fingers: [0, 0, 0, 2, 1, 3],
    base_fret: 1,
  },
  D: {
    chord: "D",
    frets: [-1, -1, 0, 2, 3, 2],
    fingers: [0, 0, 0, 1, 3, 2],
    base_fret: 1,
  },
  C: {
    chord: "C",
    frets: [-1, 3, 2, 0, 1, 0],
    fingers: [0, 3, 2, 0, 1, 0],
    base_fret: 1,
  },
  "G/B": {
    chord: "G/B",
    frets: [-1, 2, 0, 0, 3, 3],
    fingers: [0, 1, 0, 0, 3, 4],
    base_fret: 1,
  },
  Fadd9: {
    chord: "Fadd9",
    frets: [1, 3, 3, 2, 1, 3],
    fingers: [1, 3, 4, 2, 1, 4],
    base_fret: 1,
  },
  Dm7: {
    chord: "Dm7",
    frets: [-1, -1, 0, 2, 1, 1],
    fingers: [0, 0, 0, 2, 1, 1],
    base_fret: 1,
  },
  G7sus4: {
    chord: "G7sus4",
    frets: [3, 3, 0, 0, 1, 1],
    fingers: [2, 3, 0, 0, 1, 1],
    base_fret: 1,
  },
  Gmaj7: {
    chord: "Gmaj7",
    frets: [3, -1, 4, 4, 3, -1],
    fingers: [1, 0, 3, 4, 2, 0],
    base_fret: 3,
  },
  "G6/9": {
    chord: "G6/9",
    frets: [3, 2, 2, 2, 3, 3],
    fingers: [2, 1, 1, 1, 3, 4],
    base_fret: 1,
  },
  Gmaj9: {
    chord: "Gmaj9",
    frets: [3, -1, 4, 2, 3, -1],
    fingers: [2, 0, 4, 1, 3, 0],
    base_fret: 2,
  },
  Cadd9: {
    chord: "Cadd9",
    frets: [-1, 3, 2, 0, 3, 3],
    fingers: [0, 2, 1, 0, 3, 4],
    base_fret: 1,
  },
  "Gmaj7#11": {
    chord: "Gmaj7#11",
    frets: [3, -1, 4, 4, 2, -1],
    fingers: [2, 0, 3, 4, 1, 0],
    base_fret: 2,
  },
  Em9: {
    chord: "Em9",
    frets: [0, 2, 0, 0, 0, 2],
    fingers: [0, 1, 0, 0, 0, 2],
    base_fret: 1,
  },
  Em11: {
    chord: "Em11",
    frets: [0, 2, 2, 2, 3, 3],
    fingers: [0, 1, 1, 1, 2, 3],
    base_fret: 1,
  },
  Cmaj9: {
    chord: "Cmaj9",
    frets: [-1, 3, 2, 4, 3, -1],
    fingers: [0, 2, 1, 4, 3, 0],
    base_fret: 2,
  },
  "C6/9": {
    chord: "C6/9",
    frets: [-1, 3, 2, 2, 3, 3],
    fingers: [0, 2, 1, 1, 3, 4],
    base_fret: 1,
  },
  Cm7: {
    chord: "Cm7",
    frets: [-1, 3, 5, 3, 4, 3],
    fingers: [0, 1, 3, 1, 2, 1],
    base_fret: 3,
  },
  F7: {
    chord: "F7",
    frets: [1, 3, 1, 2, 1, 1],
    fingers: [1, 3, 1, 2, 1, 1],
    base_fret: 1,
  },
  Bbmaj7: {
    chord: "Bbmaj7",
    frets: [-1, 1, 3, 2, 3, 1],
    fingers: [0, 1, 3, 2, 4, 1],
    base_fret: 1,
  },
  Ebmaj7: {
    chord: "Ebmaj7",
    frets: [-1, 6, 8, 7, 8, 6],
    fingers: [0, 1, 3, 2, 4, 1],
    base_fret: 6,
  },
  "Am7(b5)": {
    chord: "Am7(b5)",
    frets: [5, -1, 5, 5, 4, -1],
    fingers: [2, 0, 3, 4, 1, 0],
    base_fret: 4,
  },
  "D7(b9)": {
    chord: "D7(b9)",
    frets: [-1, 5, 4, 5, 4, -1],
    fingers: [0, 2, 1, 3, 1, 0],
    base_fret: 4,
  },
  Gm7: {
    chord: "Gm7",
    frets: [3, 5, 3, 3, 3, 3],
    fingers: [1, 3, 1, 1, 1, 1],
    base_fret: 3,
  },
};

export function resolveChordDiagram(
  chordName: string,
  diagrams?: ChordDiagram[]
): ChordDiagram {
  if (diagrams && diagrams.length > 0) {
    const exact = diagrams.find(
      (d) => d.chord.toLowerCase() === chordName.toLowerCase()
    );
    if (exact) return exact;
  }
  if (CHORD_DIAGRAM_DICTIONARY[chordName]) {
    return CHORD_DIAGRAM_DICTIONARY[chordName];
  }
  const clean = chordName.split(" ")[0].trim();
  if (CHORD_DIAGRAM_DICTIONARY[clean]) {
    return { ...CHORD_DIAGRAM_DICTIONARY[clean], chord: chordName };
  }
  const rootOnly = clean.split("/")[0].trim();
  if (CHORD_DIAGRAM_DICTIONARY[rootOnly]) {
    return { ...CHORD_DIAGRAM_DICTIONARY[rootOnly], chord: chordName };
  }
  return {
    chord: chordName,
    frets: [3, 2, 0, 0, 0, 3],
    fingers: [2, 1, 0, 0, 0, 3],
    base_fret: 1,
  };
}

export const MOCK_ANALYSIS_RESPONSE: AnalysisResponse = {
  job_id: "7b084e85-4bc5-4dbb-a639-c1ee824c6020",
  status: "completed",
  metadata: {
    filename: "neo_soul_groove_g_major.mp3",
    duration: 180.5,
    key: "G Major",
    bpm: 105,
    time_signature: "4/4",
  },
  chords: [
    { chord: "G", start_time: 0.0, end_time: 2.4, confidence: 0.94 },
    { chord: "D/F#", start_time: 2.4, end_time: 4.8, confidence: 0.88 },
    { chord: "Em7", start_time: 4.8, end_time: 7.2, confidence: 0.96 },
    { chord: "Cmaj7", start_time: 7.2, end_time: 9.6, confidence: 0.92 },
    { chord: "Bm7", start_time: 9.6, end_time: 12.0, confidence: 0.89 },
    { chord: "Am9", start_time: 12.0, end_time: 14.4, confidence: 0.91 },
    { chord: "D7sus4", start_time: 14.4, end_time: 16.8, confidence: 0.87 },
    { chord: "G", start_time: 16.8, end_time: 19.2, confidence: 0.95 },
    // Bar 5 - 8
    { chord: "G", start_time: 19.2, end_time: 21.6, confidence: 0.93 },
    { chord: "D/F#", start_time: 21.6, end_time: 24.0, confidence: 0.86 },
    { chord: "Em7", start_time: 24.0, end_time: 26.4, confidence: 0.95 },
    { chord: "Cmaj7", start_time: 26.4, end_time: 28.8, confidence: 0.94 },
    { chord: "Bm7", start_time: 28.8, end_time: 31.2, confidence: 0.9 },
    { chord: "Am9", start_time: 31.2, end_time: 33.6, confidence: 0.92 },
    { chord: "D7sus4", start_time: 33.6, end_time: 36.0, confidence: 0.89 },
    { chord: "G", start_time: 36.0, end_time: 38.4, confidence: 0.96 },
    // Bridge section
    { chord: "Cmaj7", start_time: 38.4, end_time: 43.2, confidence: 0.93 },
    { chord: "Bm7", start_time: 43.2, end_time: 48.0, confidence: 0.91 },
    { chord: "Am7", start_time: 48.0, end_time: 52.8, confidence: 0.92 },
    { chord: "D7", start_time: 52.8, end_time: 57.6, confidence: 0.89 },
    { chord: "G", start_time: 57.6, end_time: 62.4, confidence: 0.95 },
    // Chorus
    { chord: "Em7", start_time: 62.4, end_time: 67.2, confidence: 0.94 },
    { chord: "Cmaj7", start_time: 67.2, end_time: 72.0, confidence: 0.96 },
    { chord: "G", start_time: 72.0, end_time: 76.8, confidence: 0.95 },
    { chord: "D/F#", start_time: 76.8, end_time: 81.6, confidence: 0.88 },
    { chord: "Em7", start_time: 81.6, end_time: 86.4, confidence: 0.93 },
    { chord: "Cmaj7", start_time: 86.4, end_time: 91.2, confidence: 0.97 },
    { chord: "Am9", start_time: 91.2, end_time: 96.0, confidence: 0.91 },
    { chord: "D7sus4", start_time: 96.0, end_time: 100.8, confidence: 0.89 },
    { chord: "G", start_time: 100.8, end_time: 105.6, confidence: 0.96 },
    // Solo / Outro loop until 180.5
    { chord: "G", start_time: 105.6, end_time: 115.2, confidence: 0.94 },
    { chord: "D/F#", start_time: 115.2, end_time: 124.8, confidence: 0.87 },
    { chord: "Em7", start_time: 124.8, end_time: 134.4, confidence: 0.95 },
    { chord: "Cmaj7", start_time: 134.4, end_time: 144.0, confidence: 0.93 },
    { chord: "Bm7", start_time: 144.0, end_time: 153.6, confidence: 0.89 },
    { chord: "Am9", start_time: 153.6, end_time: 163.2, confidence: 0.92 },
    { chord: "D7sus4", start_time: 163.2, end_time: 172.8, confidence: 0.88 },
    { chord: "G", start_time: 172.8, end_time: 180.5, confidence: 0.97 },
  ],
  improvisations: [
    {
      original_chord: "G",
      style: "Neo Soul",
      suggestions: ["Gmaj7", "G6/9", "Gmaj9"],
    },
    {
      original_chord: "G",
      style: "Jazz",
      suggestions: ["Gmaj7#11", "G13", "Gmaj9"],
    },
    {
      original_chord: "G",
      style: "Fingerstyle",
      suggestions: ["Gsus2", "Gadd9", "G/B"],
    },
    {
      original_chord: "G",
      style: "Pop",
      suggestions: ["Gadd9", "Gsus4", "G/B"],
    },
    {
      original_chord: "D/F#",
      style: "Neo Soul",
      suggestions: ["Dmaj7/F#", "F#m7(b5)", "D9/F#"],
    },
    {
      original_chord: "D/F#",
      style: "Jazz",
      suggestions: ["F#dim7", "D7alt/F#", "Am6/F#"],
    },
    {
      original_chord: "D/F#",
      style: "Pop",
      suggestions: ["Dsus2/F#", "D/A", "Bm7/F#"],
    },
    {
      original_chord: "D/F#",
      style: "Fingerstyle",
      suggestions: ["D5/F#", "Dsus4/F#", "F#m11"],
    },
    {
      original_chord: "Em7",
      style: "Neo Soul",
      suggestions: ["Em9", "Em11", "Eb7#9 (tritone sub)"],
    },
    {
      original_chord: "Em7",
      style: "Jazz",
      suggestions: ["Em(maj7)", "Em6/9", "Gmaj7/E"],
    },
    {
      original_chord: "Em7",
      style: "Pop",
      suggestions: ["Esus4", "Em9", "Cmaj7/E"],
    },
    {
      original_chord: "Em7",
      style: "Fingerstyle",
      suggestions: ["Em7(add11)", "Esus2", "G/E"],
    },
    {
      original_chord: "Cmaj7",
      style: "Neo Soul",
      suggestions: ["Cmaj9", "C6/9", "Cmaj7(#11)"],
    },
    {
      original_chord: "Cmaj7",
      style: "Jazz",
      suggestions: ["Cmaj13", "Cmaj7#11", "Em7/C"],
    },
    {
      original_chord: "Cmaj7",
      style: "Pop",
      suggestions: ["Cadd9", "Csus2", "Am7/C"],
    },
    {
      original_chord: "Cmaj7",
      style: "Fingerstyle",
      suggestions: ["Cadd9", "Cmaj7(no3)", "Fmaj7/C"],
    },
    {
      original_chord: "Am9",
      style: "Neo Soul",
      suggestions: ["Am11", "A7#9", "Am(add9)"],
    },
    {
      original_chord: "Am9",
      style: "Jazz",
      suggestions: ["Am6", "Am11", "F#m7(b5)"],
    },
    {
      original_chord: "Am9",
      style: "Pop",
      suggestions: ["Am7", "Asus2", "C/A"],
    },
    {
      original_chord: "Am9",
      style: "Fingerstyle",
      suggestions: ["Am7(no5)", "Am9 open", "Dsus2/A"],
    },
    {
      original_chord: "D7sus4",
      style: "Neo Soul",
      suggestions: ["D9sus4", "C/D", "Ab13 (tritone)"],
    },
    {
      original_chord: "D7sus4",
      style: "Jazz",
      suggestions: ["D7(b9,b13)", "D13sus4", "Fm7/D"],
    },
    {
      original_chord: "D7sus4",
      style: "Pop",
      suggestions: ["D7", "Dsus4", "Dadd9"],
    },
    {
      original_chord: "D7sus4",
      style: "Fingerstyle",
      suggestions: ["D2", "Dsus4/A", "D5"],
    },
  ],
  chord_diagrams: [
    CHORD_DIAGRAM_DICTIONARY["G"],
    CHORD_DIAGRAM_DICTIONARY["D/F#"],
    CHORD_DIAGRAM_DICTIONARY["Em7"],
    CHORD_DIAGRAM_DICTIONARY["Cmaj7"],
    CHORD_DIAGRAM_DICTIONARY["Bm7"],
    CHORD_DIAGRAM_DICTIONARY["Am9"],
    CHORD_DIAGRAM_DICTIONARY["D7sus4"],
    CHORD_DIAGRAM_DICTIONARY["Am7"],
    CHORD_DIAGRAM_DICTIONARY["D7"],
  ],
  tablature: {
    tuning: DEFAULT_GUITAR_TUNING,
    capo: 0,
    difficulty: "Intermediate",
    measures: NEO_SOUL_G_MEASURES,
    ascii_tab: generateAsciiTab(NEO_SOUL_G_MEASURES, DEFAULT_GUITAR_TUNING),
  },
};

export const PRESET_TRACKS: Record<string, AnalysisResponse> = {
  "neo-soul-g": MOCK_ANALYSIS_RESPONSE,
  "acoustic-c": {
    job_id: "job_acoustic_c_02",
    status: "completed",
    metadata: {
      filename: "acoustic_sunburst_c_major.wav",
      duration: 120.0,
      key: "C Major",
      bpm: 92,
      time_signature: "4/4",
    },
    chords: [
      { chord: "C", start_time: 0.0, end_time: 3.2, confidence: 0.95 },
      { chord: "G/B", start_time: 3.2, end_time: 6.4, confidence: 0.91 },
      { chord: "Am7", start_time: 6.4, end_time: 9.6, confidence: 0.94 },
      { chord: "Fadd9", start_time: 9.6, end_time: 12.8, confidence: 0.93 },
      { chord: "C", start_time: 12.8, end_time: 16.0, confidence: 0.96 },
      { chord: "G/B", start_time: 16.0, end_time: 19.2, confidence: 0.92 },
      { chord: "Am7", start_time: 19.2, end_time: 22.4, confidence: 0.93 },
      { chord: "Fadd9", start_time: 22.4, end_time: 25.6, confidence: 0.95 },
      { chord: "Dm7", start_time: 25.6, end_time: 28.8, confidence: 0.9 },
      { chord: "G7sus4", start_time: 28.8, end_time: 32.0, confidence: 0.89 },
      { chord: "C", start_time: 32.0, end_time: 120.0, confidence: 0.96 },
    ],
    improvisations: [
      {
        original_chord: "C",
        style: "Fingerstyle",
        suggestions: ["Cadd9", "Cmaj7", "C/E"],
      },
      {
        original_chord: "C",
        style: "Pop",
        suggestions: ["Csus2", "Cadd9", "F/C"],
      },
      {
        original_chord: "G/B",
        style: "Fingerstyle",
        suggestions: ["G6/B", "Gadd9/B", "Em7/B"],
      },
      {
        original_chord: "Am7",
        style: "Pop",
        suggestions: ["Am9", "Asus4", "Fmaj7/A"],
      },
      {
        original_chord: "Fadd9",
        style: "Neo Soul",
        suggestions: ["Fmaj9", "F6/9", "Fmaj7#11"],
      },
    ],
    chord_diagrams: [
      CHORD_DIAGRAM_DICTIONARY["C"],
      CHORD_DIAGRAM_DICTIONARY["G/B"],
      CHORD_DIAGRAM_DICTIONARY["Am7"],
      CHORD_DIAGRAM_DICTIONARY["Fadd9"],
      CHORD_DIAGRAM_DICTIONARY["Dm7"],
      CHORD_DIAGRAM_DICTIONARY["G7sus4"],
    ],
    tablature: {
      tuning: DEFAULT_GUITAR_TUNING,
      capo: 0,
      difficulty: "Beginner",
      measures: ACOUSTIC_C_MEASURES,
      ascii_tab: generateAsciiTab(ACOUSTIC_C_MEASURES, DEFAULT_GUITAR_TUNING),
    },
  },
  "jazz-ii-v-i": {
    job_id: "job_jazz_standard_03",
    status: "completed",
    metadata: {
      filename: "autumn_leaves_ii_v_i.mp3",
      duration: 144.0,
      key: "Bb Major",
      bpm: 124,
      time_signature: "4/4",
    },
    chords: [
      { chord: "Cm7", start_time: 0.0, end_time: 2.0, confidence: 0.96 },
      { chord: "F7", start_time: 2.0, end_time: 4.0, confidence: 0.93 },
      { chord: "Bbmaj7", start_time: 4.0, end_time: 6.0, confidence: 0.95 },
      { chord: "Ebmaj7", start_time: 6.0, end_time: 8.0, confidence: 0.92 },
      { chord: "Am7(b5)", start_time: 8.0, end_time: 10.0, confidence: 0.89 },
      { chord: "D7(b9)", start_time: 10.0, end_time: 12.0, confidence: 0.91 },
      { chord: "Gm7", start_time: 12.0, end_time: 16.0, confidence: 0.94 },
      { chord: "Cm7", start_time: 16.0, end_time: 18.0, confidence: 0.95 },
      { chord: "F7", start_time: 18.0, end_time: 20.0, confidence: 0.93 },
      { chord: "Bbmaj7", start_time: 20.0, end_time: 144.0, confidence: 0.96 },
    ],
    improvisations: [
      {
        original_chord: "Cm7",
        style: "Jazz",
        suggestions: ["Cm9", "Cm11", "Ebmaj7/C"],
      },
      {
        original_chord: "F7",
        style: "Jazz",
        suggestions: ["F13", "F7alt", "B7#11 (tritone sub)"],
      },
      {
        original_chord: "Bbmaj7",
        style: "Neo Soul",
        suggestions: ["Bbmaj9", "Bb6/9", "Bbmaj7#11"],
      },
    ],
    chord_diagrams: [
      CHORD_DIAGRAM_DICTIONARY["Cm7"],
      CHORD_DIAGRAM_DICTIONARY["F7"],
      CHORD_DIAGRAM_DICTIONARY["Bbmaj7"],
      CHORD_DIAGRAM_DICTIONARY["Ebmaj7"],
      CHORD_DIAGRAM_DICTIONARY["Am7(b5)"],
      CHORD_DIAGRAM_DICTIONARY["D7(b9)"],
      CHORD_DIAGRAM_DICTIONARY["Gm7"],
    ],
    tablature: {
      tuning: DEFAULT_GUITAR_TUNING,
      capo: 0,
      difficulty: "Advanced",
      measures: JAZZ_MEASURES,
      ascii_tab: generateAsciiTab(JAZZ_MEASURES, DEFAULT_GUITAR_TUNING),
    },
  },
};

// Guitar fret positions: [6th-E, 5th-A, 4th-D, 3rd-G, 2nd-B, 1st-e]
// 'x' = muted, 0 = open string, number = fret index
export const GUITAR_CHORD_VOICINGS: Record<string, ChordVoicingDetail> = {
  G: {
    chord: "G",
    frets: [3, 2, 0, 0, 0, 3],
    fingers: [2, 1, 0, 0, 0, 3],
    description: "Standard open G major triad",
  },
  "D/F#": {
    chord: "D/F#",
    frets: [2, "x", 0, 2, 3, 2],
    fingers: [1, 0, 0, 2, 4, 3],
    description: "First inversion D triad with F# in the bass",
  },
  Em: {
    chord: "Em",
    frets: [0, 2, 2, 0, 0, 0],
    fingers: [0, 2, 3, 0, 0, 0],
    description: "Standard open E minor triad",
  },
  Em7: {
    chord: "Em7",
    frets: [0, 2, 2, 0, 3, 3],
    fingers: [0, 1, 2, 0, 3, 4],
    description: "Open Em7 acoustic voicing",
  },
  Cmaj7: {
    chord: "Cmaj7",
    frets: ["x", 3, 2, 0, 0, 0],
    fingers: [0, 3, 2, 0, 0, 0],
    description: "Lush open C major 7th",
  },
  Bm7: {
    chord: "Bm7",
    frets: ["x", 2, 4, 2, 3, 2],
    fingers: [0, 1, 3, 1, 2, 1],
    baseFret: 2,
    description: "Root-5 minor 7th barre chord",
  },
  Am9: {
    chord: "Am9",
    frets: [5, "x", 5, 5, 5, 7],
    fingers: [1, 0, 2, 3, 3, 4],
    baseFret: 5,
    description: "Neo-Soul root-6 Am9 voicing",
  },
  Am7: {
    chord: "Am7",
    frets: ["x", 0, 2, 0, 1, 0],
    fingers: [0, 0, 2, 0, 1, 0],
    description: "Warm open Am7",
  },
  D7sus4: {
    chord: "D7sus4",
    frets: ["x", "x", 0, 2, 1, 3],
    fingers: [0, 0, 0, 2, 1, 3],
    description: "Suspended dominant with melodic pull",
  },
  D7: {
    chord: "D7",
    frets: ["x", "x", 0, 2, 1, 2],
    fingers: [0, 0, 0, 2, 1, 3],
    description: "Dominant 7th resolution",
  },
  D: {
    chord: "D",
    frets: ["x", "x", 0, 2, 3, 2],
    fingers: [0, 0, 0, 1, 3, 2],
    description: "Standard open D major triad",
  },
  C: {
    chord: "C",
    frets: ["x", 3, 2, 0, 1, 0],
    fingers: [0, 3, 2, 0, 1, 0],
    description: "Standard open C major triad",
  },
  "G/B": {
    chord: "G/B",
    frets: ["x", 2, 0, 0, 3, 3],
    fingers: [0, 1, 0, 0, 3, 4],
    description: "G major with B in bass (smooth stepwise motion)",
  },
  Fadd9: {
    chord: "Fadd9",
    frets: [1, 3, 3, 2, 1, 3],
    fingers: [1, 3, 4, 2, 1, 4],
    description: "Modern pop/acoustic F chord with high G",
  },
  Dm7: {
    chord: "Dm7",
    frets: ["x", "x", 0, 2, 1, 1],
    fingers: [0, 0, 0, 2, 1, 1],
    description: "Open D minor 7th",
  },
  Gmaj7: {
    chord: "Gmaj7",
    frets: [3, "x", 4, 4, 3, "x"],
    fingers: [1, 0, 3, 4, 2, 0],
    baseFret: 3,
    description: "Smooth Neo-Soul / Jazz root-6 drop-2 voicing",
  },
  "G6/9": {
    chord: "G6/9",
    frets: [3, 2, 2, 2, 3, 3],
    fingers: [2, 1, 1, 1, 3, 4],
    description: "Airy Brazilian Bossa / Neo Soul voicing",
  },
  Gmaj9: {
    chord: "Gmaj9",
    frets: [3, "x", 4, 2, 3, "x"],
    fingers: [2, 0, 4, 1, 3, 0],
    baseFret: 3,
    description: "Extended major 9th voicing",
  },
  Cadd9: {
    chord: "Cadd9",
    frets: ["x", 3, 2, 0, 3, 3],
    fingers: [0, 2, 1, 0, 3, 4],
    description: "Classic shimmering acoustic voicing",
  },
  "Gmaj7#11": {
    chord: "Gmaj7#11",
    frets: [3, "x", 4, 4, 2, "x"],
    fingers: [2, 0, 3, 4, 1, 0],
    description: "Lydian modal guitar voicing",
  },
  Em9: {
    chord: "Em9",
    frets: [0, 2, 0, 0, 0, 2],
    fingers: [0, 1, 0, 0, 0, 2],
    description: "Rich, contemplative 9th chord",
  },
  Em11: {
    chord: "Em11",
    frets: [0, 2, 2, 2, 3, 3],
    fingers: [0, 1, 1, 1, 2, 3],
    description: "Modern neo-soul open extension",
  },
  Cmaj9: {
    chord: "Cmaj9",
    frets: ["x", 3, 2, 4, 3, "x"],
    fingers: [0, 2, 1, 4, 3, 0],
    baseFret: 3,
    description: "Root-5 jazz/soul major 9th",
  },
  "C6/9": {
    chord: "C6/9",
    frets: ["x", 3, 2, 2, 3, 3],
    fingers: [0, 2, 1, 1, 3, 4],
    description: "Pastoral pentatonic chord",
  },
};
