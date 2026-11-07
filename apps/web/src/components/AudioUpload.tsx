"use client";

import React, { useState, useRef, DragEvent, ChangeEvent } from "react";
import {
  UploadCloud,
  FileAudio,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
} from "lucide-react";
import { UploadProgressState } from "../types";

interface AudioUploadProps {
  onFileSelected: (file: File) => void;
  uploadState: UploadProgressState;
  currentFileName?: string;
  onReset: () => void;
  onLoadDemoTrack: () => void;
}

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
const ALLOWED_EXTENSIONS = [".mp3", ".wav"];
const ALLOWED_MIME_TYPES = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav"];

export function AudioUpload({
  onFileSelected,
  uploadState,
  currentFileName,
  onReset,
  onLoadDemoTrack,
}: AudioUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): boolean => {
    setValidationError(null);

    // Format validation
    const nameLower = file.name.toLowerCase();
    const hasValidExt = ALLOWED_EXTENSIONS.some((ext) =>
      nameLower.endsWith(ext)
    );
    const hasValidMime =
      !file.type || ALLOWED_MIME_TYPES.includes(file.type.toLowerCase());

    if (!hasValidExt && !hasValidMime) {
      setValidationError(
        `Invalid audio format: "${file.name}". Please upload an .mp3 or .wav file.`
      );
      return false;
    }

    // Size validation
    if (file.size > MAX_FILE_SIZE_BYTES) {
      const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
      setValidationError(
        `File is too large (${sizeMb} MB). Maximum supported size is 50 MB.`
      );
      return false;
    }

    return true;
  };

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    if (uploadState.isUploading) return;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (validateFile(file)) {
        onFileSelected(file);
      }
    }
  };

  const handleFileInput = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (validateFile(file)) {
        onFileSelected(file);
      }
    }
  };

  const openFileDialog = () => {
    if (!uploadState.isUploading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="w-full">
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,audio/mpeg,audio/wav"
        onChange={handleFileInput}
        className="hidden"
      />

      {/* Upload Zone Card */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={openFileDialog}
        className={`relative group cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed p-8 transition-all duration-300 ${
          isDragOver
            ? "border-amber-400 bg-amber-500/10 scale-[1.008]"
            : uploadState.isUploading
            ? "border-indigo-500/50 bg-indigo-950/20"
            : currentFileName
            ? "border-slate-700 bg-slate-900/50 hover:border-slate-600"
            : "border-slate-700/80 bg-slate-900/40 hover:border-amber-500/50 hover:bg-slate-900/70"
        }`}
      >
        {/* Glow ambient effect */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative flex flex-col items-center justify-center text-center">
          {/* Status Icon */}
          <div className="mb-4">
            {uploadState.isUploading ? (
              <div className="relative flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
                </span>
              </div>
            ) : currentFileName ? (
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <CheckCircle2 className="w-8 h-8" />
              </div>
            ) : (
              <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700 group-hover:border-amber-500/50 group-hover:bg-amber-500/10 text-slate-300 group-hover:text-amber-400 transition-all duration-300 shadow-inner">
                <UploadCloud className="w-8 h-8" />
              </div>
            )}
          </div>

          {/* Upload Progress State */}
          {uploadState.isUploading ? (
            <div className="w-full max-w-md space-y-3">
              <div className="flex items-center justify-between text-xs font-medium">
                <span className="text-indigo-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400 animate-pulse" />
                  {uploadState.stage === "uploading"
                    ? "Uploading Audio..."
                    : "Neural Harmonics Inference..."}
                </span>
                <span className="font-mono text-indigo-400">
                  {uploadState.progress}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden p-0.5 border border-slate-700">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500 rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadState.progress}%` }}
                />
              </div>

              <p className="text-xs text-slate-400 font-mono italic animate-pulse">
                {uploadState.errorMessage || "Processing guitar audio..."}
              </p>
            </div>
          ) : currentFileName ? (
            <div className="space-y-2">
              <div className="flex items-center justify-center gap-2">
                <FileAudio className="w-4 h-4 text-emerald-400" />
                <span className="text-base font-semibold text-white font-mono">
                  {currentFileName}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Audio analyzed successfully. Click or drag to replace track.
              </p>
              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openFileDialog();
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
                >
                  Choose Different File
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onReset();
                  }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/30 transition-colors"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="text-base font-semibold text-white">
                Drag & drop your guitar audio track here
              </h3>
              <p className="text-xs text-slate-400 max-w-sm">
                Supports <span className="text-amber-400 font-mono">.MP3</span>{" "}
                and <span className="text-amber-400 font-mono">.WAV</span> files
                (up to 50MB). Isolated guitar or full mix supported.
              </p>
              <div className="pt-3 flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Browse Files
                </span>
                <span className="text-xs text-slate-500">or</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onLoadDemoTrack();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 hover:bg-indigo-500/20 transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
                  Load Sample Song (Instant Demo)
                </button>
              </div>
            </div>
          )}

          {/* Validation Error Banner */}
          {validationError && (
            <div className="mt-4 flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-950/40 border border-rose-500/40 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
              <span>{validationError}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
