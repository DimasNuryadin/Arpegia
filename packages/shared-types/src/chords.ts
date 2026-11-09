import { ArrangementStyle, DifficultyLevel, TablatureData } from './tabs';

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

export type MusicStyle =
  | 'Pop'
  | 'Jazz'
  | 'Neo Soul'
  | 'Fingerstyle'
  | 'Jazz Chord Melody'
  | 'Acoustic Strumming'
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

export interface AnalysisResponse {
  job_id: string;
  status: 'completed' | 'processing' | 'failed';
  metadata: SongMetadata;
  chords: ChordData[];
  improvisations: ImprovisationData[];
  chord_diagrams: ChordDiagram[];
  tablature: TablatureData;
  arrangements: ArrangementVariation[];
}

export interface ErrorDetail {
  code: string;
  message: string;
  details: any;
}

export interface ErrorEnvelope {
  error: ErrorDetail;
}
