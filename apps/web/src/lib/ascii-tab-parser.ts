// Advanced ASCII Guitar Tablature Parser for Arpegia
// Converts raw 6-string ASCII tabs into Arpegia TablatureData and AlphaTab alphaTex notation

import {
  DEFAULT_GUITAR_TUNING,
  DifficultyLevel,
  TabMeasure,
  TabNote,
  TabTechnique,
  TablatureData,
} from "../types";
import { computeMidiAndNoteName } from "./tab-utils";

export interface ParsedTabResult {
  tablature: TablatureData;
  alphaTex: string;
  bpm: number;
  timeSignature: string;
  totalNotes: number;
  totalMeasures: number;
}

// Map common string prefixes to guitar string numbers (1 = High E, 6 = Low E)
const STRING_PREFIX_MAP: Record<string, number> = {
  e: 1,
  "e'": 1,
  high_e: 1,
  b: 2,
  g: 3,
  d: 4,
  a: 5,
  e2: 6,
  low_e: 6,
  "1": 1,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
};

interface StringLine {
  stringNum: number;
  content: string;
  rawLabel: string;
}

/**
 * Parses raw ASCII tab text into structured measures and notes
 */
export function parseAsciiTab(
  asciiText: string,
  options: {
    bpm?: number;
    timeSignature?: string;
    tuning?: string[];
    capo?: number;
  } = {}
): ParsedTabResult {
  const bpm = options.bpm || 120;
  const timeSignature = options.timeSignature || "4/4";
  const tuning = options.tuning || DEFAULT_GUITAR_TUNING;
  const capo = options.capo || 0;

  const secondsPerBeat = 60 / bpm;
  const beatsPerMeasure = 4;
  const measureDuration = secondsPerBeat * beatsPerMeasure;

  const lines = asciiText.split(/\r?\n/);
  const blocks: StringLine[][] = [];
  let currentBlock: StringLine[] = [];

  // Group lines into 6-string tab blocks
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) {
      if (currentBlock.length === 6) {
        blocks.push(currentBlock);
        currentBlock = [];
      } else if (currentBlock.length > 0 && currentBlock.length < 6) {
        currentBlock = [];
      }
      continue;
    }

    // Match string pattern e.g. "e|---", "B|---", "1|---", "E|---"
    const match = rawLine.match(/^\s*([A-Ga-g1-6#']{1,4})\s*[|:\-](.+)$/);
    if (match) {
      const rawPrefix = match[1].toLowerCase();
      let stringNum = STRING_PREFIX_MAP[rawPrefix];

      if (!stringNum) {
        stringNum = currentBlock.length + 1;
      }

      currentBlock.push({
        stringNum,
        content: match[2],
        rawLabel: match[1],
      });

      if (currentBlock.length === 6) {
        blocks.push(currentBlock);
        currentBlock = [];
      }
    }
  }

  if (currentBlock.length === 6) {
    blocks.push(currentBlock);
  }

  // Fallback if no clean 6-string blocks found
  if (blocks.length === 0) {
    return createEmptyFallback(bpm, timeSignature, tuning, capo, asciiText);
  }

  const allNotes: TabNote[] = [];
  let globalMeasureOffset = 0;
  const measures: TabMeasure[] = [];

  for (const block of blocks) {
    // Sort strings from 1 (High E) to 6 (Low E)
    block.sort((a, b) => a.stringNum - b.stringNum);

    // Normalize content lengths
    const maxLen = Math.max(...block.map((b) => b.content.length));
    const normalizedRows = block.map((b) => b.content.padEnd(maxLen, "-"));

    // Identify bar line column indices '|'
    const barIndices: number[] = [];
    for (let col = 0; col < maxLen; col++) {
      let pipeCount = 0;
      for (const row of normalizedRows) {
        if (row[col] === "|" || row[col] === ":") pipeCount++;
      }
      if (pipeCount >= 3) {
        barIndices.push(col);
      }
    }

    // Slice block into sub-measure segments by bar lines
    interface Segment {
      startCol: number;
      endCol: number;
    }
    const segments: Segment[] = [];
    if (barIndices.length >= 2) {
      for (let i = 0; i < barIndices.length - 1; i++) {
        const start = barIndices[i] + 1;
        const end = barIndices[i + 1] - 1;
        if (end > start) {
          segments.push({ startCol: start, endCol: end });
        }
      }
    } else {
      const step = 16;
      for (let s = 0; s < maxLen; s += step) {
        segments.push({
          startCol: s,
          endCol: Math.min(maxLen - 1, s + step - 1),
        });
      }
    }

    // Parse notes in each segment / measure
    for (const seg of segments) {
      const segWidth = seg.endCol - seg.startCol + 1;
      if (segWidth <= 0) continue;

      const measureIdx = globalMeasureOffset++;
      const measureStartTime = measureIdx * measureDuration;
      const measureEndTime = measureStartTime + measureDuration;
      const measureNotes: TabNote[] = [];

      for (let col = seg.startCol; col <= seg.endCol; col++) {
        for (let strIdx = 0; strIdx < 6; strIdx++) {
          const char = normalizedRows[strIdx][col];
          const stringNum = block[strIdx].stringNum;

          if (/[0-9]/.test(char)) {
            let fretVal = parseInt(char, 10);
            const nextChar = normalizedRows[strIdx][col + 1];
            if (nextChar && /[0-9]/.test(nextChar)) {
              fretVal = parseInt(char + nextChar, 10);
            }

            let technique: TabTechnique = "normal";
            const prevChar = normalizedRows[strIdx][col - 1] || "";
            const trailingChar = normalizedRows[strIdx][col + 1] || "";

            if (prevChar === "h" || trailingChar === "h") technique = "hammer-on";
            else if (prevChar === "p" || trailingChar === "p") technique = "pull-off";
            else if (prevChar === "/" || trailingChar === "/" || prevChar === "\\" || trailingChar === "\\")
              technique = "slide";
            else if (prevChar === "b" || trailingChar === "b") technique = "bend";

            const segRatio = (col - seg.startCol) / Math.max(1, segWidth);
            const noteStartTime = measureStartTime + segRatio * measureDuration;
            const noteDuration = Math.max(0.2, (measureDuration / 8));

            const { midi, note_name } = computeMidiAndNoteName(
              stringNum,
              fretVal,
              tuning,
              capo
            );

            const voice = stringNum >= 4 ? "bass" : stringNum <= 2 ? "melody" : "harmony";
            const noteId = `m${measureIdx}_s${stringNum}_c${col}_${Math.random().toString(36).substring(2, 6)}`;

            const tabNote: TabNote = {
              id: noteId,
              string: stringNum,
              fret: fretVal,
              start_time: Math.round(noteStartTime * 100) / 100,
              duration: Math.round(noteDuration * 100) / 100,
              technique,
              midi,
              note_name,
              voice,
              confidence: 0.98,
            };

            measureNotes.push(tabNote);
            allNotes.push(tabNote);
          }
        }
      }

      measures.push({
        measure_number: measureIdx + 1,
        start_time: Math.round(measureStartTime * 100) / 100,
        end_time: Math.round(measureEndTime * 100) / 100,
        notes: measureNotes,
      });
    }
  }

  const alphaTex = generateAlphaTexFromMeasures(measures, bpm, timeSignature);
  const difficulty: DifficultyLevel = allNotes.length > 40 ? "Intermediate" : "Beginner";

  const tablature: TablatureData = {
    tuning,
    capo,
    difficulty,
    measures,
    ascii_tab: asciiText,
  };

  return {
    tablature,
    alphaTex,
    bpm,
    timeSignature,
    totalNotes: allNotes.length,
    totalMeasures: measures.length,
  };
}

function generateAlphaTexFromMeasures(
  measures: TabMeasure[],
  bpm: number,
  timeSignature: string
): string {
  // AlphaTex requires space-separated time signature ("\ts 4 4" instead of "\ts 4/4")
  const formattedTs = (timeSignature || "4/4").replace("/", " ").trim();
  const parts: string[] = [
    `\\tempo ${Math.round(bpm || 120)}`,
    `\\ts ${formattedTs}`,
    ".",
  ];

  for (const m of measures) {
    if (m.notes.length === 0) {
      parts.push("r.1 |");
      continue;
    }

    const sorted = [...m.notes].sort((a, b) => a.start_time - b.start_time);
    const measureTokens: string[] = [];

    const beatGroups: TabNote[][] = [];
    let currentGroup: TabNote[] = [];
    let currentGroupTime = -1;

    for (const n of sorted) {
      if (currentGroupTime < 0 || Math.abs(n.start_time - currentGroupTime) < 0.05) {
        currentGroup.push(n);
        currentGroupTime = n.start_time;
      } else {
        beatGroups.push(currentGroup);
        currentGroup = [n];
        currentGroupTime = n.start_time;
      }
    }
    if (currentGroup.length > 0) {
      beatGroups.push(currentGroup);
    }

    for (const group of beatGroups) {
      if (group.length === 1) {
        const n = group[0];
        let suffix = "";
        // In AlphaTex note effects must be enclosed in braces: {h}, {sl}, {b(0 2)}
        if (n.technique === "hammer-on" || n.technique === "pull-off") suffix = "{h}";
        else if (n.technique === "slide") suffix = "{sl}";
        else if (n.technique === "bend") suffix = "{b(0 2)}";
        measureTokens.push(`${n.fret}.${n.string}${suffix}`);
      } else {
        const chordNotes = group.map((n) => `${n.fret}.${n.string}`).join(" ");
        measureTokens.push(`(${chordNotes})`);
      }
    }

    parts.push(measureTokens.join(" ") + " |");
  }

  return parts.join("\n");
}

function createEmptyFallback(
  bpm: number,
  timeSignature: string,
  tuning: string[],
  capo: number,
  rawText: string
): ParsedTabResult {
  const dummyMeasure: TabMeasure = {
    measure_number: 1,
    start_time: 0,
    end_time: 2.0,
    notes: [
      {
        id: "demo_1",
        string: 5,
        fret: 3,
        start_time: 0,
        duration: 0.5,
        technique: "normal",
        midi: 48,
        note_name: "C3",
        voice: "bass",
        confidence: 0.99,
      },
      {
        id: "demo_2",
        string: 2,
        fret: 1,
        start_time: 0.5,
        duration: 0.5,
        technique: "normal",
        midi: 60,
        note_name: "C4",
        voice: "melody",
        confidence: 0.99,
      },
      {
        id: "demo_3",
        string: 3,
        fret: 0,
        start_time: 1.0,
        duration: 0.5,
        technique: "normal",
        midi: 55,
        note_name: "G3",
        voice: "harmony",
        confidence: 0.99,
      },
      {
        id: "demo_4",
        string: 1,
        fret: 0,
        start_time: 1.5,
        duration: 0.5,
        technique: "normal",
        midi: 64,
        note_name: "E4",
        voice: "melody",
        confidence: 0.99,
      },
    ],
  };

  return {
    tablature: {
      tuning,
      capo,
      difficulty: "Beginner",
      measures: [dummyMeasure],
      ascii_tab: rawText,
    },
    alphaTex: `\\tempo ${Math.round(bpm || 120)}\n\\ts ${(timeSignature || "4/4").replace("/", " ").trim()}\n.\n3.5 1.2 0.3 0.1 |`,
    bpm,
    timeSignature,
    totalNotes: dummyMeasure.notes.length,
    totalMeasures: 1,
  };
}
