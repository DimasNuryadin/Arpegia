"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import {
  TuningPreset,
  TuningPresetId,
  TunerPitchResult,
  TuningStringTarget,
} from "../types";
import {
  CANONICAL_TUNING_PRESETS,
  detectPitchAutocorrelation,
  evaluatePitch,
  playReferenceTone,
} from "../lib/tuner-dsp";
import { LiveMicManager } from "../lib/live-mic";
import { api } from "../lib/api";
import {
  Volume2,
  Mic,
  MicOff,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Sliders,
  Sparkles,
} from "lucide-react";

interface GuitarTunerProps {
  micManager: LiveMicManager;
  isMicActive: boolean;
  onToggleMic: () => void;
  simulatedPitch?: { freq: number; label: string; seq: number } | null;
}

export function GuitarTuner({
  micManager,
  isMicActive,
  onToggleMic,
  simulatedPitch,
}: GuitarTunerProps) {
  // Tuning Presets (fetched from GET /api/v1/tuner/presets with canonical fallback)
  const [presets, setPresets] = useState<TuningPreset[]>(CANONICAL_TUNING_PRESETS);
  const [activePresetId, setActivePresetId] = useState<TuningPresetId>("standard");
  const [autoDetectString, setAutoDetectString] = useState<boolean>(true);
  const [lockedStringNumber, setLockedStringNumber] = useState<number | null>(null);

  // Pitch evaluation result state
  const [pitchResult, setPitchResult] = useState<TunerPitchResult | null>(null);
  const [smoothedCents, setSmoothedCents] = useState<number>(0);
  const [isSilent, setIsSilent] = useState<boolean>(true);
  const [activePluckingString, setActivePluckingString] = useState<number | null>(null);

  // Animation frame reference
  const rafRef = useRef<number | null>(null);
  const smoothedCentsRef = useRef<number>(0);
  const silenceCounterRef = useRef<number>(0);

  // Active preset resolution
  const activePreset = useMemo(() => {
    return presets.find((p) => p.id === activePresetId) || presets[0] || CANONICAL_TUNING_PRESETS[0];
  }, [presets, activePresetId]);

  // Fetch presets on mount
  useEffect(() => {
    let isMounted = true;
    api.getTuningPresets(440.0).then((data) => {
      if (isMounted && data && data.length > 0) {
        setPresets(data);
      }
    });
    return () => {
      isMounted = false;
    };
  }, []);

  // Handle external simulated pitch (from demo simulator)
  useEffect(() => {
    if (!simulatedPitch || simulatedPitch.freq <= 0) return;

    const targetStr = autoDetectString ? null : lockedStringNumber;
    const result = evaluatePitch(simulatedPitch.freq, activePreset, targetStr, 0.98);

    setPitchResult(result);
    setIsSilent(false);
    smoothedCentsRef.current = result.cents_deviation;
    setSmoothedCents(result.cents_deviation);
    silenceCounterRef.current = 0;
  }, [simulatedPitch, activePreset, autoDetectString, lockedStringNumber]);

  // 60fps Web Audio Autocorrelation Pitch Detection Loop
  useEffect(() => {
    if (!isMicActive) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const processAudioFrame = () => {
      const buffer = micManager.getTimeDomainData();
      const sampleRate = micManager.getSampleRate();

      if (buffer && sampleRate > 0) {
        const { frequency, confidence, rms } = detectPitchAutocorrelation(
          buffer,
          sampleRate
        );

        if (rms < 0.008 || confidence < 0.45 || frequency < 50 || frequency > 600) {
          silenceCounterRef.current++;
          if (silenceCounterRef.current > 30) {
            // Decay to silence after ~0.5s of no signal
            setIsSilent(true);
            smoothedCentsRef.current = smoothedCentsRef.current * 0.9;
            setSmoothedCents(smoothedCentsRef.current);
          }
        } else {
          silenceCounterRef.current = 0;
          setIsSilent(false);

          const targetStr = autoDetectString ? null : lockedStringNumber;
          const result = evaluatePitch(frequency, activePreset, targetStr, confidence);
          setPitchResult(result);

          // Exponential Moving Average (EMA) smoothing for silky 60fps needle motion
          const alpha = 0.22;
          smoothedCentsRef.current =
            smoothedCentsRef.current * (1 - alpha) + result.cents_deviation * alpha;
          setSmoothedCents(smoothedCentsRef.current);
        }
      }

      rafRef.current = requestAnimationFrame(processAudioFrame);
    };

    rafRef.current = requestAnimationFrame(processAudioFrame);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isMicActive, micManager, activePreset, autoDetectString, lockedStringNumber]);

  // String click handler: locks string AND plays plucked reference audio
  const handleSelectString = useCallback(
    (str: TuningStringTarget) => {
      setLockedStringNumber(str.string);
      setAutoDetectString(false);
      setActivePluckingString(str.string);

      playReferenceTone(str.frequency_hz, 2.2);

      // Re-evaluate current pitch against locked target
      if (pitchResult) {
        const updated = evaluatePitch(
          pitchResult.detected_frequency_hz,
          activePreset,
          str.string,
          pitchResult.confidence
        );
        setPitchResult(updated);
        smoothedCentsRef.current = updated.cents_deviation;
        setSmoothedCents(updated.cents_deviation);
      }

      setTimeout(() => {
        setActivePluckingString(null);
      }, 600);
    },
    [activePreset, pitchResult]
  );

  // Active target string resolution
  const currentTargetString = useMemo(() => {
    if (!autoDetectString && lockedStringNumber) {
      return (
        activePreset.strings.find((s) => s.string === lockedStringNumber) ||
        activePreset.strings[0]
      );
    }
    if (pitchResult) {
      return (
        activePreset.strings.find((s) => s.string === pitchResult.closest_string) ||
        activePreset.strings[0]
      );
    }
    return activePreset.strings[0];
  }, [autoDetectString, lockedStringNumber, pitchResult, activePreset]);

  // Gauge state calculation
  const cents = isSilent ? 0 : smoothedCents;
  const isInTune = !isSilent && Math.abs(cents) <= 3.5;
  const isFlat = !isSilent && cents < -3.5;
  const isSharp = !isSilent && cents > 3.5;

  // Semicircular Gauge SVG Math: -50c to +50c maps from -50 degrees to +50 degrees
  const clampedAngle = Math.max(-50, Math.min(50, cents));
  const needleRotation = clampedAngle; // -50 deg to +50 deg

  return (
    <div className="w-full space-y-6">
      {/* Top Controls: Preset Selector, Auto-Detect Toggle, Mic Toggle */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 backdrop-blur-md shadow-xl flex flex-wrap items-center justify-between gap-4">
        {/* Preset Selector */}
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor="preset-select"
            className="text-xs font-mono uppercase tracking-wider text-slate-400 flex items-center gap-1.5"
          >
            <Sliders className="w-3.5 h-3.5 text-amber-400" />
            <span>Tuning:</span>
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  setActivePresetId(preset.id);
                  setLockedStringNumber(null);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono font-medium transition-all cursor-pointer ${
                  activePresetId === preset.id
                    ? "bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20"
                    : "bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white border border-slate-700/80"
                }`}
              >
                {preset.name.split(" (")[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Auto-Detect String Toggle & Mic Button */}
        <div className="flex items-center gap-3">
          {/* Auto-Detect Toggle */}
          <div className="flex items-center gap-2 bg-slate-800/70 border border-slate-700/80 rounded-xl px-3 py-1.5">
            <span className="text-xs font-mono text-slate-300">Auto-Detect</span>
            <button
              type="button"
              role="switch"
              aria-checked={autoDetectString}
              aria-label="Toggle Auto-Detect String"
              onClick={() => {
                const next = !autoDetectString;
                setAutoDetectString(next);
                if (next) setLockedStringNumber(null);
              }}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                autoDetectString ? "bg-emerald-500" : "bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  autoDetectString ? "translate-x-4" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {/* Microphone On/Off Toggle */}
          <button
            type="button"
            onClick={onToggleMic}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-mono font-semibold transition-all cursor-pointer ${
              isMicActive
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/25"
                : "bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20"
            }`}
          >
            {isMicActive ? (
              <>
                <Mic className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span>Mic Active</span>
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

      {/* Main Tuner Hero: Visual Cents Gauge / Strobe Meter */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl relative overflow-hidden text-center">
        {/* Subtle Ambient Backlight Glow depending on tuning status */}
        <div
          className={`absolute -top-32 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full blur-3xl opacity-20 pointer-events-none transition-colors duration-300 ${
            isInTune
              ? "bg-emerald-500 opacity-30"
              : isFlat
              ? "bg-amber-500 opacity-20"
              : isSharp
              ? "bg-rose-500 opacity-20"
              : "bg-slate-500 opacity-10"
          }`}
        />

        {/* In-Tune Visual Lock Banner */}
        <div className="h-8 flex items-center justify-center">
          {isInTune ? (
            <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-mono font-bold animate-pulse shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>PERFECTLY IN TUNE! (±3.5 cents)</span>
            </div>
          ) : isFlat ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-mono">
              <ArrowLeft className="w-3.5 h-3.5 animate-bounce" />
              <span>FLAT — TIGHTEN STRING</span>
            </div>
          ) : isSharp ? (
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-mono">
              <span>SHARP — LOOSEN STRING</span>
              <ArrowRight className="w-3.5 h-3.5 animate-bounce" />
            </div>
          ) : (
            <span className="text-xs font-mono text-slate-500">
              {isMicActive
                ? "Pluck a guitar string to tune..."
                : "Microphone paused. Click 'Turn On Mic' or use Demo Simulator below"}
            </span>
          )}
        </div>

        {/* Giant Note Display */}
        <div className="py-2">
          <div className="flex items-center justify-center gap-3">
            <span
              className={`text-6xl sm:text-7xl font-black font-mono tracking-tight transition-colors duration-150 ${
                isInTune
                  ? "text-emerald-400 drop-shadow-[0_0_25px_rgba(16,185,129,0.5)]"
                  : isFlat
                  ? "text-amber-400"
                  : isSharp
                  ? "text-rose-400"
                  : "text-slate-400"
              }`}
            >
              {isSilent
                ? currentTargetString.note
                : pitchResult?.detected_note || currentTargetString.note}
            </span>
          </div>

          <div className="flex items-center justify-center gap-3 text-xs font-mono text-slate-400 mt-1">
            <span>
              Target: <strong className="text-white">{currentTargetString.note}</strong> (
              {currentTargetString.frequency_hz.toFixed(2)} Hz)
            </span>
            <span>•</span>
            <span>
              Detected:{" "}
              <strong className="text-white">
                {isSilent
                  ? "--"
                  : `${pitchResult?.detected_frequency_hz.toFixed(2)} Hz`}
              </strong>
            </span>
          </div>
        </div>

        {/* Large Precision Semicircular SVG Meter */}
        <div className="relative w-full max-w-md mx-auto my-2">
          <svg
            viewBox="0 0 320 180"
            className="w-full h-auto overflow-visible select-none"
          >
            <defs>
              {/* Radial gradient for the meter glow */}
              <linearGradient id="meterGlow" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#f59e0b" />
                <stop offset="45%" stopColor="#10b981" />
                <stop offset="55%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#f43f5e" />
              </linearGradient>
            </defs>

            {/* Background Arc: 180 degree gauge from radius 120 */}
            <path
              d="M 40 150 A 120 120 0 0 1 280 150"
              fill="none"
              stroke="#1e293b"
              strokeWidth="14"
              strokeLinecap="round"
            />

            {/* Flat Zone (Left): Amber */}
            <path
              d="M 40 150 A 120 120 0 0 1 150 31"
              fill="none"
              stroke="#f59e0b"
              strokeWidth="6"
              strokeOpacity="0.4"
            />

            {/* Center Deadband (±3.5c): Emerald Green Target */}
            <path
              d="M 152 30 A 120 120 0 0 1 168 30"
              fill="none"
              stroke="#10b981"
              strokeWidth="12"
              strokeLinecap="round"
              className={isInTune ? "animate-pulse" : ""}
            />

            {/* Sharp Zone (Right): Rose */}
            <path
              d="M 170 31 A 120 120 0 0 1 280 150"
              fill="none"
              stroke="#f43f5e"
              strokeWidth="6"
              strokeOpacity="0.4"
            />

            {/* Calibration Tick Marks */}
            {[-50, -35, -20, -10, 0, 10, 20, 35, 50].map((tick) => {
              const angleRad = ((tick - 0) * (Math.PI / 180)) * 0.9 - Math.PI / 2;
              const innerR = 104;
              const outerR = tick === 0 ? 134 : 124;
              const x1 = 160 + innerR * Math.cos(angleRad);
              const y1 = 150 + innerR * Math.sin(angleRad);
              const x2 = 160 + outerR * Math.cos(angleRad);
              const y2 = 150 + outerR * Math.sin(angleRad);
              const isCenter = tick === 0;

              return (
                <line
                  key={tick}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={
                    isCenter
                      ? "#10b981"
                      : tick < 0
                      ? "#f59e0b"
                      : "#f43f5e"
                  }
                  strokeWidth={isCenter ? 3.5 : 1.8}
                  strokeOpacity={isCenter ? 1.0 : 0.6}
                />
              );
            })}

            {/* Gauge Needle */}
            <g
              transform={`rotate(${needleRotation}, 160, 150)`}
              className="transition-transform duration-75 ease-out"
            >
              {/* Needle Body */}
              <line
                x1="160"
                y1="150"
                x2="160"
                y2="24"
                stroke={
                  isInTune
                    ? "#10b981"
                    : isFlat
                    ? "#f59e0b"
                    : isSharp
                    ? "#f43f5e"
                    : "#64748b"
                }
                strokeWidth={isInTune ? "4.5" : "3.5"}
                strokeLinecap="round"
              />
              {/* Needle Tip Arrow */}
              <circle
                cx="160"
                cy="24"
                r={isInTune ? "6" : "4.5"}
                fill={
                  isInTune
                    ? "#10b981"
                    : isFlat
                    ? "#f59e0b"
                    : isSharp
                    ? "#f43f5e"
                    : "#64748b"
                }
                className={isInTune ? "animate-ping" : ""}
              />
              {/* Needle Pivot Center Hub */}
              <circle cx="160" cy="150" r="10" fill="#0f172a" stroke="#475569" strokeWidth="3" />
            </g>

            {/* Labels -50c, 0, +50c */}
            <text x="32" y="172" fill="#f59e0b" fontSize="11" fontFamily="monospace" textAnchor="middle">
              -50c
            </text>
            <text x="160" y="172" fill="#10b981" fontSize="12" fontWeight="bold" fontFamily="monospace" textAnchor="middle">
              0c (IN TUNE)
            </text>
            <text x="288" y="172" fill="#f43f5e" fontSize="11" fontFamily="monospace" textAnchor="middle">
              +50c
            </text>
          </svg>
        </div>

        {/* Precision Numeric Cents Readout */}
        <div className="flex items-center justify-center gap-2 mt-2">
          <span
            className={`text-2xl font-black font-mono ${
              isInTune
                ? "text-emerald-400"
                : isFlat
                ? "text-amber-400"
                : isSharp
                ? "text-rose-400"
                : "text-slate-500"
            }`}
          >
            {isSilent
              ? "--"
              : `${cents > 0 ? "+" : ""}${cents.toFixed(1)} cents`}
          </span>
        </div>

        {/* Confidence & Strobe bar */}
        <div className="max-w-xs mx-auto mt-3">
          <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden flex">
            <div
              className={`h-full transition-all duration-100 ${
                isInTune ? "bg-emerald-500" : isFlat ? "bg-amber-500" : "bg-rose-500"
              }`}
              style={{
                width: isSilent ? "0%" : `${Math.max(10, (pitchResult?.confidence || 0) * 100)}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-1">
            <span>Detection Confidence</span>
            <span>{isSilent ? "0%" : `${Math.round((pitchResult?.confidence || 0) * 100)}%`}</span>
          </div>
        </div>
      </div>

      {/* 6 Interactive Guitar String Buttons (String Selector & Reference Audio Generator) */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 backdrop-blur-md shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h3 className="text-xs font-semibold text-slate-200 uppercase tracking-wider font-mono flex items-center gap-1.5">
              <Volume2 className="w-4 h-4 text-amber-400" />
              <span>Interactive String Selector & Ear-Tuning Reference Tones</span>
            </h3>
            <p className="text-[11px] text-slate-400">
              Click any string to lock target AND play a plucked reference tone to tune by ear
            </p>
          </div>

          {!autoDetectString && (
            <button
              type="button"
              onClick={() => {
                setAutoDetectString(true);
                setLockedStringNumber(null);
              }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white border border-slate-700 text-xs font-mono cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset to Auto-Detect</span>
            </button>
          )}
        </div>

        {/* 6 String Buttons in 6..1 order (Low E on left to High E on right) */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
          {activePreset.strings.map((str) => {
            const isTargeted = currentTargetString.string === str.string;
            const isPlucking = activePluckingString === str.string;

            return (
              <button
                key={str.string}
                type="button"
                onClick={() => handleSelectString(str)}
                className={`relative flex flex-col items-center justify-center p-3.5 rounded-2xl border transition-all cursor-pointer group ${
                  isTargeted
                    ? isInTune
                      ? "bg-emerald-500/15 border-emerald-500/50 shadow-lg shadow-emerald-500/10"
                      : "bg-amber-500/15 border-amber-500/50 shadow-lg shadow-amber-500/10"
                    : "bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 hover:border-slate-600"
                } ${isPlucking ? "scale-95" : ""}`}
              >
                {/* Active Indicator Pip */}
                {isTargeted && (
                  <span
                    className={`absolute top-2 right-2 w-2 h-2 rounded-full ${
                      isInTune ? "bg-emerald-400 animate-pulse" : "bg-amber-400"
                    }`}
                  />
                )}

                {/* String Label */}
                <span className="text-[11px] font-mono font-medium text-slate-400 mb-0.5">
                  String {str.string}
                </span>

                {/* Note Name */}
                <span
                  className={`text-2xl font-black font-mono ${
                    isTargeted
                      ? isInTune
                        ? "text-emerald-300"
                        : "text-amber-300"
                      : "text-white group-hover:text-amber-200"
                  }`}
                >
                  {str.note}
                </span>

                {/* Frequency */}
                <span className="text-[10px] font-mono text-slate-400 mt-1">
                  {str.frequency_hz.toFixed(1)} Hz
                </span>

                {/* Sound Pluck Action cue */}
                <span className="mt-2 flex items-center gap-1 text-[10px] font-mono text-amber-400/80 group-hover:text-amber-300">
                  <Volume2 className="w-3 h-3" /> Pluck
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
