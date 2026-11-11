"use client";

import React, { useState, useEffect, useRef } from "react";
import { LiveMicManager } from "../lib/live-mic";
import { GuitarTuner } from "./GuitarTuner";
import { LiveChordDetector } from "./LiveChordDetector";
import { LiveMicSimulator } from "./LiveMicSimulator";
import { CANONICAL_TUNING_PRESETS } from "../lib/tuner-dsp";
import { TuningPreset } from "../types";
import {
  Mic,
  MicOff,
  Crosshair,
  Music2,
  AlertCircle,
  Sparkles,
  Volume2,
} from "lucide-react";

interface LiveMicStudioProps {
  mockMode: boolean;
}

export function LiveMicStudio({ mockMode }: LiveMicStudioProps) {
  // Sub-Tab Switcher State: 'tuner' | 'chord'
  const [activeSubTab, setActiveSubTab] = useState<"tuner" | "chord">("tuner");

  // Web Audio Mic Manager Instance
  const micManagerRef = useRef<LiveMicManager | null>(null);
  if (!micManagerRef.current) {
    micManagerRef.current = new LiveMicManager(2048);
  }
  const micManager = micManagerRef.current;

  // Microphone lifecycle state
  const [isMicActive, setIsMicActive] = useState<boolean>(false);
  const [micError, setMicError] = useState<string | null>(null);

  // Active Tuning Preset (defaults to Standard)
  const [activePreset, setActivePreset] = useState<TuningPreset>(
    CANONICAL_TUNING_PRESETS[0]
  );

  // Simulated events for demo testing without mic
  const [simulatedPitch, setSimulatedPitch] = useState<{
    freq: number;
    label: string;
    seq: number;
  } | null>(null);
  const [simulatedChord, setSimulatedChord] = useState<{
    chord: string;
    seq: number;
  } | null>(null);

  // Cleanup mic on unmount
  useEffect(() => {
    return () => {
      if (micManagerRef.current) {
        micManagerRef.current.stop();
      }
    };
  }, []);

  const handleToggleMic = async () => {
    if (isMicActive) {
      micManager.stop();
      setIsMicActive(false);
      setMicError(null);
    } else {
      setMicError(null);
      const res = await micManager.start();
      if (res.success) {
        setIsMicActive(true);
      } else {
        setIsMicActive(false);
        setMicError(
          res.error || "Could not access microphone. Try the Demo Simulator below!"
        );
      }
    }
  };

  const handleSimulatePitch = (freq: number, label: string) => {
    setSimulatedPitch((prev) => ({
      freq,
      label,
      seq: (prev?.seq ?? 0) + 1,
    }));
  };

  const handleSimulateChord = (chord: string) => {
    setSimulatedChord((prev) => ({
      chord,
      seq: (prev?.seq ?? 0) + 1,
    }));
  };

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-300">
      {/* Workspace Header: Sub-Tab 2-Pill Switcher & Microphone Status Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md shadow-xl">
        {/* 2-Tab Pill Switcher */}
        <div className="inline-flex p-1 rounded-xl bg-slate-950/80 border border-slate-800">
          <button
            type="button"
            onClick={() => setActiveSubTab("tuner")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
              activeSubTab === "tuner"
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span>🎯 Guitar Tuner</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab("chord")}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
              activeSubTab === "chord"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Music2 className="w-3.5 h-3.5" />
            <span>🎸 Live Chord Detector</span>
          </button>
        </div>

        {/* Global Live Mic Controls & Indicator */}
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-mono text-slate-400">
            <span
              className={`w-2 h-2 rounded-full ${
                isMicActive ? "bg-emerald-400 animate-ping" : "bg-slate-600"
              }`}
            />
            <span>
              {isMicActive
                ? `Mic Active (${micManager.getSampleRate()} Hz)`
                : "Microphone Paused"}
            </span>
          </div>

          <button
            type="button"
            onClick={handleToggleMic}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer ${
              isMicActive
                ? "bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25"
                : "bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-600/20"
            }`}
          >
            {isMicActive ? (
              <>
                <MicOff className="w-3.5 h-3.5" />
                <span>Mute Mic</span>
              </>
            ) : (
              <>
                <Mic className="w-3.5 h-3.5" />
                <span>Turn On Mic</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Mic Permission / Hardware Alert Banner if blocked */}
      {micError && (
        <div className="flex items-center justify-between gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-mono text-amber-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>
              <strong>Microphone Notice:</strong> {micError}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setMicError(null)}
            className="text-amber-400/80 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Built-in Demo Simulator Bar */}
      <LiveMicSimulator
        mode={activeSubTab}
        activePreset={activePreset}
        onSimulatePitch={handleSimulatePitch}
        onSimulateChord={handleSimulateChord}
      />

      {/* Sub-Tab 1: Guitar Tuner */}
      {activeSubTab === "tuner" && (
        <section aria-label="Interactive Guitar Tuner Workspace">
          <GuitarTuner
            micManager={micManager}
            isMicActive={isMicActive}
            onToggleMic={handleToggleMic}
            simulatedPitch={simulatedPitch}
          />
        </section>
      )}

      {/* Sub-Tab 2: Live Chord Detector */}
      {activeSubTab === "chord" && (
        <section aria-label="Real-Time Live Chord Detector Workspace">
          <LiveChordDetector
            micManager={micManager}
            isMicActive={isMicActive}
            onToggleMic={handleToggleMic}
            mockMode={mockMode}
            tuningPreset={activePreset.id}
            simulatedChord={simulatedChord}
          />
        </section>
      )}
    </div>
  );
}
