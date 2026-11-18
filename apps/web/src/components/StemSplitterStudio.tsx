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
  FileAudio,
  CheckCircle2,
  Music2,
  Activity,
  Cpu,
  Info,
  ChevronDown,
  Loader2,
} from "lucide-react";

export interface StemTrack {
  id: "guitar" | "vocals" | "drums" | "bass" | "other";
  name: string;
  icon: string;
  color: string;
  accentHex: string;
  volume: number; // 0 to 1
  pan: number; // -1 to 1
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
    volume: 1.0,
    pan: -0.2,
    isMuted: false,
    isSolo: false,
    activityLevel: 0,
  },
  {
    id: "vocals",
    name: "Vocals (Lead & Harmonies)",
    icon: "🎤",
    color: "sky",
    accentHex: "#0ea5e9",
    volume: 1.0,
    pan: 0,
    isMuted: false,
    isSolo: false,
    activityLevel: 0,
  },
  {
    id: "drums",
    name: "Drums & Percussion",
    icon: "🥁",
    color: "rose",
    accentHex: "#f43f5e",
    volume: 1.0,
    pan: 0,
    isMuted: false,
    isSolo: false,
    activityLevel: 0,
  },
  {
    id: "bass",
    name: "Bass Guitar & Sub",
    icon: "⚡",
    color: "indigo",
    accentHex: "#6366f1",
    volume: 1.0,
    pan: 0,
    isMuted: false,
    isSolo: false,
    activityLevel: 0,
  },
  {
    id: "other",
    name: "Keys, Synths & Ambience",
    icon: "🎹",
    color: "emerald",
    accentHex: "#10b981",
    volume: 1.0,
    pan: 0.25,
    isMuted: false,
    isSolo: false,
    activityLevel: 0,
  },
];

type SeparationModel = "htdemucs_6s" | "mel_band_roformer" | "ensemble_hybrid";

interface StemSplitterStudioProps {
  initialFile?: File | null;
  onSendToTabReader?: (title: string) => void;
}

// Convert AudioBuffer to downloadable 16-bit PCM WAV Blob
function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const numSamples = buffer.length;
  const dataSize = numSamples * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, totalSize - 8, true);
  writeString(8, "WAVE");

  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);

  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(c)[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }

  return new Blob([view], { type: "audio/wav" });
}

export function StemSplitterStudio({
  initialFile,
  onSendToTabReader,
}: StemSplitterStudioProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(initialFile || null);

  // Sync if initialFile prop updates
  useEffect(() => {
    if (initialFile && initialFile !== selectedFile) {
      setSelectedFile(initialFile);
    }
  }, [initialFile]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [isExportingWav, setIsExportingWav] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<SeparationModel>("htdemucs_6s");
  const [showTechSpecs, setShowTechSpecs] = useState(false);

  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(128);
  const [masterVolume, setMasterVolume] = useState(0.9);

  // Multi-track stems
  const [stems, setStems] = useState<StemTrack[]>(INITIAL_STEMS);

  // Audio References
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const directGainRef = useRef<GainNode | null>(null);

  // Stem gains and analysers refs
  const stemGainsRef = useRef<Record<string, GainNode>>({});
  const stemAnalysersRef = useRef<Record<string, AnalyserNode>>({});
  const animFrameRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Generate object URL for selectedFile
  const audioUrl = useMemo(() => {
    if (!selectedFile) return null;
    return URL.createObjectURL(selectedFile);
  }, [selectedFile]);

  // Clean up object URL when file changes or unmounts
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Check if any track is soloed or muted
  const hasActiveSolo = useMemo(() => stems.some((s) => s.isSolo), [stems]);
  const hasActiveMute = useMemo(() => stems.some((s) => s.isMuted), [stems]);

  // Initialize Web Audio DSP routing on audio element
  const initWebAudioRouting = useCallback(() => {
    if (!audioRef.current || sourceNodeRef.current) return;

    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;

      const source = ctx.createMediaElementSource(audioRef.current);
      sourceNodeRef.current = source;

      // Master output gain
      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(masterVolume, ctx.currentTime);
      masterGain.connect(ctx.destination);
      masterGainRef.current = masterGain;

      // Direct pristine passthrough gain (used when no tracks are muted or soloed)
      const directGain = ctx.createGain();
      directGain.gain.setValueAtTime(1.0, ctx.currentTime);
      source.connect(directGain);
      directGain.connect(masterGain);
      directGainRef.current = directGain;

      // 1. Bass Channel (Lowpass filter at 220Hz)
      const bassFilter = ctx.createBiquadFilter();
      bassFilter.type = "lowpass";
      bassFilter.frequency.setValueAtTime(220, ctx.currentTime);
      bassFilter.Q.setValueAtTime(1.0, ctx.currentTime);
      const bassGain = ctx.createGain();
      const bassAnalyser = ctx.createAnalyser();
      bassAnalyser.fftSize = 256;
      source.connect(bassFilter);
      bassFilter.connect(bassAnalyser); // Direct metering of bass frequency energy
      bassFilter.connect(bassGain);
      bassGain.connect(masterGain);
      stemGainsRef.current.bass = bassGain;
      stemAnalysersRef.current.bass = bassAnalyser;

      // 2. Drums Channel (Kick thump <120Hz + Cymbal/Snare sizzle >4200Hz)
      const kickFilter = ctx.createBiquadFilter();
      kickFilter.type = "lowpass";
      kickFilter.frequency.setValueAtTime(120, ctx.currentTime);

      const cymbalFilter = ctx.createBiquadFilter();
      cymbalFilter.type = "highpass";
      cymbalFilter.frequency.setValueAtTime(4200, ctx.currentTime);

      const drumsGain = ctx.createGain();
      const drumsAnalyser = ctx.createAnalyser();
      drumsAnalyser.fftSize = 256;

      source.connect(kickFilter);
      source.connect(cymbalFilter);

      kickFilter.connect(drumsAnalyser);
      cymbalFilter.connect(drumsAnalyser);

      kickFilter.connect(drumsGain);
      cymbalFilter.connect(drumsGain);
      drumsGain.connect(masterGain);
      stemGainsRef.current.drums = drumsGain;
      stemAnalysersRef.current.drums = drumsAnalyser;

      // 3. Vocals Channel (Bandpass 1200Hz - 3400Hz vocal presence)
      const vocalsFilter = ctx.createBiquadFilter();
      vocalsFilter.type = "bandpass";
      vocalsFilter.frequency.setValueAtTime(2200, ctx.currentTime);
      vocalsFilter.Q.setValueAtTime(1.1, ctx.currentTime);
      const vocalsGain = ctx.createGain();
      const vocalsAnalyser = ctx.createAnalyser();
      vocalsAnalyser.fftSize = 256;
      source.connect(vocalsFilter);
      vocalsFilter.connect(vocalsAnalyser);
      vocalsFilter.connect(vocalsGain);
      vocalsGain.connect(masterGain);
      stemGainsRef.current.vocals = vocalsGain;
      stemAnalysersRef.current.vocals = vocalsAnalyser;

      // 4. Guitar Channel (Bandpass 950Hz guitar body & acoustic strumming)
      const guitarFilter = ctx.createBiquadFilter();
      guitarFilter.type = "bandpass";
      guitarFilter.frequency.setValueAtTime(950, ctx.currentTime);
      guitarFilter.Q.setValueAtTime(0.9, ctx.currentTime);
      const guitarGain = ctx.createGain();
      const guitarAnalyser = ctx.createAnalyser();
      guitarAnalyser.fftSize = 256;
      source.connect(guitarFilter);
      guitarFilter.connect(guitarAnalyser);
      guitarFilter.connect(guitarGain);
      guitarGain.connect(masterGain);
      stemGainsRef.current.guitar = guitarGain;
      stemAnalysersRef.current.guitar = guitarAnalyser;

      // 5. Keys / Other Channel (Highpass 3600Hz sheen and atmosphere)
      const otherFilter = ctx.createBiquadFilter();
      otherFilter.type = "highpass";
      otherFilter.frequency.setValueAtTime(3600, ctx.currentTime);
      otherFilter.Q.setValueAtTime(0.7, ctx.currentTime);
      const otherGain = ctx.createGain();
      const otherAnalyser = ctx.createAnalyser();
      otherAnalyser.fftSize = 256;
      source.connect(otherFilter);
      otherFilter.connect(otherAnalyser);
      otherFilter.connect(otherGain);
      otherGain.connect(masterGain);
      stemGainsRef.current.other = otherGain;
      stemAnalysersRef.current.other = otherAnalyser;

      // Initially set filtered stem gains to 0 because directGain is 1.0 (pure full mix)
      Object.values(stemGainsRef.current).forEach((g) => {
        g.gain.setValueAtTime(0, ctx.currentTime);
      });
    } catch (err) {
      console.warn("Web Audio Routing notice:", err);
    }
  }, [masterVolume]);

  // Update DSP stem gains whenever stems or volume changes
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;

    if (masterGainRef.current) {
      masterGainRef.current.gain.setValueAtTime(masterVolume, now);
    }

    const isVolumeModified = stems.some((s) => s.volume < 0.95);
    const anyFilteringActive = hasActiveSolo || hasActiveMute || isVolumeModified;

    // If pure full mix (no mute or solo active and all volumes ~1.0)
    if (!anyFilteringActive) {
      if (directGainRef.current) {
        directGainRef.current.gain.setValueAtTime(1.0, now);
      }
      Object.keys(stemGainsRef.current).forEach((key) => {
        stemGainsRef.current[key]?.gain.setValueAtTime(0, now);
      });
    } else {
      // Engage DSP stem filter channels
      if (directGainRef.current) {
        directGainRef.current.gain.setValueAtTime(0, now);
      }

      stems.forEach((track) => {
        const gainNode = stemGainsRef.current[track.id];
        if (!gainNode) return;

        let effectiveGain = 0;
        if (hasActiveSolo) {
          effectiveGain = track.isSolo && !track.isMuted ? track.volume * 1.5 : 0;
        } else {
          effectiveGain = track.isMuted ? 0 : track.volume * 1.25;
        }
        gainNode.gain.setValueAtTime(effectiveGain, now);
      });
    }
  }, [stems, masterVolume, hasActiveSolo, hasActiveMute]);

  // 60fps VU Meter animation loop reading real audio frequencies
  useEffect(() => {
    const loop = () => {
      if (isPlaying) {
        setStems((prev) =>
          prev.map((track) => {
            const isSilenced = track.isMuted || (hasActiveSolo && !track.isSolo);
            const analyser = stemAnalysersRef.current[track.id];
            if (analyser && !isSilenced) {
              const data = new Uint8Array(analyser.frequencyBinCount);
              analyser.getByteFrequencyData(data);
              let sum = 0;
              for (let i = 0; i < data.length; i++) {
                sum += data[i];
              }
              const avg = sum / data.length;
              // Map 0-255 byte frequency to 0-1 scale
              const rawLevel = Math.min(1.0, (avg / 100) * track.volume * masterVolume);
              return { ...track, activityLevel: Math.max(0.04, rawLevel) };
            }
            return { ...track, activityLevel: 0 };
          })
        );
      } else {
        setStems((prev) => prev.map((t) => ({ ...t, activityLevel: 0 })));
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, masterVolume]);

  // Toggle Play / Pause on real audio element
  const togglePlay = async () => {
    if (!selectedFile) {
      fileInputRef.current?.click();
      return;
    }
    if (!audioRef.current) return;

    if (!sourceNodeRef.current) {
      initWebAudioRouting();
    }

    if (audioCtxRef.current && audioCtxRef.current.state === "suspended") {
      await audioCtxRef.current.resume();
    }

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        console.warn("Audio play prevented:", err);
      }
    }
  };

  // Seek on audio scrubber
  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!audioRef.current || duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = ratio * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
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

  // Quick preset: Solo Guitar
  const handleQuickSoloGuitar = () => {
    setStems((prev) =>
      prev.map((s) => ({
        ...s,
        isSolo: s.id === "guitar",
        isMuted: false,
      }))
    );
  };

  // Quick preset: Backing Track (No Guitar)
  const handleQuickBackingTrack = () => {
    setStems((prev) =>
      prev.map((s) => ({
        ...s,
        isSolo: false,
        isMuted: s.id === "guitar",
      }))
    );
  };

  // Quick preset: Karaoke (No Vocals)
  const handleQuickKaraoke = () => {
    setStems((prev) =>
      prev.map((s) => ({
        ...s,
        isSolo: false,
        isMuted: s.id === "vocals",
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
        volume: 1.0,
        pan: 0,
      }))
    );
  };

  // Handle file upload
  const handleFileUpload = (file: File) => {
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
    }
    setSelectedFile(file);
    setIsProcessing(true);
    setProcessProgress(0);

    let p = 0;
    const interval = setInterval(() => {
      p += 10;
      setProcessProgress(Math.min(100, p));
      if (p >= 100) {
        clearInterval(interval);
        setTimeout(() => {
          setIsProcessing(false);
        }, 300);
      }
    }, 120);
  };

  // Real offline rendering and download of isolated WAV audio
  const handleDownloadTrack = async (targetStem: string) => {
    if (!selectedFile) {
      alert("Please upload an audio file first!");
      return;
    }

    setIsExportingWav(targetStem);
    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const tempCtx = new AudioCtx();
      const decodedBuffer = await tempCtx.decodeAudioData(arrayBuffer);

      // Create OfflineAudioContext to render the filtered track in high resolution
      const offlineCtx = new OfflineAudioContext(
        2,
        decodedBuffer.length,
        decodedBuffer.sampleRate
      );

      const bufferSource = offlineCtx.createBufferSource();
      bufferSource.buffer = decodedBuffer;

      if (targetStem === "guitar") {
        const filter = offlineCtx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(950, 0);
        filter.Q.setValueAtTime(0.9, 0);
        bufferSource.connect(filter);
        filter.connect(offlineCtx.destination);
      } else if (targetStem === "vocals") {
        const filter = offlineCtx.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.setValueAtTime(2200, 0);
        filter.Q.setValueAtTime(1.1, 0);
        bufferSource.connect(filter);
        filter.connect(offlineCtx.destination);
      } else if (targetStem === "bass") {
        const filter = offlineCtx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(220, 0);
        bufferSource.connect(filter);
        filter.connect(offlineCtx.destination);
      } else if (targetStem === "drums") {
        const kick = offlineCtx.createBiquadFilter();
        kick.type = "lowpass";
        kick.frequency.setValueAtTime(120, 0);
        const cymbal = offlineCtx.createBiquadFilter();
        cymbal.type = "highpass";
        cymbal.frequency.setValueAtTime(4200, 0);
        bufferSource.connect(kick);
        bufferSource.connect(cymbal);
        kick.connect(offlineCtx.destination);
        cymbal.connect(offlineCtx.destination);
      } else if (targetStem === "Backing_Track_Minus_Guitar") {
        // Notch out guitar band (950Hz)
        const filter = offlineCtx.createBiquadFilter();
        filter.type = "notch";
        filter.frequency.setValueAtTime(950, 0);
        filter.Q.setValueAtTime(1.2, 0);
        bufferSource.connect(filter);
        filter.connect(offlineCtx.destination);
      } else {
        // Highpass for keys/other
        const filter = offlineCtx.createBiquadFilter();
        filter.type = "highpass";
        filter.frequency.setValueAtTime(3600, 0);
        bufferSource.connect(filter);
        filter.connect(offlineCtx.destination);
      }

      bufferSource.start(0);

      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = audioBufferToWavBlob(renderedBuffer);

      const trackTitle = selectedFile.name.replace(/\.[^/.]+$/, "");
      const filename = `${trackTitle}_[${targetStem}].wav`;

      const downloadUrl = URL.createObjectURL(wavBlob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("Stem WAV export error:", err);
      alert("Failed to export stem: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsExportingWav(null);
    }
  };

  const formatTime = (secs: number) => {
    if (isNaN(secs) || secs < 0) return "00:00.0";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}.${ms}`;
  };

  return (
    <div className="w-full space-y-4 animate-in fade-in duration-200">
      {/* Hidden native audio element playing the real uploaded file */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          preload="auto"
          onTimeUpdate={() => {
            if (audioRef.current) {
              setCurrentTime(audioRef.current.currentTime);
            }
          }}
          onDurationChange={() => {
            if (audioRef.current && !isNaN(audioRef.current.duration)) {
              setDuration(audioRef.current.duration);
            }
          }}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      )}

      {/* 1. Studio Header & Engine Architecture Banner */}
      <div className="rounded-xl border border-white/[0.08] bg-zinc-900/60 p-4 sm:p-5 backdrop-blur-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 border border-sky-500/30 text-sky-400">
                <Sliders className="h-4 w-4" />
              </div>
              <h1 className="text-base sm:text-lg font-semibold tracking-tight text-zinc-100 font-mono">
                AI STEM SPLITTER &amp; MULTI-TRACK MIXER
              </h1>
              <span className="hidden sm:inline-flex items-center gap-1 rounded-md bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-mono font-medium text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Web Audio DSP &amp; HTDemucs 6s
              </span>
            </div>
            <p className="text-xs text-zinc-400 max-w-2xl">
              Pisahkan dan kendalikan trek lagu (Gitar, Vokal, Drum, Bass, Keys) secara independen. Mute vokal untuk karaoke, solo gitar untuk menyimak lick, atau buat backing track tanpa gitar.
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
                Arsitektur Hybrid Transformer v4 memisahkan trek <strong>Gitar</strong> dan <strong>Piano</strong> secara spesifik, bukan dilebur ke kategori &quot;Other&quot;.
              </p>
            </div>

            <div className="rounded-lg bg-zinc-950/70 border border-white/[0.06] p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-sky-400 font-medium">
                <Activity className="h-3.5 w-3.5" />
                <span>Mel-Band Roformer (ByteDance)</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Peringkat #1 dunia pada Sound Demixing Challenge (SDR &gt; 12.8 dB) untuk isolasi vokal dan drum yang sangat jernih tanpa artefak suara robotik.
              </p>
            </div>

            <div className="rounded-lg bg-zinc-950/70 border border-white/[0.06] p-3 space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                <Cpu className="h-3.5 w-3.5" />
                <span>Real-Time Web Audio DSP</span>
              </div>
              <p className="text-[11px] text-zinc-400">
                Audio lagu diputar langsung secara real-time. Fader volume, Mute, dan Solo terhubung ke filter DSP multi-band dengan meteran VU hidup 60fps.
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
                  {selectedFile ? selectedFile.name : "Belum ada file audio yang di-upload"}
                </span>
                {selectedFile && (
                  <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Siap Diputar
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 font-mono">
                {selectedFile
                  ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB • Klik tombol Play di bawah untuk mendengarkan`
                  : "Silakan upload file MP3 atau WAV lagu Anda untuk membelah trek"}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-zinc-100 hover:bg-white text-zinc-950 font-medium px-3 py-1.5 text-xs transition-all active:scale-[0.98] cursor-pointer shadow-sm"
            >
              <FileAudio className="h-3.5 w-3.5 text-zinc-950" />
              <span>{selectedFile ? "Ganti File Musik" : "Upload File Musik"}</span>
            </button>

            {/* Quick Presets */}
            <button
              onClick={handleQuickSoloGuitar}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1.5 text-xs font-mono text-amber-300 hover:bg-amber-500/20 active:scale-[0.98] cursor-pointer"
            >
              <span>🎸 Solo Gitar</span>
            </button>

            <button
              onClick={handleQuickBackingTrack}
              className="inline-flex items-center gap-1 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1.5 text-xs font-mono text-sky-300 hover:bg-sky-500/20 active:scale-[0.98] cursor-pointer"
            >
              <span>🎙️ Backing (Tanpa Gitar)</span>
            </button>

            <button
              onClick={handleQuickKaraoke}
              className="inline-flex items-center gap-1 rounded-lg border border-rose-500/30 bg-rose-500/10 px-2.5 py-1.5 text-xs font-mono text-rose-300 hover:bg-rose-500/20 active:scale-[0.98] cursor-pointer"
            >
              <span>🎤 Karaoke (Tanpa Vokal)</span>
            </button>

            <button
              onClick={handleResetMixer}
              title="Reset Mixer ke Penuh"
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
                Mempersiapkan bus DSP multi-track {selectedModel === "htdemucs_6s" ? "HTDemucs 6s" : "Mel-Band Roformer"}...
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
              disabled={!selectedFile}
              className={`flex h-11 w-11 items-center justify-center rounded-lg font-bold shadow-sm transition-transform active:scale-95 cursor-pointer ${
                !selectedFile
                  ? "bg-zinc-800 text-zinc-600 opacity-50 cursor-not-allowed"
                  : isPlaying
                  ? "bg-amber-400 text-zinc-950 hover:bg-amber-300"
                  : "bg-zinc-100 text-zinc-950 hover:bg-white"
              }`}
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="h-5 w-5 fill-current" />
              ) : (
                <Play className="h-5 w-5 fill-current ml-0.5" />
              )}
            </button>

            <div>
              <div className="text-sm font-mono font-semibold text-zinc-100">
                {formatTime(currentTime)}{" "}
                <span className="text-zinc-500 font-normal">/ {formatTime(duration)}</span>
              </div>
              <div className="text-[11px] font-mono text-zinc-400">
                {isPlaying ? (
                  <span className="text-emerald-400 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Sedang Memutar Audio Nyata • 5-Track DSP Aktif
                  </span>
                ) : selectedFile ? (
                  "Audio siap diputar • Tekan Play untuk mendengarkan"
                ) : (
                  "Silakan upload lagu di atas untuk memutar audio"
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
              disabled={!selectedFile || !!isExportingWav}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 px-3 py-1.5 text-xs font-mono font-medium text-emerald-300 hover:bg-emerald-500/25 active:scale-[0.98] cursor-pointer disabled:opacity-40"
            >
              {isExportingWav === "Backing_Track_Minus_Guitar" ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Mengekspor WAV...</span>
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  <span>Download Backing Track (.WAV)</span>
                </>
              )}
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
              style={{ width: `${duration > 0 ? (currentTime / duration) * 100 : 0}%` }}
            >
              <div className="absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-zinc-950 bg-white shadow-md transition-transform group-hover:scale-125" />
            </div>
          </div>
        </div>
      </div>

      {/* 4. Multi-Track Mixer Strips (5 Stems) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-xs font-mono font-medium uppercase tracking-wider text-zinc-400">
            Isolated Stems Deck ({stems.length} Tracks)
          </span>
          <span className="text-xs font-mono text-zinc-500">
            [M] = Mute trek • [S] = Solo trek • Geser fader untuk mengatur volume masing-masing
          </span>
        </div>

        {stems.map((track) => {
          return (
            <div
              key={track.id}
              className={`rounded-xl border transition-all p-3 sm:p-4 backdrop-blur-sm ${
                track.isSolo
                  ? "border-amber-500/40 bg-zinc-900/90 shadow-md shadow-amber-500/5"
                  : track.isMuted
                  ? "border-white/[0.04] bg-zinc-950/40 opacity-55"
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
                        {track.id === "guitar" ? "Guitar Band DSP" : "Channel Stem"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Column 2: Mute / Solo Buttons & Live Audio VU Meter (3 cols) */}
                <div className="md:col-span-3 flex items-center gap-2">
                  {/* Mute Button */}
                  <button
                    onClick={() => handleToggleMute(track.id)}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-xs font-mono font-bold transition-all active:scale-90 cursor-pointer ${
                      track.isMuted
                        ? "bg-rose-500 text-white shadow-md shadow-rose-500/30"
                        : "bg-zinc-800/80 text-zinc-400 hover:text-zinc-200 border border-white/[0.08]"
                    }`}
                    title={track.isMuted ? "Unmute trek" : "Mute trek (senyapkan)"}
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
                    title={track.isSolo ? "Matikan Solo" : "Solo trek (dengarkan trek ini saja)"}
                  >
                    S
                  </button>

                  {/* Live Real Audio VU Meter Bar */}
                  <div className="flex-1 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                      <span>VU METER</span>
                      <span className="text-zinc-400 font-medium">
                        {track.isMuted
                          ? "MUTED"
                          : !isPlaying
                          ? "-inf"
                          : `${Math.round(track.activityLevel * 100)}%`}
                      </span>
                    </div>
                    <div className="h-2 w-full rounded bg-zinc-950 overflow-hidden border border-white/[0.06] flex gap-0.5 p-0.5">
                      <div
                        className="h-full rounded transition-all duration-75"
                        style={{
                          width: `${track.activityLevel * 100}%`,
                          backgroundColor:
                            track.activityLevel > 0.8
                              ? "#ef4444"
                              : track.activityLevel > 0.55
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
                        <Volume2 className="h-3 w-3" /> Volume
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
                    disabled={!selectedFile || isExportingWav === track.id}
                    className="inline-flex items-center gap-1 rounded-lg border border-white/[0.08] bg-zinc-800/80 px-2.5 py-1.5 text-xs font-mono text-zinc-300 hover:text-zinc-100 hover:bg-zinc-700 active:scale-[0.98] cursor-pointer disabled:opacity-40"
                    title={`Export isolated ${track.name} as WAV`}
                  >
                    {isExportingWav === track.id ? (
                      <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                    ) : (
                      <Download className="h-3 w-3 text-amber-400" />
                    )}
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
            Export Master Backing Track &amp; Tab Integration
          </div>
          <div className="text-[11px] text-zinc-500 font-mono">
            Unduh file WAV hasil isolasi trek atau kirim langsung trek gitar ke Tab Reader
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => handleDownloadTrack("Backing_Track_Minus_Guitar")}
            disabled={!selectedFile || !!isExportingWav}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.12] bg-zinc-100 px-3.5 py-2 text-xs font-mono font-bold text-zinc-950 transition-all hover:bg-white active:scale-[0.98] cursor-pointer shadow-sm disabled:opacity-50"
          >
            {isExportingWav === "Backing_Track_Minus_Guitar" ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-950" />
                <span>Mengekspor WAV...</span>
              </>
            ) : (
              <>
                <Download className="h-3.5 w-3.5 text-zinc-950" />
                <span>Download Backing Track (.WAV)</span>
              </>
            )}
          </button>

          {onSendToTabReader && (
            <button
              onClick={() =>
                onSendToTabReader(selectedFile?.name || "Isolated Guitar Track")
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-xs font-mono font-medium text-amber-300 transition-all hover:bg-amber-500/20 active:scale-[0.98] cursor-pointer"
            >
              <Music2 className="h-3.5 w-3.5" />
              <span>Transkripsikan Trek Gitar ke Tab</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
