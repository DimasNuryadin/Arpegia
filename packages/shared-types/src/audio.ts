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
