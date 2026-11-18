"use client";

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  FastForward,
  Rewind,
  Crosshair,
  ZoomIn,
  ZoomOut,
  Music4,
  Flame,
  Volume1,
} from "lucide-react";
import { ChordData } from "../types";
import { guitarSynth } from "../lib/synth";

interface AudioPlayerTimelineProps {
  chords: ChordData[];
  totalDuration: number;
  audioFile: File | null;
  onActiveChordChange?: (chord: ChordData | null) => void;
  selectedChordForVoicing?: ChordData | null;
  onSelectChordForVoicing?: (chord: ChordData) => void;
  onPlaybackTimeChange?: (currentTime: number, isPlaying: boolean) => void;
  seekRequest?: { time: number; seq: number } | null;
}

export function AudioPlayerTimeline({
  chords,
  totalDuration,
  audioFile,
  onActiveChordChange,
  selectedChordForVoicing,
  onSelectChordForVoicing,
  onPlaybackTimeChange,
  seekRequest,
}: AudioPlayerTimelineProps) {
  // Playback state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [synthAuditionEnabled, setSynthAuditionEnabled] = useState(true);

  // Timeline UI state
  const [followPlayhead, setFollowPlayhead] = useState(true);
  const [pixelsPerSecond, setPixelsPerSecond] = useState(60); // Zoom level

  // References
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastSynthChordRef = useRef<string | null>(null);
  const lastHandledSeekSeqRef = useRef<number>(0);
  const lastNotifiedTimeRef = useRef<number>(-1);

  // Derive audioUrl using useMemo
  const audioUrl = useMemo(() => {
    if (!audioFile) return null;
    return URL.createObjectURL(audioFile);
  }, [audioFile]);

  // Clean up object URL when changed or unmounted
  useEffect(() => {
    return () => {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
    };
  }, [audioUrl]);

  // Determine currently active chord based on currentTime
  const activeChord = useMemo(() => {
    if (!chords || chords.length === 0) return null;
    return (
      chords.find(
        (c) => currentTime >= c.start_time && currentTime < c.end_time
      ) ||
      (currentTime >= chords[chords.length - 1].end_time
        ? chords[chords.length - 1]
        : chords[0])
    );
  }, [chords, currentTime]);

  // Audio element sync & Simulated timer loop
  useEffect(() => {
    let lastTimestamp = performance.now();

    const loop = (timestamp: number) => {
      const delta = (timestamp - lastTimestamp) / 1000;
      lastTimestamp = timestamp;

      if (
        seekRequest &&
        seekRequest.seq !== lastHandledSeekSeqRef.current
      ) {
        lastHandledSeekSeqRef.current = seekRequest.seq;
        const clamped = Math.max(0, Math.min(totalDuration, seekRequest.time));
        setCurrentTime(clamped);
        if (audioRef.current && audioUrl) {
          audioRef.current.currentTime = clamped;
        }
      }

      if (isPlaying) {
        if (audioRef.current && audioUrl) {
          // Sync from actual audio element
          const audioCurrent = audioRef.current.currentTime;
          setCurrentTime((prev) => {
            if (Math.abs(prev - audioCurrent) > 0.02) {
              return audioCurrent;
            }
            return prev;
          });
          if (audioRef.current.ended) {
            setIsPlaying(false);
            setCurrentTime(0);
          }
        } else {
          // Simulated playback for demo tracks
          setCurrentTime((prev) => {
            const next = prev + delta * playbackRate;
            if (next >= totalDuration) {
              setIsPlaying(false);
              return 0;
            }
            return next;
          });
        }
      }

      animFrameRef.current = requestAnimationFrame(loop);
    };

    animFrameRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, audioUrl, playbackRate, totalDuration, seekRequest]);

  // Notify parent of active chord change & audition tones
  useEffect(() => {
    onActiveChordChange?.(activeChord);

    // If using simulated audio (no physical file uploaded) or audition enabled
    if (
      isPlaying &&
      synthAuditionEnabled &&
      activeChord &&
      activeChord.chord !== lastSynthChordRef.current
    ) {
      lastSynthChordRef.current = activeChord.chord;
      guitarSynth.playChord(activeChord.chord, 1.8);
    }
  }, [activeChord, isPlaying, synthAuditionEnabled, onActiveChordChange]);

  // Auto-scroll timeline to follow playhead
  useEffect(() => {
    if (!followPlayhead || !timelineScrollRef.current) return;
    const playheadPixel = currentTime * pixelsPerSecond;
    const container = timelineScrollRef.current;
    const containerWidth = container.clientWidth;
    const targetScroll = playheadPixel - containerWidth / 3;

    container.scrollTo({
      left: Math.max(0, targetScroll),
      behavior: "smooth",
    });
  }, [currentTime, followPlayhead, pixelsPerSecond]);

  // Play / Pause toggle
  const togglePlay = useCallback(() => {
    if (audioRef.current && audioUrl) {
      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current.play().catch(console.error);
        setIsPlaying(true);
      }
    } else {
      setIsPlaying((prev) => !prev);
    }
  }, [isPlaying, audioUrl]);

  // Keyboard shortcut: Spacebar to toggle playback
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.code === "Space" &&
        !(
          e.target instanceof HTMLInputElement ||
          e.target instanceof HTMLTextAreaElement
        )
      ) {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay]);

  // Notify parent of playback time & playing state for synchronized Tablature playhead (throttled)
  useEffect(() => {
    // Only notify parent if time difference is meaningful (> 0.05s) or play state changed
    if (Math.abs(currentTime - lastNotifiedTimeRef.current) >= 0.05 || !isPlaying) {
      lastNotifiedTimeRef.current = currentTime;
      onPlaybackTimeChange?.(currentTime, isPlaying);
    }
  }, [currentTime, isPlaying, onPlaybackTimeChange]);

  // Seek to specific timestamp
  const seekTo = useCallback(
    (timestamp: number) => {
      const clampedTime = Math.max(0, Math.min(totalDuration, timestamp));
      setCurrentTime(clampedTime);
      if (audioRef.current && audioUrl) {
        audioRef.current.currentTime = clampedTime;
      }
    },
    [totalDuration, audioUrl]
  );

  // Jump by delta seconds
  const jumpTime = (delta: number) => {
    seekTo(currentTime + delta);
  };

  // Handle clicking or touch dragging on timeline scrub bar
  const handleScrubberClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    seekTo(ratio * totalDuration);
  };

  const handleScrubberTouch = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = touch.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    seekTo(ratio * totalDuration);
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const tenths = Math.floor((seconds % 1) * 10);
    return `${mins.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}.${tenths}`;
  };

  const timelineTotalWidth = Math.max(800, totalDuration * pixelsPerSecond);

  // Generate ruler marks every 5 seconds
  const rulerMarks = useMemo(() => {
    const marks: { second: number; left: number }[] = [];
    const step = pixelsPerSecond >= 80 ? 2 : 5;
    for (let s = 0; s <= totalDuration; s += step) {
      marks.push({ second: s, left: s * pixelsPerSecond });
    }
    return marks;
  }, [totalDuration, pixelsPerSecond]);

  return (
    <div className="w-full bg-zinc-900/60 border border-white/[0.08] rounded-xl p-4 sm:p-5 backdrop-blur-md shadow-sm space-y-4">
      {/* Hidden audio element for real audio file playback */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onEnded={() => {
            setIsPlaying(false);
            setCurrentTime(0);
          }}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
        />
      )}

      {/* Player Top Controls Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-white/[0.08]">
        {/* Play / Skip Buttons + Active Chord Display */}
        <div className="flex items-center justify-between sm:justify-start gap-2.5 w-full sm:w-auto">
          {/* Transport buttons */}
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => jumpTime(-5)}
              title="Rewind 5s"
              aria-label="Rewind 5s"
              className="p-2 sm:p-2.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/[0.06] transition-all active:scale-95 cursor-pointer"
            >
              <Rewind className="w-4 h-4" />
            </button>

            <button
              onClick={togglePlay}
              title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              aria-label={isPlaying ? "Pause" : "Play"}
              className={`flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-lg shadow-sm transition-all active:scale-95 cursor-pointer ${
                isPlaying
                  ? "bg-amber-400 text-zinc-950 font-bold"
                  : "bg-zinc-100 hover:bg-white text-zinc-950 font-bold"
              }`}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current ml-0.5" />
              )}
            </button>

            <button
              onClick={() => jumpTime(5)}
              title="Fast forward 5s"
              aria-label="Fast forward 5s"
              className="p-2 sm:p-2.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-white border border-white/[0.06] transition-all active:scale-95 cursor-pointer"
            >
              <FastForward className="w-4 h-4" />
            </button>

            <button
              onClick={() => seekTo(0)}
              title="Restart to beginning"
              aria-label="Restart track"
              className="p-2 rounded-lg bg-zinc-800/60 hover:bg-zinc-700 text-zinc-400 hover:text-white border border-white/[0.06] transition-all active:scale-95 ml-0.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Current Active Chord Live Display */}
          <div className="flex items-center gap-2 sm:gap-2.5 bg-zinc-950/80 border border-white/[0.08] rounded-lg px-2.5 py-1.5 sm:px-3 sm:py-1.5">
            <div className="flex items-center gap-1 text-[11px] text-zinc-400 font-mono">
              <Flame
                className={`w-3.5 h-3.5 ${
                  isPlaying ? "text-amber-400 animate-pulse" : "text-zinc-500"
                }`}
              />
              <span className="hidden xs:inline">Active:</span>
            </div>
            <span className="text-base sm:text-lg font-bold font-mono text-amber-400 tracking-wider">
              {activeChord?.chord || "--"}
            </span>
            {activeChord && (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {(activeChord.confidence * 100).toFixed(0)}%
              </span>
            )}
          </div>
        </div>

        {/* Secondary controls: Synth Sound, Speed, Follow, Volume, Zoom */}
        <div className="flex flex-wrap items-center justify-between sm:justify-end gap-2 w-full sm:w-auto">
          {/* Synth Audition Toggle */}
          <button
            onClick={() => setSynthAuditionEnabled(!synthAuditionEnabled)}
            title={
              synthAuditionEnabled
                ? "Tone Synth Enabled: Click to mute guitar chord synth"
                : "Tone Synth Muted: Click to enable guitar chord synth"
            }
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              synthAuditionEnabled
                ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                : "bg-slate-800 text-slate-500 border-slate-700"
            }`}
          >
            <Volume1 className="w-3.5 h-3.5" />
            <span className="inline">Synth</span>
          </button>

          {/* Follow Playhead Toggle */}
          <button
            onClick={() => setFollowPlayhead(!followPlayhead)}
            title="Auto-scroll timeline with playhead"
            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
              followPlayhead
                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
            }`}
          >
            <Crosshair className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">Follow</span>
          </button>

          {/* Playback Speed */}
          <select
            value={playbackRate}
            onChange={(e) => {
              const rate = parseFloat(e.target.value);
              setPlaybackRate(rate);
              if (audioRef.current) audioRef.current.playbackRate = rate;
            }}
            className="bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono rounded-lg px-2 py-1.5 focus:outline-none focus:border-amber-500"
          >
            <option value="0.5">0.5x</option>
            <option value="0.75">0.75x</option>
            <option value="1">1.0x</option>
            <option value="1.25">1.25x</option>
            <option value="1.5">1.5x</option>
          </select>

          {/* Timeline zoom */}
          <div className="flex items-center bg-slate-800/80 rounded-lg p-0.5 border border-slate-700">
            <button
              onClick={() => setPixelsPerSecond((p) => Math.max(35, p - 15))}
              title="Zoom out timeline"
              className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono px-1.5 text-slate-400 hidden xs:inline">
              {pixelsPerSecond}px/s
            </span>
            <button
              onClick={() => setPixelsPerSecond((p) => Math.min(140, p + 15))}
              title="Zoom in timeline"
              className="p-1 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Volume slider on larger screens */}
          <div className="hidden sm:flex items-center gap-1.5 bg-slate-800/80 border border-slate-700 rounded-lg px-2 py-1">
            <button
              onClick={() => {
                const nextMute = !isMuted;
                setIsMuted(nextMute);
                if (audioRef.current) audioRef.current.muted = nextMute;
              }}
              className="text-slate-400 hover:text-white cursor-pointer"
            >
              {isMuted || volume === 0 ? (
                <VolumeX className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Volume2 className="w-3.5 h-3.5" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                setVolume(val);
                setIsMuted(false);
                if (audioRef.current) {
                  audioRef.current.volume = val;
                  audioRef.current.muted = false;
                }
              }}
              className="w-16 h-1 bg-slate-700 accent-amber-500 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>

      {/* Waveform / Scrubber Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-mono text-slate-400">
          <span className="text-amber-400 font-bold">
            {formatTime(currentTime)}
          </span>
          <span className="text-[11px] text-slate-500 truncate px-2">
            Tap or drag scrubber to seek
          </span>
          <span className="text-slate-400 font-semibold">
            {formatTime(totalDuration)}
          </span>
        </div>

        {/* Interactive Waveform Progress Bar with Touch Drag */}
        <div
          onClick={handleScrubberClick}
          onTouchStart={handleScrubberTouch}
          onTouchMove={handleScrubberTouch}
          className="relative h-12 bg-slate-950 rounded-xl overflow-hidden cursor-pointer border border-slate-800 group hover:border-slate-700 touch-none select-none"
        >
          {/* Simulated Waveform Bars */}
          <div className="absolute inset-0 flex items-center justify-between px-2 gap-[2px] opacity-40 group-hover:opacity-60 transition-opacity pointer-events-none">
            {Array.from({ length: 90 }).map((_, i) => {
              const rawHeight = 15 + Math.sin(i * 0.3) * 35 + ((i % 5) * 8);
              const height = Math.round(Math.min(95, Math.max(20, rawHeight)));
              const isPast = (i / 90) * totalDuration <= currentTime;
              return (
                <div
                  key={i}
                  className={`w-[2px] rounded-full transition-colors ${
                    isPast ? "bg-amber-400" : "bg-slate-600"
                  }`}
                  style={{ height: `${height}%` }}
                />
              );
            })}
          </div>

          {/* Progress fill */}
          <div
            className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-amber-500/20 via-rose-500/20 to-amber-500/30 border-r-2 border-amber-400 transition-all pointer-events-none"
            style={{ width: `${(currentTime / totalDuration) * 100}%` }}
          />

          {/* Scrubber Playhead pin */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.9)] pointer-events-none"
            style={{ left: `${(currentTime / totalDuration) * 100}%` }}
          >
            <div className="w-2.5 h-2.5 -ml-1 -mt-0.5 bg-amber-400 rounded-full shadow-lg" />
          </div>
        </div>
      </div>

      {/* SYNCHRONIZED CHORD TIMELINE */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music4 className="w-4 h-4 text-amber-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300 font-mono">
              Synchronized Chord Timeline
            </h3>
          </div>
          <span className="text-[11px] text-slate-400 font-mono">
            <span className="hidden sm:inline">
              {chords.length} detected chord segments • Click any block to seek
            </span>
            <span className="sm:hidden text-amber-400/90 flex items-center gap-1">
              👈 Swipe timeline • Tap chord to seek 👉
            </span>
          </span>
        </div>

        {/* Horizontal Scrolling Chord Timeline Container */}
        <div
          ref={timelineScrollRef}
          className="relative w-full overflow-x-auto overflow-y-hidden rounded-xl border border-slate-800 bg-[#07090e] p-3 select-none touch-pan-x"
        >
          <div
            className="relative h-28"
            style={{ width: `${timelineTotalWidth}px` }}
          >
            {/* Time Ruler Marks */}
            <div className="absolute top-0 left-0 right-0 h-5 border-b border-slate-800/80 flex items-center text-[10px] font-mono text-slate-500 pointer-events-none">
              {rulerMarks.map((m) => (
                <div
                  key={m.second}
                  className="absolute flex flex-col items-start"
                  style={{ left: `${m.left}px` }}
                >
                  <div className="w-px h-2 bg-slate-700" />
                  <span className="text-[9px] -ml-2 text-slate-500">
                    {m.second}s
                  </span>
                </div>
              ))}
            </div>

            {/* Chord Blocks Track */}
            <div className="absolute top-7 left-0 right-0 bottom-1 flex items-center">
              {chords.map((chord, index) => {
                const blockLeft = chord.start_time * pixelsPerSecond;
                const blockWidth = Math.max(
                  42,
                  (chord.end_time - chord.start_time) * pixelsPerSecond - 4
                );
                const isActive =
                  currentTime >= chord.start_time &&
                  currentTime < chord.end_time;
                const isVoicingSelected =
                  selectedChordForVoicing?.chord === chord.chord;

                // Color accent by chord family
                const isMinor = chord.chord.includes("m") && !chord.chord.includes("maj");

                return (
                  <div
                    key={`${chord.chord}-${index}-${chord.start_time}`}
                    onClick={() => {
                      seekTo(chord.start_time);
                      onSelectChordForVoicing?.(chord);
                      guitarSynth.playChord(chord.chord);
                    }}
                    title={`Chord: ${chord.chord} (${chord.start_time.toFixed(
                      1
                    )}s - ${chord.end_time.toFixed(1)}s) • ${(
                      chord.confidence * 100
                    ).toFixed(0)}% confidence`}
                    className={`group absolute top-0 bottom-0 rounded-xl cursor-pointer flex flex-col justify-between p-2 transition-all duration-150 border ${
                      isActive
                        ? "z-20 bg-gradient-to-b from-amber-500/25 to-amber-600/35 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.35)] scale-[1.02]"
                        : isVoicingSelected
                        ? "z-10 bg-indigo-900/40 border-indigo-500/70 shadow-lg"
                        : isMinor
                        ? "bg-slate-900/90 border-slate-800 hover:border-indigo-500/50 hover:bg-slate-850"
                        : "bg-slate-900/90 border-slate-800 hover:border-amber-500/50 hover:bg-slate-855"
                    }`}
                    style={{
                      left: `${blockLeft}px`,
                      width: `${blockWidth}px`,
                    }}
                  >
                    {/* Active chord pulse bar on top */}
                    {isActive && (
                      <div className="absolute top-0 left-0 right-0 h-1 bg-amber-400 rounded-t-xl animate-pulse" />
                    )}

                    {/* Chord Name Header */}
                    <div className="flex items-center justify-between gap-1">
                      <span
                        className={`font-mono font-bold truncate leading-none ${
                          isActive
                            ? "text-amber-300 text-base"
                            : "text-slate-100 group-hover:text-amber-300 text-sm"
                        }`}
                      >
                        {chord.chord}
                      </span>
                      <span
                        className={`text-[9px] font-mono px-1 py-0.2 rounded ${
                          isActive
                            ? "bg-amber-400/20 text-amber-200"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {(chord.confidence * 100).toFixed(0)}%
                      </span>
                    </div>

                    {/* Duration / Timestamp Subtext */}
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-400">
                      <span>{chord.start_time.toFixed(1)}s</span>
                      <span>{(chord.end_time - chord.start_time).toFixed(1)}s</span>
                    </div>
                  </div>
                );
              })}

              {/* Real-time Playhead Vertical Line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-30 pointer-events-none shadow-[0_0_12px_rgba(251,191,36,0.9)]"
                style={{ left: `${currentTime * pixelsPerSecond}px` }}
              >
                <div className="w-3 h-3 -ml-1.5 -mt-1 bg-amber-400 rounded-full border-2 border-slate-950 shadow-md" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
