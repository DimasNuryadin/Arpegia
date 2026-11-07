"use client";

import React, { useMemo } from "react";
import { GUITAR_CHORD_VOICINGS } from "../lib/mock-data";
import { Guitar, Volume2 } from "lucide-react";
import { guitarSynth } from "../lib/synth";

interface GuitarFretboardProps {
  chordName: string;
}

const STRINGS = ["E", "A", "D", "G", "B", "e"]; // 6th string to 1st string
const FRET_COUNT = 12;
const SINGLE_DOT_FRETS = [3, 5, 7, 9];
const DOUBLE_DOT_FRETS = [12];

export function GuitarFretboard({ chordName }: GuitarFretboardProps) {
  const voicing = useMemo(() => {
    // Exact match or fallback by base chord name
    if (GUITAR_CHORD_VOICINGS[chordName]) {
      return GUITAR_CHORD_VOICINGS[chordName];
    }
    const base = chordName.split("/")[0].trim();
    if (GUITAR_CHORD_VOICINGS[base]) {
      return GUITAR_CHORD_VOICINGS[base];
    }
    // Generic default for unknown chords
    return {
      chord: chordName,
      frets: [3, 2, 0, 0, 0, 3] as (number | "x")[],
      description: `Voicing diagram for ${chordName}`,
    };
  }, [chordName]);

  const frets = voicing.frets;

  const handlePlayVoicing = () => {
    guitarSynth.playChord(chordName, 2.0);
  };

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md shadow-2xl space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800/80">
        <div className="flex items-center gap-2">
          <Guitar className="w-4 h-4 text-amber-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
            Interactive Fretboard Visualizer
          </h3>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-bold font-mono text-amber-400">
            {voicing.chord}
          </span>
          <button
            onClick={handlePlayVoicing}
            title="Strum this voicing"
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-colors"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Strum</span>
          </button>
        </div>
      </div>

      <p className="text-xs text-slate-400 font-mono">
        {voicing.description || `Fretboard placement for ${voicing.chord}`}
      </p>

      {/* Horizontal Fretboard Container */}
      <div className="overflow-x-auto py-2">
        <div className="min-w-[620px] bg-stone-950/80 border border-stone-800 rounded-xl p-4 shadow-inner relative select-none">
          {/* Nut line */}
          <div className="absolute top-10 bottom-6 left-12 w-1.5 bg-stone-200 rounded-sm shadow-md" />

          {/* Fretboard Grid */}
          <div className="relative pl-14">
            {/* Strings (6 horizontal lines: 6th string on bottom, 1st on top) */}
            <div className="space-y-4 py-2">
              {[5, 4, 3, 2, 1, 0].map((stringIdx) => {
                const fretVal = frets[stringIdx];
                const stringName = STRINGS[stringIdx];

                return (
                  <div
                    key={stringIdx}
                    className="relative flex items-center h-4"
                  >
                    {/* String label & Nut status (O / X) */}
                    <div className="absolute -left-12 flex items-center gap-1.5 w-10 text-[11px] font-mono font-semibold">
                      <span className="text-slate-400 w-3">{stringName}</span>
                      <span
                        className={`text-xs ${
                          fretVal === "x"
                            ? "text-rose-400 font-bold"
                            : fretVal === 0
                            ? "text-emerald-400 font-bold"
                            : "text-slate-600"
                        }`}
                      >
                        {fretVal === "x" ? "×" : fretVal === 0 ? "○" : "•"}
                      </span>
                    </div>

                    {/* Horizontal String Line */}
                    <div
                      className={`w-full ${
                        stringIdx >= 3 ? "h-[2.5px] bg-stone-400" : "h-[1.5px] bg-stone-300"
                      } shadow-sm`}
                    />

                    {/* Fret Finger Dots on this string */}
                    {typeof fretVal === "number" && fretVal > 0 && (
                      <div
                        className="absolute flex items-center justify-center w-5 h-5 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-slate-950 font-bold font-mono text-[10px] shadow-lg shadow-amber-500/50 -translate-x-1/2 z-10"
                        style={{
                          left: `${((fretVal - 0.5) / FRET_COUNT) * 100}%`,
                        }}
                      >
                        {fretVal}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Vertical Frets and Fret Numbers */}
            <div className="absolute inset-0 flex pointer-events-none">
              {Array.from({ length: FRET_COUNT }).map((_, i) => {
                const fretNum = i + 1;
                const isSingleDot = SINGLE_DOT_FRETS.includes(fretNum);
                const isDoubleDot = DOUBLE_DOT_FRETS.includes(fretNum);

                return (
                  <div
                    key={fretNum}
                    className="flex-1 border-r border-stone-700 relative flex flex-col justify-end items-center pb-0"
                  >
                    {/* Inlay Fret Markers in neck */}
                    {isSingleDot && (
                      <div className="absolute top-[48%] -translate-y-1/2 w-2 h-2 rounded-full bg-stone-400/40" />
                    )}
                    {isDoubleDot && (
                      <div className="absolute top-[48%] -translate-y-1/2 flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-stone-400/40" />
                        <div className="w-1.5 h-1.5 rounded-full bg-stone-400/40" />
                      </div>
                    )}

                    {/* Fret Number Label at bottom */}
                    <span className="text-[10px] font-mono text-stone-500 mt-2">
                      {fretNum}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
