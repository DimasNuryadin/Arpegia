"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  DEFAULT_GUITAR_TUNING,
  ExportFormat,
  TabDifficulty,
  TabNote,
  TabNoteEdit,
  TablatureData,
  TablatureUpdateRequest,
  VoiceFilterMode,
  VoiceRole,
} from "../types";
import { getTechniqueSymbol, resolveNoteVoice } from "../lib/tab-utils";
import { guitarSynth } from "../lib/synth";
import { InteractiveTabEditor } from "./InteractiveTabEditor";
import { ExportHubBar } from "./ExportHubBar";
import {
  FileText,
  Play,
  Square,
  Edit3,
  Copy,
  Download,
  Check,
  Music2,
  X,
  Gauge,
  Sparkles,
  Filter,
} from "lucide-react";

interface TablatureViewerProps {
  jobId: string;
  filename: string;
  activeTitle?: string;
  activeArrangementId?: string | null;
  tablature: TablatureData;
  currentTime: number;
  isMainPlayerPlaying: boolean;
  onSeekMainPlayer?: (time: number) => void;
  onUpdateTablature: (payload: TablatureUpdateRequest) => Promise<void>;
  onExportFormat?: (format: ExportFormat) => Promise<void>;
}

const STRING_NUMBERS = [1, 2, 3, 4, 5, 6]; // 1 = High E4 (top), 6 = Low E2 (bottom)
const DEFAULT_TOP_DOWN_LABELS = ["E4", "B3", "G3", "D3", "A2", "E2"];

export function TablatureViewer({
  jobId,
  filename,
  activeTitle,
  activeArrangementId = null,
  tablature,
  currentTime,
  isMainPlayerPlaying,
  onSeekMainPlayer,
  onUpdateTablature,
  onExportFormat,
}: TablatureViewerProps) {
  // Interactive Edit & Selection State
  const [editMode, setEditMode] = useState<boolean>(true);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Standalone Web Audio Tab Synth Playback & Polyphonic Voice Filter State
  const [isSynthPlaying, setIsSynthPlaying] = useState<boolean>(false);
  const [synthTime, setSynthTime] = useState<number>(0);
  const [synthSpeed, setSynthSpeed] = useState<number>(1.0);
  const [voiceFilter, setVoiceFilter] = useState<VoiceFilterMode>("all");

  // ASCII Tab Modal / Drawer State
  const [showAsciiModal, setShowAsciiModal] = useState<boolean>(false);
  const [showInlineAscii, setShowInlineAscii] = useState<boolean>(false);
  const [copiedAscii, setCopiedAscii] = useState<boolean>(false);

  const staffScrollRef = useRef<HTMLDivElement | null>(null);

  // Effective playhead time: standalone synth time when synth is playing, otherwise main audio player's currentTime
  const effectiveSynthPlaying = isSynthPlaying && !isMainPlayerPlaying;
  const activeTime = effectiveSynthPlaying ? synthTime : currentTime;

  // Stop standalone synth audio engine if main player starts playing
  useEffect(() => {
    if (isMainPlayerPlaying) {
      guitarSynth.stopTabPlayback();
    }
  }, [isMainPlayerPlaying]);

  // Clean up standalone synth on unmount
  useEffect(() => {
    return () => {
      guitarSynth.stopTabPlayback();
    };
  }, []);

  // Resolve currently selected TabNote and its measure number from tablature.measures
  let selectedNoteInfo: { note: TabNote; measureNumber: number } | null = null;
  if (selectedNoteId) {
    for (const measure of tablature.measures) {
      const found = measure.notes.find((n) => n.id === selectedNoteId);
      if (found) {
        selectedNoteInfo = {
          note: found,
          measureNumber: measure.measure_number,
        };
        break;
      }
    }
  }

  // Resolve top-to-bottom string labels (1 = E4 down to 6 = E2)
  const tuningList =
    tablature.tuning && tablature.tuning.length === 6
      ? tablature.tuning
      : DEFAULT_GUITAR_TUNING;
  const stringLabelsTopDown = STRING_NUMBERS.map(
    (sNum, idx) => tuningList[6 - sNum] || DEFAULT_TOP_DOWN_LABELS[idx]
  );

  const totalNotesCount = tablature.measures.reduce(
    (sum, m) => sum + m.notes.length,
    0
  );

  // Standalone Tab Synth Play / Stop toggle
  const handleToggleTabSynth = () => {
    if (effectiveSynthPlaying) {
      guitarSynth.stopTabPlayback();
      setIsSynthPlaying(false);
      return;
    }

    setIsSynthPlaying(true);
    setSynthTime(0);
    guitarSynth.startTabPlayback(tablature.measures, {
      speed: synthSpeed,
      startTime: 0,
      tuning: tablature.tuning,
      capo: tablature.capo,
      voiceFilter,
      onTimeUpdate: (t) => {
        setSynthTime(t);
      },
      onComplete: () => {
        setIsSynthPlaying(false);
        setSynthTime(0);
      },
    });
  };

  const handleSpeedChange = (nextSpeed: number) => {
    setSynthSpeed(nextSpeed);
    guitarSynth.setTabPlaybackSpeed(nextSpeed);
  };

  const handleVoiceFilterChange = (nextFilter: VoiceFilterMode) => {
    setVoiceFilter(nextFilter);
    guitarSynth.setVoiceFilter(nextFilter);
  };

  // Click handler for any TabNote on the 6-string staff
  const handleNoteClick = (note: TabNote, e: React.MouseEvent) => {
    e.stopPropagation();
    // Always audition the note via Web Audio API synth
    guitarSynth.playTabNote(note, tablature.tuning, tablature.capo);
    setSelectedNoteId(note.id);
    if (!editMode) {
      setEditMode(true);
    }
  };

  // Save edited note via PUT /api/v1/analyze/{job_id}/tablature
  const handleSaveNoteEdit = async (
    edit: TabNoteEdit,
    meta?: { capo?: number; difficulty?: TabDifficulty }
  ) => {
    setIsSavingEdit(true);
    try {
      await onUpdateTablature({
        tuning: tablature.tuning,
        capo: meta?.capo ?? tablature.capo,
        difficulty: meta?.difficulty ?? tablature.difficulty,
        notes: [edit],
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Copy ASCII Tab to clipboard
  const handleCopyAscii = async () => {
    try {
      await navigator.clipboard.writeText(tablature.ascii_tab);
      setCopiedAscii(true);
      setTimeout(() => setCopiedAscii(false), 2000);
    } catch {
      // Fallback textarea copy
      const el = document.createElement("textarea");
      el.value = tablature.ascii_tab;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopiedAscii(true);
      setTimeout(() => setCopiedAscii(false), 2000);
    }
  };

  // Download ASCII Tab as .txt file
  const handleDownloadAsciiTxt = () => {
    const cleanBase = (filename || "arpegia_song")
      .replace(/\.[^/.]+$/, "")
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    const header = [
      `# Arpegia AI Guitar Tablature Export`,
      `# Track: ${filename}`,
      `# Tuning (6->1): ${(tablature.tuning || DEFAULT_GUITAR_TUNING).join(" ")}`,
      `# Capo: ${tablature.capo} | Difficulty: ${tablature.difficulty}`,
      `# Legend: h = hammer-on, p = pull-off, / = slide, b = bend`,
      ``,
      tablature.ascii_tab,
      ``,
    ].join("\n");

    const blob = new Blob([header], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${cleanBase}_tablature.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getTechniqueBadgeStyle = (technique: string) => {
    switch (technique) {
      case "hammer-on":
        return "bg-emerald-500 text-slate-950 border-emerald-300";
      case "pull-off":
        return "bg-sky-400 text-slate-950 border-sky-200";
      case "slide":
        return "bg-purple-400 text-slate-950 border-purple-200";
      case "bend":
        return "bg-rose-400 text-slate-950 border-rose-200";
      default:
        return "";
    }
  };

  const getVoiceNoteCardStyle = (
    voice: VoiceRole,
    isNoteActive: boolean,
    isNoteSelected: boolean,
    isMutedByFilter: boolean
  ) => {
    if (isNoteActive) {
      return "bg-amber-400 text-slate-950 border-white scale-125 shadow-[0_0_16px_rgba(251,191,36,0.9)]";
    }
    if (isNoteSelected) {
      return "bg-indigo-500 text-white border-amber-300 scale-110 shadow-lg shadow-indigo-500/40";
    }
    const dimClass = isMutedByFilter ? "opacity-30" : "";
    switch (voice) {
      case "bass":
        return `bg-amber-950/90 hover:bg-amber-900/90 text-amber-300 border-amber-500/60 hover:border-amber-300 ${dimClass}`;
      case "melody":
        return `bg-sky-950/90 hover:bg-sky-900/90 text-sky-300 border-sky-500/60 hover:border-sky-300 ${dimClass}`;
      case "harmony":
        return `bg-emerald-950/90 hover:bg-emerald-900/90 text-emerald-300 border-emerald-500/60 hover:border-emerald-300 ${dimClass}`;
      case "percussive":
        return `bg-rose-950/90 hover:bg-rose-900/90 text-rose-300 border-rose-500/60 hover:border-rose-300 ${dimClass}`;
    }
  };

  const getVoiceRoleShortTag = (voice: VoiceRole) => {
    switch (voice) {
      case "bass":
        return { tag: "B", color: "text-amber-300 border-amber-500/40 bg-amber-500/15" };
      case "melody":
        return { tag: "M", color: "text-sky-300 border-sky-500/40 bg-sky-500/15" };
      case "harmony":
        return { tag: "H", color: "text-emerald-300 border-emerald-500/40 bg-emerald-500/15" };
      case "percussive":
        return { tag: "P", color: "text-rose-300 border-rose-500/40 bg-rose-500/15" };
    }
  };

  return (
    <div className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md shadow-2xl space-y-5">
      {/* Header & Studio Controls */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Music2 className="w-4 h-4 text-amber-400" />
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-200 font-mono">
              Interactive 6-String Guitar Tablature &amp; Editor
            </h2>
            <span className="px-2 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
              {tablature.difficulty}
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              Tuning: {(tablature.tuning || DEFAULT_GUITAR_TUNING).join(" ")}
            </span>
            <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-slate-800 text-slate-300 border border-slate-700">
              Capo: {tablature.capo || 0}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {tablature.measures.length} measures • {totalNotesCount} transcribed
            notes • Click any note on the 6-string staff to audition &amp; edit
            fret, string, or articulation
          </p>
        </div>

        {/* Right Controls: Standalone Tab Synth Playback + Tempo + Edit Mode + ASCII Modal */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Web Audio Tab Synth Standalone Player */}
          <div className="flex items-center gap-1.5 bg-slate-950/90 border border-slate-800 rounded-xl p-1">
            <button
              type="button"
              onClick={handleToggleTabSynth}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer ${
                effectiveSynthPlaying
                  ? "bg-rose-500 text-white shadow-lg shadow-rose-500/30"
                  : "bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20"
              }`}
            >
              {effectiveSynthPlaying ? (
                <>
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span>Stop Tab Synth</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Play Tab Synth</span>
                </>
              )}
            </button>

            {/* Tempo Speed Selector (0.5x, 0.75x, 1.0x) */}
            <div className="flex items-center gap-1 px-2 text-xs font-mono text-slate-400 border-r border-slate-800">
              <Gauge className="w-3.5 h-3.5 text-amber-400" />
              <select
                aria-label="Tab Synth Tempo Speed"
                value={synthSpeed}
                onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
                className="bg-transparent text-slate-200 font-mono text-xs focus:outline-none cursor-pointer"
              >
                <option value="0.5" className="bg-slate-900">
                  0.5x Slow
                </option>
                <option value="0.75" className="bg-slate-900">
                  0.75x Practice
                </option>
                <option value="1" className="bg-slate-900">
                  1.0x Normal
                </option>
                <option value="1.25" className="bg-slate-900">
                  1.25x Fast
                </option>
              </select>
            </div>

            {/* Polyphonic Voice Filter / Practice Mute Selector */}
            <div className="flex items-center gap-1 px-2 text-xs font-mono text-slate-400">
              <Filter className="w-3.5 h-3.5 text-sky-400" />
              <select
                aria-label="Tab Synth Voice Filter"
                value={voiceFilter}
                onChange={(e) =>
                  handleVoiceFilterChange(e.target.value as VoiceFilterMode)
                }
                className="bg-transparent text-slate-200 font-mono text-xs focus:outline-none cursor-pointer"
              >
                <option value="all" className="bg-slate-900">
                  All Voices
                </option>
                <option value="bass" className="bg-slate-900">
                  Bass Only (Thumb)
                </option>
                <option value="melody" className="bg-slate-900">
                  Melody Only (Lead)
                </option>
                <option value="harmony" className="bg-slate-900">
                  Harmony Only (Inner)
                </option>
                <option value="percussive" className="bg-slate-900">
                  Percussive Only
                </option>
              </select>
            </div>
          </div>

          {/* Interactive Edit Mode Toggle */}
          <button
            type="button"
            onClick={() => setEditMode(!editMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold border transition-all cursor-pointer ${
              editMode
                ? "bg-amber-500/15 text-amber-300 border-amber-500/40"
                : "bg-slate-800/80 text-slate-400 border-slate-700 hover:text-white"
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>{editMode ? "Edit Mode: ON" : "Edit Mode: OFF"}</span>
          </button>

          {/* ASCII Tab Preview & Export Drawer/Modal Button */}
          <button
            type="button"
            onClick={() => setShowAsciiModal(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-mono font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 transition-colors cursor-pointer"
          >
            <FileText className="w-3.5 h-3.5" />
            <span>ASCII Tab / Export .txt</span>
          </button>
        </div>
      </div>

      {/* Polyphonic Voice Legend, Filter Pill Bar & Articulation Status */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] font-mono text-slate-400 bg-slate-950/60 border border-slate-800/80 rounded-xl px-3.5 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-slate-300 font-semibold">
            Polyphonic Voices (Click to Solo):
          </span>
          {(
            [
              {
                mode: "all" as VoiceFilterMode,
                label: "All Voices",
                style: "bg-slate-800 text-slate-200 border-slate-700",
              },
              {
                mode: "bass" as VoiceFilterMode,
                label: "Bass (Thumb S4–6)",
                style: "bg-amber-500/15 text-amber-300 border-amber-500/40",
              },
              {
                mode: "melody" as VoiceFilterMode,
                label: "Melody (Lead S1–3)",
                style: "bg-sky-500/15 text-sky-300 border-sky-500/40",
              },
              {
                mode: "harmony" as VoiceFilterMode,
                label: "Harmony (Inner)",
                style: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
              },
              {
                mode: "percussive" as VoiceFilterMode,
                label: "Percussive",
                style: "bg-rose-500/15 text-rose-300 border-rose-500/40",
              },
            ] as const
          ).map((v) => {
            const active = voiceFilter === v.mode;
            return (
              <button
                key={v.mode}
                type="button"
                onClick={() => handleVoiceFilterChange(v.mode)}
                className={`px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                  active
                    ? `${v.style} ring-1 ring-amber-400 font-bold`
                    : `${v.style} opacity-75 hover:opacity-100`
                }`}
              >
                {v.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="hidden md:inline-flex items-center gap-2 text-[10px]">
            <span>Articulations:</span>
            <span className="px-1 rounded bg-emerald-500/20 text-emerald-300">
              h
            </span>
            <span className="px-1 rounded bg-sky-500/20 text-sky-300">p</span>
            <span className="px-1 rounded bg-purple-500/20 text-purple-300">
              /
            </span>
            <span className="px-1 rounded bg-rose-500/20 text-rose-300">b</span>
          </span>
          <span className="text-amber-400">
            Playhead: <strong>{activeTime.toFixed(2)}s</strong>
          </span>
          <button
            type="button"
            onClick={() => setShowInlineAscii(!showInlineAscii)}
            className="text-indigo-300 hover:underline cursor-pointer"
          >
            {showInlineAscii ? "Hide Inline ASCII" : "Show Inline ASCII"}
          </button>
        </div>
      </div>

      {/* Horizontal Measure-Based 6-String Tablature Staff */}
      <div
        ref={staffScrollRef}
        className="w-full overflow-x-auto rounded-xl border border-slate-800 bg-[#07090e] p-4 select-none"
      >
        <div className="inline-flex min-w-full">
          {/* Sticky Left Column: 6-String Tuning Labels (E4, B3, G3, D3, A2, E2) */}
          <div className="sticky left-0 z-30 flex flex-col justify-between bg-[#07090e]/95 backdrop-blur-sm pr-3 border-r-2 border-stone-300/80 pt-7 pb-3">
            {STRING_NUMBERS.map((stringNum, idx) => (
              <div
                key={stringNum}
                className="h-9 flex items-center justify-end gap-1.5 font-mono text-xs"
              >
                <span className="text-[10px] text-slate-500">S{stringNum}</span>
                <span className="font-bold text-amber-400 w-7 text-right">
                  {stringLabelsTopDown[idx]}
                </span>
              </div>
            ))}
          </div>

          {/* Measures Track */}
          <div className="flex items-stretch">
            {tablature.measures.map((measure) => {
              const measureDuration = Math.max(
                0.5,
                measure.end_time - measure.start_time
              );
              const isMeasureActive =
                activeTime >= measure.start_time &&
                activeTime < measure.end_time;
              const measureProgress = isMeasureActive
                ? Math.max(
                    0,
                    Math.min(
                      1,
                      (activeTime - measure.start_time) / measureDuration
                    )
                  )
                : 0;

              return (
                <div
                  key={measure.measure_number}
                  onClick={() => onSeekMainPlayer?.(measure.start_time)}
                  className={`relative min-w-[270px] sm:min-w-[310px] border-r-2 border-slate-700/80 pt-7 pb-3 px-2 transition-colors ${
                    isMeasureActive
                      ? "bg-amber-500/[0.04]"
                      : "hover:bg-slate-900/30"
                  }`}
                >
                  {/* Measure Header Bar */}
                  <div className="absolute top-1 left-2 right-2 flex items-center justify-between text-[10px] font-mono">
                    <span
                      className={`px-1.5 py-0.5 rounded font-bold ${
                        isMeasureActive
                          ? "bg-amber-500 text-slate-950"
                          : "bg-slate-900 text-slate-400 border border-slate-800"
                      }`}
                    >
                      BAR {measure.measure_number}
                    </span>
                    <span className="text-slate-500">
                      {measure.start_time.toFixed(1)}s –{" "}
                      {measure.end_time.toFixed(1)}s
                    </span>
                  </div>

                  {/* Synchronized Measure Playhead Line */}
                  {isMeasureActive && (
                    <div
                      className="absolute top-6 bottom-2 w-0.5 bg-amber-400 z-20 pointer-events-none shadow-[0_0_12px_rgba(251,191,36,0.95)]"
                      style={{
                        left: `${8 + measureProgress * 88}%`,
                      }}
                    >
                      <div className="w-2.5 h-2.5 -ml-1 -mt-1 rounded-full bg-amber-400" />
                    </div>
                  )}

                  {/* 6 Horizontal Guitar String Lines (E4 at top -> E2 at bottom) */}
                  <div className="relative flex flex-col justify-between">
                    {STRING_NUMBERS.map((stringNum) => {
                      const notesOnString = measure.notes.filter(
                        (n) => n.string === stringNum
                      );

                      return (
                        <div
                          key={stringNum}
                          className="relative h-9 flex items-center"
                        >
                          {/* String Wire Line */}
                          <div
                            className={`w-full ${
                              stringNum >= 4
                                ? "h-[2px] bg-stone-500/60"
                                : "h-[1px] bg-stone-400/50"
                            }`}
                          />

                          {/* Notes on this string within the measure */}
                          {notesOnString.map((note) => {
                            const relPos = Math.max(
                              0.08,
                              Math.min(
                                0.9,
                                (note.start_time - measure.start_time +
                                  note.duration * 0.25) /
                                  measureDuration
                              )
                            );
                            const isNoteActive =
                              activeTime >= note.start_time &&
                              activeTime <
                                note.start_time +
                                  Math.max(0.25, note.duration);
                            const isNoteSelected =
                              selectedNoteId === note.id;
                            const techSym = getTechniqueSymbol(note.technique);
                            const voiceRole = resolveNoteVoice(note);
                            const isMutedByFilter =
                              voiceFilter !== "all" &&
                              voiceRole !== voiceFilter;
                            const voiceBadge = getVoiceRoleShortTag(voiceRole);

                            return (
                              <button
                                key={note.id}
                                type="button"
                                onClick={(e) => handleNoteClick(note, e)}
                                title={`Note ${note.note_name} (MIDI ${note.midi}) • Voice: ${voiceRole} • String ${note.string}, Fret ${note.fret} • Technique: ${note.technique} • Click to edit`}
                                style={{ left: `${relPos * 100}%` }}
                                className={`group absolute -translate-x-1/2 z-20 flex items-center justify-center min-w-[30px] h-7 px-1.5 rounded-lg font-mono text-xs font-extrabold transition-all cursor-pointer border ${getVoiceNoteCardStyle(
                                  voiceRole,
                                  isNoteActive,
                                  isNoteSelected,
                                  isMutedByFilter
                                )}`}
                              >
                                <span>{note.fret}</span>

                                {/* Technique Articulation Badge */}
                                {techSym && (
                                  <span
                                    className={`ml-0.5 px-1 py-0 text-[9px] rounded font-bold border ${getTechniqueBadgeStyle(
                                      note.technique
                                    )}`}
                                  >
                                    {techSym}
                                  </span>
                                )}

                                {/* Polyphonic Voice Role Micro-Indicator (B / M / H / P) */}
                                <span
                                  className={` -top-2 -right-1.5 absolute text-[8px] leading-none px-1 py-0.5 rounded border font-mono font-bold pointer-events-none ${voiceBadge.color}`}
                                >
                                  {voiceBadge.tag}
                                </span>

                                {/* Subtle Note Pitch Name Tag below on hover or selection */}
                                <span
                                  className={`absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-mono px-1 rounded pointer-events-none whitespace-nowrap ${
                                    isNoteSelected || isNoteActive
                                      ? "text-emerald-300 bg-slate-950/90 border border-slate-800"
                                      : "opacity-0 group-hover:opacity-100 text-slate-300 bg-slate-950/90"
                                  }`}
                                >
                                  {note.note_name}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Interactive Note Editor Drawer (Appears when a note is clicked or selected) */}
      {editMode && selectedNoteInfo ? (
        <InteractiveTabEditor
          key={`${selectedNoteInfo.note.id}-${selectedNoteInfo.note.string}-${selectedNoteInfo.note.fret}-${selectedNoteInfo.note.technique}-${tablature.capo}-${tablature.difficulty}`}
          selectedNote={selectedNoteInfo.note}
          measureNumber={selectedNoteInfo.measureNumber}
          tuning={tablature.tuning}
          capo={tablature.capo}
          difficulty={tablature.difficulty}
          isSaving={isSavingEdit}
          onSaveNoteEdit={handleSaveNoteEdit}
          onClose={() => setSelectedNoteId(null)}
        />
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 rounded-xl bg-slate-950/50 border border-slate-800/70 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Interactive Editor Ready: Click any fret badge on the 6-string
              staff above to edit its{" "}
              <strong className="text-slate-200">fret (0–24)</strong>,{" "}
              <strong className="text-slate-200">string (1–6)</strong>, or{" "}
              <strong className="text-slate-200">technique</strong>.
            </span>
          </div>
          {tablature.measures[0]?.notes[0] && (
            <button
              type="button"
              onClick={() => {
                setEditMode(true);
                setSelectedNoteId(tablature.measures[0].notes[0].id);
              }}
              className="text-amber-400 hover:underline font-semibold cursor-pointer"
            >
              Edit First Note →
            </button>
          )}
        </div>
      )}

      {/* Phase 3 Multi-Format Export Hub (MIDI, MusicXML, PDF, ASCII) */}
      {onExportFormat && (
        <ExportHubBar
          jobId={jobId}
          activeArrangementId={activeArrangementId}
          activeTitle={activeTitle || filename}
          onExportFormat={onExportFormat}
        />
      )}

      {/* Optional Inline ASCII Tab Drawer */}
      {showInlineAscii && (
        <div className="rounded-xl bg-slate-950 border border-slate-800 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-mono font-bold uppercase tracking-wider text-indigo-300">
              6-Line ASCII Tablature Preview (Live Synced)
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyAscii}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 cursor-pointer"
              >
                {copiedAscii ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedAscii ? "Copied!" : "Copy ASCII"}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadAsciiTxt}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download .txt</span>
              </button>
            </div>
          </div>
          <pre className="overflow-x-auto p-3 rounded-lg bg-[#05070b] border border-slate-800/90 text-xs font-mono text-emerald-300 leading-relaxed">
            {tablature.ascii_tab}
          </pre>
        </div>
      )}

      {/* ASCII Tab Preview & Download Modal */}
      {showAsciiModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          aria-label="ASCII Tablature Preview and Export Modal"
        >
          <div className="w-full max-w-3xl rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-amber-400" />
                <div>
                  <h3 className="text-sm font-bold font-mono uppercase tracking-wider text-white">
                    ASCII Guitar Tablature Preview &amp; Export
                  </h3>
                  <p className="text-[11px] font-mono text-slate-400">
                    {filename} • Tuning:{" "}
                    {(tablature.tuning || DEFAULT_GUITAR_TUNING).join(" ")} •
                    Capo {tablature.capo}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAsciiModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4">
              <pre className="w-full max-h-80 overflow-auto p-4 rounded-xl bg-[#05070b] border border-slate-800 text-xs sm:text-sm font-mono text-emerald-300 leading-relaxed select-all">
                {tablature.ascii_tab}
              </pre>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <span className="text-xs font-mono text-slate-400">
                  Automatically updates when notes are edited in Interactive
                  Edit Mode.
                </span>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={handleCopyAscii}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-mono font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 cursor-pointer"
                  >
                    {copiedAscii ? (
                      <Check className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                    <span>
                      {copiedAscii ? "Copied to Clipboard!" : "Copy ASCII Tab"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleDownloadAsciiTxt}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-mono font-bold bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 shadow-lg shadow-amber-500/20 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download .txt</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
