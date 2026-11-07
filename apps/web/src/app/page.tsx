"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Navbar } from "../components/Navbar";
import { AudioUpload } from "../components/AudioUpload";
import { MetadataCard } from "../components/MetadataCard";
import { AudioPlayerTimeline } from "../components/AudioPlayerTimeline";
import { ImprovisationPanel } from "../components/ImprovisationPanel";
import { GuitarFretboard } from "../components/GuitarFretboard";
import {
  AnalysisResponse,
  ChordData,
  UploadProgressState,
} from "../types";
import { MOCK_ANALYSIS_RESPONSE, PRESET_TRACKS } from "../lib/mock-data";
import { api } from "../lib/api";
import { Sparkles } from "lucide-react";

export default function Home() {
  // Application State
  const [mockMode, setMockMode] = useState<boolean>(true);
  const [analysisData, setAnalysisData] =
    useState<AnalysisResponse>(MOCK_ANALYSIS_RESPONSE);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [activeChord, setActiveChord] = useState<ChordData | null>(null);
  const [selectedVoicingChord, setSelectedVoicingChord] = useState<string>("G");
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Upload & Inference Progress State
  const [uploadState, setUploadState] = useState<UploadProgressState>({
    isUploading: false,
    progress: 0,
    stage: "idle",
  });

  // Calculate average AI confidence
  const averageConfidence = useMemo(() => {
    if (!analysisData.chords || analysisData.chords.length === 0) return 0.92;
    const sum = analysisData.chords.reduce((acc, c) => acc + c.confidence, 0);
    return sum / analysisData.chords.length;
  }, [analysisData.chords]);

  // Handle file selection and analysis
  const handleFileSelected = async (file: File) => {
    setUploadedFile(file);
    setUploadState({
      isUploading: true,
      progress: 5,
      stage: "uploading",
      errorMessage: `Uploading ${file.name}...`,
    });

    try {
      const response = await api.analyzeAudio(file, {
        mockMode: mockMode,
        onProgress: (percent, stageText) => {
          setUploadState((prev) => ({
            ...prev,
            progress: percent,
            stage: percent < 50 ? "uploading" : "analyzing",
            errorMessage: stageText,
          }));
        },
      });

      setAnalysisData(response);
      setUploadState({
        isUploading: false,
        progress: 100,
        stage: "completed",
      });
      setStatusNotice(
        `Successfully analyzed "${file.name}" with ${response.chords.length} chord segments!`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Analysis failed";
      setUploadState({
        isUploading: false,
        progress: 0,
        stage: "error",
        errorMessage: msg,
      });
      setStatusNotice(`Analysis error: ${msg}`);
    }
  };

  // Reset to empty state
  const handleReset = () => {
    setUploadedFile(null);
    setUploadState({
      isUploading: false,
      progress: 0,
      stage: "idle",
    });
  };

  // Load a preset demo track
  const handleLoadPreset = (presetKey: string) => {
    const preset = PRESET_TRACKS[presetKey] || MOCK_ANALYSIS_RESPONSE;
    setUploadedFile(null);
    setAnalysisData(preset);
    if (preset.chords.length > 0) {
      setActiveChord(preset.chords[0]);
      setSelectedVoicingChord(preset.chords[0].chord);
    }
    setStatusNotice(`Loaded preset: "${preset.metadata.filename}"`);
  };

  // Sync active chord to fretboard visualizer
  const handleActiveChordChange = useCallback((chord: ChordData | null) => {
    setActiveChord(chord);
    if (chord) {
      setSelectedVoicingChord(chord.chord);
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#090b10] text-slate-100 flex flex-col font-sans">
      {/* Studio Header */}
      <Navbar
        mockMode={mockMode}
        onToggleMockMode={(val) => {
          setMockMode(val);
          setStatusNotice(
            val
              ? "Switched to Mock Engine (High-fidelity studio simulation)"
              : `Switched to Live API (${api.getApiUrl()})`
          );
        }}
        onLoadPreset={handleLoadPreset}
        isProcessing={uploadState.isUploading}
      />

      {/* Main Studio Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Status / Feedback Banner */}
        {statusNotice && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs font-mono text-amber-200">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>{statusNotice}</span>
            </div>
            <button
              onClick={() => setStatusNotice(null)}
              className="text-amber-400/80 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}

        {/* 1. Audio Upload Component */}
        <section aria-label="Audio Upload Zone">
          <AudioUpload
            onFileSelected={handleFileSelected}
            uploadState={uploadState}
            currentFileName={
              uploadedFile?.name || analysisData.metadata.filename
            }
            onReset={handleReset}
            onLoadDemoTrack={() => handleLoadPreset("neo-soul-g")}
          />
        </section>

        {/* 2. Song Metadata Summary Card */}
        <section aria-label="Song Metadata Summary">
          <MetadataCard
            metadata={analysisData.metadata}
            chordsCount={analysisData.chords.length}
            averageConfidence={averageConfidence}
            isPlaying={true}
          />
        </section>

        {/* 3. Interactive Audio Player & Synchronized Chord Timeline */}
        <section aria-label="Audio Player and Synchronized Chord Timeline">
          <AudioPlayerTimeline
            chords={analysisData.chords}
            totalDuration={analysisData.metadata.duration}
            audioFile={uploadedFile}
            onActiveChordChange={handleActiveChordChange}
            selectedChordForVoicing={activeChord}
            onSelectChordForVoicing={(chord) => {
              setActiveChord(chord);
              setSelectedVoicingChord(chord.chord);
            }}
          />
        </section>

        {/* Two-Column Studio Lower Section: Improvisation Panel + Fretboard Visualizer */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 4. Basic Chord Improvisation Panel (Takes 2 cols) */}
          <section
            className="lg:col-span-2"
            aria-label="Chord Improvisation Panel"
          >
            <ImprovisationPanel
              improvisations={analysisData.improvisations}
              activeChord={activeChord}
              onSelectVoicingForDiagram={(chord) => setSelectedVoicingChord(chord)}
            />
          </section>

          {/* 5. Interactive Guitar Fretboard Visualizer (Takes 1 col) */}
          <section className="lg:col-span-1" aria-label="Fretboard Diagram">
            <GuitarFretboard chordName={selectedVoicingChord || "G"} />
          </section>
        </div>
      </main>

      {/* Studio Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/60 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Arpegia Platform • Phase 1 MVP</span>
            <span className="text-slate-700">|</span>
            <span>App Router • TypeScript • Tailwind CSS</span>
          </div>

          <div className="flex items-center gap-3">
            <span>
              API Target:{" "}
              <code className="text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                {api.getApiUrl()}
              </code>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
