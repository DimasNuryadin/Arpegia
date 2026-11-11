"use client";

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { Navbar, TopLevelStudioMode } from "../components/Navbar";
import { LiveMicStudio } from "../components/LiveMicStudio";
import { AudioUpload } from "../components/AudioUpload";
import { MetadataCard } from "../components/MetadataCard";
import { AudioPlayerTimeline } from "../components/AudioPlayerTimeline";
import { TablatureViewer } from "../components/TablatureViewer";
import { ArrangementStudioPanel } from "../components/ArrangementStudioPanel";
import { ChordVoicingDiagram } from "../components/ChordVoicingDiagram";
import { ImprovisationPanel } from "../components/ImprovisationPanel";
import { GuitarFretboard } from "../components/GuitarFretboard";
import { PipelineProgressTracker } from "../components/PipelineProgressTracker";
import {
  AnalysisResponse,
  ArrangementRequest,
  ChordData,
  ExportFormat,
  TablatureUpdateRequest,
  UploadProgressState,
} from "../types";
import { MOCK_ANALYSIS_RESPONSE, PRESET_TRACKS } from "../lib/mock-data";
import { applyTablatureUpdate } from "../lib/tab-utils";
import { api } from "../lib/api";
import { Sparkles } from "lucide-react";

export default function Home() {
  // Application State (Supports NEXT_PUBLIC_USE_MOCK=true or UI toggle; defaults to Live API http://localhost:8000/api/v1/analyze)
  const [studioMode, setStudioMode] = useState<TopLevelStudioMode>("upload_analysis");
  const [mockMode, setMockMode] = useState<boolean>(
    process.env.NEXT_PUBLIC_USE_MOCK === "true"
  );
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [analysisData, setAnalysisData] =
    useState<AnalysisResponse>(MOCK_ANALYSIS_RESPONSE);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [activeChord, setActiveChord] = useState<ChordData | null>(
    MOCK_ANALYSIS_RESPONSE.chords[0] || null
  );
  const [selectedVoicingChord, setSelectedVoicingChord] = useState<string>("G");
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  // Active arrangement variation ID (null = Original Transcription Tab)
  const [activeArrangementId, setActiveArrangementId] = useState<string | null>(
    null
  );

  // Synchronized Playback Time & Seek State between AudioPlayerTimeline and TablatureViewer
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [seekRequest, setSeekRequest] = useState<{
    time: number;
    seq: number;
  } | null>(null);

  // Upload & Inference Progress State
  const [uploadState, setUploadState] = useState<UploadProgressState>({
    isUploading: false,
    progress: 0,
    stage: "idle",
  });

  // Sync HTML root class for Light / Dark Mode
  useEffect(() => {
    if (typeof document === "undefined") return;
    const html = document.documentElement;
    if (theme === "light") {
      html.classList.remove("dark");
      html.classList.add("light");
    } else {
      html.classList.remove("light");
      html.classList.add("dark");
    }
  }, [theme]);

  // Resolve currently active arrangement variation and tablature data
  const activeArrangement = useMemo(() => {
    if (!activeArrangementId) return null;
    return (
      (analysisData.arrangements || []).find(
        (a) => a.arrangement_id === activeArrangementId
      ) || null
    );
  }, [analysisData.arrangements, activeArrangementId]);

  const activeTablature = useMemo(() => {
    return activeArrangement ? activeArrangement.tablature : analysisData.tablature;
  }, [activeArrangement, analysisData.tablature]);

  const activeTabTitle = useMemo(() => {
    return activeArrangement
      ? `${activeArrangement.title} (${activeArrangement.style})`
      : `Original Transcription Tab (${analysisData.metadata.filename})`;
  }, [activeArrangement, analysisData.metadata.filename]);
  // Calculate average AI confidence
  const averageConfidence = useMemo(() => {
    if (!analysisData.chords || analysisData.chords.length === 0) return 0.92;
    const sum = analysisData.chords.reduce((acc, c) => acc + c.confidence, 0);
    return sum / analysisData.chords.length;
  }, [analysisData.chords]);

  // Handle file selection and analysis (POST /api/v1/analyze?async_mode=true)
  const handleFileSelected = useCallback(
    async (file: File) => {
      setUploadedFile(file);
      setUploadState({
        isUploading: true,
        progress: 0,
        stage: "uploading",
        errorMessage: `Uploading "${file.name}" to neural backend...`,
        transport: mockMode ? "mock" : "websocket",
        currentEvent: null,
      });

      try {
        const response = await api.analyzeAudio(file, {
          mockMode: mockMode,
          onProgress: (percent, stageText, event) => {
            setUploadState((prev) => ({
              ...prev,
              progress: percent,
              stage: percent < 100 ? "analyzing" : "completed",
              errorMessage: stageText,
              currentEvent: event ?? prev.currentEvent,
            }));
          },
          onProgressEvent: (event) => {
            setUploadState((prev) => ({
              ...prev,
              progress: event.overall_percent,
              stage: event.status === "completed" ? "completed" : "analyzing",
              errorMessage: event.message,
              currentEvent: event,
            }));
          },
          onTransportChange: (transport) => {
            setUploadState((prev) => ({
              ...prev,
              transport,
            }));
          },
        });

        // Brief delay for the user to perceive the 100% completion checkmark before transition
        await new Promise((resolve) => setTimeout(resolve, 400));

        setAnalysisData(response);
        setActiveArrangementId(null);
        if (response.chords && response.chords.length > 0) {
          setActiveChord(response.chords[0]);
          setSelectedVoicingChord(response.chords[0].chord);
        }
        setUploadState((prev) => ({
          ...prev,
          isUploading: false,
          progress: 100,
          stage: "completed",
        }));
        setStatusNotice(
          `AI Pipeline Complete: Analyzed "${file.name}" through all 5 stages (${response.chords.length} chords, ${response.tablature.measures.length} tab measures & ${(response.arrangements || []).length} AI arrangements)!`
        );
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Analysis failed";
        setUploadState((prev) => ({
          ...prev,
          isUploading: false,
          progress: 0,
          stage: "error",
          errorMessage: msg,
        }));
        setStatusNotice(`Analysis error: ${msg}`);
      }
    },
    [mockMode]
  );

  // Phase 4: Instant 1-Click Simulation of the 5-Stage AI Pipeline Tracker
  const handleSimulatePipeline = useCallback(async () => {
    const mockFile = new File(
      ["simulated guitar audio stream"],
      "fingerstyle_arrangement_demo.mp3",
      { type: "audio/mpeg" }
    );
    await handleFileSelected(mockFile);
  }, [handleFileSelected]);

  // Handle Interactive Tablature Edit (PUT /api/v1/analyze/{job_id}/tablature)
  const handleUpdateTablature = useCallback(
    async (payload: TablatureUpdateRequest) => {
      if (activeArrangementId) {
        // Update the active arrangement variation's tablature locally
        setAnalysisData((prev) => ({
          ...prev,
          arrangements: (prev.arrangements || []).map((arr) =>
            arr.arrangement_id === activeArrangementId
              ? {
                  ...arr,
                  tablature: applyTablatureUpdate(arr.tablature, payload),
                }
              : arr
          ),
        }));
        setStatusNotice(
          `Updated note & regenerated ASCII tab in arrangement "${
            activeArrangement?.title || activeArrangementId
          }".`
        );
        return;
      }

      // 1. Immediate optimistic UI update on primary tablature
      setAnalysisData((prev) => ({
        ...prev,
        tablature: applyTablatureUpdate(prev.tablature, payload),
      }));

      // 2. Persist to backend API (or local fallback if offline / mock mode)
      const result = await api.updateTablature(
        analysisData.job_id,
        payload,
        analysisData,
        mockMode
      );

      setAnalysisData(result.analysis);
      setStatusNotice(result.notice);
    },
    [analysisData, mockMode, activeArrangementId, activeArrangement]
  );

  // Handle Phase 3 AI Arrangement Generation (POST /api/v1/analyze/{job_id}/arrange)
  const handleGenerateArrangement = useCallback(
    async (request: ArrangementRequest) => {
      const result = await api.generateArrangement(
        analysisData.job_id,
        request,
        analysisData,
        mockMode
      );

      setAnalysisData((prev) => {
        const existingList = prev.arrangements || [];
        const existingIdx = existingList.findIndex(
          (a) => a.arrangement_id === result.variation.arrangement_id
        );
        const nextArrangements =
          existingIdx >= 0
            ? existingList.map((item, idx) =>
                idx === existingIdx ? result.variation : item
              )
            : [...existingList, result.variation];

        return {
          ...prev,
          arrangements: nextArrangements,
        };
      });

      setActiveArrangementId(result.variation.arrangement_id);
      if (result.variation.chords_used?.[0]) {
        setSelectedVoicingChord(result.variation.chords_used[0]);
      }
      setStatusNotice(result.notice);
    },
    [analysisData, mockMode]
  );

  // Handle Phase 3 Multi-Format Export (GET /api/v1/analyze/{job_id}/export?format=<fmt>&arrangement_id=<id>)
  const handleExportFormat = useCallback(
    async (format: ExportFormat) => {
      const result = await api.exportTablature({
        jobId: analysisData.job_id,
        format,
        arrangementId: activeArrangementId,
        activeTablature,
        analysis: analysisData,
        activeTitle: activeArrangement?.title || analysisData.metadata.filename,
        activeStyle: activeArrangement?.style || "Original Transcription",
        mockMode,
      });
      setStatusNotice(result.notice);
    },
    [
      analysisData,
      activeArrangementId,
      activeTablature,
      activeArrangement,
      mockMode,
    ]
  );

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
    setActiveArrangementId(null);
    if (preset.chords.length > 0) {
      setActiveChord(preset.chords[0]);
      setSelectedVoicingChord(preset.chords[0].chord);
    }
    setStatusNotice(
      `Loaded Phase 3 preset: "${preset.metadata.filename}" (${preset.tablature.measures.length} tab measures & ${(preset.arrangements || []).length} AI arrangements)`
    );
  };

  // Sync active chord to SVG Chord Voicing Diagram & Fretboard Visualizer
  const handleActiveChordChange = useCallback((chord: ChordData | null) => {
    setActiveChord(chord);
    if (chord) {
      setSelectedVoicingChord(chord.chord);
    }
  }, []);

  const handlePlaybackTimeChange = useCallback(
    (time: number, playing: boolean) => {
      setCurrentTime(time);
      setIsPlaying(playing);
    },
    []
  );

  const handleSeekFromTab = useCallback((time: number) => {
    setCurrentTime(time);
    setSeekRequest((prev) => ({ time, seq: (prev?.seq ?? 0) + 1 }));
  }, []);

  return (
    <div
      className={`min-h-screen flex flex-col font-sans transition-colors ${
        theme === "light"
          ? "theme-light bg-slate-100 text-slate-900"
          : "theme-dark bg-[#090b10] text-slate-100"
      }`}
    >
      {/* Studio Header */}
      <Navbar
        currentMode={studioMode}
        onSelectMode={(mode) => setStudioMode(mode)}
        mockMode={mockMode}
        onToggleMockMode={(val) => {
          setMockMode(val);
          setStatusNotice(
            val
              ? "Switched to Mock Engine (High-fidelity Phase 2 studio simulation)"
              : `Switched to Live API (${api.getApiUrl()})`
          );
        }}
        onLoadPreset={handleLoadPreset}
        isProcessing={uploadState.isUploading}
        theme={theme}
        onToggleTheme={() =>
          setTheme((prev) => (prev === "dark" ? "light" : "dark"))
        }
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
              className="text-amber-400/80 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Top-Level Mode: Live Mic Studio vs Studio Analysis */}
        {studioMode === "live_mic" ? (
          <LiveMicStudio mockMode={mockMode} />
        ) : uploadState.isUploading ? (
          <section
            aria-label="Real-Time AI Pipeline Progress Stepper"
            className="animate-in fade-in duration-300 space-y-4"
          >
            <PipelineProgressTracker
              progressEvent={uploadState.currentEvent}
              overallPercent={uploadState.progress}
              currentMessage={uploadState.errorMessage}
              transport={uploadState.transport}
              fileName={uploadedFile?.name || analysisData.metadata.filename}
              isCompleted={uploadState.stage === "completed"}
              isError={uploadState.stage === "error"}
              errorMessage={
                uploadState.stage === "error"
                  ? uploadState.errorMessage
                  : undefined
              }
              onCancel={handleReset}
            />
          </section>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-300">
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
                onSimulatePipeline={handleSimulatePipeline}
              />
            </section>

            {/* Optional Collapsible Pipeline Diagnostic Banner */}
            {uploadState.currentEvent && uploadState.currentEvent.steps && (
              <details className="rounded-xl border border-slate-800 bg-slate-900/50 p-3 text-xs font-mono text-slate-400 group">
                <summary className="cursor-pointer select-none font-semibold text-slate-300 flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" />
                    Last Pipeline Execution: 5 of 5 Stages Completed
                  </span>
                  <span className="text-amber-400 group-open:rotate-90 transition-transform">
                    ▶
                  </span>
                </summary>
                <div className="mt-3 pt-3 border-t border-slate-800">
                  <PipelineProgressTracker
                    progressEvent={uploadState.currentEvent}
                    overallPercent={100}
                    transport={uploadState.transport}
                    fileName={
                      uploadedFile?.name || analysisData.metadata.filename
                    }
                    isCompleted={true}
                  />
                </div>
              </details>
            )}

            {/* 2. Song Metadata Summary Card */}
            <section aria-label="Song Metadata Summary">
              <MetadataCard
                metadata={analysisData.metadata}
                chordsCount={analysisData.chords.length}
                averageConfidence={averageConfidence}
                isPlaying={isPlaying}
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
                onPlaybackTimeChange={handlePlaybackTimeChange}
                seekRequest={seekRequest}
              />
            </section>

            {/* 4. Phase 3: AI Guitar Arrangement Studio & Variation Switcher */}
            <section aria-label="AI Guitar Arrangement Studio Panel">
              <ArrangementStudioPanel
                jobId={analysisData.job_id}
                originalTablature={analysisData.tablature}
                arrangements={analysisData.arrangements || []}
                activeArrangementId={activeArrangementId}
                onSelectArrangement={(arrId) => setActiveArrangementId(arrId)}
                onGenerateArrangement={handleGenerateArrangement}
                onSelectChordForDiagram={(chord) => setSelectedVoicingChord(chord)}
              />
            </section>

            {/* 5. Phase 2 & 3: Interactive 6-String Guitar Tablature Viewer, Polyphonic Voices, Web Audio Tab Synth & Multi-Format Export Hub */}
            <section aria-label="Interactive Guitar Tablature Viewer and Editor">
              <TablatureViewer
                jobId={analysisData.job_id}
                filename={analysisData.metadata.filename}
                activeTitle={activeTabTitle}
                activeArrangementId={activeArrangementId}
                tablature={activeTablature}
                currentTime={currentTime}
                isMainPlayerPlaying={isPlaying}
                onSeekMainPlayer={handleSeekFromTab}
                onUpdateTablature={handleUpdateTablature}
                onExportFormat={handleExportFormat}
              />
            </section>

            {/* 6. Two-Column Studio Section: Improvisation Panel + SVG Chord Voicing Diagram */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Chord Improvisation Panel (Takes 2 cols) */}
              <section
                className="lg:col-span-2"
                aria-label="Chord Improvisation Panel"
              >
                <ImprovisationPanel
                  improvisations={analysisData.improvisations}
                  activeChord={activeChord}
                  onSelectVoicingForDiagram={(chord) =>
                    setSelectedVoicingChord(chord)
                  }
                />
              </section>

              {/* Phase 2 SVG Guitar Chord Voicing Diagram (Takes 1 col) */}
              <section
                className="lg:col-span-1"
                aria-label="SVG Guitar Chord Voicing Diagram"
              >
                <ChordVoicingDiagram
                  selectedChordName={selectedVoicingChord || "G"}
                  activeChordName={activeChord?.chord}
                  chordDiagrams={analysisData.chord_diagrams}
                  tuning={analysisData.tablature?.tuning}
                  capo={analysisData.tablature?.capo}
                  onSelectChord={(chord) => setSelectedVoicingChord(chord)}
                />
              </section>
            </div>

            {/* 7. Full 12-Fret Horizontal Guitar Fretboard Neck Visualizer */}
            <section aria-label="Full Guitar Fretboard Neck Visualizer">
              <GuitarFretboard chordName={selectedVoicingChord || "G"} />
            </section>
          </div>
        )}
      </main>

      {/* Studio Footer */}
      <footer className="border-t border-slate-800/80 bg-slate-950/60 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4 text-xs font-mono text-slate-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Arpegia Platform • Phase 5 Live Mic Studio & Studio Analysis</span>
            <span className="text-slate-700">|</span>
            <span>
              60fps Edge Autocorrelation Tuner • WS Live Chord Jam • 5-Stage Neural Pipeline
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span>
              API Target:{" "}
              <code className="text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                {api.getHttpBaseUrl()}
              </code>
            </span>
            <span>
              WS Target:{" "}
              <code className="text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                {api.getWsBaseUrl()}/ws/live-chord
              </code>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
