"use client";

import React, { useState } from "react";
import {
  ArrangementRequest,
  ArrangementStyle,
  ArrangementVariation,
  DifficultyLevel,
  TablatureData,
} from "../types";
import { guitarSynth } from "../lib/synth";
import {
  Wand2,
  Sparkles,
  Loader2,
  Music,
  Sliders,
  Volume2,
  Layers,
  Gauge,
  CheckCircle2,
} from "lucide-react";

export interface ArrangementStudioPanelProps {
  jobId: string;
  originalTablature: TablatureData;
  arrangements: ArrangementVariation[];
  activeArrangementId: string | null; // null = Original Transcription Tab
  onSelectArrangement: (arrangementId: string | null) => void;
  onGenerateArrangement: (request: ArrangementRequest) => Promise<void>;
  onSelectChordForDiagram?: (chordName: string) => void;
}

const ARRANGEMENT_STYLES: {
  style: ArrangementStyle;
  badge: string;
  tagline: string;
}[] = [
  {
    style: "Fingerstyle",
    badge: "Polyphonic Thumb + Melody",
    tagline:
      "Alternating thumb bass on strings 5–6 with lyrical fingerpicked melody & open harmonics",
  },
  {
    style: "Neo Soul",
    badge: "9th/11th Voicings & Slides",
    tagline:
      "Extended R&B shell chords, double-stop embellishments & syncopated ghost notes",
  },
  {
    style: "Jazz Chord Melody",
    badge: "Drop-2 & Walking Bass",
    tagline:
      "Sophisticated jazz voice leading, tritone substitutions & chromatic bass motion",
  },
  {
    style: "Acoustic Strumming",
    badge: "Rhythmic Folk / Pop",
    tagline:
      "Dynamic root-strum patterns with open-string resonance & percussive muting",
  },
];

const DIFFICULTY_LEVELS: DifficultyLevel[] = [
  "Beginner",
  "Intermediate",
  "Advanced",
];

const TEMPO_PRESETS = [0.5, 0.75, 0.9, 1.0, 1.15, 1.25, 1.5];

export function ArrangementStudioPanel({
  jobId,
  originalTablature,
  arrangements,
  activeArrangementId,
  onSelectArrangement,
  onGenerateArrangement,
  onSelectChordForDiagram,
}: ArrangementStudioPanelProps) {
  const [style, setStyle] = useState<ArrangementStyle>("Fingerstyle");
  const [difficulty, setDifficulty] =
    useState<DifficultyLevel>("Intermediate");
  const [capo, setCapo] = useState<number>(0);
  const [tempoScale, setTempoScale] = useState<number>(1.0);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);

  const activeVariation =
    arrangements.find((a) => a.arrangement_id === activeArrangementId) || null;

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      await onGenerateArrangement({
        style,
        difficulty,
        capo,
        tempo_scale: tempoScale,
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const getDifficultyBadgeClass = (diff: DifficultyLevel) => {
    switch (diff) {
      case "Beginner":
        return "bg-emerald-500/15 text-emerald-300 border-emerald-500/30";
      case "Intermediate":
        return "bg-amber-500/15 text-amber-300 border-amber-500/30";
      case "Advanced":
        return "bg-rose-500/15 text-rose-300 border-rose-500/30";
      default:
        return "bg-slate-800 text-slate-300 border-slate-700";
    }
  };

  const getStyleAccentClass = (st: ArrangementStyle) => {
    switch (st) {
      case "Fingerstyle":
        return "border-amber-500/50 bg-amber-500/10 text-amber-300";
      case "Neo Soul":
        return "border-purple-500/50 bg-purple-500/10 text-purple-300";
      case "Jazz Chord Melody":
        return "border-indigo-500/50 bg-indigo-500/10 text-indigo-300";
      case "Acoustic Strumming":
        return "border-emerald-500/50 bg-emerald-500/10 text-emerald-300";
    }
  };

  return (
    <div
      className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md shadow-2xl space-y-5"
      aria-label="AI Guitar Arrangement Studio Panel"
    >
      {/* Studio Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-gradient-to-br from-amber-500/20 to-rose-500/20 border border-amber-500/40 text-amber-400">
              <Wand2 className="w-4 h-4" />
            </div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-100 font-mono">
              AI Guitar Arrangement Studio
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
              Phase 3 Intelligence
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Synthesize custom polyphonic guitar arrangements with separated{" "}
            <strong className="text-amber-300">thumb bass</strong>,{" "}
            <strong className="text-sky-300">melody</strong>, and{" "}
            <strong className="text-emerald-300">inner harmony</strong> voices
            via{" "}
            <code className="text-[11px] text-slate-300 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
              POST /api/v1/analyze/{jobId}/arrange
            </code>
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <Layers className="w-3.5 h-3.5 text-amber-400" />
          <span>
            Available Variations:{" "}
            <strong className="text-white">{arrangements.length + 1}</strong>
          </span>
        </div>
      </div>

      {/* Generator Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 1. Style Selector (6 cols) */}
        <div className="lg:col-span-6 space-y-2">
          <label className="block text-xs font-mono font-semibold text-slate-300">
            1. Arrangement Style (`style`)
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ARRANGEMENT_STYLES.map((item) => {
              const isSelected = style === item.style;
              return (
                <button
                  key={item.style}
                  type="button"
                  onClick={() => setStyle(item.style)}
                  className={`text-left p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "bg-slate-800/95 border-amber-500/70 shadow-lg shadow-amber-500/10"
                      : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold font-mono text-white">
                      {item.style}
                    </span>
                    <span
                      className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                        isSelected
                          ? "bg-amber-500 text-slate-950 border-amber-300 font-bold"
                          : "bg-slate-900 text-slate-400 border-slate-800"
                      }`}
                    >
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-2 leading-snug">
                    {item.tagline}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Difficulty, Capo & Tempo Scale (6 cols) */}
        <div className="lg:col-span-6 flex flex-col justify-between gap-3 bg-slate-950/60 border border-slate-800/90 rounded-xl p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Difficulty Selector */}
            <div className="space-y-1.5">
              <label className="flex items-center justify-between text-xs font-mono text-slate-300 font-semibold">
                <span>2. Difficulty</span>
              </label>
              <div className="flex flex-col gap-1.5">
                {DIFFICULTY_LEVELS.map((lvl) => {
                  const isSelected = difficulty === lvl;
                  return (
                    <button
                      key={lvl}
                      type="button"
                      onClick={() => setDifficulty(lvl)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all cursor-pointer text-left flex items-center justify-between ${
                        isSelected
                          ? "bg-amber-500 text-slate-950 border-amber-300 shadow-sm"
                          : "bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <span>{lvl}</span>
                      {isSelected && <CheckCircle2 className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Capo Selector (0 to 12) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300 font-semibold flex items-center gap-1">
                  <Sliders className="w-3 h-3 text-amber-400" />
                  3. Capo (0–12)
                </span>
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  {capo === 0 ? "Open" : `Fret ${capo}`}
                </span>
              </div>

              <input
                type="range"
                min={0}
                max={12}
                step={1}
                value={capo}
                aria-label="Arrangement Capo Position (0 to 12)"
                onChange={(e) =>
                  setCapo(
                    Math.max(0, Math.min(12, parseInt(e.target.value, 10) || 0))
                  )
                }
                className="w-full h-2 bg-slate-800 accent-amber-500 rounded-lg cursor-pointer"
              />

              <div className="grid grid-cols-4 gap-1 pt-1">
                {[0, 2, 4, 7].map((presetCapo) => (
                  <button
                    key={presetCapo}
                    type="button"
                    onClick={() => setCapo(presetCapo)}
                    className={`py-1 rounded text-[10px] font-mono border cursor-pointer ${
                      capo === presetCapo
                        ? "bg-amber-500 text-slate-950 border-amber-300 font-bold"
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                    }`}
                  >
                    {presetCapo === 0 ? "None" : `${presetCapo}fr`}
                  </button>
                ))}
              </div>
            </div>

            {/* Tempo Scale Selector (0.5x to 1.5x) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-slate-300 font-semibold flex items-center gap-1">
                  <Gauge className="w-3 h-3 text-indigo-400" />
                  4. Tempo Scale
                </span>
                <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                  {tempoScale.toFixed(2)}x
                </span>
              </div>

              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={tempoScale}
                aria-label="Arrangement Tempo Scale (0.5x to 1.5x)"
                onChange={(e) =>
                  setTempoScale(
                    Math.max(
                      0.5,
                      Math.min(1.5, parseFloat(e.target.value) || 1.0)
                    )
                  )
                }
                className="w-full h-2 bg-slate-800 accent-indigo-500 rounded-lg cursor-pointer"
              />

              <div className="flex flex-wrap gap-1 pt-1">
                {TEMPO_PRESETS.slice(0, 4).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTempoScale(t)}
                    className={`px-1.5 py-1 rounded text-[10px] font-mono border cursor-pointer ${
                      Math.abs(tempoScale - t) < 0.02
                        ? "bg-indigo-500 text-white border-indigo-300 font-bold"
                        : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                    }`}
                  >
                    {t}x
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Generate CTA Button */}
          <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[11px] font-mono text-slate-400">
              Target:{" "}
              <strong className="text-amber-300">{style}</strong> •{" "}
              <strong className="text-slate-200">{difficulty}</strong> • Capo{" "}
              <strong className="text-slate-200">{capo}</strong> •{" "}
              <strong className="text-slate-200">{tempoScale}x</strong>
            </div>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500 hover:from-amber-400 hover:via-rose-400 hover:to-indigo-400 text-white shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-60"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Synthesizing Arrangement...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Generate AI Arrangement</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Selectable Arrangement Variations Switcher Bar */}
      <div className="space-y-3 pt-2 border-t border-slate-800/80">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Music className="w-3.5 h-3.5 text-amber-400" />
            Active Tablature &amp; Arrangement Switcher
          </span>
          <span className="text-[11px] font-mono text-slate-400">
            Click any tab below to switch the 6-string Tablature Viewer &amp;
            Export Hub
          </span>
        </div>

        <div
          className="flex flex-wrap items-center gap-2"
          role="tablist"
          aria-label="Tablature and AI Arrangement Variations"
        >
          {/* Original Transcription Tab */}
          <button
            type="button"
            role="tab"
            aria-selected={activeArrangementId === null}
            onClick={() => onSelectArrangement(null)}
            className={`px-3.5 py-2 rounded-xl text-xs font-mono font-semibold border transition-all cursor-pointer flex items-center gap-2 ${
              activeArrangementId === null
                ? "bg-amber-500 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/20"
                : "bg-slate-950/80 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white"
            }`}
          >
            <span>Original Transcription Tab</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                activeArrangementId === null
                  ? "bg-slate-950/20 text-slate-950 font-bold"
                  : "bg-slate-900 text-slate-400"
              }`}
            >
              {originalTablature.difficulty}
            </span>
          </button>

          {/* AI Arrangement Variations */}
          {arrangements.map((variation) => {
            const isSelected =
              activeArrangementId === variation.arrangement_id;
            return (
              <button
                key={variation.arrangement_id}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => onSelectArrangement(variation.arrangement_id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-mono font-semibold border transition-all cursor-pointer flex items-center gap-2 ${
                  isSelected
                    ? "bg-gradient-to-r from-amber-500 to-rose-500 text-slate-950 border-amber-300 shadow-lg shadow-amber-500/20"
                    : "bg-slate-950/80 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white"
                }`}
              >
                <Sparkles
                  className={`w-3.5 h-3.5 ${
                    isSelected ? "text-slate-950" : "text-amber-400"
                  }`}
                />
                <span>{variation.title}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded ${
                    isSelected
                      ? "bg-slate-950/20 text-slate-950 font-bold"
                      : "bg-slate-900 text-amber-300"
                  }`}
                >
                  {variation.difficulty}
                </span>
              </button>
            );
          })}
        </div>

        {/* Active Arrangement Metadata Card (Title, Description, Difficulty Badge & Reharmonized Chords Used) */}
        {activeVariation ? (
          <div className="rounded-xl bg-slate-950/80 border border-amber-500/30 p-4 space-y-3 animate-in fade-in duration-150">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold font-mono text-white">
                    {activeVariation.title}
                  </h3>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full border ${getStyleAccentClass(
                      activeVariation.style
                    )}`}
                  >
                    {activeVariation.style}
                  </span>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded-full border ${getDifficultyBadgeClass(
                      activeVariation.difficulty
                    )}`}
                  >
                    {activeVariation.difficulty}
                  </span>
                  <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-slate-900 text-slate-300 border border-slate-800">
                    Capo: {activeVariation.tablature.capo || 0}
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  {activeVariation.description}
                </p>
              </div>

              <span className="text-[10px] font-mono text-slate-500">
                ID: {activeVariation.arrangement_id}
              </span>
            </div>

            {/* Chords Used in this Arrangement Variation */}
            {activeVariation.chords_used &&
              activeVariation.chords_used.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
                  <span className="text-[11px] font-mono text-slate-400">
                    Reharmonized Chords Used (`chords_used`):
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {activeVariation.chords_used.map((chordSymbol, idx) => (
                      <button
                        key={`${chordSymbol}-${idx}`}
                        type="button"
                        onClick={() => {
                          guitarSynth.playChord(chordSymbol, 1.8);
                          onSelectChordForDiagram?.(chordSymbol);
                        }}
                        title={`Audition ${chordSymbol} voicing`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono font-semibold bg-slate-900 hover:bg-slate-800 text-amber-300 border border-slate-700 hover:border-amber-400/50 transition-colors cursor-pointer"
                      >
                        <Volume2 className="w-3 h-3 text-amber-400" />
                        <span>{chordSymbol}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
          </div>
        ) : (
          <div className="rounded-xl bg-slate-950/50 border border-slate-800/80 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400">
            <div>
              Viewing <strong className="text-white">Original Transcription Tab</strong>{" "}
              ({originalTablature.measures.length} measures •{" "}
              {originalTablature.difficulty} tier • Capo{" "}
              {originalTablature.capo || 0}). Select an AI Arrangement tab above
              or generate a new style variation!
            </div>
            {arrangements[0] && (
              <button
                type="button"
                onClick={() =>
                  onSelectArrangement(arrangements[0].arrangement_id)
                }
                className="text-amber-400 hover:underline font-semibold cursor-pointer"
              >
                Switch to {arrangements[0].title} →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
