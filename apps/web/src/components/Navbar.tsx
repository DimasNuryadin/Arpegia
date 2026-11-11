"use client";

import React from "react";
import { Sparkles, Radio, Music2, Cpu, Sun, Moon, Mic, FileAudio } from "lucide-react";

export type TopLevelStudioMode = "upload_analysis" | "live_mic";

interface NavbarProps {
  currentMode: TopLevelStudioMode;
  onSelectMode: (mode: TopLevelStudioMode) => void;
  mockMode: boolean;
  onToggleMockMode: (val: boolean) => void;
  onLoadPreset: (presetKey: string) => void;
  isProcessing: boolean;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
}

export function Navbar({
  currentMode,
  onSelectMode,
  mockMode,
  onToggleMockMode,
  onLoadPreset,
  isProcessing,
  theme = "dark",
  onToggleTheme,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-[#090b10]/95 backdrop-blur-md transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 shadow-lg shadow-amber-500/20">
            <Music2 className="w-5 h-5 text-white" />
            <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#090b10] animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl font-bold tracking-tight text-white font-mono">
                ARPEGIA
              </span>
              <span className="px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                Phase 5 Live Mic Studio
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              60fps Edge DSP Guitar Tuner • Real-Time Mic Chord Detector
            </p>
          </div>
        </div>

        {/* Top-Level Mode Switcher (Zero Cognitive Overload) */}
        <div className="flex items-center bg-slate-900/90 border border-slate-800 rounded-2xl p-1 shadow-inner">
          <button
            type="button"
            onClick={() => onSelectMode("upload_analysis")}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer ${
              currentMode === "upload_analysis"
                ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileAudio className="w-3.5 h-3.5" />
            <span>🎵 Studio Analysis <span className="hidden md:inline">(Upload Audio)</span></span>
          </button>

          <button
            type="button"
            onClick={() => onSelectMode("live_mic")}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer ${
              currentMode === "live_mic"
                ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>🎙️ Live Mic Studio <span className="hidden md:inline">(Tuner & Chord Jam)</span></span>
          </button>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center gap-2.5">
          {/* Quick Preset Selector only visible in Upload Studio Mode */}
          {currentMode === "upload_analysis" && (
            <div className="hidden lg:flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
              <span className="text-xs text-slate-400 px-2 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Presets:
              </span>
              <button
                onClick={() => onLoadPreset("neo-soul-g")}
                disabled={isProcessing}
                className="px-2.5 py-1 text-xs font-medium rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Neo Soul (G)
              </button>
              <button
                onClick={() => onLoadPreset("acoustic-c")}
                disabled={isProcessing}
                className="px-2.5 py-1 text-xs font-medium rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Acoustic (C)
              </button>
            </div>
          )}

          {/* Demo / Mock Mode Toggle */}
          <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-3 py-1.5">
            <div className="flex items-center gap-1.5">
              <Cpu
                className={`w-3.5 h-3.5 ${
                  mockMode ? "text-amber-400" : "text-emerald-400"
                }`}
              />
              <span className="text-xs font-medium text-slate-300 hidden sm:inline">
                {mockMode ? "Mock Engine" : "Live API"}
              </span>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={mockMode}
              aria-label="Toggle Mock Engine Mode"
              onClick={() => onToggleMockMode(!mockMode)}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 focus:ring-offset-slate-900 ${
                mockMode ? "bg-amber-500" : "bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                  mockMode ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Light / Dark Mode Studio Toggle */}
          {onToggleTheme && (
            <button
              type="button"
              onClick={onToggleTheme}
              aria-label={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
              title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-xs font-mono text-slate-200 transition-colors cursor-pointer"
            >
              {theme === "dark" ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden xl:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden xl:inline">Dark</span>
                </>
              )}
            </button>
          )}

          {/* Engine Status indicator */}
          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/60 border border-slate-800/80 text-[11px] text-slate-400">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>Phase 5 Ready</span>
          </div>
        </div>
      </div>
    </header>
  );
}

