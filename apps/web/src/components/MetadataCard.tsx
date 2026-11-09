"use client";

import React, { useEffect, useState } from "react";
import {
  KeyRound,
  Activity,
  Clock,
  Music,
  CheckCircle,
  Layers,
} from "lucide-react";
import { SongMetadata } from "../types";

interface MetadataCardProps {
  metadata: SongMetadata;
  chordsCount: number;
  averageConfidence: number;
  isPlaying: boolean;
}

export function MetadataCard({
  metadata,
  chordsCount,
  averageConfidence,
  isPlaying,
}: MetadataCardProps) {
  const [pulse, setPulse] = useState(false);

  // Metronome visual pulse synced to BPM
  useEffect(() => {
    if (!isPlaying || !metadata.bpm) {
      return;
    }
    const bpm = metadata.bpm;
    const intervalMs = Math.max(100, (60 / bpm) * 1000);
    let pulseTimeout: ReturnType<typeof setTimeout> | null = null;

    const interval = setInterval(() => {
      setPulse(true);
      if (pulseTimeout) clearTimeout(pulseTimeout);
      pulseTimeout = setTimeout(() => {
        setPulse(false);
      }, 120);
    }, intervalMs);

    return () => {
      clearInterval(interval);
      if (pulseTimeout) clearTimeout(pulseTimeout);
      setPulse(false);
    };
  }, [isPlaying, metadata.bpm]);

  const activePulse = isPlaying && pulse;

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}.${tenths}`;
  };

  return (
    <div className="w-full bg-slate-900/70 border border-slate-800 rounded-2xl p-5 backdrop-blur-sm relative overflow-hidden shadow-xl">
      {/* Background aesthetic line */}
      <div className="absolute top-0 right-0 w-96 h-32 bg-gradient-to-bl from-amber-500/5 via-indigo-500/5 to-transparent pointer-events-none" />

      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-800/80 mb-5">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-300 font-mono">
            Song Intelligence Metadata
          </h2>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
          <span className="truncate max-w-[200px] sm:max-w-xs text-slate-200">
            {metadata.filename}
          </span>
          <span className="text-slate-600">•</span>
          <span className="flex items-center gap-1 text-slate-300">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            {chordsCount} Chords
          </span>
          <span className="text-slate-600">•</span>
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle className="w-3.5 h-3.5" />
            {(averageConfidence * 100).toFixed(0)}% AI Confidence
          </span>
        </div>
      </div>

      {/* 4 Primary Metadata Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Detected Key */}
        <div className="group bg-slate-950/60 hover:bg-slate-950/90 border border-slate-800 hover:border-amber-500/40 rounded-xl p-4 transition-all duration-200">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">
              Detected Key
            </span>
            <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
              <KeyRound className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono tracking-tight group-hover:text-amber-300 transition-colors">
              {metadata.key}
            </span>
          </div>
          <span className="inline-block mt-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300">
            Harmonic Center
          </span>
        </div>

        {/* Tempo (BPM) with live metronome pulse */}
        <div className="group bg-slate-950/60 hover:bg-slate-950/90 border border-slate-800 hover:border-rose-500/40 rounded-xl p-4 transition-all duration-200">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">
              Tempo
            </span>
            <div
              className={`p-1.5 rounded-lg transition-colors duration-100 ${
                activePulse
                  ? "bg-rose-500 text-white scale-110 shadow-lg shadow-rose-500/50"
                  : "bg-rose-500/10 text-rose-400"
              }`}
            >
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono tracking-tight group-hover:text-rose-300 transition-colors">
              {metadata.bpm}
            </span>
            <span className="text-xs font-mono text-slate-400">BPM</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full transition-all duration-100 ${
                activePulse ? "bg-rose-400 scale-125" : "bg-slate-700"
              }`}
            />
            <span className="text-[10px] font-mono text-slate-400">
              {isPlaying ? "Beat Pulse Active" : "Metronome Ready"}
            </span>
          </div>
        </div>

        {/* Time Signature */}
        <div className="group bg-slate-950/60 hover:bg-slate-950/90 border border-slate-800 hover:border-indigo-500/40 rounded-xl p-4 transition-all duration-200">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">
              Time Signature
            </span>
            <div className="p-1.5 rounded-lg bg-indigo-500/10 text-indigo-400">
              <Music className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono tracking-tight group-hover:text-indigo-300 transition-colors">
              {metadata.time_signature}
            </span>
          </div>
          <span className="inline-block mt-2 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-800 text-slate-300">
            Standard Meter
          </span>
        </div>

        {/* Duration */}
        <div className="group bg-slate-950/60 hover:bg-slate-950/90 border border-slate-800 hover:border-emerald-500/40 rounded-xl p-4 transition-all duration-200">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">
              Duration
            </span>
            <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono tracking-tight group-hover:text-emerald-300 transition-colors">
              {formatDuration(metadata.duration)}
            </span>
          </div>
          <span className="inline-block mt-2 text-[10px] font-mono text-slate-400">
            {metadata.duration.toFixed(1)}s total audio
          </span>
        </div>
      </div>
    </div>
  );
}
