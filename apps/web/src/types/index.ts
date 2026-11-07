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

export type MusicStyle = "Pop" | "Jazz" | "Neo Soul" | "Fingerstyle" | string;

export interface ImprovisationData {
  original_chord: string;
  style: MusicStyle;
  suggestions: string[];
}

export interface AnalysisResponse {
  job_id: string;
  status: "completed" | "processing" | "failed";
  metadata: SongMetadata;
  chords: ChordData[];
  improvisations: ImprovisationData[];
}

export interface UploadProgressState {
  isUploading: boolean;
  progress: number; // 0 - 100
  stage: "idle" | "uploading" | "analyzing" | "completed" | "error";
  errorMessage?: string;
}

export interface ChordVoicingDetail {
  chord: string;
  frets: (number | "x")[]; // 6 strings: [E, A, D, G, B, e]
  baseFret?: number;
  description?: string;
}
