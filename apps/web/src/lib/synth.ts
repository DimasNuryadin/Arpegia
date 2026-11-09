// Web Audio API Guitar Synthesizer for Chord Voicings, Single Tab Notes, and Standalone Tablature Playback

import {
  ChordDiagram,
  DEFAULT_GUITAR_TUNING,
  TabMeasure,
  TabNote,
  TabTechnique,
  VoiceFilterMode,
  VoiceRole,
} from "../types";
import {
  computeMidiAndNoteName,
  midiToFrequency,
  resolveNoteVoice,
} from "./tab-utils";

// Note to frequency map
const NOTE_FREQS: Record<string, number> = {
  C2: 65.41,
  D2: 73.42,
  E2: 82.41,
  F2: 87.31,
  "F#2": 92.5,
  G2: 98.0,
  "G#2": 103.83,
  A2: 110.0,
  "A#2": 116.54,
  B2: 123.47,
  C3: 130.81,
  "C#3": 138.59,
  D3: 146.83,
  "D#3": 155.56,
  E3: 164.81,
  F3: 174.61,
  "F#3": 185.0,
  G3: 196.0,
  "G#3": 207.65,
  A3: 220.0,
  "A#3": 233.08,
  B3: 246.94,
  C4: 261.63,
  "C#4": 277.18,
  D4: 293.66,
  "D#4": 311.13,
  E4: 329.63,
  F4: 349.23,
  "F#4": 369.99,
  G4: 392.0,
  "G#4": 415.3,
  A4: 440.0,
  "A#4": 466.16,
  B4: 493.88,
  C5: 523.25,
  "C#5": 554.37,
  D5: 587.33,
  "D#5": 622.25,
  E5: 659.25,
  F5: 698.46,
  "F#5": 739.99,
  G5: 783.99,
  "G#5": 830.61,
  A5: 880.0,
  B5: 987.77,
};

// Chord to chord tones (approximate frequencies for pleasant guitar voicing)
const CHORD_NOTES: Record<string, string[]> = {
  G: ["G2", "B3", "D4", "G4"],
  "D/F#": ["F#2", "A3", "D4", "F#4"],
  Em: ["E2", "B2", "E3", "G3", "B3", "E4"],
  Em7: ["E2", "G3", "B3", "D4", "G4"],
  Cmaj7: ["C3", "E3", "G3", "B3", "E4"],
  Bm7: ["B2", "F#3", "A3", "D4"],
  Am9: ["A2", "C3", "E3", "G3", "B3"],
  Am7: ["A2", "E3", "G3", "C4", "E4"],
  D7sus4: ["D3", "G3", "A3", "C4"],
  D7: ["D3", "F#3", "A3", "C4"],
  D: ["D3", "A3", "D4", "F#4"],
  C: ["C3", "E3", "G3", "C4", "E4"],
  "G/B": ["B2", "D3", "G3", "D4"],
  Fadd9: ["F2", "C3", "F3", "A3", "G4"],
  Dm7: ["D3", "F3", "A3", "C4"],
  G7sus4: ["G2", "C3", "D3", "F3", "C4"],
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

export interface TabPlaybackOptions {
  speed?: number; // 0.5, 0.75, 1.0, 1.25
  startTime?: number;
  tuning?: string[];
  capo?: number;
  voiceFilter?: VoiceFilterMode;
  onTimeUpdate?: (currentTime: number) => void;
  onNoteTrigger?: (note: TabNote) => void;
  onComplete?: () => void;
}

class GuitarAudioEngine {
  private ctx: AudioContext | null = null;
  private tabPlaybackRaf: number | null = null;
  private tabIsPlaying = false;
  private tabSpeed = 1.0;
  private voiceFilter: VoiceFilterMode = "all";

  private initCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Plucked acoustic/electric guitar string voice using dual oscillators + transient pluck burst + resonant lowpass envelope
   */
  private triggerPluckedVoice(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    technique: TabTechnique = "normal",
    gainScale = 0.2
  ) {
    const safeDuration = Math.max(0.18, Math.min(3.5, duration));

    // Primary body oscillator (triangle) + harmonic overtone oscillator (sawtooth)
    const bodyOsc = ctx.createOscillator();
    const harmonicOsc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const voiceGain = ctx.createGain();
    const harmonicGain = ctx.createGain();

    bodyOsc.type = "triangle";
    harmonicOsc.type = "sawtooth";

    // Apply articulation pitch contour
    if (technique === "slide") {
      const startFreq = freq * Math.pow(2, -2 / 12); // slide up 2 semitones
      bodyOsc.frequency.setValueAtTime(startFreq, startTime);
      bodyOsc.frequency.exponentialRampToValueAtTime(
        freq,
        startTime + Math.min(0.12, safeDuration * 0.4)
      );
      harmonicOsc.frequency.setValueAtTime(startFreq, startTime);
      harmonicOsc.frequency.exponentialRampToValueAtTime(
        freq,
        startTime + Math.min(0.12, safeDuration * 0.4)
      );
    } else if (technique === "bend") {
      const bendTarget = freq * Math.pow(2, 2 / 12); // full-step bend
      bodyOsc.frequency.setValueAtTime(freq, startTime);
      bodyOsc.frequency.exponentialRampToValueAtTime(
        bendTarget,
        startTime + Math.min(0.22, safeDuration * 0.6)
      );
      harmonicOsc.frequency.setValueAtTime(freq, startTime);
      harmonicOsc.frequency.exponentialRampToValueAtTime(
        bendTarget,
        startTime + Math.min(0.22, safeDuration * 0.6)
      );
    } else if (technique === "hammer-on") {
      const lowerFreq = freq * Math.pow(2, -2 / 12);
      bodyOsc.frequency.setValueAtTime(lowerFreq, startTime);
      bodyOsc.frequency.setValueAtTime(freq, startTime + 0.045);
      harmonicOsc.frequency.setValueAtTime(lowerFreq, startTime);
      harmonicOsc.frequency.setValueAtTime(freq, startTime + 0.045);
    } else if (technique === "pull-off") {
      const upperFreq = freq * Math.pow(2, 2 / 12);
      bodyOsc.frequency.setValueAtTime(upperFreq, startTime);
      bodyOsc.frequency.setValueAtTime(freq, startTime + 0.045);
      harmonicOsc.frequency.setValueAtTime(upperFreq, startTime);
      harmonicOsc.frequency.setValueAtTime(freq, startTime + 0.045);
    } else {
      bodyOsc.frequency.setValueAtTime(freq, startTime);
      harmonicOsc.frequency.setValueAtTime(freq, startTime);
    }

    // Plucked string filter envelope (Karplus-Strong style brightness decay)
    filter.type = "lowpass";
    filter.Q.setValueAtTime(2.2, startTime);
    const initialCutoff = Math.min(4800, freq * 7.5);
    const sustainCutoff = Math.max(320, freq * 1.8);
    filter.frequency.setValueAtTime(initialCutoff, startTime);
    filter.frequency.exponentialRampToValueAtTime(
      sustainCutoff,
      startTime + safeDuration
    );

    // Amplitude envelope
    const attackTime =
      technique === "hammer-on" || technique === "pull-off" ? 0.02 : 0.008;
    voiceGain.gain.setValueAtTime(0.0001, startTime);
    voiceGain.gain.linearRampToValueAtTime(gainScale, startTime + attackTime);
    voiceGain.gain.exponentialRampToValueAtTime(
      gainScale * 0.35,
      startTime + Math.min(0.18, safeDuration * 0.4)
    );
    voiceGain.gain.exponentialRampToValueAtTime(
      0.0001,
      startTime + safeDuration
    );

    harmonicGain.gain.setValueAtTime(0.32, startTime);
    harmonicGain.gain.exponentialRampToValueAtTime(
      0.04,
      startTime + Math.min(0.15, safeDuration * 0.5)
    );

    bodyOsc.connect(filter);
    harmonicOsc.connect(harmonicGain);
    harmonicGain.connect(filter);
    filter.connect(voiceGain);
    voiceGain.connect(ctx.destination);

    bodyOsc.start(startTime);
    harmonicOsc.start(startTime);
    bodyOsc.stop(startTime + safeDuration + 0.04);
    harmonicOsc.stop(startTime + safeDuration + 0.04);
  }

  /**
   * Play a chord by name
   */
  playChord(chordName: string, duration = 1.6) {
    const ctx = this.initCtx();
    if (!ctx) return;

    const baseName = chordName.trim().split(" ")[0];
    const notes = CHORD_NOTES[chordName] ||
      CHORD_NOTES[baseName] || ["G2", "D3", "G3", "B3"];

    const now = ctx.currentTime;
    notes.forEach((noteName, idx) => {
      const freq = NOTE_FREQS[noteName] || 220;
      const strumDelay = idx * 0.032;
      this.triggerPluckedVoice(
        ctx,
        freq,
        now + strumDelay,
        duration,
        "normal",
        0.22 / Math.sqrt(notes.length)
      );
    });
  }

  /**
   * Play an exact ChordDiagram voicing (frets array from Low E string 6 to High E string 1)
   */
  playChordDiagram(
    diagram: ChordDiagram,
    tuning: string[] = DEFAULT_GUITAR_TUNING,
    capo = 0,
    duration = 1.8
  ) {
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    let strumIdx = 0;

    // diagram.frets is [Low E (string 6), A (5), D (4), G (3), B (2), High E (1)]
    diagram.frets.forEach((fret, arrayIdx) => {
      if (fret < 0) return; // muted string (-1)
      const stringNum = 6 - arrayIdx;
      const { frequency } = computeMidiAndNoteName(
        stringNum,
        fret,
        tuning,
        capo
      );
      const strumDelay = strumIdx * 0.035;
      strumIdx++;

      this.triggerPluckedVoice(
        ctx,
        frequency,
        now + strumDelay,
        duration,
        "normal",
        0.16
      );
    });
  }

  /**
   * Play a single TabNote with string/fret/midi/technique/voice articulation
   */
  playTabNote(
    note: Pick<TabNote, "string" | "fret"> &
      Partial<Pick<TabNote, "midi" | "duration" | "technique" | "voice">>,
    tuning: string[] = DEFAULT_GUITAR_TUNING,
    capo = 0
  ) {
    const ctx = this.initCtx();
    if (!ctx) return;

    const voice: VoiceRole = resolveNoteVoice(note);
    const freq =
      typeof note.midi === "number" && note.midi > 0
        ? midiToFrequency(note.midi)
        : computeMidiAndNoteName(note.string, note.fret, tuning, capo)
            .frequency;

    const baseDur =
      voice === "percussive"
        ? 0.14
        : voice === "bass"
        ? Math.max(0.55, Math.min(2.6, (note.duration ?? 0.85) * 1.15))
        : Math.max(0.35, Math.min(2.2, note.duration ?? 0.65));

    const gainScale =
      voice === "bass"
        ? 0.27
        : voice === "melody"
        ? 0.25
        : voice === "percussive"
        ? 0.19
        : 0.2;

    this.triggerPluckedVoice(
      ctx,
      freq,
      ctx.currentTime,
      baseDur,
      note.technique ?? "normal",
      gainScale
    );
  }

  private matchesVoiceFilter(note: TabNote): boolean {
    if (this.voiceFilter === "all") return true;
    const role = resolveNoteVoice(note);
    return role === this.voiceFilter;
  }

  /**
   * Standalone Tablature Synth Sequencer with variable speed & polyphonic voice filtering
   */
  startTabPlayback(measures: TabMeasure[], options: TabPlaybackOptions = {}) {
    this.stopTabPlayback();

    const ctx = this.initCtx();
    if (!ctx || !measures || measures.length === 0) {
      options.onComplete?.();
      return;
    }

    const allNotes = measures
      .flatMap((m) => m.notes)
      .sort((a, b) => a.start_time - b.start_time);

    const lastMeasureEnd = Math.max(
      ...measures.map((m) => m.end_time),
      ...allNotes.map((n) => n.start_time + n.duration),
      2.4
    );

    this.tabSpeed = options.speed ?? 1.0;
    this.voiceFilter = options.voiceFilter ?? this.voiceFilter ?? "all";
    this.tabIsPlaying = true;

    let songTime = options.startTime ?? 0;
    let lastFrameTime = performance.now();
    const triggeredNoteIds = new Set<string>();

    // Mark notes strictly before startTime as already triggered
    for (const n of allNotes) {
      if (n.start_time < songTime - 0.02) {
        triggeredNoteIds.add(n.id);
      }
    }

    const tick = (nowPerf: number) => {
      if (!this.tabIsPlaying) return;

      const deltaSec = (nowPerf - lastFrameTime) / 1000;
      lastFrameTime = nowPerf;
      songTime += deltaSec * this.tabSpeed;

      options.onTimeUpdate?.(songTime);

      // Trigger any notes whose start_time has been reached and match the active voice filter
      for (const note of allNotes) {
        if (!triggeredNoteIds.has(note.id) && songTime >= note.start_time) {
          triggeredNoteIds.add(note.id);
          if (this.matchesVoiceFilter(note)) {
            this.playTabNote(
              {
                ...note,
                duration: Math.max(0.25, note.duration / this.tabSpeed),
              },
              options.tuning ?? DEFAULT_GUITAR_TUNING,
              options.capo ?? 0
            );
            options.onNoteTrigger?.(note);
          }
        }
      }

      if (songTime >= lastMeasureEnd) {
        this.tabIsPlaying = false;
        this.tabPlaybackRaf = null;
        options.onComplete?.();
        return;
      }

      this.tabPlaybackRaf = requestAnimationFrame(tick);
    };

    this.tabPlaybackRaf = requestAnimationFrame(tick);
  }

  setTabPlaybackSpeed(speed: number) {
    this.tabSpeed = Math.max(0.25, Math.min(2.0, speed));
  }

  setVoiceFilter(filter: VoiceFilterMode) {
    this.voiceFilter = filter;
  }

  getVoiceFilter(): VoiceFilterMode {
    return this.voiceFilter;
  }

  stopTabPlayback() {
    this.tabIsPlaying = false;
    if (this.tabPlaybackRaf !== null) {
      cancelAnimationFrame(this.tabPlaybackRaf);
      this.tabPlaybackRaf = null;
    }
  }

  isTabPlaying(): boolean {
    return this.tabIsPlaying;
  }
}

export const guitarSynth = new GuitarAudioEngine();
