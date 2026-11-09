"use client";

import React from "react";
import { Sparkles, Radio, Music2, Cpu, Sun, Moon } from "lucide-react";

interface NavbarProps {
  mockMode: boolean;
  onToggleMockMode: (val: boolean) => void;
  onLoadPreset: (presetKey: string) => void;
  isProcessing: boolean;
  theme?: "dark" | "light";
  onToggleTheme?: () => void;
}

export function Navbar({
  mockMode,
  onToggleMockMode,
  onLoadPreset,
  isProcessing,
  theme = "dark",
  onToggleTheme,
}: NavbarProps) {
  return (
    <header className="sticky top-0 z-50 w-full border-b border-slate-800/80 bg-[#090b10]/90 backdrop-blur-md transition-colors">
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
                Phase 3 AI Music Intelligence
              </span>
            </div>
            <p className="text-xs text-slate-400 hidden sm:block">
              Arrangement Studio • Polyphonic Voices • Multi-Format Export Hub
            </p>
          </div>
        </div>

        {/* Center / Right controls */}
        <div className="flex items-center gap-2.5">
          {/* Quick Preset Selector */}
          <div className="hidden md:flex items-center gap-1.5 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
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
            <button
              onClick={() => onLoadPreset("jazz-ii-v-i")}
              disabled={isProcessing}
              className="px-2.5 py-1 text-xs font-medium rounded-md text-slate-300 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50 cursor-pointer"
            >
              Jazz Standard
            </button>
          </div>

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
                  <span className="hidden lg:inline">Light</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="hidden lg:inline">Dark</span>
                </>
              )}
            </button>
          )}

          {/* Engine Status indicator */}
          <div className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-900/60 border border-slate-800/80 text-[11px] text-slate-400">
            <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>Studio Ready</span>
          </div>
        </div>
      </div>
    </header>
  );
}
