/**
 * Web Audio Edge DSP: Real-Time Autocorrelation Pitch Detector & Guitar Tuner Engine
 *
 * Implements 60fps time-domain autocorrelation pitch extraction, cents deviation calculation,
 * tuning evaluation against canonical tuning presets, and reference tone generation.
 */

import {
  TuningPreset,
  TuningPresetId,
  TuningStatus,
  TuningStringTarget,
  TunerPitchResult,
} from "../types";

export const CANONICAL_TUNING_PRESETS: TuningPreset[] = [
  {
    id: "standard",
    name: "Standard (E A D G B E)",
    description: "Standard guitar tuning (E2 A2 D3 G3 B3 E4)",
    reference_a4_hz: 440.0,
    strings: [
      { string: 6, note: "E2", frequency_hz: 82.41, midi: 40 },
      { string: 5, note: "A2", frequency_hz: 110.0, midi: 45 },
      { string: 4, note: "D3", frequency_hz: 146.83, midi: 50 },
      { string: 3, note: "G3", frequency_hz: 196.0, midi: 55 },
      { string: 2, note: "B3", frequency_hz: 246.94, midi: 59 },
      { string: 1, note: "E4", frequency_hz: 329.63, midi: 64 },
    ],
  },
  {
    id: "drop_d",
    name: "Drop D (D A D G B E)",
    description: "Drop D tuning with string 6 lowered a whole step to D2",
    reference_a4_hz: 440.0,
    strings: [
      { string: 6, note: "D2", frequency_hz: 73.42, midi: 38 },
      { string: 5, note: "A2", frequency_hz: 110.0, midi: 45 },
      { string: 4, note: "D3", frequency_hz: 146.83, midi: 50 },
      { string: 3, note: "G3", frequency_hz: 196.0, midi: 55 },
      { string: 2, note: "B3", frequency_hz: 246.94, midi: 59 },
      { string: 1, note: "E4", frequency_hz: 329.63, midi: 64 },
    ],
  },
  {
    id: "half_step_down",
    name: "Half Step Down (Eb Ab Db Gb Bb Eb)",
    description: "All 6 strings tuned down one semitone",
    reference_a4_hz: 440.0,
    strings: [
      { string: 6, note: "Eb2", frequency_hz: 77.78, midi: 39 },
      { string: 5, note: "Ab2", frequency_hz: 103.83, midi: 44 },
      { string: 4, note: "Db3", frequency_hz: 138.59, midi: 49 },
      { string: 3, note: "Gb3", frequency_hz: 185.0, midi: 54 },
      { string: 2, note: "Bb3", frequency_hz: 233.08, midi: 58 },
      { string: 1, note: "Eb4", frequency_hz: 311.13, midi: 63 },
    ],
  },
  {
    id: "open_g",
    name: "Open G (D G D G B D)",
    description: "Open G chord tuning popular in blues and slide guitar",
    reference_a4_hz: 440.0,
    strings: [
      { string: 6, note: "D2", frequency_hz: 73.42, midi: 38 },
      { string: 5, note: "G2", frequency_hz: 98.0, midi: 43 },
      { string: 4, note: "D3", frequency_hz: 146.83, midi: 50 },
      { string: 3, note: "G3", frequency_hz: 196.0, midi: 55 },
      { string: 2, note: "B3", frequency_hz: 246.94, midi: 59 },
      { string: 1, note: "D4", frequency_hz: 293.66, midi: 62 },
    ],
  },
  {
    id: "dadgad",
    name: "DADGAD (D A D G A D)",
    description: "Celtic / folk modal open tuning",
    reference_a4_hz: 440.0,
    strings: [
      { string: 6, note: "D2", frequency_hz: 73.42, midi: 38 },
      { string: 5, note: "A2", frequency_hz: 110.0, midi: 45 },
      { string: 4, note: "D3", frequency_hz: 146.83, midi: 50 },
      { string: 3, note: "G3", frequency_hz: 196.0, midi: 55 },
      { string: 2, note: "A3", frequency_hz: 220.0, midi: 57 },
      { string: 1, note: "D4", frequency_hz: 293.66, midi: 62 },
    ],
  },
];

/**
 * Calculate cents deviation from detected frequency to target frequency.
 * Formula: 1200 * log2(detected / target)
 */
export function calculateCentsDeviation(
  detectedFreq: number,
  targetFreq: number
): number {
  if (detectedFreq <= 0 || targetFreq <= 0) return 0;
  const cents = 1200 * Math.log2(detectedFreq / targetFreq);
  // Clamped between -50.0 and +50.0
  return Math.max(-50, Math.min(50, Math.round(cents * 10) / 10));
}

/**
 * Determine tuning status from cents deviation (±3.5 cents = in_tune)
 */
export function getTuningStatus(centsDeviation: number): TuningStatus {
  if (Math.abs(centsDeviation) <= 3.5) {
    return "in_tune";
  }
  return centsDeviation < 0 ? "flat" : "sharp";
}

/**
 * Scientific pitch calculation from frequency (e.g. 440 -> "A4")
 */
const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

export function frequencyToNoteName(freq: number): string {
  if (freq <= 0) return "--";
  const midi = Math.round(69 + 12 * Math.log2(freq / 440.0));
  const noteIndex = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return `${NOTE_NAMES[noteIndex]}${octave}`;
}

/**
 * Evaluates detected frequency against a tuning preset.
 * If targetString is provided (1 to 6), evaluates against that specific string.
 * Otherwise, auto-detects the closest string by minimum cents deviation.
 */
export function evaluatePitch(
  detectedFreq: number,
  preset: TuningPreset,
  targetString?: number | null,
  rawConfidence = 1.0
): TunerPitchResult {
  const strings = preset.strings;

  let selectedString: TuningStringTarget;

  if (targetString && targetString >= 1 && targetString <= 6) {
    const found = strings.find((s) => s.string === targetString);
    selectedString = found || strings[0];
  } else {
    // Auto-detect string: find string target that minimizes absolute cents deviation
    let minAbsDiff = Infinity;
    selectedString = strings[0];

    for (const str of strings) {
      const cents = Math.abs(1200 * Math.log2(detectedFreq / str.frequency_hz));
      if (cents < minAbsDiff) {
        minAbsDiff = cents;
        selectedString = str;
      }
    }
  }

  const centsDeviation = calculateCentsDeviation(
    detectedFreq,
    selectedString.frequency_hz
  );
  const status = getTuningStatus(centsDeviation);
  const detectedNote = frequencyToNoteName(detectedFreq);

  return {
    detected_frequency_hz: Math.round(detectedFreq * 100) / 100,
    detected_note: detectedNote,
    closest_string: selectedString.string,
    target_note: selectedString.note,
    target_frequency_hz: selectedString.frequency_hz,
    cents_deviation: centsDeviation,
    tuning_status: status,
    confidence: Math.max(0, Math.min(1, Math.round(rawConfidence * 100) / 100)),
  };
}

/**
 * 60fps Autocorrelation Pitch Detector
 * Efficiently computes the fundamental pitch frequency (f0) from a time-domain buffer.
 */
export function detectPitchAutocorrelation(
  buffer: Float32Array,
  sampleRate: number
): { frequency: number; confidence: number; rms: number } {
  const bufferLen = buffer.length;

  // 1. Calculate RMS energy
  let sumSquares = 0;
  let sum = 0;
  for (let i = 0; i < bufferLen; i++) {
    const val = buffer[i];
    sum += val;
    sumSquares += val * val;
  }
  const rms = Math.sqrt(sumSquares / bufferLen);

  // Noise gate: below 0.008 RMS is silence/ambient room noise
  if (rms < 0.008) {
    return { frequency: 0, confidence: 0, rms };
  }

  // 2. Remove DC offset
  const mean = sum / bufferLen;
  const normalized = new Float32Array(bufferLen);
  for (let i = 0; i < bufferLen; i++) {
    normalized[i] = buffer[i] - mean;
  }

  // 3. Search range: Guitar frequencies typically 60Hz (Low C/D) to 480Hz (High B)
  const minFreq = 60;
  const maxFreq = 480;
  const minLag = Math.floor(sampleRate / maxFreq);
  const maxLag = Math.min(bufferLen - 1, Math.ceil(sampleRate / minFreq));

  // Compute energy at zero lag r[0]
  let r0 = 0;
  for (let i = 0; i < bufferLen - maxLag; i++) {
    r0 += normalized[i] * normalized[i];
  }
  if (r0 <= 0) return { frequency: 0, confidence: 0, rms };

  // 4. Compute Autocorrelation over lags
  let bestLag = -1;
  let maxCorr = -Infinity;
  let hasPassedInitialSlope = false;
  let prevCorr = 0;

  for (let lag = minLag; lag <= maxLag; lag++) {
    let corr = 0;
    const windowSize = bufferLen - lag;
    for (let i = 0; i < windowSize; i++) {
      corr += normalized[i] * normalized[i + lag];
    }
    // Normalized correlation coefficient
    corr = corr / r0;

    // Wait until slope begins to rise (skip peak at lag 0)
    if (!hasPassedInitialSlope) {
      if (corr > prevCorr && prevCorr < 0.8) {
        hasPassedInitialSlope = true;
      }
    }

    if (hasPassedInitialSlope && corr > maxCorr) {
      maxCorr = corr;
      bestLag = lag;
    }

    prevCorr = corr;
  }

  // If correlation is too low, no reliable periodic pitch
  if (bestLag === -1 || maxCorr < 0.4) {
    return { frequency: 0, confidence: Math.max(0, maxCorr), rms };
  }

  // 5. Parabolic interpolation around peak lag for sub-sample accuracy
  let refinedLag = bestLag;
  if (bestLag > minLag && bestLag < maxLag) {
    let prevC = 0;
    let nextC = 0;
    const wPrev = bufferLen - (bestLag - 1);
    for (let i = 0; i < wPrev; i++) {
      prevC += normalized[i] * normalized[i + (bestLag - 1)];
    }
    prevC = prevC / r0;

    const wNext = bufferLen - (bestLag + 1);
    for (let i = 0; i < wNext; i++) {
      nextC += normalized[i] * normalized[i + (bestLag + 1)];
    }
    nextC = nextC / r0;

    const denom = 2 * (2 * maxCorr - prevC - nextC);
    if (Math.abs(denom) > 1e-6) {
      const delta = (nextC - prevC) / denom;
      if (Math.abs(delta) < 1.0) {
        refinedLag = bestLag + delta;
      }
    }
  }

  const frequency = sampleRate / refinedLag;
  const confidence = Math.min(1.0, Math.max(0.0, maxCorr));

  return { frequency, confidence, rms };
}

/**
 * Audio Context Reference Tone Generator:
 * Plucks a reference pitch tone (via Web Audio API) for tuning by ear.
 */
let sharedAudioCtx: AudioContext | null = null;

export function playReferenceTone(frequencyHz: number, durationSeconds = 2.2): void {
  if (typeof window === "undefined") return;

  if (!sharedAudioCtx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    sharedAudioCtx = new AudioCtx();
  }
  if (sharedAudioCtx.state === "suspended") {
    sharedAudioCtx.resume();
  }

  const ctx = sharedAudioCtx;
  const now = ctx.currentTime;

  // Dual oscillator for a rich, warm guitar string timbre
  const osc1 = ctx.createOscillator();
  const osc2 = ctx.createOscillator();
  const filter = ctx.createBiquadFilter();
  const masterGain = ctx.createGain();

  osc1.type = "triangle";
  osc1.frequency.setValueAtTime(frequencyHz, now);

  osc2.type = "sine";
  osc2.frequency.setValueAtTime(frequencyHz * 2, now); // 2nd harmonic

  const osc2Gain = ctx.createGain();
  osc2Gain.gain.setValueAtTime(0.25, now);

  // Plucked envelope filter
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(Math.min(3200, frequencyHz * 6), now);
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(220, frequencyHz * 1.5),
    now + durationSeconds
  );

  // Amplitude envelope
  masterGain.gain.setValueAtTime(0.0001, now);
  masterGain.gain.linearRampToValueAtTime(0.28, now + 0.015);
  masterGain.gain.exponentialRampToValueAtTime(0.12, now + 0.3);
  masterGain.gain.exponentialRampToValueAtTime(0.0001, now + durationSeconds);

  osc1.connect(filter);
  osc2.connect(osc2Gain);
  osc2Gain.connect(filter);
  filter.connect(masterGain);
  masterGain.connect(ctx.destination);

  osc1.start(now);
  osc2.start(now);
  osc1.stop(now + durationSeconds + 0.05);
  osc2.stop(now + durationSeconds + 0.05);
}
