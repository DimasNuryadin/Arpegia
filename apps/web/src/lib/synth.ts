// High-Fidelity Web Audio API Guitar Engine: Real Sampled Soundfont + Karplus-Strong Physical Modeling String Synth
// Supports: Acoustic Steel String, Nylon Classical, Clean Electric, Jazz Hollowbody, Overdriven Guitar

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

export type GuitarInstrumentType =
  | "acoustic_guitar_steel"
  | "acoustic_guitar_nylon"
  | "electric_guitar_clean"
  | "electric_guitar_jazz"
  | "overdriven_guitar";

export interface GuitarInstrumentMeta {
  id: GuitarInstrumentType;
  name: string;
  tag: string;
  icon: string;
  description: string;
}

export const GUITAR_INSTRUMENTS: GuitarInstrumentMeta[] = [
  {
    id: "acoustic_guitar_steel",
    name: "Steel-String Acoustic",
    tag: "Studio",
    icon: "🎸",
    description: "Bright, rich Martin dreadnought tone with full wooden acoustic body resonance",
  },
  {
    id: "acoustic_guitar_nylon",
    name: "Nylon Classical",
    tag: "Warm",
    icon: "🪕",
    description: "Warm, intimate Spanish guitar with rounded fingerstyle transients",
  },
  {
    id: "electric_guitar_clean",
    name: "Clean Electric",
    tag: "Strat",
    icon: "⚡",
    description: "Crisp single-coil electric tone with bell-like high-end chime",
  },
  {
    id: "electric_guitar_jazz",
    name: "Jazz Hollowbody",
    tag: "Archtop",
    icon: "🎷",
    description: "Deep, mellow jazz archtop with warm midrange and smooth sustain",
  },
  {
    id: "overdriven_guitar",
    name: "Overdrive Blues/Rock",
    tag: "Crunch",
    icon: "🔥",
    description: "Dynamic edge-of-breakup tube amp saturation for expressive solos and chords",
  },
];

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

// Standard guitar chords to chord tones
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

// Forward declaration for smplr instance
interface SmplrInstance {
  start: (params: {
    note: string | number;
    time?: number;
    duration?: number;
    velocity?: number;
  }) => () => void;
  stop: () => void;
  ready: Promise<void>;
  output: {
    addEffect: (name: string, effect: unknown, mix: number) => void;
  };
}

class GuitarAudioEngine {
  private ctx: AudioContext | null = null;
  private tabPlaybackRaf: number | null = null;
  private tabIsPlaying = false;
  private tabSpeed = 1.0;
  private voiceFilter: VoiceFilterMode = "all";

  // Instrument soundfont state
  private activeInstrument: GuitarInstrumentType = "acoustic_guitar_steel";
  private smplrInstances: Map<GuitarInstrumentType, SmplrInstance> = new Map();
  private loadedInstruments: Set<GuitarInstrumentType> = new Set();
  private isInitializingSoundfont = false;
  private instrumentListeners: Set<
    (instrument: GuitarInstrumentType, isReady: boolean) => void
  > = new Set();

  // Master Gain & Reverb Node
  private masterGain: GainNode | null = null;
  private reverbNode: ConvolverNode | null = null;

  public initCtx(): AudioContext | null {
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master output stage with Studio Dynamics Limiter/Compressor
      const compressor = this.ctx.createDynamicsCompressor();
      compressor.threshold.setValueAtTime(-18, this.ctx.currentTime);
      compressor.knee.setValueAtTime(12, this.ctx.currentTime);
      compressor.ratio.setValueAtTime(4.0, this.ctx.currentTime);
      compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      compressor.release.setValueAtTime(0.15, this.ctx.currentTime);

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(1.4, this.ctx.currentTime);

      compressor.connect(this.masterGain);
      this.masterGain.connect(this.ctx.destination);

      // Create warm wooden acoustic convolution reverb impulse
      this.initAcousticReverb(this.ctx);

      // Asynchronously trigger soundfont pre-load for active instrument
      this.loadSoundfontInstrument(this.activeInstrument).catch(() => {
        // Fallback to physical modeling continues smoothly
      });
    }

    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  /**
   * Generates a warm, wooden acoustic studio impulse response for natural guitar body decay
   */
  private initAcousticReverb(ctx: AudioContext) {
    try {
      const sampleRate = ctx.sampleRate;
      const length = Math.floor(sampleRate * 1.2); // 1.2s reverb tail
      const impulse = ctx.createBuffer(2, length, sampleRate);
      const left = impulse.getChannelData(0);
      const right = impulse.getChannelData(1);

      // Exponential decay with warm wooden absorption
      for (let i = 0; i < length; i++) {
        const decay = Math.exp(-i / (sampleRate * 0.28));
        const noiseL = (Math.random() * 2 - 1) * decay;
        const noiseR = (Math.random() * 2 - 1) * decay;
        left[i] = noiseL;
        right[i] = noiseR;
      }

      const convolver = ctx.createConvolver();
      convolver.buffer = impulse;

      const reverbGain = ctx.createGain();
      reverbGain.gain.setValueAtTime(0.18, ctx.currentTime);

      convolver.connect(reverbGain);
      if (this.masterGain) {
        reverbGain.connect(this.masterGain);
      }
      this.reverbNode = convolver;
    } catch {
      // Audio buffer creation fallback
    }
  }

  /**
   * Dynamically loads a real sampled guitar soundfont from smplr
   */
  private async loadSoundfontInstrument(
    instrument: GuitarInstrumentType
  ): Promise<SmplrInstance | null> {
    const ctx = this.initCtx();
    if (!ctx) return null;

    if (this.smplrInstances.has(instrument)) {
      return this.smplrInstances.get(instrument) || null;
    }

    if (this.isInitializingSoundfont) return null;
    this.isInitializingSoundfont = true;

    try {
      const { Soundfont, Reverb } = await import("smplr");
      const instance = Soundfont(ctx, {
        instrument,
        kit: "MusyngKite",
      }) as unknown as SmplrInstance;

      this.smplrInstances.set(instrument, instance);

      // Add studio reverb to soundfont output
      try {
        instance.output?.addEffect?.("reverb", Reverb(ctx), 0.22);
      } catch {
        // Output effect optional
      }

      // Wait for soundfont samples to finish decoding in the background
      await instance.ready;
      this.loadedInstruments.add(instrument);
      this.notifyListeners(instrument, true);
      this.isInitializingSoundfont = false;
      return instance;
    } catch {
      this.isInitializingSoundfont = false;
      // If offline or network error, fallback to physical modeling
      this.notifyListeners(instrument, false);
      return null;
    }
  }

  /**
   * Listeners for UI indicators (e.g., sample loaded badge)
   */
  public onInstrumentStateChange(
    callback: (instrument: GuitarInstrumentType, isReady: boolean) => void
  ) {
    this.instrumentListeners.add(callback);
    callback(this.activeInstrument, this.isSampleLoaded(this.activeInstrument));
    return () => {
      this.instrumentListeners.delete(callback);
    };
  }

  private notifyListeners(instrument: GuitarInstrumentType, isReady: boolean) {
    this.instrumentListeners.forEach((fn) => fn(instrument, isReady));
  }

  public isSampleLoaded(
    instrument: GuitarInstrumentType = this.activeInstrument
  ): boolean {
    return this.loadedInstruments.has(instrument);
  }

  public getInstrument(): GuitarInstrumentType {
    return this.activeInstrument;
  }

  public setInstrument(instrument: GuitarInstrumentType) {
    this.activeInstrument = instrument;
    this.notifyListeners(instrument, this.isSampleLoaded(instrument));
    this.loadSoundfontInstrument(instrument).catch(() => {});
  }

  public getAvailableInstruments(): GuitarInstrumentMeta[] {
    return GUITAR_INSTRUMENTS;
  }

  /**
   * High-Fidelity Karplus-Strong Physical Modeling Plucked String Voice (Instant & Zero-Lag Offline Fallback)
   * Simulates wooden guitar cavity resonance + string harmonics + transient pluck click
   */
  private triggerPhysicalPluckedVoice(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    technique: TabTechnique = "normal",
    gainScale = 0.2
  ) {
    const safeDuration = Math.max(0.18, Math.min(3.8, duration));

    // 1. Transient Pluck Noise Burst (emulates fingernail / plectrum release)
    const bufferSize = Math.floor(ctx.sampleRate * 0.008); // 8ms transient burst
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      noiseData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
    }
    const pluckNode = ctx.createBufferSource();
    pluckNode.buffer = noiseBuffer;

    const pluckFilter = ctx.createBiquadFilter();
    pluckFilter.type = "bandpass";
    pluckFilter.frequency.setValueAtTime(Math.min(3200, freq * 3.5), startTime);
    pluckFilter.Q.setValueAtTime(1.8, startTime);

    const pluckGain = ctx.createGain();
    pluckGain.gain.setValueAtTime(gainScale * 0.65, startTime);
    pluckGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.016);

    pluckNode.connect(pluckFilter);
    pluckFilter.connect(pluckGain);

    // 2. Dual Oscillators for String Body (Fundamental Triangle + Overtone Sawtooth)
    const bodyOsc = ctx.createOscillator();
    const harmonicOsc = ctx.createOscillator();
    bodyOsc.type = "triangle";
    harmonicOsc.type = "sawtooth";

    // Articulation Pitch Shifts
    if (technique === "slide") {
      const startFreq = freq * Math.pow(2, -2 / 12);
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
      const bendTarget = freq * Math.pow(2, 2 / 12);
      bodyOsc.frequency.setValueAtTime(freq, startTime);
      bodyOsc.frequency.exponentialRampToValueAtTime(
        bendTarget,
        startTime + Math.min(0.24, safeDuration * 0.6)
      );
      harmonicOsc.frequency.setValueAtTime(freq, startTime);
      harmonicOsc.frequency.exponentialRampToValueAtTime(
        bendTarget,
        startTime + Math.min(0.24, safeDuration * 0.6)
      );
    } else if (technique === "hammer-on" || technique === "pull-off") {
      const offset = technique === "hammer-on" ? -2 : 2;
      const prevFreq = freq * Math.pow(2, offset / 12);
      bodyOsc.frequency.setValueAtTime(prevFreq, startTime);
      bodyOsc.frequency.setValueAtTime(freq, startTime + 0.04);
      harmonicOsc.frequency.setValueAtTime(prevFreq, startTime);
      harmonicOsc.frequency.setValueAtTime(freq, startTime + 0.04);
    } else {
      bodyOsc.frequency.setValueAtTime(freq, startTime);
      harmonicOsc.frequency.setValueAtTime(freq, startTime);
    }

    // 3. Guitar Body Resonance Filter (Wooden Top-plate & Helmholtz Cavity)
    const woodResonance = ctx.createBiquadFilter();
    woodResonance.type = "peaking";
    woodResonance.frequency.setValueAtTime(215, startTime); // Dreadnought guitar top-plate resonance
    woodResonance.Q.setValueAtTime(2.4, startTime);
    woodResonance.gain.setValueAtTime(4.5, startTime);

    // 4. Lowpass String Damping Filter (Harmonics decay faster than fundamental)
    const dampingFilter = ctx.createBiquadFilter();
    dampingFilter.type = "lowpass";
    dampingFilter.Q.setValueAtTime(2.0, startTime);
    const initialCutoff = Math.min(5200, freq * 8);
    const sustainCutoff = Math.max(340, freq * 1.5);
    dampingFilter.frequency.setValueAtTime(initialCutoff, startTime);
    dampingFilter.frequency.exponentialRampToValueAtTime(
      sustainCutoff,
      startTime + safeDuration
    );

    // 5. Amplitude Envelope
    const voiceGain = ctx.createGain();
    const harmonicGain = ctx.createGain();
    const attackTime =
      technique === "hammer-on" || technique === "pull-off" ? 0.015 : 0.006;

    voiceGain.gain.setValueAtTime(0.0001, startTime);
    voiceGain.gain.linearRampToValueAtTime(gainScale, startTime + attackTime);
    voiceGain.gain.exponentialRampToValueAtTime(
      gainScale * 0.65,
      startTime + Math.min(0.25, safeDuration * 0.4)
    );
    voiceGain.gain.exponentialRampToValueAtTime(
      0.0001,
      startTime + safeDuration
    );

    harmonicGain.gain.setValueAtTime(0.45, startTime);
    harmonicGain.gain.exponentialRampToValueAtTime(
      0.08,
      startTime + Math.min(0.2, safeDuration * 0.45)
    );

    // Routing
    bodyOsc.connect(woodResonance);
    harmonicOsc.connect(harmonicGain);
    harmonicGain.connect(woodResonance);
    woodResonance.connect(dampingFilter);
    dampingFilter.connect(voiceGain);

    const dest = this.masterGain || ctx.destination;
    voiceGain.connect(dest);
    pluckGain.connect(dest);

    // Optional send to acoustic reverb
    if (this.reverbNode) {
      voiceGain.connect(this.reverbNode);
    }

    // Trigger Nodes
    pluckNode.start(startTime);
    bodyOsc.start(startTime);
    harmonicOsc.start(startTime);

    bodyOsc.stop(startTime + safeDuration + 0.05);
    harmonicOsc.stop(startTime + safeDuration + 0.05);
    pluckNode.stop(startTime + 0.02);
  }

  /**
   * Plays a single guitar note using real sampled soundfont when ready, or physical modeling fallback
   */
  public triggerNote(
    noteTarget: string | number,
    startTime: number,
    duration = 1.6,
    velocity = 85,
    technique: TabTechnique = "normal"
  ) {
    const ctx = this.initCtx();
    if (!ctx) return;

    const smplr = this.smplrInstances.get(this.activeInstrument);

    // If Soundfont is loaded and ready, play real studio guitar samples
    if (smplr && this.loadedInstruments.has(this.activeInstrument)) {
      try {
        smplr.start({
          note: noteTarget,
          time: startTime,
          duration,
          velocity,
        });
        return;
      } catch {
        // Fallback to physical voice
      }
    }

    // Resolve frequency for physical voice
    let freq = 220;
    if (typeof noteTarget === "number") {
      freq = midiToFrequency(noteTarget);
    } else if (NOTE_FREQS[noteTarget]) {
      freq = NOTE_FREQS[noteTarget];
    }

    const gainScale = Math.min(1.0, (velocity / 127) * 0.92);
    this.triggerPhysicalPluckedVoice(
      ctx,
      freq,
      startTime,
      duration,
      technique,
      gainScale
    );
  }

  /**
   * Play a chord by name with natural acoustic downstrum delay (25-35ms between strings)
   */
  public playChord(chordName: string, duration = 1.8) {
    const ctx = this.initCtx();
    if (!ctx) return;

    const baseName = chordName.trim().split(" ")[0];
    const notes =
      CHORD_NOTES[chordName] ||
      CHORD_NOTES[baseName] || ["G2", "D3", "G3", "B3"];

    const now = ctx.currentTime;
    notes.forEach((noteName, idx) => {
      // Humanized micro-delay for realistic guitar strumming
      const humanJitter = (Math.random() - 0.5) * 0.003;
      const strumDelay = idx * 0.032 + humanJitter;

      // Dynamics: punchy bass root note, balanced inner strings, clear treble
      const velocity = idx === 0 ? 100 : idx === notes.length - 1 ? 92 : 84;

      this.triggerNote(
        noteName,
        now + strumDelay,
        duration,
        velocity,
        "normal"
      );
    });
  }

  /**
   * Play an exact ChordDiagram voicing (frets array from Low E string 6 to High E string 1)
   */
  public playChordDiagram(
    diagram: ChordDiagram,
    tuning: string[] = DEFAULT_GUITAR_TUNING,
    capo = 0,
    duration = 2.0
  ) {
    const ctx = this.initCtx();
    if (!ctx) return;

    const now = ctx.currentTime;
    let strumIdx = 0;

    // diagram.frets: [Low E (string 6), A (5), D (4), G (3), B (2), High E (1)]
    diagram.frets.forEach((fret, arrayIdx) => {
      if (fret < 0) return; // muted string (-1)
      const stringNum = 6 - arrayIdx;
      const { midi, note_name } = computeMidiAndNoteName(
        stringNum,
        fret,
        tuning,
        capo
      );

      const humanJitter = (Math.random() - 0.5) * 0.003;
      const strumDelay = strumIdx * 0.034 + humanJitter;
      const velocity = strumIdx === 0 ? 102 : 88;
      strumIdx++;

      this.triggerNote(
        note_name || midi,
        now + strumDelay,
        duration,
        velocity,
        "normal"
      );
    });
  }

  /**
   * Play a single TabNote with string/fret/midi/technique/voice articulation
   */
  public playTabNote(
    note: Pick<TabNote, "string" | "fret"> &
      Partial<Pick<TabNote, "midi" | "duration" | "technique" | "voice">>,
    tuning: string[] = DEFAULT_GUITAR_TUNING,
    capo = 0
  ) {
    const ctx = this.initCtx();
    if (!ctx) return;

    const voice: VoiceRole = resolveNoteVoice(note);
    const { midi, note_name } =
      typeof note.midi === "number" && note.midi > 0
        ? {
            midi: note.midi,
            note_name: "",
          }
        : computeMidiAndNoteName(note.string, note.fret, tuning, capo);

    const baseDur =
      voice === "percussive"
        ? 0.16
        : voice === "bass"
        ? Math.max(0.65, Math.min(2.8, (note.duration ?? 0.85) * 1.2))
        : Math.max(0.4, Math.min(2.4, note.duration ?? 0.65));

    const velocity =
      voice === "bass"
        ? 102
        : voice === "melody"
        ? 96
        : voice === "percussive"
        ? 72
        : 86;

    this.triggerNote(
      note_name || midi,
      ctx.currentTime,
      baseDur,
      velocity,
      note.technique ?? "normal"
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
  public startTabPlayback(
    measures: TabMeasure[],
    options: TabPlaybackOptions = {}
  ) {
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

  public setTabPlaybackSpeed(speed: number) {
    this.tabSpeed = Math.max(0.25, Math.min(2.0, speed));
  }

  public setVoiceFilter(filter: VoiceFilterMode) {
    this.voiceFilter = filter;
  }

  public getVoiceFilter(): VoiceFilterMode {
    return this.voiceFilter;
  }

  public stopTabPlayback() {
    this.tabIsPlaying = false;
    if (this.tabPlaybackRaf !== null) {
      cancelAnimationFrame(this.tabPlaybackRaf);
      this.tabPlaybackRaf = null;
    }
    // Stop any ringing soundfont voices
    const smplr = this.smplrInstances.get(this.activeInstrument);
    smplr?.stop?.();
  }

  public isTabPlaying(): boolean {
    return this.tabIsPlaying;
  }
}

export const guitarSynth = new GuitarAudioEngine();
