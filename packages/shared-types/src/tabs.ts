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
