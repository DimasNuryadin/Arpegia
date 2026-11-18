"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  Volume2,
  VolumeX,
  Play,
  Pause,
  Download,
  RotateCcw,
  Sparkles,
  Sliders,
  Radio,
  FileAudio,
  CheckCircle2,
  Music2,
  Mic,
  Disc3,
  Layers,
  Activity,
  Cpu,
  Info,
  ChevronDown,
  ExternalLink,
} from "lucide-react";

export interface StemTrack {
  id: "guitar" | "vocals" | "drums" | "bass" | "other";
  name: string;
  icon: string;
  color: string;
  accentHex: string;
  volume: number; // 0 to 1
  pan: number; // -1 (Left) to 1 (Right)
  isMuted: boolean;
  isSolo: boolean;
  activityLevel: number; // 0 to 1 for live VU meter
}

const INITIAL_STEMS: StemTrack[] = [
  {
    id: "guitar",
    name: "Guitar (Acoustic / Electric)",
    icon: "🎸",
    color: "amber",
    accentHex: "#f59e0b",
    volume: 0.95,
    pan: -0.2,
    isMuted: false,
    isSolo: false,
    activityLevel: 0.85,
  },
  {
    id: "vocals",
    name: "Vocals (Lead & Harmonies)",
    icon: "🎤",
    color: "sky",
    accentHex: "#0ea5e9",
    volume: 0.9,
    pan: 0,
    isMuted: false,
    isSolo: false,
    activityLevel: 0.78,
  },
  {
    id: "drums",
    name: "Drums & Percussion",
    icon: "🥁",
    color: "rose",
    accentHex: "#f43f5e",
    volume: 0.85,
    pan: 0,
    isMuted: false,
    isSolo: false,
    activityLevel: 0.92,
  },
  {
    id: "bass",
    name: "Bass Guitar & Sub",
    icon: "⚡",
    color: "indigo",
    accentHex: "#6366f1",
    volume: 0.85,
    pan: 0,
    isMuted: false,
    isSolo: false,
    activityLevel: 0.7,
  },
  {
    id: "other",
    name: "Keys, Synths & Ambience",
    icon: "🎹",
    color: "emerald",
    accentHex: "#10b981",
    volume: 0.75,
    pan: 0.25,
    isMuted: false,
    isSolo: false,
    activityLevel: 0.65,
  },
];

type SeparationModel = "htdemucs_6s" | "mel_band_roformer" | "ensemble_hybrid";

interface StemSplitterStudioProps {
  initialFile?: File | null;
  onSendToTabReader?: (title: string) => void;
}

export function StemSplitterStudio({
  initialFile,
  onSendToTabReader,
}: StemSplitterStudioProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(initialFile || null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [separationComplete, setSeparationComplete] = useState(true); // Default ready with demo stems
  const [selectedModel, setSelectedModel] = useState<SeparationModel>("htdemucs_6s");
  const [showTechSpecs, setShowTechSpecs] = useState(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(128.4);
  const [masterVolume, setMasterVolume] = useState(0.9);

  // Multi-track stems
  const [stems, setStems] = useState<StemTrack[]>(INITIAL_STEMS);

  // Audio Context & oscillator simulation for multi-track preview
  const audioCtxRef = useRef<AudioContext | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Check if any track is soloed
  const hasActiveSolo = useMemo(() => stems.some((s) => s.isSolo), [stems]);

  // Master effective volume for track
  const getEffectiveGain = useCallback(
    (track: StemTrack) => {
      if (hasActiveSolo) {
        return track.isSolo && !track.isMuted ? track.volume * masterVolume : 0;
      }
      return track.isMuted ? 0 : track.volume * masterVolume;
    },
    [hasActiveSolo, masterVolume]
  );

  // Playback loop with live simulated VU meters
  useEffect(() => {
    let lastTime = performance.now();

    const loop = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;

      if (isPlaying) {
        setCurrentTime((prev) => {
          const next = prev + dt;
          if (next >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });

        // Simulate lively VU activity based on time and effective gain
        setStems((prev) =>
          prev.map((track, i) => {
            const gain = getEffectiveGain(track);
            if (gain === 0) {
              return { ...track, activityLevel: 0 };
            }
            const wobble = Math.sin(now * 0.008 + i * 1.5) * 0.25;
            const beat = (Math.sin(now * 0.012) + 1) * 0.3;
            const level = Math.max(0.05, Math.min(1, (0.55 + wobble + beat) * gain));
            return { ...track, activityLevel: level };
          })
        );
      } else {
        // Idle meters
        setStems((prev) =>
          prev.map((track) => ({ ...track, activityLevel: 0 }))
        );
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, duration, getEffectiveGain]);

  const togglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setCurrentTime(ratio * duration);
  };

  const handleToggleMute = (id: string) => {
    setStems((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isMuted: !s.isMuted } : s))
    );
  };

  const handleToggleSolo = (id: string) => {
    setStems((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isSolo: !s.isSolo } : s))
    );
  };

  const handleVolumeChange = (id: string, val: number) => {
    setStems((prev) =>
      prev.map((s) => (s.id === id ? { ...s, volume: val } : s))
    );
  };

  const handlePanChange = (id: string, val: number) => {
    setStems((prev) =>
      prev.map((s) => (s.id === id ? { ...s, pan: val } : s))
    );
  };

  // Solo guitar (isolate guitar for practice)
  const handleQuickSoloGuitar = () => {
    setStems((prev) =>
      prev.map((s) => ({
        ...s,
        isSolo: s.id === "guitar",
        isMuted: false,
      }))
    );
  };

  // Backing track mode (Mute guitar, keep everything else)
  const handleQuickBackingTrack = () => {
    setStems((prev) =>
      prev.map((s) => ({
        ...s,
        isSolo: false,
        isMuted: s.id === "guitar",
      }))
    );
  };

  // Reset all mutes and solos
  const handleResetMixer = () => {
    setStems((prev) =>
      prev.map((s) => ({
        ...s,
        isSolo: false,
        isMuted: false,
        volume: 0.85,
        pan: 0,
      }))
    );
  };

  // Simulate file upload and stem separation
  const handleFileUpload = (file: File) => {
    setSelectedFile(file);
    setIsProcessing(true);
    setProcessProgress(0);
    setSeparationComplete(false);

    let p = 0;
    const interval = setInterval(() => {
      p += 5;
      setProcessProgress(Math.min(100, p));
      if (p >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setIsProcessing(false);
          setSeparationComplete(true);
        }, 500);
      }
    }, 150);
  };

  // Download a single stem or mix
  const handleDownloadTrack = (stemName: string) => {
    const trackTitle = selectedFile?.name ? selectedFile.name.replace(/\.[^/.]+$/, "") : "arpegia_song";
    const filename = `${trackTitle}_[${stemName.toLowerCase().replace(/[^a-z0-9]/g, "_")}].wav`;

    // Simulated file download trigger
    const dummyBlob = new Blob([`Arpegia High-Res Stem Export: ${stemName}`], {
      type: "audio/wav",
    });
    const url = URL.createObjectURL(dummyBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}.${ms}`;
  };

  return (
    <div className="w-full space-y-5 animate-in fade-in duration-200">
      {/* 1. Studio Header & Engine Architecture Banner */}
      <div className="rounded-xl border border-white/[0.08] bg-zinc-900/60 p-4 sm:p-5 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400">
                <Sliders className="h-4 w-4" />
              </div>
              <h1 className="text-base sm:text-lg font-semibold tracking-tight text-zinc-100 font-mono">
                AI STEM SPLITTER &amp; MULTI-TRACK MIXER
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Meta HTDemucs 6-Stem Engine
              </span>
            </div>
            <p className="text-xs text-zinc-400 max-w-2xl">
              Pisahkan audio musik menjadi trek terisolasi (Gitar, Vokal, Drum, Bass, Keyboard). Mainkan solo gitar untuk latihan, matikan vokal untuk karaoke, atau buat backing track tanpa gitar.
            </p>
          </div>

          {/* Model selector & tech specs toggle */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-white/[0.08] bg-zinc-950/80 p-1 text-xs font-mono">
              <span className="px-2 text-zinc-400 text-[11px]">Model:</span>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value as SeparationModel)}
                className="bg-transparent text-zinc-200 text-xs font-medium focus:outline-none cursor-pointer pr-2"
                aria-label="Separation AI Model"
              >
                <option value="htdemucs_6s" className="bg-zinc-900">
                  HTDemucs 6s (Guitar Focused • Meta AI)
                </option>
                <option value="mel_band_roformer" className="bg-zinc-900">
                  Mel-Band Roformer (SDR Leader #1)
                </option>
                <option value="ensemble_hybrid" className="bg-zinc-900">
                  Ensemble Hybrid (Roformer + HTDemucs)
                </option>
              </select>
            </div>

            <button
              onClick={() => setShowTechSpecs((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-zinc-900/80 px-2.5 py-1.5 text-xs font-mono text-zinc-300 transition-all hover:bg-zinc-800 hover:text-zinc-100 active:scale-[0.98] cursor-pointer"
            >
              <Info className="h-3.5 w-3.5 text-amber-400" />
              <span>Specs</span>
              <ChevronDown
                className={`h-3 w-3 text-zinc-400 transition-transform ${
                  showTechSpecs ? "rotate-180" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* Expandable Tech Specs details */}
        {showTechSpecs && (
          <div className="mt-4 pt-4 border-t border-white/[0.08] grid grid-cols-1 md:grid-cols-3 gap-3 text-xs font-mono text-zinc-400 animate-in fade-in duration-150">
            <div className="rounded-lg bg-zinc-950/70 border border-white/[0.06] p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-amber-400 font-medium">
                <Sparkles className="h-3.5 w-3.5" />
                <span>HTDemucs 6-Stem (Meta AI)</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Arsitektur Hybrid Transformer v4 terlatih khusus memisahkan <strong>Guitar</strong> dan <strong>Piano</strong> secara terpisah, bukan digabung ke kategori &quot;Other&quot; seperti model 4-stem biasa.
              </p>
            </div>

            <div className="rounded-lg bg-zinc-950/70 border border-white/[0.06] p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-sky-400 font-medium">
                <Activity className="h-3.5 w-3.5" />
                <span>Mel-Band Roformer (ByteDance)</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Peringkat #1 pada Sound Demixing Challenge (SDR &gt; 12.8 dB). Menghasilkan isolasi vokal dan drum yang sangat jernih tanpa artefak suara robotik atau bleeding.
              </p>
            </div>

            <div className="rounded-lg bg-zinc-950/70 border border-white/[0.06] p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <Cpu className="h-3.5 w-3.5" />
                <span>Multi-Gain DSP Audio Pipeline</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Streaming Web Audio API dengan 5 bus gain sinkron 60fps. Mute, Solo, dan fader volume bekerja secara instan tanpa jeda re-buffering.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. File Ingestion & Processing Bar */}
      <div className="rounded-xl border border-white/[0.08] bg-zinc-900/60 p-4 backdrop-blur-md">
        <input
          ref={fileInputRef}
          type="file"
          accept="audio/*,.mp3,.wav,.flac,.m4a"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files[0]) {
              handleFileUpload(e.target.files[0]);
            }
          }}
        />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-800/80 border border-white/[0.06] text-zinc-300">
              <FileAudio className="h-5 w-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-semibold text-zinc-200">
                  {selectedFile ? selectedFile.name : "Demo Song: Neo-Soul Fingerstyle Jam (G Major)"}
                </span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-mono text-zinc-400">
                  44.1kHz • 24-bit
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 font-mono">
                {selectedFile
                  ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB • Audio Uploaded`
                  : "Pre-loaded studio multitrack stems ready for isolation"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-zinc-800/80 px-3 py-1.5 text-xs font-medium text-zinc-200 transition-all hover:bg-zinc-700 active:scale-[0.98] cursor-pointer"
            >
              <FileAudio className="h-3.5 w-3.5 text-amber-400" />
              <span>Upload New Song</span>
            </button>

            {/* Quick Preset Presets */}
            <button
              onClick={handleQuickSoloGuitar}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-mono font-medium text-amber-300 transition-all hover:bg-amber-500/20 active:scale-[0.98] cursor-pointer"
            >
              <span>🎸 Solo Guitar</span>
            </button>

            <button
              onClick={handleQuickBackingTrack}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-xs font-mono font-medium text-sky-300 transition-all hover:bg-sky-500/20 active:scale-[0.98] cursor-pointer"
            >
              <span>🎙️ Backing Track (No Guitar)</span>
            </button>

            <button
              onClick={handleResetMixer}
              title="Reset all mutes & solos"
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-zinc-800/60 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 active:scale-95 cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Processing Progress */}
        {isProcessing && (
          <div className="mt-4 pt-4 border-t border-white/[0.08] space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-zinc-300 flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                Separating Stems with {selectedModel === "htdemucs_6s" ? "HTDemucs 6s" : "Mel-Band Roformer"}...
              </span>
              <span className="text-amber-400 font-semibold">{processProgress}%</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500 transition-all duration-150"
                style={{ width: `${processProgress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. Master Transport & Scrub Bar */}
      <div className="rounded-xl border border-white/[0.08] bg-zinc-900/60 p-4 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-3">
          {/* Play/Pause & Time */}
          <div className="flex items-center gap-3">
            <button
              onClick={togglePlay}
              className="flex h-10 w-10 items-center justify-center rounded-lg bg-zinc-100 text-zinc-950 font-bold shadow-sm transition-transform active:scale-95 hover:bg-white cursor-pointer"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="h-5 w-5 fill-current" /> : <Play className="h-5 w-5 fill-current ml-0.5" />}
            </button>

            <div>
              <div className="text-sm font-mono font-semibold text-zinc-100">
                {formatTime(currentTime)}{" "}
                <span className="text-zinc-500 font-normal">/ {formatTime(duration)}</span>
              </div>
              <div className="text-[10px] font-mono text-zinc-400">
                {isPlaying ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Synchronized 5-Track DSP Engine
                  </span>
                ) : (
                  "Ready • Spacebar to toggle"
                )}
              </div>
            </div>
          </div>

          {/* Master Volume & Global Actions */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-zinc-950/80 border border-white/[0.08] px-3 py-1.5 rounded-lg">
              <Volume2 className="h-4 w-4 text-zinc-400" />
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={masterVolume}
                onChange={(e) => setMasterVolume(parseFloat(e.target.value))}
                className="w-20 accent-amber-500 cursor-pointer"
                aria-label="Master Volume"
              />
              <span className="text-xs font-mono text-zinc-300 w-8 text-right">
                {Math.round(masterVolume * 100)}%
              </span>
            </div>

            {/* Quick Export Master Backing Track */}
            <button
              onClick={() => handleDownloadTrack("Backing_Track_Minus_Guitar")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 text-xs font-mono font-medium text-emerald-300 hover:bg-emerald-500/25 active:scale-[0.98] cursor-pointer"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Backing Track</span>
            </button>
          </div>
        </div>

        {/* Master Scrubber Bar */}
        <div
          onClick={handleSeek}
          className="group relative h-4 w-full cursor-pointer flex items-center"
        >
          <div className="h-1.5 w-full rounded-full bg-zinc-800/80 group-hover:h-2 transition-all">
            <div
              className="relative h-full rounded-full bg-gradient-to-r from-amber-500 via-rose-500 to-indigo-500"
              style={{ width: `${(currentTime / duration) * 100}%` }}
            >
              <div className="absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-zinc-950 bg-white shadow-md transition-transform group-hover:scale-125" />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Multi-Track Mixer Strips (5 Stems) */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-mono font-medium uppercase tracking-wider text-zinc-400">
            Isolated Stems Deck ({stems.length} Tracks)
          </span>
          <span className="text-xs font-mono text-zinc-500">
            Click [M] to Mute • [S] to Solo • Download individual WAVs
          </span>
        </div>

        {stems.map((track) => {
          const effectiveGain = getEffectiveGain(track);
          const isSilent = effectiveGain === 0;

          return (
            <div
              key={track.id}
              className={`rounded-xl border transition-all p-3 sm:p-4 backdrop-blur-sm ${
                track.isSolo
                  ? "border-amber-500/40 bg-zinc-900/90 shadow-md shadow-amber-500/5"
                  : track.isMuted
                  ? "border-white/[0.04] bg-zinc-950/40 opacity-60"
                  : "border-white/[0.08] bg-zinc-900/60 hover:border-white/[0.14]"
              }`}
            >
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 md:gap-4 items-center">
                {/* Column 1: Track Identity & Icon (3 cols) */}
                <div className="md:col-span-3 flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-lg border text-base flex-shrink-0"
                    style={{
                      borderColor: `${track.accentHex}40`,
                      backgroundColor: `${track.accentHex}15`,
                    }}
                  >
                    <span>{track.icon}</span>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono font-semibold text-zinc-200 truncate">
                        {track.name}
                      </span>
                    </div>
                    <div className="text-[10px] font-mono text-zinc-500 flex items-center gap-1">
                      <span>ID: {track.id}</span>
                      <span>•</span>
                      <span style={{ color: track.accentHex }}>
                        {track.id === "guitar" ? "HTDemucs 6s Isolated" : "Direct Stem"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Column 2: Mute / Solo Buttons & Live VU Meter (3 cols) */}
                <div className="md:col-span-3 flex items-center gap-2">
                  {/* Mute Button */}
                  <button
                    onClick={() => handleToggleMute(track.id)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-mono font-bold transition-all active:scale-90 cursor-pointer ${
                      track.isMuted
                        ? "bg-rose-500 text-white shadow-md shadow-rose-500/30"
                        : "bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 border border-white/[0.08]"
                    }`}
                    title={track.isMuted ? "Unmute track" : "Mute track"}
                  >
                    M
                  </button>

                  {/* Solo Button */}
                  <button
                    onClick={() => handleToggleSolo(track.id)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-mono font-bold transition-all active:scale-90 cursor-pointer ${
                      track.isSolo
                        ? "bg-amber-400 text-zinc-950 shadow-md shadow-amber-400/30"
                        : "bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 border border-white/[0.08]"
                    }`}
                    title={track.isSolo ? "Deactivate Solo" : "Solo track"}
                  >
                    S
                  </button>

                  {/* Live VU Meter Bar */}
                  <div className="flex-1 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                      <span>VU</span>
                      <span className="text-zinc-400">
                        {isSilent ? "-inf" : `${(track.activityLevel * -3).toFixed(1)}dB`}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded bg-zinc-950 overflow-hidden border border-white/[0.06] flex gap-0.5 p-0.5">
                      <div
                        className="h-full rounded transition-all duration-75"
                        style={{
                          width: `${track.activityLevel * 100}%`,
                          backgroundColor:
                            track.activityLevel > 0.85
                              ? "#ef4444"
                              : track.activityLevel > 0.65
                              ? "#f59e0b"
                              : track.accentHex,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Column 3: Volume & Pan Faders (4 cols) */}
                <div className="md:col-span-4 flex items-center gap-3">
                  {/* Volume Fader */}
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Volume2 className="h-3 w-3" /> Vol
                      </span>
                      <span>{Math.round(track.volume * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={track.volume}
                      disabled={track.isMuted}
                      onChange={(e) =>
                        handleVolumeChange(track.id, parseFloat(e.target.value))
                      }
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-200 disabled:opacity-30"
                      aria-label={`${track.name} Volume`}
                    />
                  </div>

                  {/* Pan Fader */}
                  <div className="w-20 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-400">
                      <span>Pan</span>
                      <span>
                        {track.pan === 0
                          ? "C"
                          : track.pan < 0
                          ? `L${Math.round(Math.abs(track.pan) * 50)}`
                          : `R${Math.round(track.pan * 50)}`}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="-1"
                      max="1"
                      step="0.05"
                      value={track.pan}
                      disabled={track.isMuted}
                      onChange={(e) =>
                        handlePanChange(track.id, parseFloat(e.target.value))
                      }
                      className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-zinc-400 disabled:opacity-30"
                      aria-label={`${track.name} Pan`}
                    />
                  </div>
                </div>

                {/* Column 4: Download Stem Button (2 cols) */}
                <div className="md:col-span-2 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleDownloadTrack(track.id)}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-zinc-800/80 px-2.5 py-1.5 text-xs font-mono text-zinc-300 hover:text-zinc-100 hover:bg-zinc-700 active:scale-[0.98] cursor-pointer"
                    title={`Download isolated ${track.name} WAV`}
                  >
                    <Download className="h-3 w-3 text-amber-400" />
                    <span>Stem WAV</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 5. Master Actions & Integration Hub */}
      <div className="rounded-xl border border-white/[0.08] bg-zinc-900/60 p-4 sm:p-5 backdrop-blur-md flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="space-y-0.5 text-center sm:text-left">
          <div className="text-xs font-mono font-medium text-zinc-200">
            Export Master Bundle or Jam Along
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">
            Download individual isolated stems or export entire package as zip
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleDownloadTrack("All_Stems_Bundle")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-zinc-100 px-3.5 py-2 text-xs font-mono font-bold text-zinc-950 transition-all hover:bg-white active:scale-[0.98] cursor-pointer shadow-sm"
          >
            <Download className="h-3.5 w-3.5 text-zinc-950" />
            <span>Download All Stems (.ZIP)</span>
          </button>

          {onSendToTabReader && (
            <button
              onClick={() => onSendToTabReader(selectedFile?.name || "Isolated Guitar Track")}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-mono font-medium text-amber-300 transition-all hover:bg-amber-500/20 active:scale-[0.98] cursor-pointer"
            >
              <Music2 className="h-3.5 w-3.5" />
              <span>Transcribe Guitar Stem to Tab</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
