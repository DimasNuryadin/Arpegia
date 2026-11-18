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
    <div className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl p-4 sm:p-5 backdrop-blur-md relative overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3.5 border-b border-white/[0.08] mb-4">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />
          <h2 className="text-xs sm:text-sm font-semibold uppercase tracking-wider text-zinc-200 font-mono">
            Song Intelligence Metadata
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] sm:text-xs font-mono text-zinc-400">
          <span className="truncate max-w-[140px] xs:max-w-[200px] sm:max-w-xs text-zinc-200 font-medium">
            {metadata.filename}
          </span>
          <span className="text-zinc-600 hidden xs:inline">•</span>
          <span className="flex items-center gap-1 text-zinc-300">
            <Layers className="w-3.5 h-3.5 text-indigo-400" />
            {chordsCount} Chords
          </span>
          <span className="text-zinc-600 hidden xs:inline">•</span>
          <span className="flex items-center gap-1 text-emerald-400">
            <CheckCircle className="w-3.5 h-3.5" />
            {(averageConfidence * 100).toFixed(0)}% AI Conf
          </span>
        </div>
      </div>

      {/* 4 Primary Metadata Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Detected Key */}
        <div className="group bg-zinc-950/60 hover:bg-zinc-950/90 border border-white/[0.06] hover:border-amber-500/30 rounded-lg p-3.5 transition-all">
          <div className="flex items-center justify-between text-zinc-400 mb-1.5">
            <span className="text-[11px] font-mono font-medium uppercase tracking-wider">
              Detected Key
            </span>
            <div className="p-1 rounded bg-amber-500/10 text-amber-400">
              <KeyRound className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-100 font-mono tracking-tight group-hover:text-amber-300 transition-colors">
              {metadata.key}
            </span>
          </div>
          <span className="inline-block mt-2 text-[10px] font-mono font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
            Harmonic Center
          </span>
        </div>

        {/* Tempo (BPM) with live metronome pulse */}
        <div className="group bg-zinc-950/60 hover:bg-zinc-950/90 border border-white/[0.06] hover:border-rose-500/30 rounded-lg p-3.5 transition-all">
          <div className="flex items-center justify-between text-zinc-400 mb-1.5">
            <span className="text-[11px] font-mono font-medium uppercase tracking-wider">
              Tempo
            </span>
            <div
              className={`p-1 rounded transition-colors duration-100 ${
                activePulse
                  ? "bg-rose-500 text-white scale-110 shadow-md shadow-rose-500/40"
                  : "bg-rose-500/10 text-rose-400"
              }`}
            >
              <Activity className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-100 font-mono tracking-tight group-hover:text-rose-300 transition-colors">
              {metadata.bpm}
            </span>
            <span className="text-xs font-mono text-zinc-400">BPM</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className={`w-1.5 h-1.5 rounded-full transition-all duration-100 ${
                activePulse ? "bg-rose-400 scale-125" : "bg-zinc-700"
              }`}
            />
            <span className="text-[10px] font-mono text-zinc-400">
              {isPlaying ? "Beat Pulse Active" : "Metronome Ready"}
            </span>
          </div>
        </div>

        {/* Time Signature */}
        <div className="group bg-zinc-950/60 hover:bg-zinc-950/90 border border-white/[0.06] hover:border-indigo-500/30 rounded-lg p-3.5 transition-all">
          <div className="flex items-center justify-between text-zinc-400 mb-1.5">
            <span className="text-[11px] font-mono font-medium uppercase tracking-wider">
              Time Signature
            </span>
            <div className="p-1 rounded bg-indigo-500/10 text-indigo-400">
              <Music className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-100 font-mono tracking-tight group-hover:text-indigo-300 transition-colors">
              {metadata.time_signature}
            </span>
          </div>
          <span className="inline-block mt-2 text-[10px] font-mono font-medium uppercase tracking-wider px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-300">
            Standard Meter
          </span>
        </div>

        {/* Duration */}
        <div className="group bg-zinc-950/60 hover:bg-zinc-950/90 border border-white/[0.06] hover:border-emerald-500/30 rounded-lg p-3.5 transition-all">
          <div className="flex items-center justify-between text-zinc-400 mb-1.5">
            <span className="text-[11px] font-mono font-medium uppercase tracking-wider">
              Duration
            </span>
            <div className="p-1 rounded bg-emerald-500/10 text-emerald-400">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-zinc-100 font-mono tracking-tight group-hover:text-emerald-300 transition-colors">
              {formatDuration(metadata.duration)}
            </span>
          </div>
          <span className="inline-block mt-2 text-[10px] font-mono text-zinc-400">
            {metadata.duration.toFixed(1)}s total audio
          </span>
        </div>
      </div>
    </div>
  );
}
