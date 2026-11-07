import { AnalysisResponse } from "../types";
import { MOCK_ANALYSIS_RESPONSE } from "./mock-data";

const DEFAULT_API_URL = "http://localhost:8000/api/v1/analyze";

export interface AnalyzeOptions {
  onProgress?: (percent: number, stageText: string) => void;
  mockMode?: boolean;
}

export class ArpegiaApiClient {
  private apiUrl: string;

  constructor() {
    this.apiUrl =
      process.env.NEXT_PUBLIC_API_URL || DEFAULT_API_URL;
  }

  getApiUrl(): string {
    return this.apiUrl;
  }

  /**
   * Analyze audio file with backend API or realistic mock fallback
   */
  async analyzeAudio(
    file: File,
    options?: AnalyzeOptions
  ): Promise<AnalysisResponse> {
    const isMock = options?.mockMode ?? false;

    if (isMock) {
      return this.simulateMockAnalysis(file, options?.onProgress);
    }

    try {
      options?.onProgress?.(10, "Uploading audio to neural backend...");

      const formData = new FormData();
      formData.append("file", file);

      // Attempt to hit the backend API
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

      const response = await fetch(this.apiUrl, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(
          `Backend returned ${response.status}: ${response.statusText}`
        );
      }

      options?.onProgress?.(80, "Decoding chords and harmonizations...");
      const data: AnalysisResponse = await response.json();
      options?.onProgress?.(100, "Analysis complete!");
      return data;
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to connect to backend";
      console.warn(
        `[Arpegia API] Backend request failed (${errorMsg}). Falling back to studio mock simulation.`,
        err
      );

      // Auto-fallback to mock mode so developer/tester experience is frictionless
      return this.simulateMockAnalysis(
        file,
        options?.onProgress,
        `Backend offline (${errorMsg}). Used AI Studio Simulation.`
      );
    }
  }

  /**
   * Simulates high-fidelity AI inference pipeline with progress callbacks
   */
  private async simulateMockAnalysis(
    file: File,
    onProgress?: (percent: number, stageText: string) => void,
    notice?: string
  ): Promise<AnalysisResponse> {
    const steps = [
      { progress: 15, text: "Reading audio buffer & sample rate..." },
      { progress: 35, text: "Running stem demixing & guitar isolation..." },
      { progress: 65, text: "Extracting chroma vectors & pitch detection..." },
      { progress: 85, text: "Mapping harmonic progression & voicings..." },
      { progress: 95, text: "Generating style-based improvisations..." },
      { progress: 100, text: notice || "Analysis complete!" },
    ];

    for (const step of steps) {
      onProgress?.(step.progress, step.text);
      await new Promise((resolve) => setTimeout(resolve, 320));
    }

    // Build custom response using actual uploaded filename
    return {
      ...MOCK_ANALYSIS_RESPONSE,
      job_id: `job_sim_${Date.now()}`,
      metadata: {
        ...MOCK_ANALYSIS_RESPONSE.metadata,
        filename: file.name || "uploaded_audio.mp3",
      },
    };
  }
}

export const api = new ArpegiaApiClient();
