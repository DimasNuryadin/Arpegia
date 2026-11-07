// Web Audio API tone synthesis for chord preview and demo track playback

// Note to frequency map
const NOTE_FREQS: Record<string, number> = {
  C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, "F#2": 92.5, G2: 98.0, A2: 110.0, B2: 123.47,
  C3: 130.81, "C#3": 138.59, D3: 146.83, "D#3": 155.56, E3: 164.81, F3: 174.61, "F#3": 185.0, G3: 196.0, "G#3": 207.65, A3: 220.0, "A#3": 233.08, B3: 246.94,
  C4: 261.63, "C#4": 277.18, D4: 293.66, "D#4": 311.13, E4: 329.63, F4: 349.23, "F#4": 369.99, G4: 392.0, "G#4": 415.3, A4: 440.0, "A#4": 466.16, B4: 493.88,
  C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, "F#5": 739.99, G5: 783.99, A5: 880.0, B5: 987.77,
};

// Chord to chord tones (approximate frequencies for pleasant guitar voicing)
const CHORD_NOTES: Record<string, string[]> = {
  G: ["G2", "B3", "D4", "G4"],
  "D/F#": ["F#2", "A3", "D4", "F#4"],
  Em7: ["E2", "G3", "B3", "D4", "G4"],
  Cmaj7: ["C3", "E3", "G3", "B3", "E4"],
  Bm7: ["B2", "F#3", "A3", "D4"],
  Am9: ["A2", "C3", "E3", "G3", "B3"],
  Am7: ["A2", "E3", "G3", "C4", "E4"],
  D7sus4: ["D3", "G3", "A3", "C4"],
  D7: ["D3", "F#3", "A3", "C4"],
  C: ["C3", "E3", "G3", "C4", "E4"],
  "G/B": ["B2", "D3", "G3", "D4"],
  Fadd9: ["F2", "C3", "F3", "A3", "G4"],
  Dm7: ["D3", "F3", "A3", "C4"],
  Gmaj7: ["G2", "D3", "F#3", "B3", "D4"],
  "G6/9": ["G2", "B3", "E4", "A4"],
  Gmaj9: ["G2", "F#3", "B3", "D4", "A4"],
  Cadd9: ["C3", "E3", "G3", "D4"],
  "Gmaj7#11": ["G2", "B3", "C#4", "F#4"],
  Em9: ["E2", "B3", "D4", "F#4", "G4"],
  Em11: ["E2", "G3", "D4", "A4"],
  Cmaj9: ["C3", "B3", "D4", "E4"],
  "C6/9": ["C3", "E3", "A3", "D4"],
  Cm7: ["C3", "D#3", "G3", "A#3"],
  F7: ["F2", "A3", "C4", "D#4"],
  Bbmaj7: ["A#2", "D3", "F3", "A3"],
  Ebmaj7: ["D#3", "G3", "A#3", "D4"],
  "Am7(b5)": ["A2", "C3", "D#3", "G3"],
  "D7(b9)": ["D3", "F#3", "C4", "D#4"],
  Gm7: ["G2", "A#3", "D4", "F4"],
};

class GuitarAudioEngine {
  private ctx: AudioContext | null = null;

  private initCtx() {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  playChord(chordName: string, duration = 1.6) {
    const ctx = this.initCtx();
    if (!ctx) return;

    const baseName = chordName.trim().split(" ")[0];
    const notes = CHORD_NOTES[chordName] || CHORD_NOTES[baseName] || ["G2", "D3", "G3", "B3"];

    const now = ctx.currentTime;

    notes.forEach((noteName, idx) => {
      const freq = NOTE_FREQS[noteName] || 220;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      // Guitar acoustic timbre simulation
      osc.type = idx === 0 ? "sawtooth" : "triangle";
      osc.frequency.setValueAtTime(freq, now);

      // Low pass filter for warm acoustic guitar tone
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(1400, now);
      filter.frequency.exponentialRampToValueAtTime(400, now + duration);

      // Strum delay simulation (25ms between strings)
      const strumDelay = idx * 0.035;
      const startTime = now + strumDelay;

      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.linearRampToValueAtTime(0.18 / notes.length, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration + 0.05);
    });
  }
}

export const guitarSynth = new GuitarAudioEngine();
