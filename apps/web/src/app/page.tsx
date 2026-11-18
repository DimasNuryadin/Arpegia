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
import { TabReaderStudio } from "../components/TabReaderStudio";
import { StemSplitterStudio } from "../components/StemSplitterStudio";
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
import {
  Sparkles,
  Music2,
  FileText,
  Sliders,
  Layers,
  Activity,
  Play,
  RotateCcw,
  Upload,
  Cpu,
  Clock,
  KeyRound,
  CheckCircle,
} from "lucide-react";

export type StudioSubTab =
  | "tablature"
  | "arrangements"
  | "fretboard"
  | "intelligence";

export default function Home() {
  // Application State
  const [studioMode, setStudioMode] = useState<TopLevelStudioMode>("upload_analysis");
  const [subTab, setSubTab] = useState<StudioSubTab>("tablature");
  const [showUploadZone, setShowUploadZone] = useState<boolean>(false);
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
      setShowUploadZone(false);
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

        // Brief delay for the user to perceive completion
        await new Promise((resolve) => setTimeout(resolve, 350));

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
          `AI Pipeline Complete: Transcribed "${file.name}" (${response.chords.length} chords, ${response.tablature.measures.length} measures)`
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

  // 1-Click Simulation of the 5-Stage AI Pipeline Tracker
  const handleSimulatePipeline = useCallback(async () => {
    const mockFile = new File(
      ["simulated guitar audio stream"],
      "fingerstyle_arrangement_demo.mp3",
      { type: "audio/mpeg" }
    );
    await handleFileSelected(mockFile);
  }, [handleFileSelected]);

  // Handle Interactive Tablature Edit
  const handleUpdateTablature = useCallback(
    async (payload: TablatureUpdateRequest) => {
      if (activeArrangementId) {
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
          `Updated note in arrangement "${activeArrangement?.title || activeArrangementId}".`
        );
        return;
      }

      setAnalysisData((prev) => ({
        ...prev,
        tablature: applyTablatureUpdate(prev.tablature, payload),
      }));

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

  // Handle AI Arrangement Generation
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

  // Handle Multi-Format Export
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

  // Reset state
  const handleReset = () => {
    setUploadedFile(null);
    setShowUploadZone(true);
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
    setShowUploadZone(false);
    setAnalysisData(preset);
    setActiveArrangementId(null);
    if (preset.chords.length > 0) {
      setActiveChord(preset.chords[0]);
      setSelectedVoicingChord(preset.chords[0].chord);
    }
    setStatusNotice(
      `Loaded preset: "${preset.metadata.filename}" (${preset.tablature.measures.length} measures)`
    );
  };

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
          ? "theme-light bg-[#f8fafc] text-zinc-900"
          : "theme-dark bg-[#090b0e] text-zinc-100"
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
              ? "Switched to Mock Engine (High-fidelity local simulation)"
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-5">
        {/* Status / Feedback Banner */}
        {statusNotice && (
          <div className="flex items-center justify-between gap-3 px-3.5 py-2 rounded-lg bg-amber-500/10 border border-amber-500/25 text-xs font-mono text-amber-200 animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
              <span>{statusNotice}</span>
            </div>
            <button
              onClick={() => setStatusNotice(null)}
              className="text-amber-400/80 hover:text-white cursor-pointer px-1 text-sm leading-none"
            >
              ✕
            </button>
          </div>
        )}

        {/* Mode 1: Tab & Score Studio (AlphaTab + ASCII Reader) */}
        {studioMode === "tab_reader" ? (
          <section
            aria-label="Guitar Tab Reader and Playback Studio"
            className="animate-in fade-in duration-200"
          >
            <TabReaderStudio
              onSendToArrangement={(tab, title) => {
                setAnalysisData((prev) => ({
                  ...prev,
                  metadata: { ...prev.metadata, filename: title },
                  tablature: tab,
                }));
                setStudioMode("upload_analysis");
                setStatusNotice(`Imported "${title}" into AI Studio Analysis`);
              }}
            />
          </section>
        ) : studioMode === "stem_splitter" ? (
          /* Mode 2: Stem Splitter & Multi-Track Mixer */
          <section
            aria-label="AI Stem Splitter and Multi-Track Mixer"
            className="animate-in fade-in duration-200"
          >
            <StemSplitterStudio
              initialFile={uploadedFile}
              onSendToTabReader={(title) => {
                setStudioMode("tab_reader");
                setStatusNotice(`Ready to transcribe isolated guitar stem: "${title}"`);
              }}
            />
          </section>
        ) : studioMode === "live_mic" ? (
          /* Mode 3: Live Mic Studio */
          <LiveMicStudio mockMode={mockMode} />
        ) : uploadState.isUploading ? (
          /* Pipeline Processing Stepper */
          <section
            aria-label="Real-Time AI Pipeline Progress Stepper"
            className="animate-in fade-in duration-200 space-y-4"
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
          /* Mode 4: AI Transcribe & Workspace Tabs */
          <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-200">
            {/* Optional Collapsible Audio Upload Zone */}
            {showUploadZone && (
              <section
                aria-label="Audio Upload Zone"
                className="animate-in fade-in duration-200"
              >
                <div className="flex items-center justify-between pb-2">
                  <span className="text-xs font-mono font-medium text-zinc-400">
                    Upload Audio File (.MP3, .WAV)
                  </span>
                  <button
                    onClick={() => setShowUploadZone(false)}
                    className="text-xs font-mono text-zinc-500 hover:text-zinc-300 cursor-pointer"
                  >
                    Close Dropzone ✕
                  </button>
                </div>
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
            )}

            {/* 1. Track Deck Header (Unified Status & Action Bar) */}
            <div className="rounded-xl border border-white/[0.08] bg-zinc-900/60 p-3 sm:p-4 backdrop-blur-md">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Left: Song Meta Pills */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-800/80 border border-white/[0.06] text-xs font-mono text-zinc-200">
                    <Music2 className="w-3.5 h-3.5 text-amber-400" />
                    <span className="font-semibold truncate max-w-[180px] sm:max-w-xs">
                      {uploadedFile?.name || analysisData.metadata.filename}
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-950/60 border border-white/[0.06] text-xs font-mono text-amber-300">
                    <KeyRound className="w-3 h-3 text-amber-400" />
                    {analysisData.metadata.key}
                  </span>

                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-950/60 border border-white/[0.06] text-xs font-mono text-zinc-300">
                    <Activity className="w-3 h-3 text-sky-400" />
                    {Math.round(analysisData.metadata.bpm)} BPM
                  </span>

                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-950/60 border border-white/[0.06] text-xs font-mono text-zinc-300">
                    <Clock className="w-3 h-3 text-zinc-400" />
                    {Math.floor(analysisData.metadata.duration / 60)}:
                    {Math.floor(analysisData.metadata.duration % 60)
                      .toString()
                      .padStart(2, "0")}
                  </span>

                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-950/60 border border-white/[0.06] text-xs font-mono text-emerald-400">
                    <CheckCircle className="w-3 h-3" />
                    {(averageConfidence * 100).toFixed(0)}% AI Conf
                  </span>
                </div>

                {/* Right: Quick Action Triggers */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowUploadZone((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/[0.08] bg-zinc-800/80 hover:bg-zinc-700 text-xs font-mono text-zinc-200 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <Upload className="w-3.5 h-3.5 text-amber-400" />
                    <span>{showUploadZone ? "Hide Upload" : "Upload File"}</span>
                  </button>

                  <button
                    onClick={handleSimulatePipeline}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-mono font-medium text-amber-300 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span className="hidden sm:inline">Simulate AI Pipeline</span>
                    <span className="sm:hidden">Simulate</span>
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Audio Player Timeline (Scrubber & Synchronized Chords) */}
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

            {/* 3. Modern Workspace Sub-Tabs Switcher (Anti-Slop Segmented Bar) */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-1">
              <div className="flex items-center gap-1 bg-zinc-900/80 border border-white/[0.08] rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => setSubTab("tablature")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all active:scale-[0.98] cursor-pointer ${
                    subTab === "tablature"
                      ? "bg-zinc-800 text-zinc-100 border border-white/[0.08] shadow-sm font-semibold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>Tablature &amp; Notation</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSubTab("arrangements")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all active:scale-[0.98] cursor-pointer ${
                    subTab === "arrangements"
                      ? "bg-zinc-800 text-zinc-100 border border-white/[0.08] shadow-sm font-semibold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Layers className="w-3.5 h-3.5 text-sky-400" />
                  <span>AI Arrangement Studio</span>
                  <span className="rounded bg-zinc-700 px-1 py-0.2 text-[9px] font-mono text-zinc-300">
                    {(analysisData.arrangements || []).length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setSubTab("fretboard")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all active:scale-[0.98] cursor-pointer ${
                    subTab === "fretboard"
                      ? "bg-zinc-800 text-zinc-100 border border-white/[0.08] shadow-sm font-semibold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Music2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Fretboard &amp; Voicings</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSubTab("intelligence")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium transition-all active:scale-[0.98] cursor-pointer ${
                    subTab === "intelligence"
                      ? "bg-zinc-800 text-zinc-100 border border-white/[0.08] shadow-sm font-semibold"
                      : "text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Activity className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Song Intelligence</span>
                </button>
              </div>

              <div className="hidden lg:flex items-center gap-2 text-xs font-mono text-zinc-500">
                <span>Chord: <strong className="text-amber-400">{selectedVoicingChord}</strong></span>
                <span>•</span>
                <span>Tuning: <strong className="text-zinc-300">{(analysisData.tablature?.tuning || ["E2","A2","D3","G3","B3","E4"]).join(" ")}</strong></span>
              </div>
            </div>

            {/* 4. Active Sub-Tab Content Deck */}
            {subTab === "tablature" && (
              <section
                aria-label="Interactive Guitar Tablature Viewer and Editor"
                className="animate-in fade-in duration-150"
              >
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
            )}

            {subTab === "arrangements" && (
              <section
                aria-label="AI Guitar Arrangement Studio Panel"
                className="animate-in fade-in duration-150"
              >
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
            )}

            {subTab === "fretboard" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* 12-Fret Horizontal Fretboard Neck Visualizer */}
                <section aria-label="Full Guitar Fretboard Neck Visualizer">
                  <GuitarFretboard chordName={selectedVoicingChord || "G"} />
                </section>

                {/* Two-Column Studio Section: Improvisation Coach + Chord Voicing Diagram */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
              </div>
            )}

            {subTab === "intelligence" && (
              <div className="space-y-4 animate-in fade-in duration-150">
                {/* Song Metadata Summary Card */}
                <section aria-label="Song Metadata Summary">
                  <MetadataCard
                    metadata={analysisData.metadata}
                    chordsCount={analysisData.chords.length}
                    averageConfidence={averageConfidence}
                    isPlaying={isPlaying}
                  />
                </section>

                {/* Pipeline Diagnostics Details */}
                {uploadState.currentEvent && uploadState.currentEvent.steps && (
                  <div className="rounded-xl border border-white/[0.08] bg-zinc-900/60 p-4">
                    <h3 className="text-xs font-mono font-semibold text-zinc-300 mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-400" />
                      5-Stage Neural Pipeline Execution Details
                    </h3>
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
                )}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Studio Footer */}
      <footer className="border-t border-white/[0.08] bg-zinc-950/80 py-3.5 mt-8 pb-safe">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs font-mono text-zinc-500 text-center sm:text-left">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0 animate-pulse" />
            <span className="text-zinc-300 font-medium">Arpegia Studio</span>
            <span className="text-zinc-700 hidden sm:inline">•</span>
            <span className="hidden md:inline text-zinc-400">
              Anti-Slop Professional DAW Architecture • 60fps Edge DSP
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-2 text-[11px]">
            <span>
              API:{" "}
              <code className="text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-white/[0.06]">
                {api.getHttpBaseUrl()}
              </code>
            </span>
            <span>
              WS:{" "}
              <code className="text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-white/[0.06]">
                {api.getWsBaseUrl()}/ws/live-chord
              </code>
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
