/**
 * Web Audio Edge DSP: Real-Time Chromagram & Live Chord Recognition Engine
 *
 * Computes 12-bin Pitch Class Profile (chroma [C..B]) from AnalyserNode FFT spectrum,
 * applies an RMS noise gate, and performs client-side harmonic template matching
 * for instant offline/mock feedback and WebSocket fallback.
 */

import { ChordDiagram, LiveChordDetectionResult } from "../types";

export const PITCH_CLASSES = [
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

// Common 6-string guitar chord voicings for live chord display
export const STANDARD_CHORD_VOICINGS: Record<string, ChordDiagram> = {
  C: { chord: "C", frets: [-1, 3, 2, 0, 1, 0], fingers: [0, 3, 2, 0, 1, 0], base_fret: 1 },
  Cmaj7: { chord: "Cmaj7", frets: [-1, 3, 2, 0, 0, 0], fingers: [0, 3, 2, 0, 0, 0], base_fret: 1 },
  C7: { chord: "C7", frets: [-1, 3, 2, 3, 1, 0], fingers: [0, 3, 2, 4, 1, 0], base_fret: 1 },
  Cm: { chord: "Cm", frets: [-1, 3, 5, 5, 4, 3], fingers: [0, 1, 3, 4, 2, 1], base_fret: 3 },
  Cm7: { chord: "Cm7", frets: [-1, 3, 5, 3, 4, 3], fingers: [0, 1, 3, 1, 2, 1], base_fret: 3 },

  D: { chord: "D", frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2], base_fret: 1 },
  Dmaj7: { chord: "Dmaj7", frets: [-1, -1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 1, 1], base_fret: 1 },
  D7: { chord: "D7", frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3], base_fret: 1 },
  Dm: { chord: "Dm", frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1], base_fret: 1 },
  Dm7: { chord: "Dm7", frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1], base_fret: 1 },

  E: { chord: "E", frets: [0, 2, 2, 1, 0, 0], fingers: [0, 2, 3, 1, 0, 0], base_fret: 1 },
  Emaj7: { chord: "Emaj7", frets: [0, 2, 1, 1, 0, 0], fingers: [0, 2, 1, 1, 0, 0], base_fret: 1 },
  E7: { chord: "E7", frets: [0, 2, 0, 1, 0, 0], fingers: [0, 2, 0, 1, 0, 0], base_fret: 1 },
  Em: { chord: "Em", frets: [0, 2, 2, 0, 0, 0], fingers: [0, 2, 3, 0, 0, 0], base_fret: 1 },
  Em7: { chord: "Em7", frets: [0, 2, 2, 0, 3, 0], fingers: [0, 2, 3, 0, 4, 0], base_fret: 1 },

  F: { chord: "F", frets: [1, 3, 3, 2, 1, 1], fingers: [1, 3, 4, 2, 1, 1], base_fret: 1 },
  Fmaj7: { chord: "Fmaj7", frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0], base_fret: 1 },
  F7: { chord: "F7", frets: [1, 3, 1, 2, 1, 1], fingers: [1, 3, 1, 2, 1, 1], base_fret: 1 },
  Fm: { chord: "Fm", frets: [1, 3, 3, 1, 1, 1], fingers: [1, 3, 4, 1, 1, 1], base_fret: 1 },

  G: { chord: "G", frets: [3, 2, 0, 0, 0, 3], fingers: [2, 1, 0, 0, 0, 3], base_fret: 1 },
  Gmaj7: { chord: "Gmaj7", frets: [3, 2, 0, 0, 0, 2], fingers: [3, 2, 0, 0, 0, 1], base_fret: 1 },
  G7: { chord: "G7", frets: [3, 2, 0, 0, 0, 1], fingers: [3, 2, 0, 0, 0, 1], base_fret: 1 },
  Gm: { chord: "Gm", frets: [3, 5, 5, 3, 3, 3], fingers: [1, 3, 4, 1, 1, 1], base_fret: 3 },
  Gm7: { chord: "Gm7", frets: [3, 5, 3, 3, 3, 3], fingers: [1, 3, 1, 1, 1, 1], base_fret: 3 },

  A: { chord: "A", frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 0, 1, 2, 3, 0], base_fret: 1 },
  Amaj7: { chord: "Amaj7", frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 0, 2, 1, 3, 0], base_fret: 1 },
  A7: { chord: "A7", frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 0, 2, 0, 3, 0], base_fret: 1 },
  Am: { chord: "Am", frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 0, 2, 3, 1, 0], base_fret: 1 },
  Am7: { chord: "Am7", frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 0, 2, 0, 1, 0], base_fret: 1 },

  B: { chord: "B", frets: [-1, 2, 4, 4, 4, 2], fingers: [0, 1, 2, 3, 4, 1], base_fret: 2 },
  Bmaj7: { chord: "Bmaj7", frets: [-1, 2, 4, 3, 4, 2], fingers: [0, 1, 3, 2, 4, 1], base_fret: 2 },
  B7: { chord: "B7", frets: [-1, 2, 1, 2, 0, 2], fingers: [0, 2, 1, 3, 0, 4], base_fret: 1 },
  Bm: { chord: "Bm", frets: [-1, 2, 4, 4, 3, 2], fingers: [0, 1, 3, 4, 2, 1], base_fret: 2 },
  Bm7: { chord: "Bm7", frets: [-1, 2, 0, 2, 0, 2], fingers: [0, 2, 0, 3, 0, 4], base_fret: 1 },

  // Suspended chords
  Dsus4: { chord: "Dsus4", frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 2, 3], base_fret: 1 },
  Asus4: { chord: "Asus4", frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 0, 1, 2, 3, 0], base_fret: 1 },
  Esus4: { chord: "Esus4", frets: [0, 2, 2, 2, 0, 0], fingers: [0, 1, 2, 3, 0, 0], base_fret: 1 },
  Gsus4: { chord: "Gsus4", frets: [3, 3, 0, 0, 1, 3], fingers: [2, 3, 0, 0, 1, 4], base_fret: 1 },
};

/**
 * Harmonic template profiles for chord matching
 */
interface ChordTemplate {
  name: string;
  root: string;
  quality: string;
  vector: number[]; // 12 elements
}

function buildChordTemplates(): ChordTemplate[] {
  const templates: ChordTemplate[] = [];

  const qualities = [
    { suffix: "", label: "major", pattern: [0, 4, 7], weight: 1.0 },
    { suffix: "m", label: "minor", pattern: [0, 3, 7], weight: 1.0 },
    { suffix: "7", label: "dom7", pattern: [0, 4, 7, 10], weight: 1.1 },
    { suffix: "maj7", label: "maj7", pattern: [0, 4, 7, 11], weight: 1.1 },
    { suffix: "m7", label: "m7", pattern: [0, 3, 7, 10], weight: 1.1 },
    { suffix: "sus4", label: "sus4", pattern: [0, 5, 7], weight: 0.95 },
  ];

  PITCH_CLASSES.forEach((root, rootIdx) => {
    qualities.forEach((q) => {
      const vec = new Array(12).fill(0);
      q.pattern.forEach((semitone, semitoneIdx) => {
        const bin = (rootIdx + semitone) % 12;
        // Give root and 3rd higher weight
        const w = semitoneIdx === 0 ? 1.0 : semitoneIdx === 1 ? 0.9 : 0.8;
        vec[bin] = w;
      });

      // Normalize template vector
      const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
      const normalizedVec = vec.map((v) => (norm > 0 ? v / norm : 0));

      templates.push({
        name: `${root}${q.suffix}`,
        root,
        quality: q.label,
        vector: normalizedVec,
      });
    });
  });

  return templates;
}

const CHORD_TEMPLATES = buildChordTemplates();

/**
 * Calculate RMS energy from time domain samples
 */
export function calculateRms(buffer: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i++) {
    sumSquares += buffer[i] * buffer[i];
  }
  return Math.sqrt(sumSquares / buffer.length);
}

/**
 * Extracts a 12-bin Pitch Class Profile (chroma) vector from FFT frequency data.
 * Works with Float32Array dB values (from getFloatFrequencyData).
 */
export function extractChromaFromFft(
  freqDbData: Float32Array,
  sampleRate: number,
  fftSize: number
): number[] {
  const chroma = new Array(12).fill(0);
  const binCount = freqDbData.length;
  const binFreqStep = sampleRate / fftSize;

  // Search range: Guitar spectrum fundamentals & harmonics ~70Hz to 1600Hz
  const minFreq = 70;
  const maxFreq = 1600;
  const minBin = Math.max(1, Math.floor(minFreq / binFreqStep));
  const maxBin = Math.min(binCount - 1, Math.ceil(maxFreq / binFreqStep));

  for (let k = minBin; k <= maxBin; k++) {
    const db = freqDbData[k];
    if (db < -80 || isNaN(db)) continue; // ignore noise floor

    // Convert dB to linear power
    const linearMag = Math.pow(10, db / 20);
    const freq = k * binFreqStep;

    // Convert freq to MIDI pitch number
    const midi = 69 + 12 * Math.log2(freq / 440.0);
    const pitchClass = ((Math.round(midi) % 12) + 12) % 12;

    // Accumulate energy
    chroma[pitchClass] += linearMag * linearMag;
  }

  // Find max energy for normalization to 0.0 - 1.0 range
  let maxEnergy = 0;
  for (let i = 0; i < 12; i++) {
    if (chroma[i] > maxEnergy) maxEnergy = chroma[i];
  }

  if (maxEnergy <= 0) {
    return new Array(12).fill(0);
  }

  return chroma.map((v) => Math.round((v / maxEnergy) * 1000) / 1000);
}

/**
 * Match a normalized 12-bin chroma vector against chord templates using Cosine Similarity.
 */
export function matchChromaToChord(
  chroma: number[],
  rms = 0.05
): LiveChordDetectionResult {
  const timestamp_ms = Date.now();

  // Noise gate: if silent or near zero energy, return "N" (silence / listening)
  const chromaNorm = Math.sqrt(chroma.reduce((s, v) => s + v * v, 0));
  if (rms < 0.015 || chromaNorm < 0.1) {
    return {
      chord: "N",
      root: "",
      quality: "",
      confidence: 0,
      voicing: null,
      notes_detected: [],
      timestamp_ms,
    };
  }

  // Find detected pitch classes (bins with energy >= 0.35 of peak)
  const notes_detected: string[] = [];
  chroma.forEach((val, idx) => {
    if (val >= 0.35) {
      notes_detected.push(PITCH_CLASSES[idx]);
    }
  });

  // Normalized input vector for cosine similarity
  const unitChroma = chroma.map((v) => v / chromaNorm);

  let bestMatch: ChordTemplate | null = null;
  let highestScore = -1;

  for (const t of CHORD_TEMPLATES) {
    let dot = 0;
    for (let i = 0; i < 12; i++) {
      dot += unitChroma[i] * t.vector[i];
    }

    if (dot > highestScore) {
      highestScore = dot;
      bestMatch = t;
    }
  }

  // Confidence threshold
  if (!bestMatch || highestScore < 0.42) {
    return {
      chord: "N",
      root: "",
      quality: "",
      confidence: Math.round(highestScore * 100) / 100,
      voicing: null,
      notes_detected,
      timestamp_ms,
    };
  }

  const chordName = bestMatch.name;
  const voicing = STANDARD_CHORD_VOICINGS[chordName] || null;

  return {
    chord: chordName,
    root: bestMatch.root,
    quality: formatChordQuality(bestMatch.quality),
    confidence: Math.min(1.0, Math.round(highestScore * 100) / 100),
    voicing,
    notes_detected,
    timestamp_ms,
  };
}

/**
 * Human-readable quality label
 */
export function formatChordQuality(quality: string): string {
  switch (quality) {
    case "major":
      return "Major Triad";
    case "minor":
      return "Minor Triad";
    case "maj7":
      return "Major 7th";
    case "m7":
      return "Minor 7th";
    case "dom7":
      return "Dominant 7th";
    case "sus4":
      return "Suspended 4th";
    default:
      return quality || "Chord";
  }
}
