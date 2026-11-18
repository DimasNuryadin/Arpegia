"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  FileText,
  Play,
  Pause,
  Square,
  Upload,
  Sparkles,
  Gauge,
  Filter,
  Music2,
  Copy,
  Check,
  Download,
  Eye,
  Settings2,
  FileCode,
  Volume2,
  Layers,
  ChevronDown,
  RotateCcw,
} from "lucide-react";
import {
  DEFAULT_GUITAR_TUNING,
  TabMeasure,
  TabNote,
  TablatureData,
  VoiceFilterMode,
} from "../types";
import { parseAsciiTab, ParsedTabResult } from "../lib/ascii-tab-parser";
import { GUITAR_TAB_PRESETS, TabPreset } from "../lib/tab-presets";
import {
  guitarSynth,
  GUITAR_INSTRUMENTS,
  GuitarInstrumentType,
} from "../lib/synth";
import { GuitarFretboard } from "./GuitarFretboard";
import { getTechniqueSymbol } from "../lib/tab-utils";

export type NotationDisplayMode = "alphatab" | "arpegia_staff";

interface TabReaderStudioProps {
  onSendToArrangement?: (tab: TablatureData, title: string) => void;
}

export function TabReaderStudio({ onSendToArrangement }: TabReaderStudioProps) {
  // Active Preset or Loaded File State
  const [selectedPresetId, setSelectedPresetId] = useState<string>(
    GUITAR_TAB_PRESETS[0].id
  );
  const [currentTitle, setCurrentTitle] = useState<string>(
    GUITAR_TAB_PRESETS[0].title
  );
  const [currentGenre, setCurrentGenre] = useState<string>(
    GUITAR_TAB_PRESETS[0].genre
  );
  const [rawAsciiText, setRawAsciiText] = useState<string>(
    GUITAR_TAB_PRESETS[0].asciiTab
  );
  const [isRawEditorOpen, setIsRawEditorOpen] = useState<boolean>(false);
  const [copiedStatus, setCopiedStatus] = useState<boolean>(false);

  // Playback & Sequencer State
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [voiceFilter, setVoiceFilter] = useState<VoiceFilterMode>("all");
  const [activeNotes, setActiveNotes] = useState<TabNote[]>([]);

  // Guitar Tone / Soundfont State
  const [activeInstrument, setActiveInstrument] = useState<GuitarInstrumentType>(
    guitarSynth.getInstrument()
  );
  const [isSampleLoaded, setIsSampleLoaded] = useState<boolean>(
    guitarSynth.isSampleLoaded()
  );

  // View Display Mode (AlphaTab Pro Score vs Arpegia Interactive Staff)
  const [displayMode, setDisplayMode] =
    useState<NotationDisplayMode>("alphatab");

  // DOM Refs
  const alphaTabContainerRef = useRef<HTMLDivElement | null>(null);
  const alphaTabApiRef = useRef<unknown>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Parse ASCII tab into Arpegia TablatureData and AlphaTex
  const parsedResult: ParsedTabResult = useMemo(() => {
    return parseAsciiTab(rawAsciiText, {
      bpm: GUITAR_TAB_PRESETS.find((p) => p.id === selectedPresetId)?.bpm || 100,
    });
  }, [rawAsciiText, selectedPresetId]);

  const activeTablature = parsedResult.tablature;
  const totalMeasures = activeTablature.measures.length;
  const totalDuration = useMemo(() => {
    if (activeTablature.measures.length === 0) return 4;
    const lastMeasure =
      activeTablature.measures[activeTablature.measures.length - 1];
    return lastMeasure.end_time || 4;
  }, [activeTablature.measures]);

  // Sync Instrument Soundfont status
  useEffect(() => {
    const unsub = guitarSynth.onInstrumentStateChange((inst, ready) => {
      setActiveInstrument(inst);
      setIsSampleLoaded(ready);
    });
    return unsub;
  }, []);

  // Initialize and sync AlphaTab engine
  useEffect(() => {
    if (typeof window === "undefined" || displayMode !== "alphatab") return;

    let isSubscribed = true;
    let apiInstance: unknown = null;

    const initAlphaTab = async () => {
      try {
        const { AlphaTabApi } = await import("@coderline/alphatab");
        if (!isSubscribed || !alphaTabContainerRef.current) return;

        // Cleanup any existing instance
        if (alphaTabApiRef.current) {
          try {
            (alphaTabApiRef.current as { destroy: () => void }).destroy();
          } catch {
            // cleanup ignore
          }
        }

        const api = new AlphaTabApi(alphaTabContainerRef.current, {
          core: {
            engine: "svg",
            fontDirectory: "/alphatab/font/",
          },
          display: {
            layoutMode: 0, // Page layout
            staveProfile: 3, // Score & Tab
          },
          player: {
            enablePlayer: true,
            soundFont: "/alphatab/soundfont/sonivox.sf2",
          },
        });

        apiInstance = api;
        alphaTabApiRef.current = api;

        // Load generated alphaTex safely
        if (parsedResult.alphaTex) {
          try {
            api.tex(parsedResult.alphaTex);
          } catch (texErr) {
            console.warn("AlphaTex render notice:", texErr);
          }
        }

        // Listen for AlphaTab playback position change
        api.playerPositionChanged.on((args: { currentTime: number }) => {
          if (!isSubscribed) return;
          setCurrentTime(args.currentTime / 1000);
        });

        api.playerStateChanged.on((args: { state: number }) => {
          if (!isSubscribed) return;
          // state 1 = playing, 0 = paused/stopped
          setIsPlaying(args.state === 1);
        });
      } catch (err) {
        console.warn("AlphaTab dynamic import notice:", err);
      }
    };

    initAlphaTab();

    return () => {
      isSubscribed = false;
      if (apiInstance) {
        try {
          (apiInstance as { destroy: () => void }).destroy();
        } catch {
          // ignore
        }
      }
    };
  }, [displayMode, parsedResult.alphaTex]);

  // Handle Play/Stop toggle for standalone Arpegia synth
  const handleTogglePlayback = useCallback(() => {
    if (isPlaying) {
      // Stop
      guitarSynth.stopTabPlayback();
      if (alphaTabApiRef.current) {
        try {
          (alphaTabApiRef.current as { stop: () => void }).stop();
        } catch {
          // ignore
        }
      }
      setIsPlaying(false);
      setActiveNotes([]);
    } else {
      // Play
      setIsPlaying(true);

      // If in AlphaTab mode with built-in player
      if (
        displayMode === "alphatab" &&
        alphaTabApiRef.current &&
        typeof (alphaTabApiRef.current as { play: () => void }).play ===
          "function"
      ) {
        try {
          (alphaTabApiRef.current as { play: () => void }).play();
          return;
        } catch {
          // fallback to Arpegia guitarSynth
        }
      }

      // Play via Arpegia guitarSynth
      guitarSynth.startTabPlayback(activeTablature.measures, {
        speed: playbackSpeed,
        startTime: currentTime,
        voiceFilter,
        onTimeUpdate: (time) => {
          setCurrentTime(time);
        },
        onNoteTrigger: (note) => {
          setActiveNotes([note]);
          setTimeout(() => {
            setActiveNotes([]);
          }, 350);
        },
        onComplete: () => {
          setIsPlaying(false);
          setCurrentTime(0);
          setActiveNotes([]);
        },
      });
    }
  }, [
    isPlaying,
    displayMode,
    activeTablature.measures,
    playbackSpeed,
    currentTime,
    voiceFilter,
  ]);

  // Handle Speed Change
  const handleSpeedChange = (nextSpeed: number) => {
    setPlaybackSpeed(nextSpeed);
    guitarSynth.setTabPlaybackSpeed(nextSpeed);
    if (alphaTabApiRef.current) {
      try {
        (alphaTabApiRef.current as { playbackSpeed: number }).playbackSpeed =
          nextSpeed;
      } catch {
        // ignore
      }
    }
  };

  // Handle Preset Select
  const handleSelectPreset = (preset: TabPreset) => {
    guitarSynth.stopTabPlayback();
    setIsPlaying(false);
    setCurrentTime(0);
    setSelectedPresetId(preset.id);
    setCurrentTitle(preset.title);
    setCurrentGenre(preset.genre);
    setRawAsciiText(preset.asciiTab);
  };

  // Handle User File Upload (.gp, .gp5, .gpx, .xml, .txt, .tab)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    guitarSynth.stopTabPlayback();
    setIsPlaying(false);
    setCurrentTime(0);

    const ext = file.name.split(".").pop()?.toLowerCase();
    setCurrentTitle(file.name.replace(/\.[^/.]+$/, ""));
    setCurrentGenre(ext === "gp" || ext === "gp5" || ext === "gpx" ? "Guitar Pro File" : "Imported Tab");

    if (ext === "txt" || ext === "tab") {
      // Plain text ASCII tab
      const text = await file.text();
      setRawAsciiText(text);
      setSelectedPresetId("custom_upload");
    } else if (
      (ext === "gp" || ext === "gp5" || ext === "gpx" || ext === "xml" || ext === "musicxml") &&
      alphaTabApiRef.current
    ) {
      // Binary Guitar Pro / MusicXML file loaded directly into AlphaTab
      const buffer = await file.arrayBuffer();
      try {
        (alphaTabApiRef.current as { load: (data: ArrayBuffer) => void }).load(
          buffer
        );
        setSelectedPresetId("custom_upload");
      } catch (err) {
        console.error("Failed to load binary GP file into AlphaTab:", err);
      }
    }
    // reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Format time (seconds -> mm:ss)
  const formatTime = (seconds: number) => {
    const s = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}`;
  };

  return (
    <div className="rounded-2xl border border-white/[0.08] bg-zinc-950/80 p-4 sm:p-6 shadow-xl backdrop-blur-md">
      {/* Studio Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-white/[0.08]">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-md bg-amber-500/15 px-2 py-0.5 text-xs font-mono font-medium text-amber-300 border border-amber-500/30">
              <Sparkles className="w-3 h-3 text-amber-400" />
              Tab Reader &amp; Playback Engine
            </span>
            <span className="text-zinc-600">•</span>
            <span className="text-xs font-mono text-zinc-400">{currentGenre}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-100 mt-1 flex items-center gap-2">
            <span>{currentTitle}</span>
          </h2>
          <p className="text-xs text-zinc-400 mt-0.5 font-mono">
            {totalMeasures} measures • {parsedResult.totalNotes} transcribed
            notes • Supports Guitar Pro (.gp, .gp5, .gpx) &amp; ASCII (.txt)
          </p>
        </div>

        {/* Header Right Actions: Upload & Paste Tab */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".gp,.gp3,.gp4,.gp5,.gpx,.xml,.musicxml,.txt,.tab"
            onChange={handleFileUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-100 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 shadow-sm transition hover:bg-white active:scale-[0.98] cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import .gp / .txt</span>
          </button>

          <button
            type="button"
            onClick={() => setIsRawEditorOpen(!isRawEditorOpen)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-mono font-medium transition active:scale-[0.98] cursor-pointer ${
              isRawEditorOpen
                ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                : "border-white/[0.08] bg-zinc-900/80 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>{isRawEditorOpen ? "Hide ASCII Box" : "Paste Raw Tab"}</span>
          </button>

          {onSendToArrangement && (
            <button
              type="button"
              onClick={() => onSendToArrangement(activeTablature, currentTitle)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/15 px-3 py-1.5 text-xs font-mono font-medium text-purple-300 hover:bg-purple-500/25 transition active:scale-[0.98] cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Send to Arrangement</span>
            </button>
          )}
        </div>
      </div>

      {/* Preset Selector Pill Bar */}
      <div className="flex items-center gap-2 py-3 overflow-x-auto no-scrollbar touch-pan-x border-b border-white/[0.05]">
        <span className="text-xs font-mono text-zinc-500 flex-shrink-0 flex items-center gap-1">
          <Music2 className="w-3 h-3" /> Presets:
        </span>
        {GUITAR_TAB_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            onClick={() => handleSelectPreset(preset)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-mono transition-all flex-shrink-0 cursor-pointer active:scale-[0.98] ${
              selectedPresetId === preset.id
                ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold"
                : "bg-zinc-900/60 text-zinc-400 border border-white/[0.06] hover:bg-zinc-800 hover:text-zinc-200"
            }`}
          >
            <span>{preset.title}</span>
            <span className="text-[10px] opacity-70">({preset.genre.split("/")[0]})</span>
          </button>
        ))}
      </div>

      {/* Optional Collapsible Raw ASCII Tab Paste Box */}
      {isRawEditorOpen && (
        <div className="mt-4 p-4 rounded-xl border border-white/[0.08] bg-zinc-900/70 animate-in fade-in duration-200">
          <div className="flex items-center justify-between pb-2">
            <span className="text-xs font-mono text-zinc-300 font-semibold">
              Paste or Edit Raw 6-String ASCII Tab:
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(rawAsciiText);
                setCopiedStatus(true);
                setTimeout(() => setCopiedStatus(false), 1500);
              }}
              className="inline-flex items-center gap-1 text-xs font-mono text-zinc-400 hover:text-zinc-200"
            >
              {copiedStatus ? (
                <Check className="w-3 h-3 text-emerald-400" />
              ) : (
                <Copy className="w-3 h-3" />
              )}
              <span>{copiedStatus ? "Copied!" : "Copy"}</span>
            </button>
          </div>
          <textarea
            value={rawAsciiText}
            onChange={(e) => setRawAsciiText(e.target.value)}
            rows={8}
            className="w-full rounded-lg border border-white/[0.08] bg-zinc-950 p-3 font-mono text-xs text-zinc-200 focus:border-amber-400 focus:outline-none"
            placeholder="e|---0-2-3---&#10;B|---1-------&#10;G|---0-------&#10;D|---2-------&#10;A|---3-------&#10;E|-----------"
          />
        </div>
      )}

      {/* Studio Playback Transport Control Bar */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-zinc-900/70 p-3">
        {/* Left: Play/Pause Button & Scrubber Display */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTogglePlayback}
            className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-xs font-mono font-bold transition-all shadow-md active:scale-[0.98] cursor-pointer ${
              isPlaying
                ? "bg-rose-500 text-white shadow-rose-500/25 hover:bg-rose-600"
                : "bg-emerald-500 text-zinc-950 shadow-emerald-500/20 hover:bg-emerald-400"
            }`}
          >
            {isPlaying ? (
              <>
                <Square className="w-3.5 h-3.5 fill-current" />
                <span>Stop</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Play Tab</span>
              </>
            )}
          </button>

          {/* Time Counter */}
          <div className="text-xs font-mono text-zinc-300 bg-zinc-950/80 px-2.5 py-1.5 rounded-lg border border-white/[0.08]">
            <span className="text-emerald-400 font-bold">{formatTime(currentTime)}</span>
            <span className="text-zinc-600 mx-1">/</span>
            <span className="text-zinc-500">{formatTime(totalDuration)}</span>
          </div>
        </div>

        {/* Center: Tempo Speed & Guitar Instrument Tone Selectors */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tempo Speed */}
          <div className="flex items-center gap-1.5 rounded-lg bg-zinc-950/80 px-2.5 py-1.5 border border-white/[0.08] text-xs font-mono text-zinc-400">
            <Gauge className="w-3.5 h-3.5 text-amber-400" />
            <select
              aria-label="Playback Tempo Speed"
              value={playbackSpeed}
              onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
              className="bg-transparent text-zinc-200 font-mono text-xs focus:outline-none cursor-pointer"
            >
              <option value="0.5" className="bg-zinc-900">0.5x Slow</option>
              <option value="0.75" className="bg-zinc-900">0.75x Practice</option>
              <option value="1" className="bg-zinc-900">1.0x Normal</option>
              <option value="1.25" className="bg-zinc-900">1.25x Fast</option>
            </select>
          </div>

          {/* Guitar Tone Soundfont Selector */}
          <div className="flex items-center gap-1.5 rounded-lg bg-zinc-950/80 px-2.5 py-1.5 border border-white/[0.08] text-xs font-mono text-zinc-400">
            <span className="text-sm">🎸</span>
            <select
              aria-label="Guitar Tone Soundfont"
              value={activeInstrument}
              onChange={(e) => {
                const next = e.target.value as GuitarInstrumentType;
                setActiveInstrument(next);
                guitarSynth.setInstrument(next);
              }}
              className="bg-transparent text-zinc-200 font-mono text-xs focus:outline-none cursor-pointer max-w-[140px] truncate"
            >
              {GUITAR_INSTRUMENTS.map((inst) => (
                <option key={inst.id} value={inst.id} className="bg-zinc-900 text-zinc-200">
                  {inst.icon} {inst.name}
                </option>
              ))}
            </select>
            {/* Living Soundfont Indicator */}
            <span
              title={
                isSampleLoaded
                  ? "Studio Multi-Sample Soundfont Active"
                  : "Physical Modeling Synthesis Active"
              }
              className="relative flex h-2 w-2 flex-shrink-0 cursor-help"
            >
              {isSampleLoaded && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2 w-2 ${
                  isSampleLoaded ? "bg-emerald-500" : "bg-amber-400"
                }`}
              />
            </span>
          </div>
        </div>

        {/* Right: Notation View Mode Switcher */}
        <div className="flex items-center gap-1 rounded-lg bg-zinc-950/80 p-1 border border-white/[0.08]">
          <button
            type="button"
            onClick={() => setDisplayMode("alphatab")}
            className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition cursor-pointer ${
              displayMode === "alphatab"
                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Pro Score (AlphaTab)
          </button>
          <button
            type="button"
            onClick={() => setDisplayMode("arpegia_staff")}
            className={`px-2.5 py-1 rounded-md text-xs font-mono font-medium transition cursor-pointer ${
              displayMode === "arpegia_staff"
                ? "bg-zinc-800 text-zinc-100 shadow-sm"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Interactive Staff
          </button>
        </div>
      </div>

      {/* Main Notation Rendering Container */}
      <div className="mt-5 rounded-xl border border-white/[0.08] bg-zinc-950/60 p-4 min-h-[300px]">
        {displayMode === "alphatab" ? (
          <div className="relative">
            <div
              ref={alphaTabContainerRef}
              className="w-full overflow-x-auto text-zinc-100 rounded-lg"
            />
          </div>
        ) : (
          /* Mode B: Arpegia Interactive 6-String Staff View */
          <div className="space-y-4">
            <div className="overflow-x-auto no-scrollbar pb-2">
              <div className="flex gap-4 min-w-[700px]">
                {activeTablature.measures.map((measure) => (
                  <div
                    key={measure.measure_number}
                    className="flex-1 rounded-lg border border-white/[0.06] bg-zinc-900/40 p-3"
                  >
                    <div className="flex items-center justify-between text-xs font-mono text-zinc-400 border-b border-white/[0.06] pb-1.5 mb-2">
                      <span className="font-semibold text-zinc-300">
                        Bar #{measure.measure_number}
                      </span>
                      <span>{parsedResult.timeSignature}</span>
                    </div>

                    {/* 6-String Staff Visualizer */}
                    <div className="relative py-2 space-y-3 font-mono text-xs">
                      {[1, 2, 3, 4, 5, 6].map((strNum) => {
                        const noteOnString = measure.notes.find(
                          (n) => n.string === strNum
                        );
                        return (
                          <div
                            key={strNum}
                            className="relative flex items-center h-4 border-b border-zinc-700/60 group"
                          >
                            <span className="text-[10px] text-zinc-500 w-4">
                              {["e", "B", "G", "D", "A", "E"][strNum - 1]}
                            </span>
                            {noteOnString && (
                              <button
                                type="button"
                                onClick={() =>
                                  guitarSynth.playTabNote(
                                    noteOnString,
                                    activeTablature.tuning,
                                    activeTablature.capo
                                  )
                                }
                                className={`ml-6 flex items-center justify-center h-5 w-5 rounded-full text-[11px] font-bold shadow-md cursor-pointer transition-transform active:scale-95 ${
                                  noteOnString.voice === "bass"
                                    ? "bg-amber-400 text-zinc-950"
                                    : noteOnString.voice === "melody"
                                    ? "bg-sky-400 text-zinc-950"
                                    : "bg-emerald-400 text-zinc-950"
                                }`}
                                title={`Click to play: String ${strNum}, Fret ${noteOnString.fret} (${noteOnString.voice})`}
                              >
                                {noteOnString.fret}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Live Synchronized 12-Fret Guitar Fretboard Neck */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-mono font-semibold text-zinc-300 flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Synchronized 12-Fret Guitar Fretboard
          </span>
          <span className="text-[11px] font-mono text-zinc-500">
            Notes light up on the neck as the tab plays
          </span>
        </div>
        <GuitarFretboard
          chordName={
            activeNotes.length > 0
              ? `Note: ${activeNotes[0].fret}f S${activeNotes[0].string}`
              : currentTitle
          }
        />
      </div>
    </div>
  );
}
