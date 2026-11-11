/**
 * Real-Time Live Microphone Chord Streaming Client
 *
 * Implements high-performance bidirectional WebSocket streaming (/ws/live-chord)
 * with graceful HTTP fallback (/api/v1/live/detect-chord) and instant client-side
 * template matching in Mock/Offline mode.
 */

import {
  LiveChordDetectionResult,
  LiveChordFrameRequest,
  TuningPresetId,
} from "../types";
import { matchChromaToChord } from "./chord-dsp";
import { api } from "./api";

export type LiveChordTransport = "websocket" | "http" | "client-mock";

export interface LiveChordClientOptions {
  wsUrl?: string;
  httpUrl?: string;
  mockMode?: boolean;
  tuningPreset?: TuningPresetId;
  onResult: (result: LiveChordDetectionResult, transport: LiveChordTransport) => void;
  onTransportChange?: (transport: LiveChordTransport) => void;
  onError?: (err: string) => void;
}

export class LiveChordClient {
  private ws: WebSocket | null = null;
  private wsUrl: string;
  private httpUrl: string;
  private mockMode: boolean;
  private tuningPreset: TuningPresetId;
  private currentTransport: LiveChordTransport = "client-mock";
  private onResult: (
    result: LiveChordDetectionResult,
    transport: LiveChordTransport
  ) => void;
  private onTransportChange?: (transport: LiveChordTransport) => void;
  private onError?: (err: string) => void;

  private isRunning = false;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private isHttpInFlight = false;
  private lastHttpSentTime = 0;

  constructor(options: LiveChordClientOptions) {
    this.wsUrl = options.wsUrl || `${api.getWsBaseUrl()}/ws/live-chord`;
    this.httpUrl =
      options.httpUrl || `${api.getHttpBaseUrl()}/api/v1/live/detect-chord`;
    this.mockMode = !!options.mockMode;
    this.tuningPreset = options.tuningPreset || "standard";
    this.onResult = options.onResult;
    this.onTransportChange = options.onTransportChange;
    this.onError = options.onError;
  }

  setMockMode(val: boolean) {
    this.mockMode = val;
    if (val) {
      this.closeWebSocket();
      this.setTransport("client-mock");
    } else if (this.isRunning) {
      this.connectWebSocket();
    }
  }

  setTuningPreset(preset: TuningPresetId) {
    this.tuningPreset = preset;
  }

  private setTransport(t: LiveChordTransport) {
    if (this.currentTransport !== t) {
      this.currentTransport = t;
      this.onTransportChange?.(t);
    }
  }

  start() {
    this.isRunning = true;
    if (this.mockMode) {
      this.setTransport("client-mock");
    } else {
      this.connectWebSocket();
    }
  }

  stop() {
    this.isRunning = false;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    this.closeWebSocket();
  }

  private connectWebSocket() {
    if (this.mockMode || !this.isRunning) return;

    try {
      this.closeWebSocket();
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;

      ws.onopen = () => {
        if (!this.isRunning) {
          ws.close();
          return;
        }
        this.setTransport("websocket");

        // Keepalive ping every 15s
        if (this.pingInterval) clearInterval(this.pingInterval);
        this.pingInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, 15000);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data && data.type === "pong") return; // heartbeat
          if (data && typeof data.chord === "string") {
            this.onResult(data as LiveChordDetectionResult, "websocket");
          }
        } catch (e) {
          console.error("Malformed WebSocket frame received:", e);
        }
      };

      ws.onerror = () => {
        // Fallback to HTTP
        this.setTransport("http");
      };

      ws.onclose = () => {
        if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
        }
        this.ws = null;

        if (this.isRunning && !this.mockMode) {
          // Schedule reconnect attempt in 3s
          this.setTransport("http");
          if (!this.reconnectTimeout) {
            this.reconnectTimeout = setTimeout(() => {
              this.reconnectTimeout = null;
              if (this.isRunning && !this.mockMode) {
                this.connectWebSocket();
              }
            }, 3000);
          }
        }
      };
    } catch {
      this.setTransport("http");
    }
  }

  private closeWebSocket() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.ws) {
      try {
        this.ws.onclose = null;
        this.ws.onerror = null;
        this.ws.onmessage = null;
        this.ws.close();
      } catch {
        // ignore
      }
      this.ws = null;
    }
  }

  /**
   * Process a live frame: sends to WebSocket or HTTP fallback, or evaluates locally via Mock DSP
   */
  async processFrame(
    chroma: number[],
    rms: number,
    pcmSamples?: number[] | null,
    sampleRate = 22050
  ) {
    if (!this.isRunning) return;

    // 1. Mock Mode or Client-side Fallback
    if (this.mockMode) {
      const result = matchChromaToChord(chroma, rms);
      this.onResult(result, "client-mock");
      return;
    }

    // 2. WebSocket Connected
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const frame: LiveChordFrameRequest = {
        chroma,
        pcm_samples: pcmSamples || null,
        sample_rate: sampleRate,
        tuning_preset: this.tuningPreset,
      };
      this.ws.send(JSON.stringify(frame));
      return;
    }

    // 3. HTTP Fallback (Throttled to max 5 reqs/sec = 200ms)
    const now = Date.now();
    if (this.isHttpInFlight || now - this.lastHttpSentTime < 190) {
      // While HTTP is waiting, provide instant client-side preview
      const localResult = matchChromaToChord(chroma, rms);
      this.onResult(localResult, "client-mock");
      return;
    }

    this.isHttpInFlight = true;
    this.lastHttpSentTime = now;

    try {
      const response = await fetch(this.httpUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chroma,
          sample_rate: sampleRate,
          tuning_preset: this.tuningPreset,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: LiveChordDetectionResult = await response.json();
      this.setTransport("http");
      this.onResult(data, "http");
    } catch {
      // Backend not running -> Seamless client-side template matching fallback
      this.setTransport("client-mock");
      const localResult = matchChromaToChord(chroma, rms);
      this.onResult(localResult, "client-mock");
    } finally {
      this.isHttpInFlight = false;
    }
  }
}
