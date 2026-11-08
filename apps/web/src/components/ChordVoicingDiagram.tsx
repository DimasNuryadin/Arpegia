"use client";

import React, { useMemo } from "react";
import { ChordDiagram, DEFAULT_GUITAR_TUNING } from "../types";
import { resolveChordDiagram } from "../lib/mock-data";
import { guitarSynth } from "../lib/synth";
import { computeMidiAndNoteName } from "../lib/tab-utils";
import { Volume2, Grid, Sparkles } from "lucide-react";

interface ChordVoicingDiagramProps {
  selectedChordName: string;
  activeChordName?: string | null;
  chordDiagrams: ChordDiagram[];
  tuning?: string[];
  capo?: number;
  onSelectChord?: (chordName: string) => void;
}

const STRING_LABELS = ["E", "A", "D", "G", "B", "e"];
const FINGER_NAMES: Record<number, string> = {
  1: "Index (1)",
  2: "Middle (2)",
  3: "Ring (3)",
  4: "Pinky (4)",
};

export function ChordVoicingDiagram({
  selectedChordName,
  activeChordName,
  chordDiagrams,
  tuning = DEFAULT_GUITAR_TUNING,
  capo = 0,
  onSelectChord,
}: ChordVoicingDiagramProps) {
  // Resolve the active/selected ChordDiagram
  const currentDiagram = useMemo(() => {
    return resolveChordDiagram(selectedChordName || "G", chordDiagrams);
  }, [selectedChordName, chordDiagrams]);

  // Calculate display base_fret so all fretted notes fit within a 5-fret SVG box
  const displayBaseFret = useMemo(() => {
    const positiveFrets = currentDiagram.frets.filter((f) => f > 0);
    if (positiveFrets.length === 0) return 1;
    const maxFret = Math.max(...positiveFrets);
    const minFret = Math.min(...positiveFrets);
    if (currentDiagram.base_fret && currentDiagram.base_fret > 1) {
      return currentDiagram.base_fret;
    }
    if (maxFret <= 5) return 1;
    return Math.max(1, minFret);
  }, [currentDiagram]);

  // Compute note names for each of the 6 strings in this voicing
  const stringNotes = useMemo(() => {
    return currentDiagram.frets.map((fret, idx) => {
      if (fret < 0) return "Muted";
      const stringNum = 6 - idx;
      return computeMidiAndNoteName(stringNum, fret, tuning, capo).note_name;
    });
  }, [currentDiagram, tuning, capo]);

  const handleStrumCurrent = () => {
    guitarSynth.playChordDiagram(currentDiagram, tuning, capo, 1.8);
  };

  const handlePluckSingleString = (arrayIdx: number) => {
    const fret = currentDiagram.frets[arrayIdx];
    if (fret < 0) return;
    const stringNum = 6 - arrayIdx;
    const { midi } = computeMidiAndNoteName(stringNum, fret, tuning, capo);
    guitarSynth.playTabNote(
      {
        string: stringNum,
        fret,
        midi,
        duration: 1.1,
        technique: "normal",
      },
      tuning,
      capo
    );
  };

  // SVG coordinate constants
  const svgWidth = 240;
  const svgHeight = 250;
  const gridLeft = 42;
  const gridRight = 202;
  const gridTop = 44;
  const gridBottom = 204;
  const numStrings = 6;
  const numFrets = 5;
  const stringSpacing = (gridRight - gridLeft) / (numStrings - 1); // 32px
  const fretSpacing = (gridBottom - gridTop) / numFrets; // 32px

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Grid className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
            SVG Chord Voicing Diagram
          </h3>
        </div>

        <div className="flex items-center gap-2">
          {activeChordName &&
            activeChordName.toLowerCase() ===
              currentDiagram.chord.toLowerCase() && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                <Sparkles className="w-2.5 h-2.5" /> Synced
              </span>
            )}
          <button
            onClick={handleStrumCurrent}
            title={`Strum ${currentDiagram.chord} voicing`}
            className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-semibold rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-colors cursor-pointer"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Strum {currentDiagram.chord}</span>
          </button>
        </div>
      </div>

      {/* Main SVG Chord Box + Voicing Metadata */}
      <div className="flex flex-col sm:flex-row lg:flex-col xl:flex-row items-center justify-between gap-4 bg-slate-950/70 border border-slate-800/90 rounded-xl p-3">
        {/* Interactive SVG Chord Box */}
        <div className="relative flex-shrink-0">
          <svg
            width={svgWidth}
            height={svgHeight}
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="select-none overflow-visible"
            role="img"
            aria-label={`Guitar chord diagram for ${currentDiagram.chord}`}
          >
            {/* Base Fret Label on the left if > 1 */}
            {displayBaseFret > 1 && (
              <text
                x={gridLeft - 14}
                y={gridTop + fretSpacing * 0.65}
                textAnchor="end"
                className="fill-amber-400 font-mono text-xs font-bold"
              >
                {displayBaseFret}fr
              </text>
            )}

            {/* Top Nut (Thick bar if base_fret === 1, thin line otherwise) */}
            <line
              x1={gridLeft}
              y1={gridTop}
              x2={gridRight}
              y2={gridTop}
              stroke={displayBaseFret === 1 ? "#f8fafc" : "#475569"}
              strokeWidth={displayBaseFret === 1 ? 5 : 2}
              strokeLinecap="round"
            />

            {/* Horizontal Fret Lines */}
            {Array.from({ length: numFrets }).map((_, fretIdx) => {
              const y = gridTop + (fretIdx + 1) * fretSpacing;
              return (
                <line
                  key={`fret-${fretIdx}`}
                  x1={gridLeft}
                  y1={y}
                  x2={gridRight}
                  y2={y}
                  stroke="#334155"
                  strokeWidth={1.5}
                />
              );
            })}

            {/* Vertical String Lines (Low E on left to High e on right) */}
            {Array.from({ length: numStrings }).map((_, strIdx) => {
              const x = gridLeft + strIdx * stringSpacing;
              const strokeW = 2.4 - strIdx * 0.25; // thicker bass strings
              const fretVal = currentDiagram.frets[strIdx];
              const fingerVal = currentDiagram.fingers?.[strIdx] ?? 0;

              // Relative fret position inside the 5-fret box (1..5)
              const relFret =
                fretVal > 0 ? fretVal - displayBaseFret + 1 : 0;
              const clampedRelFret = Math.max(1, Math.min(numFrets, relFret));
              const dotY =
                gridTop + (clampedRelFret - 0.5) * fretSpacing;

              return (
                <g
                  key={`string-${strIdx}`}
                  onClick={() => handlePluckSingleString(strIdx)}
                  className={
                    fretVal >= 0 ? "cursor-pointer group" : "cursor-not-allowed"
                  }
                >
                  {/* Invisible wider hit target for clicking individual strings */}
                  <rect
                    x={x - 12}
                    y={gridTop - 28}
                    width={24}
                    height={gridBottom - gridTop + 56}
                    fill="transparent"
                  />

                  {/* Vertical string line */}
                  <line
                    x1={x}
                    y1={gridTop}
                    x2={x}
                    y2={gridBottom}
                    stroke={fretVal < 0 ? "#475569" : "#94a3b8"}
                    strokeWidth={strokeW}
                    strokeDasharray={fretVal < 0 ? "3 3" : undefined}
                  />

                  {/* Top Mute (X) or Open (O) Marker */}
                  {fretVal === -1 && (
                    <text
                      x={x}
                      y={gridTop - 12}
                      textAnchor="middle"
                      className="fill-rose-400 font-mono text-xs font-bold"
                    >
                      ✕
                    </text>
                  )}
                  {fretVal === 0 && (
                    <circle
                      cx={x}
                      cy={gridTop - 16}
                      r={5.5}
                      fill="none"
                      stroke="#34d399"
                      strokeWidth={2}
                    />
                  )}

                  {/* Fretted Note Circle + Finger Number */}
                  {fretVal > 0 && (
                    <g>
                      <circle
                        cx={x}
                        cy={dotY}
                        r={10.5}
                        className="fill-amber-400 stroke-amber-200 transition-transform duration-150 group-hover:scale-110"
                        strokeWidth={1.5}
                      />
                      <text
                        x={x}
                        y={dotY + 3.8}
                        textAnchor="middle"
                        className="fill-slate-950 font-mono text-[11px] font-extrabold pointer-events-none"
                      >
                        {fingerVal > 0 ? fingerVal : fretVal}
                      </text>
                    </g>
                  )}

                  {/* Bottom String Name & Pitch Label */}
                  <text
                    x={x}
                    y={gridBottom + 18}
                    textAnchor="middle"
                    className="fill-slate-400 font-mono text-[11px] font-semibold"
                  >
                    {STRING_LABELS[strIdx]}
                  </text>
                  <text
                    x={x}
                    y={gridBottom + 33}
                    textAnchor="middle"
                    className={`font-mono text-[9px] ${
                      fretVal < 0 ? "fill-slate-600" : "fill-amber-300/90"
                    }`}
                  >
                    {fretVal < 0 ? "—" : stringNotes[strIdx]}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* Right Side: Voicing Breakdown Details */}
        <div className="flex-1 w-full space-y-2.5 text-xs font-mono">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <span className="text-slate-400">Chord Symbol</span>
            <span className="text-lg font-bold text-amber-400">
              {currentDiagram.chord}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Base Fret</span>
            <span className="text-slate-200 font-semibold">
              Fret {displayBaseFret}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Frets (6→1)</span>
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-amber-300">
              [
              {currentDiagram.frets
                .map((f) => (f < 0 ? "X" : f))
                .join(", ")}
              ]
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-slate-400">Fingers (6→1)</span>
            <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-300">
              [
              {(currentDiagram.fingers || [0, 0, 0, 0, 0, 0])
                .map((f) => (f === 0 ? "-" : f))
                .join(", ")}
              ]
            </span>
          </div>

          {/* Active Finger Legend */}
          <div className="pt-1 flex flex-wrap gap-1.5">
            {Array.from(
              new Set(
                (currentDiagram.fingers || []).filter((f) => f >= 1 && f <= 4)
              )
            )
              .sort()
              .map((fingerNum) => (
                <span
                  key={fingerNum}
                  className="text-[10px] px-2 py-0.5 rounded-md bg-slate-900 text-slate-300 border border-slate-800"
                >
                  {FINGER_NAMES[fingerNum]}
                </span>
              ))}
          </div>

          <p className="text-[10px] text-slate-500 pt-1">
            Tip: Click any vertical string on the SVG box to pluck that single
            string.
          </p>
        </div>
      </div>

      {/* Song Chord Diagrams Quick Selector Strip */}
      {chordDiagrams && chordDiagrams.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
            <span>Detected Song Voicings ({chordDiagrams.length})</span>
            <span>Click to inspect & strum</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {chordDiagrams.map((diag, idx) => {
              const isSelected =
                diag.chord.toLowerCase() ===
                currentDiagram.chord.toLowerCase();
              const isTimelineActive =
                activeChordName &&
                activeChordName.toLowerCase() === diag.chord.toLowerCase();

              return (
                <button
                  key={`${diag.chord}-${idx}`}
                  onClick={() => {
                    onSelectChord?.(diag.chord);
                    guitarSynth.playChordDiagram(diag, tuning, capo, 1.6);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all border cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? "bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20"
                      : isTimelineActive
                      ? "bg-amber-500/20 text-amber-300 border-amber-400/60"
                      : "bg-slate-950/70 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white"
                  }`}
                >
                  <span>{diag.chord}</span>
                  {isTimelineActive && (
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isSelected ? "bg-slate-950" : "bg-amber-400 animate-ping"
                      }`}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
