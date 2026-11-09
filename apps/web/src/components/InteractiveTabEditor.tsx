"use client";

import React, { useState, useMemo } from "react";
import {
  DEFAULT_GUITAR_TUNING,
  TabDifficulty,
  TabNote,
  TabNoteEdit,
  TabTechnique,
  VoiceRole,
} from "../types";
import {
  computeMidiAndNoteName,
  getTechniqueLabel,
  getTechniqueSymbol,
  getVoiceLabel,
  resolveNoteVoice,
} from "../lib/tab-utils";
import { guitarSynth } from "../lib/synth";
import {
  Sliders,
  Volume2,
  Check,
  X,
  ArrowUpDown,
  Sparkles,
  Loader2,
} from "lucide-react";

export interface InteractiveTabEditorProps {
  selectedNote: TabNote | null;
  measureNumber?: number;
  tuning?: string[];
  capo: number;
  difficulty: TabDifficulty;
  isSaving?: boolean;
  onSaveNoteEdit: (
    edit: TabNoteEdit,
    meta?: { capo?: number; difficulty?: TabDifficulty }
  ) => Promise<void> | void;
  onClose: () => void;
}

const TECHNIQUES: TabTechnique[] = [
  "normal",
  "hammer-on",
  "pull-off",
  "slide",
  "bend",
];

const VOICE_ROLES: VoiceRole[] = ["bass", "melody", "harmony", "percussive"];

const STRING_DESCRIPTIONS: Record<number, string> = {
  1: "1st (High E4)",
  2: "2nd (B3)",
  3: "3rd (G3)",
  4: "4th (D3)",
  5: "5th (A2)",
  6: "6th (Low E2)",
};

export function InteractiveTabEditor({
  selectedNote,
  measureNumber,
  tuning = DEFAULT_GUITAR_TUNING,
  capo,
  difficulty,
  isSaving = false,
  onSaveNoteEdit,
  onClose,
}: InteractiveTabEditorProps) {
  const [stringNum, setStringNum] = useState<number>(
    selectedNote?.string ?? 1
  );
  const [fret, setFret] = useState<number>(selectedNote?.fret ?? 0);
  const [technique, setTechnique] = useState<TabTechnique>(
    selectedNote?.technique ?? "normal"
  );
  const [voice, setVoice] = useState<VoiceRole>(
    selectedNote
      ? resolveNoteVoice(selectedNote)
      : "melody"
  );
  const [editCapo, setEditCapo] = useState<number>(capo);
  const [editDifficulty, setEditDifficulty] =
    useState<TabDifficulty>(difficulty);

  const computedPitch = useMemo(() => {
    return computeMidiAndNoteName(stringNum, fret, tuning, editCapo);
  }, [stringNum, fret, tuning, editCapo]);

  if (!selectedNote) return null;

  const handleAuditionPreview = (
    nextStr = stringNum,
    nextFret = fret,
    nextTech = technique,
    nextCapo = editCapo,
    nextVoice = voice
  ) => {
    const { midi } = computeMidiAndNoteName(nextStr, nextFret, tuning, nextCapo);
    guitarSynth.playTabNote(
      {
        string: nextStr,
        fret: nextFret,
        midi,
        duration: selectedNote.duration || 0.65,
        technique: nextTech,
        voice: nextVoice,
      },
      tuning,
      nextCapo
    );
  };

  const handleApplySave = async () => {
    await onSaveNoteEdit(
      {
        id: selectedNote.id,
        string: stringNum,
        fret,
        technique,
        voice,
      },
      {
        capo: editCapo,
        difficulty: editDifficulty,
      }
    );
  };

  return (
    <div
      className="w-full rounded-xl bg-slate-950/90 border border-amber-500/40 p-4 shadow-2xl space-y-4 animate-in fade-in duration-150"
      aria-label="Interactive Tab Note Editor"
    >
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-amber-300">
                Interactive Note Editor
              </h4>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800">
                ID: {selectedNote.id}
                {measureNumber ? ` • Measure #${measureNumber}` : ""}
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-mono">
              Onset: {selectedNote.start_time.toFixed(2)}s • Duration:{" "}
              {selectedNote.duration.toFixed(2)}s • Resulting Pitch:{" "}
              <strong className="text-emerald-400">
                {computedPitch.note_name} (MIDI {computedPitch.midi})
              </strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleAuditionPreview()}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-mono font-semibold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/25 transition-colors cursor-pointer"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Audition Pitch</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close Note Editor"
            className="p-1.5 rounded-lg bg-slate-900 text-slate-400 hover:text-white border border-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Editor Controls Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. String Selection (1 to 6) */}
        <div className="space-y-2 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 font-semibold flex items-center gap-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
              Guitar String (1–6)
            </span>
            <span className="text-amber-400 font-bold">
              String {stringNum}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-1.5">
            {[1, 2, 3, 4, 5, 6].map((s) => {
              const isSelected = stringNum === s;
              const openName = tuning[6 - s] || DEFAULT_GUITAR_TUNING[6 - s];
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setStringNum(s);
                    handleAuditionPreview(s, fret, technique, editCapo);
                  }}
                  title={STRING_DESCRIPTIONS[s]}
                  className={`px-2 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-all cursor-pointer flex items-center justify-between ${
                    isSelected
                      ? "bg-amber-500 text-slate-950 border-amber-300 shadow-md"
                      : "bg-slate-950/80 text-slate-300 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  <span>S{s}</span>
                  <span
                    className={`text-[10px] ${
                      isSelected ? "text-slate-900" : "text-slate-500"
                    }`}
                  >
                    {openName}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. Fret Position (0 to 24) */}
        <div className="space-y-2 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 font-semibold">
              Fret Position (0–24)
            </span>
            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
              Fret {fret} {fret === 0 ? "(Open)" : ""}
            </span>
          </div>

          <input
            type="range"
            min={0}
            max={24}
            step={1}
            value={fret}
            aria-label="Fret Position Slider"
            onChange={(e) => {
              const nextFret = Math.max(
                0,
                Math.min(24, parseInt(e.target.value, 10) || 0)
              );
              setFret(nextFret);
              handleAuditionPreview(stringNum, nextFret, technique, editCapo);
            }}
            className="w-full h-2 bg-slate-800 accent-amber-500 rounded-lg cursor-pointer"
          />

          <div className="flex items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1">
              {[0, 3, 5, 7, 10, 12].map((quickFret) => (
                <button
                  key={quickFret}
                  type="button"
                  onClick={() => {
                    setFret(quickFret);
                    handleAuditionPreview(
                      stringNum,
                      quickFret,
                      technique,
                      editCapo
                    );
                  }}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono border cursor-pointer ${
                    fret === quickFret
                      ? "bg-amber-500 text-slate-950 border-amber-400 font-bold"
                      : "bg-slate-950 text-slate-400 border-slate-800 hover:text-white"
                  }`}
                >
                  {quickFret}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  const next = Math.max(0, fret - 1);
                  setFret(next);
                  handleAuditionPreview(stringNum, next, technique, editCapo);
                }}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono cursor-pointer"
              >
                -1
              </button>
              <input
                type="number"
                min={0}
                max={24}
                value={fret}
                aria-label="Fret Number Input"
                onChange={(e) => {
                  const val = Math.max(
                    0,
                    Math.min(24, parseInt(e.target.value, 10) || 0)
                  );
                  setFret(val);
                }}
                className="w-12 text-center bg-slate-950 border border-slate-700 rounded py-0.5 text-xs font-mono text-amber-300"
              />
              <button
                type="button"
                onClick={() => {
                  const next = Math.min(24, fret + 1);
                  setFret(next);
                  handleAuditionPreview(stringNum, next, technique, editCapo);
                }}
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-mono cursor-pointer"
              >
                +1
              </button>
            </div>
          </div>
        </div>

        {/* 3. Articulation Technique & Tab Metadata */}
        <div className="space-y-2 bg-slate-900/60 border border-slate-800/80 rounded-xl p-3">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-300 font-semibold flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
              Technique
            </span>
            <span className="text-purple-300 font-bold">
              {getTechniqueLabel(technique)}
            </span>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {TECHNIQUES.map((tech) => {
              const isSelected = technique === tech;
              const sym = getTechniqueSymbol(tech);
              return (
                <button
                  key={tech}
                  type="button"
                  onClick={() => {
                    setTechnique(tech);
                    handleAuditionPreview(stringNum, fret, tech, editCapo);
                  }}
                  className={`px-2 py-1 rounded-lg text-[11px] font-mono font-medium border transition-all cursor-pointer ${
                    isSelected
                      ? "bg-purple-500 text-white border-purple-300 shadow-md"
                      : "bg-slate-950/80 text-slate-300 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  {tech}
                  {sym ? ` (${sym})` : ""}
                </button>
              );
            })}
          </div>

          {/* Polyphonic Voice Role Selector */}
          <div className="space-y-1.5 pt-1.5 border-t border-slate-800/80">
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-400">Polyphonic Voice:</span>
              <span className="text-amber-300 font-bold">
                {getVoiceLabel(voice)}
              </span>
            </div>
            <div className="grid grid-cols-4 gap-1">
              {VOICE_ROLES.map((r) => {
                const isSelected = voice === r;
                return (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setVoice(r);
                      handleAuditionPreview(
                        stringNum,
                        fret,
                        technique,
                        editCapo,
                        r
                      );
                    }}
                    className={`px-1.5 py-1 rounded text-[10px] font-mono font-semibold border transition-all cursor-pointer capitalize ${
                      isSelected
                        ? "bg-amber-500 text-slate-950 border-amber-300"
                        : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                    }`}
                  >
                    {r}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Capo & Difficulty quick controls */}
          <div className="grid grid-cols-2 gap-2 pt-1.5 border-t border-slate-800/80 text-[11px] font-mono">
            <label className="flex items-center justify-between gap-1 text-slate-400">
              <span>Capo:</span>
              <select
                value={editCapo}
                onChange={(e) => setEditCapo(parseInt(e.target.value, 10) || 0)}
                className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-slate-200"
              >
                {[0, 1, 2, 3, 4, 5, 6, 7].map((c) => (
                  <option key={c} value={c}>
                    {c === 0 ? "None" : `Fret ${c}`}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-center justify-between gap-1 text-slate-400">
              <span>Tier:</span>
              <select
                value={editDifficulty}
                onChange={(e) =>
                  setEditDifficulty(e.target.value as TabDifficulty)
                }
                className="bg-slate-950 border border-slate-800 rounded px-1.5 py-0.5 text-slate-200"
              >
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* Bottom Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800">
        <div className="text-[11px] font-mono text-slate-400">
           Syncs via{" "}
          <code className="text-amber-300 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
            PUT /api/v1/analyze/&#123;job_id&#125;/tablature
          </code>{" "}
          with optimistic UI &amp; ASCII regeneration
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-mono text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={handleApplySave}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-mono font-bold bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5" />
            )}
            <span>Save Note Edit &amp; Update ASCII Tab</span>
          </button>
        </div>
      </div>
    </div>
  );
}
