export type GuitarTuning = 'STANDARD_E' | 'DROP_D' | 'DADGAD' | 'OPEN_D' | 'OPEN_G';

export interface TabNote {
  string: 1 | 2 | 3 | 4 | 5 | 6; // 1 = High E, 6 = Low E
  fret: number;
  finger?: 1 | 2 | 3 | 4; // 1 = Index, 4 = Pinky
}

export interface TabChordEvent {
  timestamp: number;
  notes: TabNote[];
  chordName?: string;
}

export interface TablatureData {
  id: string;
  trackId: string;
  tuning: GuitarTuning;
  capo: number;
  alphaTexContent: string;
  difficultyRating: 'BEGINNER' | 'INTERMEDIATE' | 'ADVANCED';
}
