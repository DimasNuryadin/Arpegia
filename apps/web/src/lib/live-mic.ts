/**
 * Web Audio Microphone Capture & DSP Manager
 *
 * Configures raw audio stream with zero pre-processing:
 * echoCancellation: false, autoGainControl: false, noiseSuppression: false
 * Exposes time-domain and frequency buffers for 60fps pitch detection and live chromagram analysis.
 */

export interface LiveMicState {
  isActive: boolean;
  isPermissionDenied: boolean;
  permissionError: string | null;
  sampleRate: number;
}

export class LiveMicManager {
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private timeDomainBuffer: Float32Array<ArrayBuffer> | null = null;
  private freqDbBuffer: Float32Array<ArrayBuffer> | null = null;
  private fftSize: number;

  constructor(fftSize = 2048) {
    this.fftSize = fftSize;
  }

  isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) &&
      !!(window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)
    );
  }

  async start(): Promise<{ success: boolean; error?: string }> {
    if (!this.isSupported()) {
      return {
        success: false,
        error: "Web Audio / Microphone API is not supported in this browser.",
      };
    }

    try {
      // 1. Request raw, unadulterated microphone stream for precise guitar frequency detection
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          autoGainControl: false,
          noiseSuppression: false,
        },
      });

      this.mediaStream = stream;

      // 2. Initialize AudioContext
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === "suspended") {
        await this.audioCtx.resume();
      }

      // 3. Connect nodes
      this.sourceNode = this.audioCtx.createMediaStreamSource(stream);
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = this.fftSize;
      this.analyserNode.smoothingTimeConstant = 0.15; // fast response for instant pitch tracking

      this.sourceNode.connect(this.analyserNode);

      this.timeDomainBuffer = new Float32Array(this.analyserNode.fftSize);
      this.freqDbBuffer = new Float32Array(this.analyserNode.frequencyBinCount);

      return { success: true };
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Microphone access denied or failed.";
      return { success: false, error: errorMsg };
    }
  }

  stop(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      this.mediaStream = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {
        // ignore
      }
      this.sourceNode = null;
    }

    if (this.audioCtx && this.audioCtx.state !== "closed") {
      try {
        this.audioCtx.close();
      } catch {
        // ignore
      }
      this.audioCtx = null;
    }

    this.analyserNode = null;
    this.timeDomainBuffer = null;
    this.freqDbBuffer = null;
  }

  getTimeDomainData(): Float32Array | null {
    if (!this.analyserNode || !this.timeDomainBuffer) return null;
    this.analyserNode.getFloatTimeDomainData(this.timeDomainBuffer);
    return this.timeDomainBuffer;
  }

  getFrequencyDbData(): Float32Array | null {
    if (!this.analyserNode || !this.freqDbBuffer) return null;
    this.analyserNode.getFloatFrequencyData(this.freqDbBuffer);
    return this.freqDbBuffer;
  }

  getSampleRate(): number {
    return this.audioCtx?.sampleRate || 44100;
  }

  getFftSize(): number {
    return this.analyserNode?.fftSize || this.fftSize;
  }

  isActive(): boolean {
    return (
      !!this.mediaStream &&
      this.mediaStream.active &&
      !!this.audioCtx &&
      this.audioCtx.state === "running"
    );
  }
}
