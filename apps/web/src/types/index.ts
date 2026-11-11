/**
 * @arpegia/shared-types — Physical TypeScript Contracts (Phase 1, Phase 2 & Phase 3)
 * Mirrored inside apps/web/src/types/index.ts in strict alignment with packages/shared-types/index.ts
 */

export type ProcessingStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";

export interface AudioTrack {
  id: string;
  userId?: string;
  title: string;
  artist?: string;
  durationSeconds: number;
  fileFormat: "mp3" | "wav" | "flac" | "m4a";
  storageKey: string;
  status: ProcessingStatus;
  createdAt: string;
  updatedAt: string;
}

export interface AnalysisJob {
  jobId: string;
  trackId: string;
  status: ProcessingStatus;
  progressPercentage: number;
  currentStep?: string;
  errorMessage?: string;
  bpm?: number;
  keySignature?: string;
  keyConfidence?: number;
}

export type GuitarTuning =
  | "STANDARD_E"
  | "DROP_D"
  | "DADGAD"
  | "OPEN_D"
  | "OPEN_G";

export type TabTechnique =
  | "normal"
  | "hammer-on"
  | "pull-off"
  | "slide"
  | "bend";

export type DifficultyLevel = "Beginner" | "Intermediate" | "Advanced";

export type TabDifficulty = DifficultyLevel;

export type ArrangementStyle =
  | "Fingerstyle"
  | "Neo Soul"
  | "Jazz Chord Melody"
  | "Acoustic Strumming";

export type ExportFormat = "midi" | "musicxml" | "ascii" | "pdf";

export type VoiceRole = "melody" | "bass" | "harmony" | "percussive";

export const DEFAULT_GUITAR_TUNING: string[] = [
  "E2",
  "A2",
  "D3",
  "G3",
  "B3",
  "E4",
];

export interface TabNote {
  id: string;
  start_time: number; // seconds
  duration: number; // seconds
  string: number; // 1 to 6, where 1 = High E4 and 6 = Low E2
  fret: number; // 0 to 24
  midi: number; // e.g., 40 to 88
  note_name: string; // e.g., "E4", "G#3"
  confidence: number; // 0.0 to 1.0
  technique: TabTechnique;
  voice?: VoiceRole; // default "melody", polyphonic Fingerstyle role ("melody" | "bass" | "harmony" | "percussive")
}

export interface TabMeasure {
  measure_number: number;
  start_time: number;
  end_time: number;
  notes: TabNote[];
}

export interface TablatureData {
  tuning: string[]; // default ["E2", "A2", "D3", "G3", "B3", "E4"]
  capo: number; // default 0
  difficulty: DifficultyLevel;
  measures: TabMeasure[];
  ascii_tab: string; // pre-rendered 6-line ASCII tablature preview for export/quick view
}

export interface TabNoteEdit {
  id: string;
  string: number; // 1 to 6, where 1 = High E4 and 6 = Low E2
  fret: number; // 0 to 24
  technique?: TabTechnique;
  voice?: VoiceRole;
  start_time?: number;
  duration?: number;
}

export interface TablatureUpdateRequest {
  tuning?: string[];
  capo?: number;
  difficulty?: DifficultyLevel;
  measures?: TabMeasure[];
  notes?: TabNoteEdit[];
}

export interface TabChordEvent {
  timestamp: number;
  notes: TabNote[];
  chordName?: string;
}

export interface ChordEvent {
  id: string;
  analysisId: string;
  startTime: number;
  endTime: number;
  chordName: string;
  root: string;
  quality: string;
  bass?: string;
  confidence: number;
  barNumber?: number;
  beatNumber?: number;
}

export interface ChordProgressionAnalysis {
  trackId: string;
  bpm: number;
  key: string;
  chords: ChordEvent[];
}

// Phase 1, Phase 2 & Phase 3 Shared Data Contract (Web <-> API <-> Audio Engine)
export interface SongMetadata {
  filename: string;
  duration: number; // in seconds
  key: string;
  bpm: number;
  time_signature: string;
}

export interface ChordData {
  chord: string;
  start_time: number; // in seconds
  end_time: number; // in seconds
  confidence: number; // between 0.0 and 1.0
}

export type MusicStyle =
  | "Pop"
  | "Jazz"
  | "Neo Soul"
  | "Fingerstyle"
  | "Jazz Chord Melody"
  | "Acoustic Strumming"
  | string;

export interface ImprovisationData {
  original_chord: string;
  style: MusicStyle;
  suggestions: string[];
}

export interface ChordDiagram {
  chord: string; // e.g., "G", "Cmaj7"
  frets: number[]; // length 6, Low E to High E, -1 for muted string, 0 for open string
  fingers: number[]; // length 6, 0 for open/muted, 1-4 for index to pinky
  base_fret: number; // default 1
}

export interface ArrangementVariation {
  arrangement_id: string;
  title: string; // e.g., "Fingerstyle Solo Arrangement"
  style: ArrangementStyle;
  difficulty: DifficultyLevel;
  description: string; // summary of voice leading, bassline pattern, and chord substitutions used
  chords_used: string[];
  tablature: TablatureData; // complete playable 6-string tab with measures, notes, and ascii_tab
}

export interface ArrangementRequest {
  style: ArrangementStyle;
  difficulty: DifficultyLevel;
  capo?: number; // default 0, range 0 to 12
  tempo_scale?: number; // default 1.0, range 0.5 to 1.5
}

export type PipelineStage =
  | "queued"
  | "separating_stems"
  | "detecting_key_tempo"
  | "detecting_chords"
  | "transcribing_tablature"
  | "generating_arrangement"
  | "completed"
  | "failed";

export type StageStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped"
  | "failed";

export interface PipelineStepInfo {
  stage: PipelineStage;
  label: string;
  status: StageStatus;
  progress_percent: number; // 0 to 100
  detail?: string | null;
}

export type JobProgressEventType = "job.progress" | "job.completed" | "job.failed";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface JobProgressEvent {
  event: JobProgressEventType;
  job_id: string;
  status: JobStatus;
  current_stage: PipelineStage;
  overall_percent: number; // 0 to 100
  message: string;
  steps: PipelineStepInfo[];
  updated_at: string; // ISO-8601 timestamp
  result?: AnalysisResponse | null;
  error?: Record<string, unknown> | ErrorDetail | null;
}

export interface AnalysisResponse {
  job_id: string;
  status: "queued" | "processing" | "completed" | "failed";
  metadata: SongMetadata;
  chords: ChordData[];
  improvisations: ImprovisationData[];
  chord_diagrams: ChordDiagram[];
  tablature: TablatureData;
  arrangements: ArrangementVariation[];
  progress?: JobProgressEvent | null;
}

export interface ErrorDetail {
  code: string;
  message: string;
  details: Record<string, unknown> | unknown;
}

export interface ErrorEnvelope {
  error: ErrorDetail;
}

export type TransportType = "websocket" | "polling" | "mock" | "sync";

export interface UploadProgressState {
  isUploading: boolean;
  progress: number; // 0 - 100
  stage: "idle" | "uploading" | "analyzing" | "completed" | "error";
  errorMessage?: string;
  currentEvent?: JobProgressEvent | null;
  transport?: TransportType;
  elapsedSeconds?: number;
}

export interface ChordVoicingDetail {
  chord: string;
  frets: (number | "x")[]; // 6 strings: [E, A, D, G, B, e]
  fingers?: number[]; // 6 strings: [0..4]
  baseFret?: number;
  description?: string;
}

export type VoiceFilterMode =
  | "all"
  | "bass"
  | "melody"
  | "harmony"
  | "percussive";

export interface CanonicalStageDefinition {
  stage: PipelineStage;
  label: string;
  shortLabel: string;
  description: string;
  milestonePercent: number;
}

export const CANONICAL_PIPELINE_STAGES: CanonicalStageDefinition[] = [
  {
    stage: "separating_stems",
    label: "Separating Audio Stems — Demucs",
    shortLabel: "Stem Separation",
    description: "Demucs 4-stem source separation isolating guitar & bass tracks",
    milestonePercent: 25,
  },
  {
    stage: "detecting_key_tempo",
    label: "Detecting Musical Key & Tempo",
    shortLabel: "Key & Tempo",
    description: "Beat tracking (BPM) & Krumhansl-Schmuckler key signature detection",
    milestonePercent: 40,
  },
  {
    stage: "detecting_chords",
    label: "Recognizing Chords & Improvisations",
    shortLabel: "Chord Recognition",
    description: "Harmonic chromagram, voicings & style-based substitutions",
    milestonePercent: 60,
  },
  {
    stage: "transcribing_tablature",
    label: "Transcribing Guitar Tab — Basic Pitch + Viterbi",
    shortLabel: "Tab Transcription",
    description: "Polyphonic pitch extraction & biomechanical Viterbi fretboard mapping",
    milestonePercent: 85,
  },
  {
    stage: "generating_arrangement",
    label: "Generating Fingerstyle Arrangement",
    shortLabel: "AI Arrangement",
    description: "Fingerstyle voice separation, thumb bass & style synthesis",
    milestonePercent: 100,
  },
];

// ============================================================================
// Phase 5 Live Microphone Guitar Tuner & Real-Time Mic Chord Detector Models
// ============================================================================

export type TuningPresetId =
  | "standard"
  | "drop_d"
  | "half_step_down"
  | "open_g"
  | "dadgad";

export type TuningStatus = "flat" | "in_tune" | "sharp";

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


