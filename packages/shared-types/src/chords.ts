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
