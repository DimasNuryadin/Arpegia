import { AnalysisResponse, ErrorDetail } from './chords';

export type PipelineStage =
  | 'queued'
  | 'separating_stems'
  | 'detecting_key_tempo'
  | 'detecting_chords'
  | 'transcribing_tablature'
  | 'generating_arrangement'
  | 'completed'
  | 'failed';

export type StageStatus = 'pending' | 'in_progress' | 'completed' | 'skipped' | 'failed';

export interface PipelineStepInfo {
  stage: PipelineStage;
  label: string;
  status: StageStatus;
  progress_percent: number; // 0 to 100
  detail?: string | null;
}

export type JobProgressEventType = 'job.progress' | 'job.completed' | 'job.failed';

export type JobStatus = 'queued' | 'processing' | 'completed' | 'failed';

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
  error?: Record<string, any> | ErrorDetail | null;
}
