import {
  AnalysisResponse,
  ArrangementRequest,
  ArrangementVariation,
  DEFAULT_GUITAR_TUNING,
  ExportFormat,
  TablatureData,
  TablatureUpdateRequest,
} from "../types";
import {
  buildMockArrangementVariation,
  DEFAULT_FINGERSTYLE_ARRANGEMENT,
  MOCK_ANALYSIS_RESPONSE,
  resolveChordDiagram,
} from "./mock-data";
import {
  createClientFallbackExportBlob,
  getExportFormatSpec,
  triggerBrowserDownload,
} from "./export-utils";
import { applyTablatureUpdate, resolveNoteVoice } from "./tab-utils";

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

export interface GenerateArrangementResult {
  variation: ArrangementVariation;
  persistedToBackend: boolean;
  notice: string;
}

export interface ExportTablatureResult {
  filename: string;
  fromBackend: boolean;
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
   * Ensures every TablatureData has voice roles populated on all notes
   */
  private normalizeTablature(tab: TablatureData): TablatureData {
    return {
      ...tab,
      tuning:
        tab.tuning && tab.tuning.length === 6
          ? tab.tuning
          : DEFAULT_GUITAR_TUNING,
      capo: typeof tab.capo === "number" ? tab.capo : 0,
      difficulty: tab.difficulty || "Intermediate",
      measures: (tab.measures || []).map((m) => ({
        ...m,
        notes: (m.notes || []).map((n) => ({
          ...n,
          voice: resolveNoteVoice(n),
        })),
      })),
    };
  }

  /**
   * Ensures every AnalysisResponse contains valid Phase 2 & Phase 3 chord_diagrams, tablature, and arrangements
   */
  private normalizeResponse(data: AnalysisResponse): AnalysisResponse {
    const chord_diagrams =
      data.chord_diagrams && data.chord_diagrams.length > 0
        ? data.chord_diagrams
        : Array.from(new Set((data.chords || []).map((c) => c.chord))).map(
            (chordName) => resolveChordDiagram(chordName)
          );

    const rawTablature = data.tablature ?? {
      tuning: DEFAULT_GUITAR_TUNING,
      capo: 0,
      difficulty: "Beginner",
      measures: MOCK_ANALYSIS_RESPONSE.tablature.measures,
      ascii_tab: MOCK_ANALYSIS_RESPONSE.tablature.ascii_tab,
    };
    const tablature = this.normalizeTablature(rawTablature);

    const rawArrangements =
      data.arrangements && data.arrangements.length > 0
        ? data.arrangements
        : [DEFAULT_FINGERSTYLE_ARRANGEMENT];

    const arrangements: ArrangementVariation[] = rawArrangements.map((arr) => ({
      ...arr,
      tablature: this.normalizeTablature(arr.tablature),
    }));

    return {
      ...data,
      chord_diagrams,
      tablature,
      arrangements,
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
   * POST /api/v1/analyze/{job_id}/arrange — Generate Style & Fingerstyle Arrangement (Phase 3)
   */
  async generateArrangement(
    jobId: string,
    request: ArrangementRequest,
    currentAnalysis?: AnalysisResponse,
    mockMode = false
  ): Promise<GenerateArrangementResult> {
    const fallbackVariation = buildMockArrangementVariation(
      request,
      currentAnalysis
    );

    const envMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
    const isMock = typeof mockMode === "boolean" ? mockMode : envMock;

    if (isMock) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      return {
        variation: fallbackVariation,
        persistedToBackend: false,
        notice: `Generated "${fallbackVariation.title}" via Phase 3 AI Arrangement Studio (Mock Engine).`,
      };
    }

    try {
      const endpoint = `${this.apiUrl}/${encodeURIComponent(jobId)}/arrange`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 20000);

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          style: request.style,
          difficulty: request.difficulty,
          capo: request.capo ?? 0,
          tempo_scale: request.tempo_scale ?? 1.0,
        }),
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

      const rawVariation: ArrangementVariation = await response.json();
      const normalizedVariation: ArrangementVariation = {
        ...rawVariation,
        tablature: this.normalizeTablature(rawVariation.tablature),
      };

      return {
        variation: normalizedVariation,
        persistedToBackend: true,
        notice: `Synthesized "${normalizedVariation.title}" via POST /api/v1/analyze/${jobId}/arrange.`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Backend unreachable";
      console.warn(
        `[Arpegia API] POST /arrange fallback to deterministic studio generator (${msg}).`
      );
      return {
        variation: fallbackVariation,
        persistedToBackend: false,
        notice: `Generated "${fallbackVariation.title}" locally (Backend offline: ${msg}).`,
      };
    }
  }

  /**
   * GET /api/v1/analyze/{job_id}/export?format=<fmt>&arrangement_id=<id>
   * Downloads MIDI (.mid), MusicXML (.musicxml), ASCII (.txt), or PDF (.pdf) with client-side fallback.
   */
  async exportTablature(params: {
    jobId: string;
    format: ExportFormat;
    arrangementId?: string | null;
    activeTablature: TablatureData;
    analysis?: AnalysisResponse;
    activeTitle?: string;
    activeStyle?: string;
    mockMode?: boolean;
  }): Promise<ExportTablatureResult> {
    const {
      jobId,
      format,
      arrangementId,
      activeTablature,
      analysis,
      activeTitle,
      activeStyle,
      mockMode = false,
    } = params;

    const envMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
    const isMock = typeof mockMode === "boolean" ? mockMode : envMock;

    const triggerFallback = (reason?: string): ExportTablatureResult => {
      const { blob, filename } = createClientFallbackExportBlob(
        format,
        activeTablature,
        {
          jobId,
          title: activeTitle || analysis?.metadata?.filename,
          style: activeStyle || "Original Transcription",
          arrangementId,
          songMetadata: analysis?.metadata,
        }
      );
      triggerBrowserDownload(blob, filename);
      const spec = getExportFormatSpec(format);
      return {
        filename,
        fromBackend: false,
        notice: reason
          ? `Exported ${spec.label} (${filename}) via client generator (${reason}).`
          : `Exported ${spec.label} (${filename}) via Phase 3 Studio Exporter.`,
      };
    };

    if (isMock) {
      return triggerFallback();
    }

    try {
      const query = new URLSearchParams({ format });
      if (arrangementId) {
        query.set("arrangement_id", arrangementId);
      }
      const endpoint = `${this.apiUrl}/${encodeURIComponent(
        jobId
      )}/export?${query.toString()}`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(endpoint, {
        method: "GET",
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }

      const blob = await response.blob();
      const spec = getExportFormatSpec(format);

      // Parse filename from Content-Disposition if available
      const disposition = response.headers.get("Content-Disposition") || "";
      const filenameMatch = disposition.match(/filename="?([^";]+)"?/i);
      const filename =
        filenameMatch?.[1] || `arpegia-${jobId}.${spec.ext}`;

      triggerBrowserDownload(blob, filename);
      return {
        filename,
        fromBackend: true,
        notice: `Downloaded ${spec.label} (${filename}) from GET /api/v1/analyze/${jobId}/export.`,
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Backend offline";
      console.warn(
        `[Arpegia API] GET /export fallback to client generator (${msg}).`
      );
      return triggerFallback(`Backend offline: ${msg}`);
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
