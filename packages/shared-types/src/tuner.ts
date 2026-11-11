import { ChordDiagram } from './chords';

export type TuningPresetId =
  | 'standard'
  | 'drop_d'
  | 'half_step_down'
  | 'open_g'
  | 'dadgad';

export type TuningStatus = 'flat' | 'in_tune' | 'sharp';

export interface TuningStringTarget {
  string: number; // 1 to 6, where 1 = High E and 6 = Low E
  note: string; // e.g., "E2", "A2", "D3", "G3", "B3", "E4"
  frequency_hz: number; // e.g., 82.41, 110.00, 146.83, 196.00, 246.94, 329.63
  midi: number; // e.g., 40, 45, 50, 55, 59, 64
}

export interface TuningPreset {
  id: TuningPresetId;
  name: string; // e.g., "Standard (E A D G B E)", "Drop D (D A D G B E)"
  description: string;
  reference_a4_hz: number; // default 440.0
  strings: TuningStringTarget[]; // length 6, ordered from string 6 Low to string 1 High
}

export interface TunerPitchResult {
  detected_frequency_hz: number;
  detected_note: string; // e.g., "E2"
  closest_string: number; // 1 to 6
  target_note: string;
  target_frequency_hz: number;
  cents_deviation: number; // -50.0 to +50.0, where 0.0 is perfectly in tune
  tuning_status: TuningStatus; // "flat" | "in_tune" | "sharp" (in_tune when abs(cents_deviation) <= 3.5)
  confidence: number; // 0.0 to 1.0
}

export interface LiveChordFrameRequest {
  chroma?: number[] | null; // 12-element pitch class energy vector [C, C#, D, D#, E, F, F#, G, G#, A, A#, B]
  pcm_samples?: number[] | null; // optional downsampled mono audio buffer
  sample_rate?: number; // default 22050
  tuning_preset?: TuningPresetId; // default "standard"
}

export interface LiveChordDetectionResult {
  chord: string; // e.g., "Cmaj7", "Am", "G7", or "N" when silence/unrecognized
  root: string; // e.g., "C", "A", "G"
  quality: string; // e.g., "maj7", "minor", "dom7"
  confidence: number; // 0.0 to 1.0
  voicing?: ChordDiagram | null; // 6-string SVG chord diagram for the detected chord
  notes_detected: string[]; // e.g., ["C", "E", "G", "B"]
  timestamp_ms: number;
}
