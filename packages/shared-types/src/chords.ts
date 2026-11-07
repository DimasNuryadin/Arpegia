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

// Phase 1 MVP Shared Data Contract (Web <-> API <-> Audio Engine)
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

export interface AnalysisResponse {
  job_id: string;
  status: 'completed' | 'processing' | 'failed';
  metadata: SongMetadata;
  chords: ChordData[];
  improvisations: ImprovisationData[];
}

