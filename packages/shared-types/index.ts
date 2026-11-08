/**
 * @arpegia/shared-types — Physical TypeScript Contracts (Phase 1 & Phase 2)
 *
 * Canonical TypeScript interfaces shared across apps/web, apps/api, and services/audio-engine.
 * Mirrors packages/shared-types/schemas.py (Pydantic v2 reference models).
 */

export type ProcessingStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

export interface AudioTrack {
  id: string;
  userId?: string;
  title: string;
  artist?: string;
  durationSeconds: number;
  fileFormat: 'mp3' | 'wav' | 'flac' | 'm4a';
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

export type GuitarTuning = 'STANDARD_E' | 'DROP_D' | 'DADGAD' | 'OPEN_D' | 'OPEN_G';

export type TabTechnique = 'normal' | 'hammer-on' | 'pull-off' | 'slide' | 'bend';

export type TabDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export const DEFAULT_GUITAR_TUNING: string[] = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];

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
  difficulty: TabDifficulty;
  measures: TabMeasure[];
  ascii_tab: string; // pre-rendered 6-line ASCII tablature preview for export/quick view
}

export interface TabNoteEdit {
  id: string;
  string: number; // 1 to 6, where 1 = High E4 and 6 = Low E2
  fret: number; // 0 to 24
  technique?: TabTechnique;
  start_time?: number;
  duration?: number;
}

export interface TablatureUpdateRequest {
  tuning?: string[];
  capo?: number;
  difficulty?: TabDifficulty;
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

// Phase 1 & Phase 2 Shared Data Contract (Web <-> API <-> Audio Engine)
export interface SongMetadata {
  filename: string;
  duration: number;
  key: string;
  bpm: number;
  time_signature: string;
}

export interface ChordData {
  chord: string;
  start_time: number;
  end_time: number;
  confidence: number;
}

export type MusicStyle = 'Pop' | 'Jazz' | 'Neo Soul' | 'Fingerstyle' | string;

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

export interface AnalysisResponse {
  job_id: string;
  status: 'completed' | 'processing' | 'failed';
  metadata: SongMetadata;
  chords: ChordData[];
  improvisations: ImprovisationData[];
  chord_diagrams: ChordDiagram[];
  tablature: TablatureData;
}

export interface ErrorDetail {
  code: string;
  message: string;
  details: any;
}

export interface ErrorEnvelope {
  error: ErrorDetail;
}
