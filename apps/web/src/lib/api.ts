import {
  AnalysisResponse,
  ArrangementRequest,
  ArrangementVariation,
  CANONICAL_PIPELINE_STAGES,
  DEFAULT_GUITAR_TUNING,
  ExportFormat,
  JobProgressEvent,
  PipelineStage,
  PipelineStepInfo,
  TablatureData,
  TablatureUpdateRequest,
  TransportType,
  TuningPreset,
  LiveChordFrameRequest,
  LiveChordDetectionResult,
} from "../types";
import { CANONICAL_TUNING_PRESETS } from "./tuner-dsp";
import { matchChromaToChord } from "./chord-dsp";
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

export interface AnalyzeOptions {
  onProgress?: (percent: number, stageText: string, event?: JobProgressEvent) => void;
  onProgressEvent?: (event: JobProgressEvent) => void;
  onTransportChange?: (transport: TransportType) => void;
  mockMode?: boolean;
  pollIntervalMs?: number;
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
  private httpBaseUrl: string;
  private analyzeUrl: string;
  private wsBaseUrl: string;

  constructor() {
    const rawApi = process.env.NEXT_PUBLIC_API_URL?.trim() || "http://localhost:8000";
    const cleanApi = rawApi.replace(/\/+$/, "");
    this.httpBaseUrl = cleanApi.replace(/\/api\/v1\/analyze$/, "");
    this.analyzeUrl = `${this.httpBaseUrl}/api/v1/analyze`;

    const rawWs = process.env.NEXT_PUBLIC_WS_URL?.trim();
    if (rawWs) {
      this.wsBaseUrl = rawWs.replace(/\/+$/, "");
    } else {
      this.wsBaseUrl = this.httpBaseUrl.replace(/^http:/, "ws:").replace(/^https:/, "wss:");
    }
  }

  getApiUrl(): string {
    return this.analyzeUrl;
  }

  getHttpBaseUrl(): string {
    return this.httpBaseUrl;
  }

  getWsBaseUrl(): string {
    return this.wsBaseUrl;
  }

  getWsUrl(jobId: string): string {
    return `${this.wsBaseUrl}/ws/analyze/${encodeURIComponent(jobId)}`;
  }

  getProgressUrl(jobId: string): string {
    return `${this.analyzeUrl}/${encodeURIComponent(jobId)}/progress`;
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
   * Ensures every AnalysisResponse contains valid Phase 2, Phase 3 & Phase 4 fields
   */
  public normalizeResponse(data: AnalysisResponse): AnalysisResponse {
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
   * Helper to construct initial progress frame
   */
  public buildInitialProgressEvent(
    jobId: string,
    message = "Job queued for analysis..."
  ): JobProgressEvent {
    const steps: PipelineStepInfo[] = CANONICAL_PIPELINE_STAGES.map((s, idx) => ({
      stage: s.stage,
      label: s.label,
      status: idx === 0 ? "in_progress" : "pending",
      progress_percent: idx === 0 ? 10 : 0,
      detail: idx === 0 ? "Initializing Demucs source separation..." : null,
    }));

    return {
      event: "job.progress",
      job_id: jobId,
      status: "processing",
      current_stage: "separating_stems",
      overall_percent: 5,
      message,
      steps,
      updated_at: new Date().toISOString(),
      result: null,
      error: null,
    };
  }

  /**
   * Helper to construct completed progress frame
   */
  public buildCompletedProgressEvent(
    jobId: string,
    result: AnalysisResponse
  ): JobProgressEvent {
    const steps: PipelineStepInfo[] = CANONICAL_PIPELINE_STAGES.map((s) => ({
      stage: s.stage,
      label: s.label,
      status: "completed",
      progress_percent: 100,
      detail: s.description,
    }));

    return {
      event: "job.completed",
      job_id: jobId,
      status: "completed",
      current_stage: "completed",
      overall_percent: 100,
      message: "Analysis completed successfully!",
      steps,
      updated_at: new Date().toISOString(),
      result,
      error: null,
    };
  }

  /**
   * POST /api/v1/analyze?async_mode=true
   * Phase 4 Dual-Transport Audio Analysis (WebSocket + HTTP Polling Fallback)
   */
  async analyzeAudio(
    file: File,
    options?: AnalyzeOptions
  ): Promise<AnalysisResponse> {
    const envMock = process.env.NEXT_PUBLIC_USE_MOCK === "true";
    const isMock = options?.mockMode ?? envMock;

    if (isMock) {
      options?.onTransportChange?.("mock");
      return this.simulateMockPipeline(file, options);
    }

    try {
      options?.onProgress?.(5, "Uploading audio to neural backend...");

      const formData = new FormData();
      formData.append("file", file);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 60000);

      // Async upload request targeting POST /api/v1/analyze?async_mode=true
      const uploadUrl = `${this.analyzeUrl}?async_mode=true`;
      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        let errDetail = `${response.status}: ${response.statusText}`;
        try {
          const errJson = await response.json();
          if (errJson?.error?.message) {
            errDetail = errJson.error.message;
          } else if (errJson?.detail) {
            errDetail =
              typeof errJson.detail === "string"
                ? errJson.detail
                : JSON.stringify(errJson.detail);
          }
        } catch {
          // ignore parse error
        }
        throw new Error(`Backend returned ${errDetail}`);
      }

      const data = await response.json();

      // Graceful compatibility check: if backend answered synchronously with complete analysis
      if (
        data.status === "completed" &&
        data.metadata &&
        data.chords &&
        Array.isArray(data.chords)
      ) {
        options?.onTransportChange?.("sync");
        const normalized = this.normalizeResponse(data as AnalysisResponse);
        const syncEvent = this.buildCompletedProgressEvent(
          normalized.job_id || `job_${Date.now()}`,
          normalized
        );
        options?.onProgressEvent?.(syncEvent);
        options?.onProgress?.(100, "Analysis complete!", syncEvent);
        return normalized;
      }

      // Asynchronous streaming mode: parse job_id and initial progress
      const jobId = data.job_id;
      if (!jobId) {
        throw new Error("Invalid async response from backend: missing job_id");
      }

      const initialEvent: JobProgressEvent = data.steps
        ? (data as JobProgressEvent)
        : this.buildInitialProgressEvent(
            jobId,
            data.message || "Job accepted for processing"
          );

      options?.onProgressEvent?.(initialEvent);
      options?.onProgress?.(
        initialEvent.overall_percent,
        initialEvent.message,
        initialEvent
      );

      return await this.trackJobProgress(jobId, initialEvent, options);
    } catch (err: unknown) {
      const errorMsg =
        err instanceof Error ? err.message : "Failed to connect to backend";
      console.warn(
        `[Arpegia API] Backend request failed (${errorMsg}). Falling back to studio mock simulation.`,
        err
      );

      options?.onTransportChange?.("mock");
      return this.simulateMockPipeline(
        file,
        options,
        `Backend offline (${errorMsg}). Used AI Studio Simulation.`
      );
    }
  }

  /**
   * Dual-Transport Real-Time Progress Streamer:
   * 1. Attempts WebSocket connection to ws://localhost:8000/ws/analyze/{job_id}
   * 2. Automatically falls back to HTTP Polling GET /api/v1/analyze/{job_id}/progress every 800ms
   */
  async trackJobProgress(
    jobId: string,
    initialEvent: JobProgressEvent | null,
    options?: AnalyzeOptions
  ): Promise<AnalysisResponse> {
    const pollInterval =
      options?.pollIntervalMs ||
      Number(process.env.ARPEGIA_ASYNC_POLL_INTERVAL_MS) ||
      800;

    return new Promise<AnalysisResponse>((resolve, reject) => {
      let isFinished = false;
      let pollingIntervalId: ReturnType<typeof setInterval> | null = null;
      let ws: WebSocket | null = null;
      let pollFailures = 0;

      const cleanup = () => {
        if (pollingIntervalId) {
          clearInterval(pollingIntervalId);
          pollingIntervalId = null;
        }
        if (ws) {
          try {
            ws.onopen = null;
            ws.onmessage = null;
            ws.onerror = null;
            ws.onclose = null;
            if (
              ws.readyState === WebSocket.OPEN ||
              ws.readyState === WebSocket.CONNECTING
            ) {
              ws.close();
            }
          } catch {
            // ignore socket close errors
          }
          ws = null;
        }
      };

      const handleSuccess = async (event: JobProgressEvent) => {
        if (isFinished) return;
        isFinished = true;
        cleanup();

        options?.onProgressEvent?.(event);
        options?.onProgress?.(100, event.message || "Analysis complete!", event);

        if (event.result) {
          resolve(this.normalizeResponse(event.result));
        } else {
          try {
            const fullData = await this.getAnalysisJob(jobId);
            resolve(this.normalizeResponse(fullData));
          } catch (fetchErr) {
            reject(fetchErr);
          }
        }
      };

      const handleFailure = (event: JobProgressEvent) => {
        if (isFinished) return;
        isFinished = true;
        cleanup();

        options?.onProgressEvent?.(event);
        options?.onProgress?.(
          event.overall_percent || 0,
          event.message || "Analysis failed",
          event
        );

        const errorMsg =
          typeof event.error === "object" &&
          event.error !== null &&
          "message" in event.error
            ? String((event.error as { message: unknown }).message)
            : event.message || "Pipeline processing failed";
        reject(new Error(errorMsg));
      };

      const handleEventFrame = (event: JobProgressEvent) => {
        if (isFinished) return;

        options?.onProgressEvent?.(event);
        options?.onProgress?.(event.overall_percent, event.message, event);

        if (event.status === "completed" || event.event === "job.completed") {
          handleSuccess(event);
        } else if (event.status === "failed" || event.event === "job.failed") {
          handleFailure(event);
        }
      };

      const startHttpPolling = () => {
        if (isFinished || pollingIntervalId) return;

        console.info(
          `[Arpegia API] Initiating HTTP polling fallback for job "${jobId}" (interval: ${pollInterval}ms)`
        );
        options?.onTransportChange?.("polling");

        const poll = async () => {
          if (isFinished) return;
          try {
            const res = await fetch(this.getProgressUrl(jobId));
            if (!res.ok) {
              pollFailures++;
              if (pollFailures > 12) {
                throw new Error(
                  `Polling failed with HTTP ${res.status}: ${res.statusText}`
                );
              }
              return;
            }
            pollFailures = 0;
            const frame: JobProgressEvent = await res.json();
            handleEventFrame(frame);
          } catch (pollErr: unknown) {
            pollFailures++;
            if (pollFailures > 12 && !isFinished) {
              isFinished = true;
              cleanup();
              reject(
                pollErr instanceof Error
                  ? pollErr
                  : new Error("HTTP polling fallback failed repeatedly")
              );
            }
          }
        };

        // Poll immediately then on scheduled interval
        poll();
        pollingIntervalId = setInterval(poll, pollInterval);
      };

      // Attempt WebSocket transport first
      const wsUrl = this.getWsUrl(jobId);
      try {
        if (typeof WebSocket !== "undefined") {
          ws = new WebSocket(wsUrl);

          ws.onopen = () => {
            options?.onTransportChange?.("websocket");
            console.info(`[Arpegia API] WebSocket connected to ${wsUrl}`);
          };

          ws.onmessage = (messageEvent) => {
            try {
              const frame: JobProgressEvent = JSON.parse(messageEvent.data);
              handleEventFrame(frame);
            } catch (jsonErr) {
              console.warn(
                "[Arpegia API] WebSocket frame parsing error:",
                jsonErr
              );
            }
          };

          ws.onerror = (err) => {
            console.warn(
              "[Arpegia API] WebSocket error encountered, switching to HTTP polling:",
              err
            );
            if (!isFinished) {
              startHttpPolling();
            }
          };

          ws.onclose = (closeEvent) => {
            if (!isFinished) {
              console.info(
                `[Arpegia API] WebSocket closed (code ${closeEvent.code}), switching to HTTP polling.`
              );
              startHttpPolling();
            }
          };
        } else {
          startHttpPolling();
        }
      } catch (wsErr) {
        console.warn(
          "[Arpegia API] Failed to instantiate WebSocket, falling back to HTTP polling:",
          wsErr
        );
        startHttpPolling();
      }

      // Safety timeout: abort if pipeline takes longer than 180 seconds
      setTimeout(() => {
        if (!isFinished) {
          isFinished = true;
          cleanup();
          reject(
            new Error(
              `Pipeline analysis timed out after 180 seconds for job ${jobId}`
            )
          );
        }
      }, 180000);
    });
  }

  /**
   * GET /api/v1/analyze/{job_id}/progress — Poll Pipeline Progress (HTTP Fallback)
   */
  async pollJobProgress(jobId: string): Promise<JobProgressEvent> {
    const response = await fetch(this.getProgressUrl(jobId), {
      method: "GET",
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch job progress (${response.status}: ${response.statusText})`
      );
    }

    return response.json();
  }

  /**
   * GET /api/v1/analyze/{job_id} — Retrieve an existing analysis job
   */
  async getAnalysisJob(jobId: string): Promise<AnalysisResponse> {
    const response = await fetch(
      `${this.analyzeUrl}/${encodeURIComponent(jobId)}`,
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
   */
  async updateTablature(
    jobId: string,
    payload: TablatureUpdateRequest,
    currentAnalysis: AnalysisResponse,
    mockMode = false
  ): Promise<UpdateTablatureResult> {
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
      const endpoint = `${this.analyzeUrl}/${encodeURIComponent(
        jobId
      )}/tablature`;
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
          // ignore
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
      const msg = err instanceof Error ? err.message : "Backend unreachable";
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
      const endpoint = `${this.analyzeUrl}/${encodeURIComponent(
        jobId
      )}/arrange`;
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
          // ignore
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
      const endpoint = `${this.analyzeUrl}/${encodeURIComponent(
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
   * Phase 4: Simulates a realistic step-by-step animated progression through all 5 PipelineStepInfo stages
   * (0% -> 25% -> 40% -> 60% -> 85% -> 100% over ~2.5 seconds).
   */
  public async simulateMockPipeline(
    file: File,
    options?: AnalyzeOptions,
    notice?: string
  ): Promise<AnalysisResponse> {
    const jobId = `job_sim_${Date.now()}`;
    const stages = [
      {
        stage: "separating_stems" as PipelineStage,
        overallPercent: 25,
        stepPercent: 100,
        message: "Separating audio stems (Demucs)...",
        detail: "Isolating guitar & bass tracks with Demucs...",
      },
      {
        stage: "detecting_key_tempo" as PipelineStage,
        overallPercent: 40,
        stepPercent: 100,
        message: "Detecting musical key & tempo...",
        detail: "Detected G Major @ 105 BPM (confidence 0.95)",
      },
      {
        stage: "detecting_chords" as PipelineStage,
        overallPercent: 60,
        stepPercent: 100,
        message: "Recognizing chords & improvisations...",
        detail: "Identified 4 harmonic chords & jazz/neo-soul voicings",
      },
      {
        stage: "transcribing_tablature" as PipelineStage,
        overallPercent: 85,
        stepPercent: 100,
        message: "Transcribing guitar tablature...",
        detail: "Basic Pitch polyphonic extraction + Viterbi trellis dynamic programming",
      },
      {
        stage: "generating_arrangement" as PipelineStage,
        overallPercent: 100,
        stepPercent: 100,
        message: notice || "Generating fingerstyle arrangement...",
        detail: "Synthesizing fingerstyle solo arrangement with alternating thumb bass",
      },
    ];

    // Initial 0% snapshot
    const initialSteps: PipelineStepInfo[] = CANONICAL_PIPELINE_STAGES.map(
      (s, idx) => ({
        stage: s.stage,
        label: s.label,
        status: idx === 0 ? "in_progress" : "pending",
        progress_percent: 0,
        detail: idx === 0 ? "Preparing Demucs audio separation..." : null,
      })
    );

    const startEvent: JobProgressEvent = {
      event: "job.progress",
      job_id: jobId,
      status: "processing",
      current_stage: "separating_stems",
      overall_percent: 0,
      message: "Initializing AI pipeline...",
      steps: initialSteps,
      updated_at: new Date().toISOString(),
      result: null,
      error: null,
    };

    options?.onProgressEvent?.(startEvent);
    options?.onProgress?.(0, startEvent.message, startEvent);

    // 5 stages * 500ms = 2500ms (~2.5 seconds)
    const delayPerStage = 500;

    for (let i = 0; i < stages.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, delayPerStage));
      const current = stages[i];

      const currentSteps: PipelineStepInfo[] = CANONICAL_PIPELINE_STAGES.map(
        (s, sIdx) => {
          if (sIdx < i) {
            return {
              stage: s.stage,
              label: s.label,
              status: "completed",
              progress_percent: 100,
              detail: stages[sIdx].detail,
            };
          } else if (sIdx === i) {
            return {
              stage: s.stage,
              label: s.label,
              status: i === stages.length - 1 ? "completed" : "in_progress",
              progress_percent: current.stepPercent,
              detail: current.detail,
            };
          } else {
            return {
              stage: s.stage,
              label: s.label,
              status: "pending",
              progress_percent: 0,
              detail: null,
            };
          }
        }
      );

      const isLast = i === stages.length - 1;
      const completedResult: AnalysisResponse = {
        ...MOCK_ANALYSIS_RESPONSE,
        job_id: jobId,
        metadata: {
          ...MOCK_ANALYSIS_RESPONSE.metadata,
          filename: file.name || "uploaded_audio.mp3",
        },
      };
      const normalizedResult = this.normalizeResponse(completedResult);

      const event: JobProgressEvent = {
        event: isLast ? "job.completed" : "job.progress",
        job_id: jobId,
        status: isLast ? "completed" : "processing",
        current_stage: isLast ? "completed" : current.stage,
        overall_percent: current.overallPercent,
        message: current.message,
        steps: currentSteps,
        updated_at: new Date().toISOString(),
        result: isLast ? normalizedResult : null,
        error: null,
      };

      options?.onProgressEvent?.(event);
      options?.onProgress?.(current.overallPercent, current.message, event);

      if (isLast) {
        return normalizedResult;
      }
    }

    return this.normalizeResponse({
      ...MOCK_ANALYSIS_RESPONSE,
      job_id: jobId,
      metadata: {
        ...MOCK_ANALYSIS_RESPONSE.metadata,
        filename: file.name || "uploaded_audio.mp3",
      },
    });
  }

  /**
   * Phase 5: Retrieve all 5 guitar tuning presets with exact physical target frequencies
   * (GET /api/v1/tuner/presets) with built-in canonical offline fallback.
   */
  async getTuningPresets(referenceA4Hz = 440.0): Promise<TuningPreset[]> {
    try {
      const url = `${this.httpBaseUrl}/api/v1/tuner/presets?reference_a4_hz=${referenceA4Hz}`;
      const res = await fetch(url, { method: "GET" });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data as TuningPreset[];
        }
      }
    } catch {
      // Backend unavailable; graceful fallback
    }
    return CANONICAL_TUNING_PRESETS;
  }

  /**
   * Phase 5: Stateless single frame real-time chord detection (POST /api/v1/live/detect-chord)
   * with automatic client-side chroma template matching fallback.
   */
  async detectLiveChord(
    frame: LiveChordFrameRequest
  ): Promise<LiveChordDetectionResult> {
    try {
      const url = `${this.httpBaseUrl}/api/v1/live/detect-chord`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(frame),
      });
      if (res.ok) {
        const data = await res.json();
        return data as LiveChordDetectionResult;
      }
    } catch {
      // Network/server offline; client template matching fallback
    }
    return matchChromaToChord(frame.chroma || []);
  }
}

export const api = new ArpegiaApiClient();
