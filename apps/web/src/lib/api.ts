import {
  AnalysisResponse,
  DEFAULT_GUITAR_TUNING,
  TablatureUpdateRequest,
} from "../types";
import { MOCK_ANALYSIS_RESPONSE, resolveChordDiagram } from "./mock-data";
import { applyTablatureUpdate } from "./tab-utils";

const DEFAULT_API_URL = "http://localhost:8000/api/v1/analyze";

export interface AnalyzeOptions {
  onProgress?: (percent: number, stageText: string) => void;
  mockMode?: boolean;
}

export interface UpdateTablatureResult {
  analysis: AnalysisResponse;
  persistedToBackend: boolean;
  notice: string;
}

export class ArpegiaApiClient {
  private apiUrl: string;

  constructor() {
    const rawUrl = process.env.NEXT_PUBLIC_API_URL?.trim();
    if (rawUrl) {
      const normalized = rawUrl.replace(/\/+$/, "");
      this.apiUrl = normalized.endsWith("/api/v1/analyze")
        ? normalized
        : `${normalized}/api/v1/analyze`;
    } else {
      this.apiUrl = DEFAULT_API_URL;
    }
  }

  getApiUrl(): string {
    return this.apiUrl;
  }

  /**
   * Ensures every AnalysisResponse contains valid Phase 2 chord_diagrams and tablature
   */
  private normalizeResponse(data: AnalysisResponse): AnalysisResponse {
    const chord_diagrams =
      data.chord_diagrams && data.chord_diagrams.length > 0
        ? data.chord_diagrams
        : Array.from(new Set((data.chords || []).map((c) => c.chord))).map(
            (chordName) => resolveChordDiagram(chordName)
          );

    const tablature = data.tablature ?? {
      tuning: DEFAULT_GUITAR_TUNING,
      capo: 0,
      difficulty: "Beginner",
      measures: MOCK_ANALYSIS_RESPONSE.tablature.measures,
      ascii_tab: MOCK_ANALYSIS_RESPONSE.tablature.ascii_tab,
    };

    return {
      ...data,
      chord_diagrams,
      tablature,
    };
  }

  /**
   * POST /api/v1/analyze — Analyze audio file with backend API or realistic mock fallback
   */
  async analyzeAudio(
    file: File,
    options?: AnalyzeOptions
  ): Promise<AnalysisResponse> {
    const envMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
    const isMock = options?.mockMode ?? envMock;

    if (isMock) {
      return this.simulateMockAnalysis(file, options?.onProgress);
    }

    try {
      options?.onProgress?.(10, "Uploading audio to neural backend...");

      const formData = new FormData();
      formData.append("file", file);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000); // 60s timeout for DSP & LangGraph pipeline

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

      options?.onProgress?.(
        80,
        "Decoding chords, voicings & guitar tablature..."
      );
      const rawData: AnalysisResponse = await response.json();
      const data = this.normalizeResponse(rawData);
      options?.onProgress?.(100, "Analysis complete!");
      return data;
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to connect to backend";
      console.warn(
        `[Arpegia API] Backend request failed (${errorMsg}). Falling back to studio mock simulation.`,
        err
      );

      return this.simulateMockAnalysis(
        file,
        options?.onProgress,
        `Backend offline (${errorMsg}). Used AI Studio Simulation.`
      );
    }
  }

  /**
   * GET /api/v1/analyze/{job_id} — Retrieve an existing analysis job
   */
  async getAnalysisJob(jobId: string): Promise<AnalysisResponse> {
    const response = await fetch(
      `${this.apiUrl}/${encodeURIComponent(jobId)}`,
      {
        method: "GET",
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch job ${jobId} (${response.status}: ${response.statusText})`
      );
    }

    const rawData: AnalysisResponse = await response.json();
    return this.normalizeResponse(rawData);
  }

  /**
   * PUT /api/v1/analyze/{job_id}/tablature — Update Tablature & Regenerate ASCII Tab
   * Performs optimistic local computation first and persists to backend when available.
   */
  async updateTablature(
    jobId: string,
    payload: TablatureUpdateRequest,
    currentAnalysis: AnalysisResponse,
    mockMode = false
  ): Promise<UpdateTablatureResult> {
    // 1. Optimistic local recomputation of midi, note_name, and 6-line ascii_tab
    const optimisticTablature = applyTablatureUpdate(
      currentAnalysis.tablature,
      payload
    );
    const optimisticAnalysis: AnalysisResponse = {
      ...currentAnalysis,
      tablature: optimisticTablature,
    };

    const envMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
    const isMock = typeof mockMode === "boolean" ? mockMode : envMock;
    if (isMock) {
      return {
        analysis: optimisticAnalysis,
        persistedToBackend: false,
        notice:
          "Updated tablature & regenerated ASCII tab locally (Mock Engine active).",
      };
    }

    try {
      const endpoint = `${this.apiUrl}/${encodeURIComponent(jobId)}/tablature`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(endpoint, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errDetail = `${response.status} ${response.statusText}`;
        try {
          const errJson = await response.json();
          if (errJson?.error?.message) {
            errDetail = errJson.error.message;
          }
        } catch {
          // ignore JSON parse error
        }
        throw new Error(errDetail);
      }

      const rawUpdated: AnalysisResponse = await response.json();
      return {
        analysis: this.normalizeResponse(rawUpdated),
        persistedToBackend: true,
        notice: `Saved tablature edits to backend (PUT /api/v1/analyze/${jobId}/tablature).`,
      };
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Backend unreachable";
      console.warn(
        `[Arpegia API] PUT /tablature fallback to optimistic state (${msg}).`
      );
      return {
        analysis: optimisticAnalysis,
        persistedToBackend: false,
        notice: `Applied tablature edit locally (Backend offline: ${msg}).`,
      };
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
      { progress: 60, text: "Extracting chroma vectors & pitch detection..." },
      {
        progress: 80,
        text: "Mapping biomechanical fretboard tablature & chord voicings...",
      },
      { progress: 95, text: "Generating style-based improvisations..." },
      { progress: 100, text: notice || "Analysis complete!" },
    ];

    for (const step of steps) {
      onProgress?.(step.progress, step.text);
      await new Promise((resolve) => setTimeout(resolve, 260));
    }

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
