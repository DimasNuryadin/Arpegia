"use client";

import React, { useState, useMemo } from "react";
import {
  Sparkles,
  Volume2,
  Flame,
  ArrowRight,
  Music,
} from "lucide-react";
import { ImprovisationData, ChordData } from "../types";
import { guitarSynth } from "../lib/synth";

interface ImprovisationPanelProps {
  improvisations: ImprovisationData[];
  activeChord: ChordData | null;
  onSelectVoicingForDiagram?: (chordName: string) => void;
}

const STYLES: { key: string; label: string; color: string }[] = [
  { key: "ALL", label: "All Styles", color: "text-slate-200" },
  { key: "Neo Soul", label: "Neo Soul", color: "text-purple-400" },
  { key: "Jazz", label: "Jazz", color: "text-indigo-400" },
  { key: "Pop", label: "Pop", color: "text-emerald-400" },
  { key: "Fingerstyle", label: "Fingerstyle", color: "text-amber-400" },
];

export function ImprovisationPanel({
  improvisations,
  activeChord,
  onSelectVoicingForDiagram,
}: ImprovisationPanelProps) {
  const [selectedStyle, setSelectedStyle] = useState<string>("ALL");
  const [auditioningChord, setAuditioningChord] = useState<string | null>(null);
  const [filterActiveOnly, setFilterActiveOnly] = useState<boolean>(false);

  // Filter improvisations by style and optionally active chord
  const filteredImprovisations = useMemo(() => {
    return improvisations.filter((item) => {
      const matchStyle =
        selectedStyle === "ALL" ||
        item.style.toLowerCase() === selectedStyle.toLowerCase();
      const matchActive =
        !filterActiveOnly ||
        (activeChord &&
          item.original_chord.toLowerCase() === activeChord.chord.toLowerCase());
      return matchStyle && matchActive;
    });
  }, [improvisations, selectedStyle, filterActiveOnly, activeChord]);

  const handleAudition = (chordName: string) => {
    setAuditioningChord(chordName);
    guitarSynth.playChord(chordName, 2.0);
    onSelectVoicingForDiagram?.(chordName);
    setTimeout(() => {
      setAuditioningChord((curr) => (curr === chordName ? null : curr));
    }, 1200);
  };

  const getStyleBadgeClass = (style: string) => {
    switch (style.toLowerCase()) {
      case "neo soul":
        return "bg-purple-500/10 text-purple-300 border-purple-500/30";
      case "jazz":
        return "bg-indigo-500/10 text-indigo-300 border-indigo-500/30";
      case "pop":
        return "bg-emerald-500/10 text-emerald-300 border-emerald-500/30";
      case "fingerstyle":
        return "bg-amber-500/10 text-amber-300 border-amber-500/30";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md shadow-2xl space-y-5">
      {/* Panel Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Chord Improvisation & Alternative Voicings
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            AI-suggested harmonic substitutions & extended voicings grouped by
            musical style
          </p>
        </div>

        {/* Filter by Active Chord toggle */}
        {activeChord && (
          <button
            onClick={() => setFilterActiveOnly(!filterActiveOnly)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono rounded-lg border transition-all ${
              filterActiveOnly
                ? "bg-amber-500/15 border-amber-500/40 text-amber-300"
                : "bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200"
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Follow Active:{" "}
              <strong className="text-amber-300">{activeChord.chord}</strong>
            </span>
          </button>
        )}
      </div>

      {/* Style Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {STYLES.map((style) => {
          const isSelected = selectedStyle === style.key;
          return (
            <button
              key={style.key}
              onClick={() => setSelectedStyle(style.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-xl border transition-all duration-200 ${
                isSelected
                  ? "bg-slate-800 text-white border-amber-500/60 shadow-lg shadow-amber-500/10"
                  : "bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200"
              }`}
            >
              {style.label}
            </button>
          );
        })}
      </div>

      {/* Improvisation Cards Grid */}
      {filteredImprovisations.length === 0 ? (
        <div className="py-12 text-center rounded-xl bg-slate-950/40 border border-slate-800/60 space-y-2">
          <Music className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-sm text-slate-400 font-medium">
            No substitutions found for current filter
          </p>
          <button
            onClick={() => {
              setSelectedStyle("ALL");
              setFilterActiveOnly(false);
            }}
            className="text-xs text-amber-400 hover:underline font-mono"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredImprovisations.map((item, idx) => {
            const isActiveNow =
              activeChord &&
              activeChord.chord.toLowerCase() ===
                item.original_chord.toLowerCase();

            return (
              <div
                key={`${item.original_chord}-${item.style}-${idx}`}
                className={`relative rounded-xl p-4 transition-all duration-200 border flex flex-col justify-between ${
                  isActiveNow
                    ? "bg-slate-900/90 border-amber-500/40 shadow-[0_0_15px_rgba(251,191,36,0.1)]"
                    : "bg-slate-950/60 hover:bg-slate-950/90 border-slate-800 hover:border-slate-700"
                }`}
              >
                {/* Header: Original Chord -> Style */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold font-mono text-white">
                        {item.original_chord}
                      </span>
                      {isActiveNow && (
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Now Playing
                        </span>
                      )}
                    </div>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${getStyleBadgeClass(
                        item.style
                      )}`}
                    >
                      {item.style}
                    </span>
                  </div>

                  {/* Substitution Suggestions */}
                  <div className="space-y-2">
                    <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
                      <ArrowRight className="w-3 h-3 text-amber-400" />
                      <span>Suggested Alternative Voicings:</span>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {item.suggestions.map((suggestion) => {
                        const isAuditioning = auditioningChord === suggestion;
                        return (
                          <button
                            key={suggestion}
                            onClick={() => handleAudition(suggestion)}
                            title={`Audition ${suggestion} chord tone & view neck`}
                            className={`group inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold transition-all border ${
                              isAuditioning
                                ? "bg-amber-400 text-slate-950 border-amber-300 scale-105 shadow-md"
                                : "bg-slate-900 hover:bg-slate-800 text-amber-200 border-slate-700 hover:border-amber-500/40"
                            }`}
                          >
                            <Volume2
                              className={`w-3.5 h-3.5 ${
                                isAuditioning
                                  ? "animate-ping text-slate-950"
                                  : "text-amber-400/80 group-hover:text-amber-300"
                              }`}
                            />
                            <span>{suggestion}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Theoretical Style Note */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
                  <span>Click voicing to audition tone</span>
                  <span className="text-amber-400/80">6-string fret map</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
