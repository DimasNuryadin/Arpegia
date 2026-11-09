"use client";

import React, { useEffect, useState, useMemo } from "react";
import {
  CheckCircle2,
  Clock,
  Loader2,
  Layers,
  Activity,
  Music,
  FileText,
  Wand2,
  AlertCircle,
  Timer,
  Wifi,
  Sparkles,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import {
  JobProgressEvent,
  PipelineStage,
  PipelineStepInfo,
  StageStatus,
  TransportType,
  CANONICAL_PIPELINE_STAGES,
} from "../types";

export interface PipelineProgressTrackerProps {
  progressEvent?: JobProgressEvent | null;
  overallPercent?: number;
  currentMessage?: string;
  transport?: TransportType;
  fileName?: string;
  isCompleted?: boolean;
  isError?: boolean;
  errorMessage?: string;
  onCancel?: () => void;
  className?: string;
}

export function PipelineProgressTracker({
  progressEvent,
  overallPercent = 0,
  currentMessage,
  transport = "mock",
  fileName,
  isCompleted = false,
  isError = false,
  errorMessage,
  onCancel,
  className = "",
}: PipelineProgressTrackerProps) {
  // Elapsed timer state (counts in 100ms intervals)
  const [elapsedMs, setElapsedMs] = useState<number>(0);
  const [startTime] = useState<number>(() => Date.now());

  useEffect(() => {
    if (isCompleted || isError) return;
    const interval = setInterval(() => {
      setElapsedMs(Date.now() - startTime);
    }, 100);
    return () => clearInterval(interval);
  }, [isCompleted, isError, startTime]);

  // Format elapsed time as mm:ss.s
  const formattedTimer = useMemo(() => {
    const totalSeconds = elapsedMs / 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = (totalSeconds % 60).toFixed(1);
    const padSec = Number(seconds) < 10 ? `0${seconds}` : seconds;
    return `${minutes > 0 ? `${minutes}:` : ""}${padSec}s`;
  }, [elapsedMs]);

  // Computed overall percent
  const percent = isCompleted
    ? 100
    : typeof progressEvent?.overall_percent === "number"
    ? Math.min(100, Math.max(0, progressEvent.overall_percent))
    : Math.min(100, Math.max(0, overallPercent));

  // Merge canonical steps with incoming progressEvent.steps
  const displaySteps = useMemo<PipelineStepInfo[]>(() => {
    const eventStepsMap = new Map<string, PipelineStepInfo>();
    if (progressEvent?.steps && Array.isArray(progressEvent.steps)) {
      for (const step of progressEvent.steps) {
        eventStepsMap.set(step.stage, step);
      }
    }

    return CANONICAL_PIPELINE_STAGES.map((canonical, idx) => {
      const match = eventStepsMap.get(canonical.stage);
      if (match) {
        return match;
      }

      // Infer fallback status based on current overall percent
      let status: StageStatus = "pending";
      let stepProgress = 0;
      let detail: string | null = null;

      if (isCompleted) {
        status = "completed";
        stepProgress = 100;
        detail = canonical.description;
      } else if (percent >= canonical.milestonePercent) {
        status = "completed";
        stepProgress = 100;
        detail = canonical.description;
      } else {
        const prevMilestone =
          idx > 0 ? CANONICAL_PIPELINE_STAGES[idx - 1].milestonePercent : 0;
        if (percent >= prevMilestone && percent < canonical.milestonePercent) {
          status = "in_progress";
          stepProgress = Math.round(
            ((percent - prevMilestone) /
              (canonical.milestonePercent - prevMilestone)) *
              100
          );
          detail = `Running ${canonical.shortLabel}...`;
        }
      }

      return {
        stage: canonical.stage,
        label: canonical.label,
        status,
        progress_percent: stepProgress,
        detail,
      };
    });
  }, [progressEvent, percent, isCompleted]);

  // Get stage-specific icon
  const getStageIcon = (stage: PipelineStage) => {
    switch (stage) {
      case "separating_stems":
        return <Layers className="w-4 h-4" />;
      case "detecting_key_tempo":
        return <Activity className="w-4 h-4" />;
      case "detecting_chords":
        return <Music className="w-4 h-4" />;
      case "transcribing_tablature":
        return <FileText className="w-4 h-4" />;
      case "generating_arrangement":
        return <Wand2 className="w-4 h-4" />;
      default:
        return <Sparkles className="w-4 h-4" />;
    }
  };

  // Status badge renderer
  const renderStatusBadge = (status: StageStatus) => {
    switch (status) {
      case "completed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" />
            Done
          </span>
        );
      case "in_progress":
        return (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
            <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
            Processing
          </span>
        );
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold font-mono bg-rose-500/20 text-rose-300 border border-rose-500/40">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            Failed
          </span>
        );
      case "skipped":
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-slate-800 text-slate-400 border border-slate-700">
            Skipped
          </span>
        );
      case "pending":
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-mono bg-slate-800/80 text-slate-400 border border-slate-700/60">
            <Clock className="w-2.5 h-2.5" />
            Pending
          </span>
        );
    }
  };

  // Active message text
  const headlineMessage =
    errorMessage ||
    currentMessage ||
    progressEvent?.message ||
    (isCompleted
      ? "AI Analysis and Tablature Synthesis Complete!"
      : "Analyzing audio signals through 5-stage neural pipeline...");

  return (
    <div
      className={`relative w-full rounded-2xl border border-slate-700/70 bg-gradient-to-b from-slate-900/90 via-slate-900/80 to-slate-950/90 shadow-2xl backdrop-blur-md overflow-hidden ${className}`}
    >
      {/* Ambient background glows */}
      <div className="absolute -top-20 -left-20 w-60 h-60 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-20 -right-20 w-60 h-60 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="relative px-6 py-4 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-amber-500/20 to-indigo-500/20 border border-amber-500/30 text-amber-400">
            {isCompleted ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            ) : isError ? (
              <AlertCircle className="w-5 h-5 text-rose-400" />
            ) : (
              <Loader2 className="w-5 h-5 animate-spin text-amber-400" />
            )}
            {!isCompleted && !isError && (
              <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              </span>
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-white tracking-wide">
                Arpegia AI Pipeline Progress Tracker
              </h2>
              {fileName && (
                <span className="text-xs font-mono text-slate-400 max-w-[220px] truncate">
                  ({fileName})
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 font-mono flex items-center gap-1.5 mt-0.5">
              <span>Stage-by-Stage Neural Inference</span>
              <span className="text-slate-600">•</span>
              <span className="text-amber-400/90">{headlineMessage}</span>
            </p>
          </div>
        </div>

        {/* Right Info: Transport Badge & Elapsed Timer */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Dual-Transport Mode Indicator */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/70 border border-slate-700/60 text-xs font-mono">
            {transport === "websocket" ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                </span>
                <Wifi className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-300 font-medium">
                  WebSocket Stream
                </span>
              </>
            ) : transport === "polling" ? (
              <>
                <RefreshCw className="w-3 h-3 text-amber-400 animate-spin" />
                <span className="text-amber-300 font-medium">
                  HTTP Polling (800ms)
                </span>
              </>
            ) : transport === "sync" ? (
              <>
                <span className="h-2 w-2 rounded-full bg-blue-400" />
                <span className="text-blue-300 font-medium">Synchronous</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 text-purple-400" />
                <span className="text-purple-300 font-medium">
                  Studio Simulation
                </span>
              </>
            )}
          </div>

          {/* Elapsed Timer Counter */}
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-800/70 border border-slate-700/60 text-xs font-mono text-slate-300">
            <Timer className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-amber-400 font-semibold">{formattedTimer}</span>
          </div>

          {onCancel && !isCompleted && !isError && (
            <button
              type="button"
              onClick={onCancel}
              className="px-2.5 py-1 text-xs font-mono rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Main Overall Progress Bar */}
      <div className="px-6 pt-5 pb-3">
        <div className="flex items-center justify-between text-xs font-mono mb-2">
          <div className="flex items-center gap-2">
            <span className="text-slate-300 font-medium">Overall Progress</span>
            <span className="text-slate-500">•</span>
            <span className="text-slate-400">
              {percent === 100
                ? "5 of 5 stages complete"
                : `${displaySteps.filter((s) => s.status === "completed").length} of 5 completed`}
            </span>
          </div>
          <span className="text-base font-bold font-mono text-amber-400">
            {percent}%
          </span>
        </div>

        {/* Progress Bar Container */}
        <div className="w-full h-3 bg-slate-800/90 rounded-full overflow-hidden p-0.5 border border-slate-700/80 shadow-inner">
          <div
            className="h-full bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500 rounded-full transition-all duration-500 ease-out shadow-sm"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {/* 5-Stage Step-by-Step Stepper Cards Grid */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {displaySteps.map((step, index) => {
            const canonical = CANONICAL_PIPELINE_STAGES[index];
            const isActive = step.status === "in_progress";
            const isDone = step.status === "completed";

            return (
              <div
                key={step.stage}
                className={`relative rounded-xl p-3.5 transition-all duration-300 border ${
                  isActive
                    ? "bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/10 ring-1 ring-amber-500/30"
                    : isDone
                    ? "bg-emerald-950/20 border-emerald-500/30 hover:border-emerald-500/50"
                    : "bg-slate-900/40 border-slate-800 text-slate-500"
                }`}
              >
                {/* Top Row: Stage Number, Icon & Status Badge */}
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex items-center justify-center w-6 h-6 rounded-lg text-xs font-mono font-bold ${
                        isActive
                          ? "bg-amber-500 text-slate-950"
                          : isDone
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {isDone ? "✓" : index + 1}
                    </span>
                    <span
                      className={
                        isActive
                          ? "text-amber-400"
                          : isDone
                          ? "text-emerald-400"
                          : "text-slate-500"
                      }
                    >
                      {getStageIcon(step.stage)}
                    </span>
                  </div>

                  {renderStatusBadge(step.status)}
                </div>

                {/* Step Label */}
                <h3
                  className={`text-xs font-semibold leading-snug line-clamp-2 min-h-[32px] ${
                    isActive
                      ? "text-amber-200"
                      : isDone
                      ? "text-slate-200"
                      : "text-slate-400"
                  }`}
                  title={step.label}
                >
                  {canonical?.label || step.label}
                </h3>

                {/* Granular Step Progress Bar for active step */}
                {isActive && (
                  <div className="mt-2 w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.max(15, step.progress_percent)}%`,
                      }}
                    />
                  </div>
                )}

                {/* Step Real-Time Detail Subtext */}
                <p
                  className={`mt-2 text-[11px] font-mono leading-tight ${
                    isActive
                      ? "text-amber-300/90 font-medium"
                      : isDone
                      ? "text-emerald-300/70"
                      : "text-slate-500"
                  }`}
                >
                  {step.detail || canonical?.description || "Awaiting pipeline trigger..."}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Live Feedback Bar */}
      <div className="px-6 py-3 bg-slate-950/60 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-3 text-xs font-mono">
        <div className="flex items-center gap-2 text-slate-400">
          <ArrowRight className="w-3.5 h-3.5 text-amber-400" />
          <span>Active Pipeline Milestone:</span>
          <span className="text-white font-medium">
            {displaySteps.find((s) => s.status === "in_progress")?.label ||
              (isCompleted ? "All 5 Stages Complete" : "Initializing...")}
          </span>
        </div>

        <div className="flex items-center gap-4 text-slate-500">
          <span>Demucs Stems • Basic Pitch • Viterbi Fret Trellis</span>
        </div>
      </div>
    </div>
  );
}
