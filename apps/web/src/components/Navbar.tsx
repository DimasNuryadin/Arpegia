"use client";

import React, { useState } from "react";
import {
  Sparkles,
  Radio,
  Music2,
  Cpu,
  Sun,
  Moon,
  Mic,
  FileAudio,
  Menu,
  X,
  SlidersHorizontal,
} from "lucide-react";

export type TopLevelStudioMode = "tab_reader" | "upload_analysis" | "live_mic";

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
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-[#090b10]/95 backdrop-blur-md transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* Top Navbar Row */}
        <div className="h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="relative flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-indigo-600 shadow-lg shadow-amber-500/20 flex-shrink-0">
              <Music2 className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-[#090b10] animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-lg sm:text-xl font-bold tracking-tight text-white font-mono">
                  ARPEGIA
                </span>
                <span className="hidden xs:inline-block px-1.5 py-0.5 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30">
                  AI Guitar
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden lg:block">
                60fps Edge DSP Guitar Tuner • Real-Time Mic Chord Detector
              </p>
            </div>
          </div>

          {/* Desktop Top-Level Mode Switcher */}
          <div className="hidden md:flex items-center bg-slate-900/90 border border-slate-800 rounded-2xl p-1 shadow-inner">
            <button
              type="button"
              onClick={() => onSelectMode("tab_reader")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer ${
                currentMode === "tab_reader"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Music2 className="w-3.5 h-3.5" />
              <span>🎸 Tab &amp; Score</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectMode("upload_analysis")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer ${
                currentMode === "upload_analysis"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileAudio className="w-3.5 h-3.5" />
              <span>🎵 AI Transcribe</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectMode("live_mic")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer ${
                currentMode === "live_mic"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>🎙️ Live Jam &amp; Tuner</span>
            </button>
          </div>

          {/* Center / Right controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {/* Quick Preset Selector visible on desktop in Studio Analysis Mode */}
            {currentMode === "upload_analysis" && (
              <div className="hidden xl:flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
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

            {/* Desktop Mock Mode Toggle */}
            <div className="hidden sm:flex items-center gap-2 bg-slate-900/90 border border-slate-800 rounded-xl px-2.5 py-1.5">
              <div className="flex items-center gap-1.5">
                <Cpu
                  className={`w-3.5 h-3.5 ${
                    mockMode ? "text-amber-400" : "text-emerald-400"
                  }`}
                />
                <span className="text-xs font-medium text-slate-300">
                  {mockMode ? "Mock" : "Live API"}
                </span>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={mockMode}
                aria-label="Toggle Mock Engine Mode"
                onClick={() => onToggleMockMode(!mockMode)}
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 ${
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
                className="flex items-center justify-center w-9 h-9 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 text-xs font-mono text-slate-200 transition-colors cursor-pointer"
              >
                {theme === "dark" ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-indigo-400" />
                )}
              </button>
            )}

            {/* Mobile Menu & Quick Settings Toggle Button (Visible on mobile/tablet) */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? "Close menu" : "Open studio menu"}
              className="flex md:hidden items-center justify-center w-9 h-9 rounded-xl bg-slate-900/90 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              {mobileMenuOpen ? (
                <X className="w-4 h-4 text-amber-400" />
              ) : (
                <Menu className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Full-Width Segmented Mode Switcher (Always accessible on mobile) */}
        <div className="flex md:hidden pb-3 pt-1">
          <div className="grid grid-cols-3 w-full bg-slate-950/90 border border-slate-800/90 rounded-xl p-1 shadow-inner gap-1">
            <button
              type="button"
              onClick={() => {
                onSelectMode("tab_reader");
                setMobileMenuOpen(false);
              }}
              className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer text-center ${
                currentMode === "tab_reader"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Music2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">Tab Play</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectMode("upload_analysis");
                setMobileMenuOpen(false);
              }}
              className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer text-center ${
                currentMode === "upload_analysis"
                  ? "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <FileAudio className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">Transcribe</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectMode("live_mic");
                setMobileMenuOpen(false);
              }}
              className={`flex items-center justify-center gap-1 py-2 px-1.5 rounded-lg text-xs font-mono font-semibold transition-all cursor-pointer text-center ${
                currentMode === "live_mic"
                  ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/25 font-bold"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <Mic className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">Live Jam</span>
            </button>
          </div>
        </div>

        {/* Mobile Collapsible Quick Drawer (Presets, Engine Mode, System Status) */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4 pt-1 border-t border-slate-800/80 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Mobile Mock Engine Mode Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs">
              <div className="flex items-center gap-2">
                <Cpu
                  className={`w-4 h-4 ${
                    mockMode ? "text-amber-400" : "text-emerald-400"
                  }`}
                />
                <div>
                  <span className="font-semibold text-slate-200 block">
                    {mockMode ? "Mock Engine Mode" : "Live FastAPI Mode"}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {mockMode
                      ? "High-fidelity local simulation"
                      : "Real neural backend at localhost:8000"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={mockMode}
                onClick={() => onToggleMockMode(!mockMode)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  mockMode ? "bg-amber-500" : "bg-slate-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                    mockMode ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Mobile Sample Preset Tracks */}
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Load Sample Guitar Song:</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onLoadPreset("neo-soul-g");
                    setMobileMenuOpen(false);
                  }}
                  disabled={isProcessing}
                  className="py-2 px-2.5 rounded-lg text-xs font-mono font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors text-center cursor-pointer"
                >
                  Neo Soul (G)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onLoadPreset("acoustic-c");
                    setMobileMenuOpen(false);
                  }}
                  disabled={isProcessing}
                  className="py-2 px-2.5 rounded-lg text-xs font-mono font-medium bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-colors text-center cursor-pointer"
                >
                  Acoustic (C)
                </button>
              </div>
            </div>

            {/* Mobile Engine Status badge */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-950/50 text-[11px] text-slate-400 font-mono">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                Arpegia Engine Active
              </span>
              <span className="text-slate-500">v0.1.0</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
