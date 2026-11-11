"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  ChordDiagram,
  LiveChordDetectionResult,
  TuningPresetId,
} from "../types";
import {
  extractChromaFromFft,
  calculateRms,
  matchChromaToChord,
  PITCH_CLASSES,
  STANDARD_CHORD_VOICINGS,
} from "../lib/chord-dsp";
import { LiveMicManager } from "../lib/live-mic";
import { LiveChordClient, LiveChordTransport } from "../lib/live-chord-client";
import { ChordVoicingDiagram } from "./ChordVoicingDiagram";
import { guitarSynth } from "../lib/synth";
import {
  Music,
  Radio,
  Mic,
  MicOff,
  Trash2,
  Volume2,
  Sparkles,
  Layers,
  ArrowRight,
  Activity,
} from "lucide-react";

interface LiveChordDetectorProps {
  micManager: LiveMicManager;
  isMicActive: boolean;
  onToggleMic: () => void;
  mockMode: boolean;
  tuningPreset?: TuningPresetId;
  simulatedChord?: { chord: string; seq: number } | null;
}

interface ProgressionItem {
  id: string;
  chord: string;
  quality: string;
  time: string;
}

export function LiveChordDetector({
  micManager,
  isMicActive,
  onToggleMic,
  mockMode,
  tuningPreset = "standard",
  simulatedChord,
}: LiveChordDetectorProps) {
  // Live Detection State
  const [activeResult, setActiveResult] = useState<LiveChordDetectionResult | null>(null);
  const [transport, setTransport] = useState<LiveChordTransport>(
    mockMode ? "client-mock" : "websocket"
  );
  const [isRoomSilent, setIsRoomSilent] = useState<boolean>(true);
  const [liveChroma, setLiveChroma] = useState<number[]>(new Array(12).fill(0));
  const [rollingProgression, setRollingProgression] = useState<ProgressionItem[]>([
    { id: "init-1", chord: "G", quality: "Major Triad", time: "Ready" },
    { id: "init-2", chord: "Em7", quality: "Minor 7th", time: "Ready" },
    { id: "init-3", chord: "Cmaj7", quality: "Major 7th", time: "Ready" },
  ]);
  const [selectedChordForDiagram, setSelectedChordForDiagram] = useState<string>("G");

  // Client and interval references
  const clientRef = useRef<LiveChordClient | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastChordRef = useRef<string>("Cmaj7");

  // Initialize or update LiveChordClient
  useEffect(() => {
    const client = new LiveChordClient({
      mockMode,
      tuningPreset,
      onResult: (result, currentTransport) => {
        setTransport(currentTransport);

        if (!result || result.chord === "N") {
          setIsRoomSilent(true);
          return;
        }

        setIsRoomSilent(false);
        setActiveResult(result);
        setSelectedChordForDiagram(result.chord);

        // Update Rolling Progression (if different from previous chord)
        if (result.chord && result.chord !== lastChordRef.current && result.confidence >= 0.55) {
          lastChordRef.current = result.chord;
          const newItem: ProgressionItem = {
            id: `${result.chord}-${Date.now()}`,
            chord: result.chord,
            quality: result.quality || "Chord",
            time: new Date().toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
          };

          setRollingProgression((prev) => {
            const next = [...prev, newItem];
            return next.length > 8 ? next.slice(next.length - 8) : next;
          });
        }
      },
      onTransportChange: (newTransport) => {
        setTransport(newTransport);
      },
    });

    clientRef.current = client;
    client.start();

    return () => {
      client.stop();
      clientRef.current = null;
    };
  }, [mockMode, tuningPreset]);

  // Handle external simulated chord
  useEffect(() => {
    if (!simulatedChord || !simulatedChord.chord) return;

    const chord = simulatedChord.chord;
    const voicing = STANDARD_CHORD_VOICINGS[chord] || null;
    const synthResult: LiveChordDetectionResult = {
      chord,
      root: chord.replace(/[^A-G#b]/g, ""),
      quality: chord.includes("maj7")
        ? "Major 7th"
        : chord.includes("m7")
        ? "Minor 7th"
        : chord.includes("m")
        ? "Minor Triad"
        : chord.includes("7")
        ? "Dominant 7th"
        : "Major Triad",
      confidence: 0.96,
      voicing,
      notes_detected: [chord.charAt(0), "E", "G", "B"],
      timestamp_ms: Date.now(),
    };

    setActiveResult(synthResult);
    setIsRoomSilent(false);
    setSelectedChordForDiagram(chord);

    // Synthetic Chroma vector
    const mockChroma = new Array(12).fill(0.05);
    const rootIdx = PITCH_CLASSES.indexOf(synthResult.root);
    if (rootIdx >= 0) {
      mockChroma[rootIdx] = 0.95;
      mockChroma[(rootIdx + 4) % 12] = 0.82;
      mockChroma[(rootIdx + 7) % 12] = 0.88;
    }
    setLiveChroma(mockChroma);

    // Append to progression
    if (chord !== lastChordRef.current) {
      lastChordRef.current = chord;
      const newItem: ProgressionItem = {
        id: `${chord}-${Date.now()}`,
        chord,
        quality: synthResult.quality,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
      };
      setRollingProgression((prev) => {
        const next = [...prev, newItem];
        return next.length > 8 ? next.slice(next.length - 8) : next;
      });
    }
  }, [simulatedChord]);

  // Live Microphonic FFT Chroma Extraction Loop (~200ms frame interval)
  useEffect(() => {
    if (!isMicActive) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    const frameIntervalMs = 190;
    intervalRef.current = setInterval(() => {
      const freqDb = micManager.getFrequencyDbData();
      const timeData = micManager.getTimeDomainData();
      const sampleRate = micManager.getSampleRate();
      const fftSize = micManager.getFftSize();

      if (freqDb && timeData && sampleRate > 0) {
        const rms = calculateRms(timeData);
        const chroma = extractChromaFromFft(freqDb, sampleRate, fftSize);
        setLiveChroma(chroma);

        if (rms < 0.015) {
          setIsRoomSilent(true);
        } else {
          setIsRoomSilent(false);
        }

        if (clientRef.current) {
          clientRef.current.processFrame(chroma, rms, null, sampleRate);
        }
      }
    }, frameIntervalMs);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isMicActive, micManager]);

  const handleClearHistory = useCallback(() => {
    setRollingProgression([]);
  }, []);

  const handleStrumCurrentChord = useCallback(() => {
    const chord = activeResult?.chord || selectedChordForDiagram || "G";
    guitarSynth.playChord(chord, 2.0);
  }, [activeResult, selectedChordForDiagram]);

  // Fallback display values
  const displayChord = isRoomSilent
    ? selectedChordForDiagram || "G"
    : activeResult?.chord || selectedChordForDiagram || "G";
  const displayQuality = isRoomSilent
    ? "Ready to Jam"
    : activeResult?.quality || "Harmonic Chord";
  const displayConfidence = isRoomSilent
    ? 0
    : Math.round((activeResult?.confidence || 0) * 100);
  const displayNotes = isRoomSilent
    ? ["G", "B", "D"]
    : activeResult?.notes_detected || [];

  return (
    <div className="w-full space-y-6">
      {/* Top Header Bar: Status & Transport Mode */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 backdrop-blur-md shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-tr from-amber-500/20 to-indigo-500/20 text-amber-400 border border-amber-500/30">
            <Music className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
              <span>Live Microphone Chord Recognition</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Phase 5
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              12-bin Pitch Class Profile • Real-time Strum Detection • SVG Voicing Companion
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Transport Badge */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800/80 border border-slate-700/80 text-xs font-mono">
            <Radio
              className={`w-3.5 h-3.5 ${
                transport === "websocket"
                  ? "text-emerald-400 animate-pulse"
                  : transport === "http"
                  ? "text-indigo-400"
                  : "text-amber-400"
              }`}
            />
            <span className="text-slate-300">
              {transport === "websocket"
                ? "WebSocket (<30ms)"
                : transport === "http"
                ? "HTTP Polling"
                : "Mock DSP"}
            </span>
          </div>

          {/* Microphone On/Off */}
          <button
            type="button"
            onClick={onToggleMic}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer ${
              isMicActive
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25"
                : "bg-indigo-600 text-white hover:bg-indigo-500 shadow-md shadow-indigo-600/20"
            }`}
          >
            {isMicActive ? (
              <>
                <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>Listening...</span>
              </>
            ) : (
              <>
                <MicOff className="w-3.5 h-3.5" />
                <span>Turn On Mic</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Two-Column Section: Hero Active Chord Card + SVG Chord Voicing Diagram */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Hero Active Chord Card & 12-bin Chromagram Spectrum */}
        <div className="lg:col-span-7 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-7 backdrop-blur-xl shadow-2xl flex flex-col justify-between space-y-6">
          {/* Status Headline / Silence Indicator */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  isRoomSilent ? "bg-amber-400 animate-pulse" : "bg-emerald-400"
                }`}
              />
              <span className="text-xs font-mono uppercase tracking-wider text-slate-300 font-semibold">
                {isRoomSilent
                  ? isMicActive
                    ? "Listening... Strum a chord"
                    : "Microphone Paused (Click Strum in Simulator)"
                  : "Active Chord Detected"}
              </span>
            </div>

            <button
              type="button"
              onClick={handleStrumCurrentChord}
              className="flex items-center gap-1.5 px-3 py-1 text-xs font-mono font-semibold rounded-lg bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 transition-colors cursor-pointer"
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Strum Voice</span>
            </button>
          </div>

          {/* Hero Detected Chord Display */}
          <div className="py-2">
            <div className="flex items-baseline gap-4">
              <span className="text-6xl sm:text-7xl font-black font-mono tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-indigo-200 to-amber-300 drop-shadow-[0_0_30px_rgba(99,102,241,0.25)]">
                {displayChord}
              </span>
              <span className="px-3 py-1 rounded-xl text-xs font-mono font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
                {displayQuality}
              </span>
            </div>

            {/* Confidence Bar */}
            <div className="mt-4 max-w-sm">
              <div className="flex items-center justify-between text-xs font-mono text-slate-400 mb-1.5">
                <span>Chord Confidence</span>
                <span className="text-white font-bold">{displayConfidence}%</span>
              </div>
              <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-emerald-400 transition-all duration-200"
                  style={{ width: `${displayConfidence}%` }}
                />
              </div>
            </div>
          </div>

          {/* Detected Pitch Classes Pills */}
          <div>
            <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 block mb-2">
              Detected Pitch Classes:
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {displayNotes.length > 0 ? (
                displayNotes.map((note) => (
                  <span
                    key={note}
                    className="px-3 py-1 rounded-xl text-xs font-mono font-bold bg-slate-800 text-amber-300 border border-amber-500/30 shadow-sm"
                  >
                    {note}
                  </span>
                ))
              ) : (
                <span className="text-xs font-mono text-slate-500">
                  Waiting for guitar strum...
                </span>
              )}
            </div>
          </div>

          {/* 12-bin Chromagram Energy Vector Visualizer */}
          <div className="pt-4 border-t border-slate-800/80">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-indigo-400" />
                <span>12-Bin Pitch Class Profile (Chroma Energy):</span>
              </span>
              <span className="text-[10px] font-mono text-slate-500">
                C to B Chromatic Scale
              </span>
            </div>

            {/* 12 Bars */}
            <div className="grid grid-cols-12 gap-1.5 h-20 items-end bg-slate-950/60 p-2.5 rounded-2xl border border-slate-800/80">
              {PITCH_CLASSES.map((pitch, idx) => {
                const energy = liveChroma[idx] || 0;
                const isDetected = displayNotes.includes(pitch);
                const heightPercent = Math.max(8, Math.round(energy * 100));

                return (
                  <div
                    key={pitch}
                    className="flex flex-col items-center justify-end h-full group"
                  >
                    <div
                      className={`w-full rounded-t transition-all duration-150 ${
                        isDetected
                          ? "bg-amber-400 shadow-sm shadow-amber-400/30"
                          : energy > 0.3
                          ? "bg-indigo-500"
                          : "bg-slate-700/60"
                      }`}
                      style={{ height: `${heightPercent}%` }}
                    />
                    <span
                      className={`text-[9px] font-mono mt-1 ${
                        isDetected
                          ? "text-amber-300 font-bold"
                          : "text-slate-400"
                      }`}
                    >
                      {pitch}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Interactive SVG Chord Voicing Diagram */}
        <div className="lg:col-span-5 flex flex-col justify-center">
          <ChordVoicingDiagram
            selectedChordName={displayChord}
            activeChordName={displayChord}
            chordDiagrams={
              activeResult?.voicing
                ? [activeResult.voicing]
                : Object.values(STANDARD_CHORD_VOICINGS)
            }
            onSelectChord={(chord) => setSelectedChordForDiagram(chord)}
          />
        </div>
      </div>

      {/* Rolling Chord Progression Strip */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md shadow-xl">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono">
              Rolling Chord Progression Strip (Recent Strums)
            </h3>
          </div>

          {rollingProgression.length > 0 && (
            <button
              type="button"
              onClick={handleClearHistory}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-slate-400 hover:text-rose-300 hover:bg-rose-500/10 rounded-lg border border-transparent hover:border-rose-500/20 transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear History</span>
            </button>
          )}
        </div>

        {/* Progression Horizontal Flow */}
        <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-700">
          {rollingProgression.length === 0 ? (
            <p className="text-xs font-mono text-slate-500 py-2">
              No chords in history yet. Strum your guitar or click the demo buttons above!
            </p>
          ) : (
            rollingProgression.map((item, idx) => (
              <React.Fragment key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedChordForDiagram(item.chord);
                    guitarSynth.playChord(item.chord, 1.8);
                  }}
                  className={`flex flex-col items-center justify-center min-w-[72px] px-3 py-2 rounded-xl border transition-all cursor-pointer ${
                    selectedChordForDiagram === item.chord
                      ? "bg-indigo-500/20 border-indigo-500/50 text-indigo-200 shadow-md shadow-indigo-500/10"
                      : "bg-slate-800/80 border-slate-700/80 text-white hover:bg-slate-800"
                  }`}
                >
                  <span className="text-base font-black font-mono">
                    {item.chord}
                  </span>
                  <span className="text-[9px] font-mono text-slate-400 truncate max-w-[64px]">
                    {item.quality.split(" ")[0]}
                  </span>
                </button>

                {idx < rollingProgression.length - 1 && (
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />
                )}
              </React.Fragment>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
