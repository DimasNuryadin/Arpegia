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
  Sliders,
} from "lucide-react";

export type TopLevelStudioMode =
  | "tab_reader"
  | "upload_analysis"
  | "stem_splitter"
  | "live_mic";

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
    <header className="sticky top-0 z-50 w-full border-b border-white/[0.08] bg-zinc-950/90 backdrop-blur-md transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        {/* Top Navbar Row */}
        <div className="h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-4">
          {/* Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="relative flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-zinc-900 border border-white/[0.12] shadow-sm flex-shrink-0">
              <Music2 className="w-4 h-4 text-amber-400" />
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 border border-zinc-950 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="text-base sm:text-lg font-bold tracking-tight text-zinc-100 font-mono">
                  ARPEGIA
                </span>
                <span className="hidden xs:inline-block px-1.5 py-0.5 text-[9px] sm:text-[10px] font-mono font-medium uppercase tracking-wider rounded bg-zinc-800 text-zinc-300 border border-white/[0.08]">
                  Studio
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 hidden lg:block font-mono">
                AI Tablature Transcriber • Stem Splitter • Live Tuner
              </p>
            </div>
          </div>

          {/* Desktop Top-Level Mode Switcher (Clean Anti-Slop Segmented Switcher) */}
          <div className="hidden md:flex items-center bg-zinc-900/80 border border-white/[0.08] rounded-lg p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => onSelectMode("tab_reader")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all active:scale-[0.98] cursor-pointer ${
                currentMode === "tab_reader"
                  ? "bg-zinc-800 text-zinc-100 border border-white/[0.08] shadow-sm font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Music2 className="w-3.5 h-3.5 text-amber-400" />
              <span>Tab &amp; Score</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectMode("upload_analysis")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all active:scale-[0.98] cursor-pointer ${
                currentMode === "upload_analysis"
                  ? "bg-zinc-800 text-zinc-100 border border-white/[0.08] shadow-sm font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <FileAudio className="w-3.5 h-3.5 text-amber-400" />
              <span>AI Transcribe</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectMode("stem_splitter")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all active:scale-[0.98] cursor-pointer ${
                currentMode === "stem_splitter"
                  ? "bg-zinc-800 text-zinc-100 border border-white/[0.08] shadow-sm font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-sky-400" />
              <span>Stem Splitter</span>
              <span className="rounded bg-sky-500/15 border border-sky-500/30 px-1 py-0.2 text-[9px] font-mono text-sky-300">
                6s
              </span>
            </button>

            <button
              type="button"
              onClick={() => onSelectMode("live_mic")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all active:scale-[0.98] cursor-pointer ${
                currentMode === "live_mic"
                  ? "bg-zinc-800 text-zinc-100 border border-white/[0.08] shadow-sm font-semibold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Mic className="w-3.5 h-3.5 text-emerald-400" />
              <span>Live Jam &amp; Tuner</span>
            </button>
          </div>

          {/* Center / Right controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5">
            {/* Quick Preset Selector visible on desktop in Studio Analysis Mode */}
            {currentMode === "upload_analysis" && (
              <div className="hidden xl:flex items-center gap-1 bg-zinc-900/80 border border-white/[0.08] rounded-lg p-0.5">
                <span className="text-xs text-zinc-400 px-2 flex items-center gap-1 font-mono">
                  <Sparkles className="w-3 h-3 text-amber-400" /> Demo:
                </span>
                <button
                  onClick={() => onLoadPreset("neo-soul-g")}
                  disabled={isProcessing}
                  className="px-2 py-1 text-xs font-mono rounded text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  Neo Soul
                </button>
                <button
                  onClick={() => onLoadPreset("acoustic-c")}
                  disabled={isProcessing}
                  className="px-2 py-1 text-xs font-mono rounded text-zinc-300 hover:text-white hover:bg-zinc-800 transition-colors disabled:opacity-50 cursor-pointer active:scale-95"
                >
                  Acoustic
                </button>
              </div>
            )}

            {/* Desktop Mock Mode Toggle */}
            <div className="hidden sm:flex items-center gap-2 bg-zinc-900/80 border border-white/[0.08] rounded-lg px-2.5 py-1">
              <div className="flex items-center gap-1.5">
                <Cpu
                  className={`w-3.5 h-3.5 ${
                    mockMode ? "text-amber-400" : "text-emerald-400"
                  }`}
                />
                <span className="text-xs font-mono font-medium text-zinc-300">
                  {mockMode ? "Mock" : "Live API"}
                </span>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={mockMode}
                aria-label="Toggle Mock Engine Mode"
                onClick={() => onToggleMockMode(!mockMode)}
                className={`relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  mockMode ? "bg-amber-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    mockMode ? "translate-x-3" : "translate-x-0"
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
                className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-900/80 hover:bg-zinc-800 border border-white/[0.08] text-xs font-mono text-zinc-300 transition-all active:scale-95 cursor-pointer"
              >
                {theme === "dark" ? (
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                )}
              </button>
            )}

            {/* Mobile Menu Hamburger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-900/80 border border-white/[0.08] text-zinc-300 hover:text-white transition-colors cursor-pointer"
              aria-label="Toggle Navigation Menu"
            >
              {mobileMenuOpen ? (
                <X className="w-4 h-4 text-zinc-200" />
              ) : (
                <Menu className="w-4 h-4 text-zinc-200" />
              )}
            </button>
          </div>
        </div>

        {/* Mobile Sticky Tab Selector Bar (Visible on mobile/tablet) */}
        <div className="md:hidden pb-2 pt-1 border-t border-white/[0.04]">
          <div className="grid grid-cols-4 gap-1 bg-zinc-900/90 border border-white/[0.08] rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => {
                onSelectMode("tab_reader");
                setMobileMenuOpen(false);
              }}
              className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-md text-[11px] font-mono transition-all cursor-pointer text-center ${
                currentMode === "tab_reader"
                  ? "bg-zinc-800 text-zinc-100 border border-white/[0.08] font-bold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Music2 className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">Tabs</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectMode("upload_analysis");
                setMobileMenuOpen(false);
              }}
              className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-md text-[11px] font-mono transition-all cursor-pointer text-center ${
                currentMode === "upload_analysis"
                  ? "bg-zinc-800 text-zinc-100 border border-white/[0.08] font-bold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <FileAudio className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">AI Tab</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectMode("stem_splitter");
                setMobileMenuOpen(false);
              }}
              className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-md text-[11px] font-mono transition-all cursor-pointer text-center ${
                currentMode === "stem_splitter"
                  ? "bg-zinc-800 text-zinc-100 border border-white/[0.08] font-bold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Sliders className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">Stems</span>
            </button>

            <button
              type="button"
              onClick={() => {
                onSelectMode("live_mic");
                setMobileMenuOpen(false);
              }}
              className={`flex items-center justify-center gap-1 py-1.5 px-1 rounded-md text-[11px] font-mono transition-all cursor-pointer text-center ${
                currentMode === "live_mic"
                  ? "bg-zinc-800 text-zinc-100 border border-white/[0.08] font-bold"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Mic className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">Tuner</span>
            </button>
          </div>
        </div>

        {/* Mobile Collapsible Quick Drawer (Presets, Engine Mode, System Status) */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4 pt-2 border-t border-white/[0.08] space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-150">
            {/* Mobile Mock Engine Mode Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-zinc-900/80 border border-white/[0.08] text-xs font-mono">
              <div className="flex items-center gap-2">
                <Cpu
                  className={`w-4 h-4 ${
                    mockMode ? "text-amber-400" : "text-emerald-400"
                  }`}
                />
                <div>
                  <span className="font-semibold text-zinc-200 block">
                    {mockMode ? "Mock Engine Mode" : "Live FastAPI Mode"}
                  </span>
                  <span className="text-[10px] text-zinc-400">
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
                className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  mockMode ? "bg-amber-500" : "bg-zinc-700"
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out ${
                    mockMode ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Mobile Sample Preset Tracks */}
            <div className="p-3 rounded-lg bg-zinc-900/80 border border-white/[0.08] space-y-2 font-mono">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-300">
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
                  className="py-1.5 px-2.5 rounded-md text-xs font-mono font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.08] transition-colors text-center cursor-pointer active:scale-95"
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
                  className="py-1.5 px-2.5 rounded-md text-xs font-mono font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-white/[0.08] transition-colors text-center cursor-pointer active:scale-95"
                >
                  Acoustic (C)
                </button>
              </div>
            </div>

            {/* Mobile Engine Status badge */}
            <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-900/50 text-[11px] text-zinc-400 font-mono">
              <span className="flex items-center gap-1.5">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                Arpegia Engine Active
              </span>
              <span className="text-zinc-500">v0.1.0</span>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
