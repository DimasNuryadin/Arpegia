"use client";

import React from "react";
import { Sparkles, Music2, Activity, Volume2 } from "lucide-react";
import { TuningPreset } from "../types";
import { playReferenceTone } from "../lib/tuner-dsp";
import { guitarSynth } from "../lib/synth";

interface LiveMicSimulatorProps {
  mode: "tuner" | "chord";
  activePreset: TuningPreset;
  onSimulatePitch?: (freq: number, label: string) => void;
  onSimulateChord?: (chord: string) => void;
}

export function LiveMicSimulator({
  mode,
  activePreset,
  onSimulatePitch,
  onSimulateChord,
}: LiveMicSimulatorProps) {
  // Low E String simulations (String 6)
  const lowE = activePreset.strings.find((s) => s.string === 6) || activePreset.strings[0];
  const targetE = lowE.frequency_hz;
  const flatE = Math.round(targetE * Math.pow(2, -18 / 1200) * 100) / 100; // -18 cents
  const inTuneE = targetE; // 0 cents
  const sharpE = Math.round(targetE * Math.pow(2, 22 / 1200) * 100) / 100; // +22 cents

  const handleSimulateString = (freq: number, label: string) => {
    playReferenceTone(freq, 2.0);
    onSimulatePitch?.(freq, label);
  };

  const handleSimulateChordClick = (chordName: string) => {
    guitarSynth.playChord(chordName, 2.0);
    onSimulateChord?.(chordName);
  };

  return (
    <div className="w-full bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono">
              Simulate Guitar Input (Demo Mode)
            </h4>
            <p className="text-[11px] text-slate-400">
              Test DSP & algorithms without requiring a physical guitar or hardware microphone
            </p>
          </div>
        </div>

        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
          Synthesizer Linked
        </span>
      </div>

      {mode === "tuner" ? (
        <div className="space-y-2">
          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span>Simulate String Plucks (Plucks audio + evaluates meter):</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Low E Cents Variations */}
            <button
              type="button"
              onClick={() =>
                handleSimulateString(flatE, `${lowE.note} (Flat: -18c)`)
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition-colors text-xs font-mono cursor-pointer"
            >
              <Volume2 className="w-3 h-3" />
              <span>
                {lowE.note} Flat <span className="opacity-70">(-18c)</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                handleSimulateString(inTuneE, `${lowE.note} (In Tune: 0c)`)
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition-colors text-xs font-mono font-semibold cursor-pointer shadow-sm shadow-emerald-500/10"
            >
              <Volume2 className="w-3 h-3" />
              <span>
                {lowE.note} In-Tune <span className="opacity-70">(0c)</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() =>
                handleSimulateString(sharpE, `${lowE.note} (Sharp: +22c)`)
              }
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition-colors text-xs font-mono cursor-pointer"
            >
              <Volume2 className="w-3 h-3" />
              <span>
                {lowE.note} Sharp <span className="opacity-70">(+22c)</span>
              </span>
            </button>

            <span className="text-slate-600 hidden sm:inline">|</span>

            {/* Other 5 Strings */}
            {activePreset.strings
              .filter((s) => s.string !== 6)
              .map((str) => (
                <button
                  key={str.string}
                  type="button"
                  onClick={() =>
                    handleSimulateString(
                      str.frequency_hz,
                      `${str.note} (In Tune)`
                    )
                  }
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700 transition-colors text-xs font-mono cursor-pointer"
                >
                  <Volume2 className="w-3 h-3 text-slate-400" />
                  <span>
                    String {str.string} ({str.note})
                  </span>
                </button>
              ))}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
            <Music2 className="w-3.5 h-3.5 text-indigo-400" />
            <span>Simulate Guitar Strum (Plays chord voicing & feeds chromagram):</span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {["G", "Em7", "Cmaj7", "D7", "Am", "Fadd9"].map((chord) => (
              <button
                key={chord}
                type="button"
                onClick={() => handleSimulateChordClick(chord)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 transition-colors text-xs font-mono font-semibold cursor-pointer"
              >
                <Volume2 className="w-3 h-3" />
                <span>Strum {chord}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
