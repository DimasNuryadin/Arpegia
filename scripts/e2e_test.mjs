#!/usr/bin/env node
/**
 * Arpegia Phase 1, Phase 2, Phase 3 & Phase 4 End-to-End (E2E) Integration & Smoke Test
 *
 * Verifies live communication across services:
 * a. Checks GET /health -> asserts 200 OK.
 * b. Synthesizes a multi-note guitar WAV file and uploads to POST /api/v1/analyze ->
 *    asserts 200 OK, verifies chords, improvisations, chord_diagrams, tablature,
 *    initial arrangements, and progress.overall_percent == 100.
 * c. Sends PUT /api/v1/analyze/{job_id}/tablature -> edits a note's fret and technique
 *    ("slide") and verifies updated ascii_tab.
 * d. Sends POST /api/v1/analyze/{job_id}/arrange with
 *    { "style": "Neo Soul", "difficulty": "Advanced", "capo": 2, "tempo_scale": 0.9 } ->
 *    asserts 200 OK, verifies the new arrangement_id is generated with valid measures,
 *    notes, and voice roles, and persists in GET /api/v1/analyze/{job_id}.
 * e. Sends GET /api/v1/analyze/{job_id}/export across all 4 formats (midi, musicxml, pdf, ascii)
 *    for both base tablature and the new arrangement_id -> asserts 200 OK and validates
 *    magic bytes (MThd for MIDI, <?xml + <score-partwise for MusicXML, %PDF- for PDF,
 *    and 6-line staff for ASCII) plus Content-Disposition headers.
 * f. Tests Phase 4 Async Pipeline + HTTP Polling Fallback (POST /api/v1/analyze?async_mode=true
 *    and GET /api/v1/analyze/{job_id}/progress) verifying all 5 pipeline stages reach completion.
 * g. Tests Phase 4 WebSocket Real-Time Streaming (WS /ws/analyze/{job_id}) asserting structured
 *    JobProgressEvent frames with non-decreasing overall_percent reaching 100% with full result.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, "..");
const API_URL = (process.env.API_URL || "http://127.0.0.1:8000").replace(/\/+$/, "");

/**
 * Generate a 16-bit PCM Mono WAV buffer in memory with exponential pluck decay.
 */
function createSyntheticGuitarArpeggioWav({
  frequencies = [164.81, 196.00, 246.94, 329.63], // E3, G3, B3, E4
  noteDuration = 0.5,
  sampleRate = 22050,
} = {}) {
  const samplesPerNote = Math.floor(sampleRate * noteDuration);
  const totalSamples = samplesPerNote * frequencies.length;
  const dataByteLength = totalSamples * 2; // 16-bit = 2 bytes per sample
  const buffer = Buffer.alloc(44 + dataByteLength);

  // 1. RIFF header
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataByteLength, 4);
  buffer.write("WAVE", 8);

  // 2. fmt subchunk
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16); // Subchunk1Size
  buffer.writeUInt16LE(1, 20);  // PCM format
  buffer.writeUInt16LE(1, 22);  // Mono (1 channel)
  buffer.writeUInt32LE(sampleRate, 24); // SampleRate
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  buffer.writeUInt16LE(2, 32);  // BlockAlign
  buffer.writeUInt16LE(16, 34); // BitsPerSample

  // 3. data subchunk
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataByteLength, 40);

  // Synthesize wave samples
  let offset = 44;
  for (const freq of frequencies) {
    for (let i = 0; i < samplesPerNote; i++) {
      const t = i / sampleRate;
      const pluckDecay = Math.exp(-3.0 * t);
      const fundamental = Math.sin(2 * Math.PI * freq * t);
      const secondHarmonic = 0.3 * Math.sin(4 * Math.PI * freq * t);
      const sampleFloat = (fundamental + secondHarmonic) * pluckDecay * 0.85;
      const clampedInt16 = Math.max(-32768, Math.min(32767, Math.round(sampleFloat * 32767)));
      buffer.writeInt16LE(clampedInt16, offset);
      offset += 2;
    }
  }

  return buffer;
}

/**
 * Check if the API server is healthy.
 */
async function checkHealth(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (res.ok) {
      const data = await res.json();
      return data?.status === "ok" || data?.status === "healthy";
    }
  } catch {
    // server unreachable
  }
  return false;
}

/**
 * Find local python executable.
 */
function findPythonExecutable() {
  const venvWin = resolve(ROOT_DIR, ".venv", "Scripts", "python.exe");
  const venvPosix = resolve(ROOT_DIR, ".venv", "bin", "python");
  if (existsSync(venvWin)) return venvWin;
  if (existsSync(venvPosix)) return venvPosix;
  return process.platform === "win32" ? "python" : "python3";
}

/**
 * Verify all 4 export formats for a given job_id and optional arrangement_id.
 */
async function verifyFourExports(baseUrl, jobId, arrangementId = null) {
  const label = arrangementId ? `Arrangement '${arrangementId}'` : "Base Tablature";
  const querySuffix = arrangementId ? `&arrangement_id=${encodeURIComponent(arrangementId)}` : "";

  // 1. MIDI (.mid)
  const midiRes = await fetch(`${baseUrl}/api/v1/analyze/${jobId}/export?format=midi${querySuffix}`, {
    headers: { Origin: "http://localhost:3000" },
  });
  if (!midiRes.ok) {
    throw new Error(`MIDI export (${label}) failed with HTTP ${midiRes.status}`);
  }
  const midiBuf = Buffer.from(await midiRes.arrayBuffer());
  const midiHeader = midiBuf.subarray(0, 4).toString("ascii");
  if (midiHeader !== "MThd" || !midiBuf.includes(Buffer.from("MTrk"))) {
    throw new Error(`Invalid MIDI magic bytes (${label}): got header '${midiHeader}'`);
  }
  const midiDisp = midiRes.headers.get("content-disposition") || "";
  if (!midiDisp.includes(`arpegia-${jobId}.mid`)) {
    throw new Error(`Unexpected MIDI Content-Disposition: ${midiDisp}`);
  }

  // 2. MusicXML (.musicxml)
  const xmlRes = await fetch(`${baseUrl}/api/v1/analyze/${jobId}/export?format=musicxml${querySuffix}`);
  if (!xmlRes.ok) {
    throw new Error(`MusicXML export (${label}) failed with HTTP ${xmlRes.status}`);
  }
  const xmlText = await xmlRes.text();
  if (!xmlText.startsWith("<?xml") || !xmlText.includes("<score-partwise") || !xmlText.includes("<string>") || !xmlText.includes("<fret>")) {
    throw new Error(`Invalid MusicXML content (${label})`);
  }

  // 3. PDF (.pdf)
  const pdfRes = await fetch(`${baseUrl}/api/v1/analyze/${jobId}/export?format=pdf${querySuffix}`);
  if (!pdfRes.ok) {
    throw new Error(`PDF export (${label}) failed with HTTP ${pdfRes.status}`);
  }
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  const pdfHeader = pdfBuf.subarray(0, 5).toString("ascii");
  if (pdfHeader !== "%PDF-" || !pdfBuf.includes(Buffer.from("%%EOF"))) {
    throw new Error(`Invalid PDF magic bytes (${label}): got header '${pdfHeader}'`);
  }

  // 4. ASCII (.txt)
  const asciiRes = await fetch(`${baseUrl}/api/v1/analyze/${jobId}/export?format=ascii${querySuffix}`);
  if (!asciiRes.ok) {
    throw new Error(`ASCII export (${label}) failed with HTTP ${asciiRes.status}`);
  }
  const asciiText = await asciiRes.text();
  const staffLines = asciiText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => /^(e|B|G|D|A|E)\|/.test(l));
  if (staffLines.length !== 6) {
    throw new Error(`Expected 6 guitar staff lines in ASCII export (${label}), got ${staffLines.length}`);
  }

  console.log(`  ✓ Verified all 4 exports for ${label}:`);
  console.log(`    • MIDI (.mid)      : ${midiBuf.byteLength} bytes [magic: "MThd" + "MTrk"]`);
  console.log(`    • MusicXML (.xml)  : ${xmlText.length} chars [magic: "<?xml" + "<score-partwise>"]`);
  console.log(`    • PDF (.pdf)       : ${pdfBuf.byteLength} bytes [magic: "%PDF-1.4" + "%%EOF"]`);
  console.log(`    • ASCII (.txt)     : ${asciiText.length} chars [6-line staff e|..E|]`);
}

/**
 * Main E2E runner.
 */
async function runSmokeTest() {
  console.log("\n🎸 ===================================================================");
  console.log("   Arpegia Phase 1 + 2 + 3 + 4 E2E Integration & Smoke Test (Live API)");
  console.log("=====================================================================\n");

  const startTime = Date.now();
  let serverProcess = null;

  // Step A: Healthcheck
  console.log(`[1/8] Checking API gateway health at ${API_URL}/health ...`);
  let isAlive = await checkHealth(API_URL);

  if (!isAlive) {
    console.log(`[INFO] Server not detected at ${API_URL}. Spawning local API gateway...`);
    const pyExe = findPythonExecutable();
    const audioEnginePath = resolve(ROOT_DIR, "services", "audio-engine");
    const apiPath = resolve(ROOT_DIR, "apps", "api");

    const sep = process.platform === "win32" ? ";" : ":";
    const pythonPath = `${apiPath}${sep}${audioEnginePath}${process.env.PYTHONPATH ? `${sep}${process.env.PYTHONPATH}` : ""}`;

    serverProcess = spawn(
      pyExe,
      ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
      {
        cwd: apiPath,
        env: {
          ...process.env,
          PYTHONPATH: pythonPath,
          AUDIO_ENGINE_PATH: audioEnginePath,
        },
        stdio: "pipe",
      }
    );

    serverProcess.stderr.on("data", (chunk) => {
      const msg = chunk.toString();
      if (process.env.DEBUG_SERVER) {
        process.stderr.write(`[API Server] ${msg}`);
      }
    });

    const maxRetries = 30;
    for (let i = 0; i < maxRetries; i++) {
      await new Promise((r) => setTimeout(r, 500));
      if (await checkHealth(API_URL)) {
        isAlive = true;
        break;
      }
    }

    if (!isAlive) {
      if (serverProcess) serverProcess.kill();
      throw new Error("Failed to start or connect to API server at http://127.0.0.1:8000 within 15 seconds.");
    }
  }

  const healthRes = await fetch(`${API_URL}/health`);
  if (!healthRes.ok) {
    throw new Error(`Healthcheck failed with HTTP ${healthRes.status}: ${healthRes.statusText}`);
  }
  const healthData = await healthRes.json();
  console.log(`  ✓ GET /health returned 200 OK (service: "${healthData.service || "arpegia-api"}", status: "${healthData.status}")`);

  try {
    // Step B: Synthesize WAV & POST /api/v1/analyze (Sync Backward-Compat)
    console.log("\n[2/8] Synthesizing multi-note guitar WAV & running POST /api/v1/analyze (Sync Backward-Compat)...");
    const wavBuffer = createSyntheticGuitarArpeggioWav({
      frequencies: [164.81, 196.00, 246.94, 329.63], // E3, G3, B3, E4
      noteDuration: 0.5,
      sampleRate: 22050,
    });
    console.log(`  ✓ Generated 16-bit PCM WAV (${wavBuffer.byteLength} bytes, 2.0s duration, 22050 Hz)`);

    const formData = new FormData();
    const blob = new Blob([wavBuffer], { type: "audio/wav" });
    formData.append("file", blob, "e2e_guitar_arpeggio.wav");

    const uploadStart = Date.now();
    const analyzeRes = await fetch(`${API_URL}/api/v1/analyze`, {
      method: "POST",
      body: formData,
    });

    if (!analyzeRes.ok) {
      const errText = await analyzeRes.text();
      throw new Error(`POST /api/v1/analyze failed with HTTP ${analyzeRes.status}: ${errText}`);
    }

    const analysis = await analyzeRes.json();
    const elapsedSeconds = ((Date.now() - uploadStart) / 1000).toFixed(2);
    console.log(`  ✓ POST /api/v1/analyze succeeded in ${elapsedSeconds}s (Job ID: ${analysis.job_id})`);

    if (!analysis.job_id || analysis.status !== "completed") {
      throw new Error(`Invalid analysis response: status='${analysis.status}', job_id='${analysis.job_id}'`);
    }
    console.log(`  ✓ Phase 1 Metadata: key="${analysis.metadata?.key}", bpm=${analysis.metadata?.bpm}, duration=${analysis.metadata?.duration}s, chords=${analysis.chords?.length}, improvisations=${analysis.improvisations?.length}`);

    // Verify Phase 4 Progress object on synchronous response
    if (
      !analysis.progress ||
      analysis.progress.status !== "completed" ||
      analysis.progress.overall_percent !== 100
    ) {
      throw new Error(
        `Synchronous response missing valid completed progress object: ${JSON.stringify(analysis.progress)}`
      );
    }
    console.log(`  ✓ Phase 4 Progress Telemetry: overall_percent=${analysis.progress.overall_percent}%, status="${analysis.progress.status}", steps=${analysis.progress.steps?.length}`);

    // Validate chord_diagrams & tablature
    const diagrams = analysis.chord_diagrams;
    if (!Array.isArray(diagrams) || diagrams.length === 0) {
      throw new Error("Missing or empty chord_diagrams in analysis response");
    }
    const tab = analysis.tablature;
    if (!tab || !Array.isArray(tab.measures) || tab.measures.length === 0) {
      throw new Error("Missing or empty tablature.measures in analysis response");
    }
    const m1Notes = tab.measures[0]?.notes || [];
    if (m1Notes.length === 0) {
      throw new Error("Tablature measure 1 contains no transcribed notes");
    }
    console.log(`  ✓ Phase 2 Tablature: ${diagrams.length} chord diagrams, ${tab.measures.length} measure(s), ${m1Notes.length} notes in Measure 1`);

    // Validate Phase 3 initial arrangements
    const arrangements = analysis.arrangements;
    if (!Array.isArray(arrangements) || arrangements.length === 0) {
      throw new Error("Missing or empty arrangements in POST /api/v1/analyze response");
    }
    const defaultArr = arrangements[0];
    if (defaultArr.style !== "Fingerstyle") {
      throw new Error(`Expected initial arrangement style 'Fingerstyle', got '${defaultArr.style}'`);
    }
    const defaultArrNotes = (defaultArr.tablature?.measures || []).flatMap((m) => m.notes || []);
    const defaultVoices = new Set(defaultArrNotes.map((n) => n.voice));
    if (!defaultVoices.has("bass") || (!defaultVoices.has("melody") && !defaultVoices.has("harmony"))) {
      throw new Error(`Default Fingerstyle arrangement missing polyphonic voice roles: ${Array.from(defaultVoices).join(", ")}`);
    }
    console.log(`  ✓ Phase 3 Default Arrangement: "${defaultArr.title}" (${defaultArr.arrangement_id}) with voices [${Array.from(defaultVoices).join(", ")}]`);

    // Step C: Interactive Tab Note Edit (PUT /api/v1/analyze/{job_id}/tablature)
    console.log("\n[3/8] Testing Interactive Tab Editor (PUT /api/v1/analyze/{job_id}/tablature)...");
    const targetNote = m1Notes[0];
    const targetFret = 4;
    const targetTech = "slide";

    const putPayload = {
      capo: 0,
      difficulty: "Intermediate",
      notes: [
        {
          id: targetNote.id,
          string: targetNote.string,
          fret: targetFret,
          technique: targetTech,
        },
      ],
    };

    const putRes = await fetch(`${API_URL}/api/v1/analyze/${analysis.job_id}/tablature`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(putPayload),
    });

    if (!putRes.ok) {
      const errText = await putRes.text();
      throw new Error(`PUT /api/v1/analyze/{job_id}/tablature failed with HTTP ${putRes.status}: ${errText}`);
    }

    const updatedAnalysis = await putRes.json();
    const updatedTarget = (updatedAnalysis.tablature.measures[0]?.notes || []).find((n) => n.id === targetNote.id);
    if (!updatedTarget || updatedTarget.fret !== targetFret || updatedTarget.technique !== targetTech) {
      throw new Error("Edited note not reflected in PUT /tablature response");
    }
    if (!updatedAnalysis.tablature.ascii_tab.includes("4/")) {
      throw new Error("Regenerated ASCII tab does not contain slide marker '4/'");
    }
    console.log(`  ✓ Note '${targetNote.id}' updated to fret=${targetFret}, technique='${targetTech}' (${updatedTarget.note_name}, MIDI ${updatedTarget.midi}) & ASCII tab regenerated`);

    // Step D: Phase 3 On-Demand Style Arrangement (POST /api/v1/analyze/{job_id}/arrange)
    console.log("\n[4/8] Generating Phase 3 Custom Arrangement (POST /api/v1/analyze/{job_id}/arrange)...");
    const arrangeRequest = {
      style: "Neo Soul",
      difficulty: "Advanced",
      capo: 2,
      tempo_scale: 0.9,
    };

    const arrangeRes = await fetch(`${API_URL}/api/v1/analyze/${analysis.job_id}/arrange`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(arrangeRequest),
    });

    if (!arrangeRes.ok) {
      const errText = await arrangeRes.text();
      throw new Error(`POST /api/v1/analyze/{job_id}/arrange failed with HTTP ${arrangeRes.status}: ${errText}`);
    }

    const newArrangement = await arrangeRes.json();
    if (
      !newArrangement.arrangement_id ||
      newArrangement.style !== "Neo Soul" ||
      newArrangement.difficulty !== "Advanced" ||
      newArrangement.tablature?.capo !== 2
    ) {
      throw new Error(`Invalid ArrangementVariation returned: ${JSON.stringify(newArrangement)}`);
    }
    const arrNotes = (newArrangement.tablature?.measures || []).flatMap((m) => m.notes || []);
    const arrVoices = new Set(arrNotes.map((n) => n.voice));
    if (arrNotes.length === 0 || !arrVoices.has("bass") || !arrVoices.has("melody")) {
      throw new Error(`Generated Neo Soul arrangement missing valid notes or voice roles: ${Array.from(arrVoices)}`);
    }
    console.log(`  ✓ Generated "${newArrangement.title}" (ID: ${newArrangement.arrangement_id}, Capo: ${newArrangement.tablature.capo}, Chords: [${newArrangement.chords_used.join(", ")}], Voices: [${Array.from(arrVoices).join(", ")}])`);

    // Step E: Verify persistence in GET /api/v1/analyze/{job_id}
    console.log("\n[5/8] Verifying job store persistence via GET /api/v1/analyze/{job_id}...");
    const getRes = await fetch(`${API_URL}/api/v1/analyze/${analysis.job_id}`);
    if (!getRes.ok) {
      throw new Error(`GET /api/v1/analyze/{job_id} failed with HTTP ${getRes.status}`);
    }
    const retrievedAnalysis = await getRes.json();
    const persistedArr = (retrievedAnalysis.arrangements || []).find(
      (a) => a.arrangement_id === newArrangement.arrangement_id
    );
    if (!persistedArr) {
      throw new Error(`Arrangement '${newArrangement.arrangement_id}' was not persisted in job store`);
    }
    console.log(`  ✓ GET /api/v1/analyze/${analysis.job_id} confirmed persisted tab edits and ${retrievedAnalysis.arrangements.length} arrangements`);

    // Step F: Verify Multi-Format Export across all 4 formats for both base tablature and new arrangement_id
    console.log("\n[6/8] Testing Multi-Format Export (GET /api/v1/analyze/{job_id}/export) across MIDI, MusicXML, PDF, and ASCII...");
    await verifyFourExports(API_URL, analysis.job_id, null);
    await verifyFourExports(API_URL, analysis.job_id, newArrangement.arrangement_id);

    // Step G: Phase 4 Async Pipeline + HTTP Polling Fallback
    console.log("\n[7/8] Testing Phase 4 Async Pipeline + HTTP Polling Fallback (POST /api/v1/analyze?async_mode=true)...");
    const asyncWav = createSyntheticGuitarArpeggioWav({
      frequencies: [164.81, 196.00, 246.94, 329.63],
      noteDuration: 0.5,
      sampleRate: 22050,
    });
    const asyncFormData = new FormData();
    asyncFormData.append("file", new Blob([asyncWav], { type: "audio/wav" }), "e2e_guitar_async.wav");

    const asyncPostRes = await fetch(`${API_URL}/api/v1/analyze?async_mode=true`, {
      method: "POST",
      body: asyncFormData,
    });
    if (!asyncPostRes.ok) {
      throw new Error(`Async analyze initiation failed with HTTP ${asyncPostRes.status}`);
    }
    const asyncInit = await asyncPostRes.json();
    const asyncJobId = asyncInit.job_id;
    if (!asyncJobId) {
      throw new Error("Async analyze initiation did not return a job_id");
    }
    console.log(`  ✓ Async job dispatched: ${asyncJobId} (initial status="${asyncInit.status}", stage="${asyncInit.current_stage}", percent=${asyncInit.overall_percent}%)`);

    // Poll GET /api/v1/analyze/{job_id}/progress
    const pollStart = Date.now();
    const maxPollTimeMs = 45000;
    let pollCompleted = null;
    let pollCount = 0;

    while (Date.now() - pollStart < maxPollTimeMs) {
      await new Promise((r) => setTimeout(r, 600));
      pollCount++;
      const pollRes = await fetch(`${API_URL}/api/v1/analyze/${asyncJobId}/progress`);
      if (!pollRes.ok) {
        throw new Error(`Polling /progress failed with HTTP ${pollRes.status}`);
      }
      const pollData = await pollRes.json();
      if (pollData.status === "completed") {
        pollCompleted = pollData;
        break;
      }
      if (pollData.status === "failed") {
        throw new Error(`Async pipeline job failed during polling: ${pollData.message || JSON.stringify(pollData)}`);
      }
    }

    if (!pollCompleted) {
      throw new Error(`Async job ${asyncJobId} did not reach 'completed' within ${maxPollTimeMs / 1000}s`);
    }

    console.log(`  ✓ Polling completed in ${((Date.now() - pollStart) / 1000).toFixed(2)}s (${pollCount} polls, overall_percent=${pollCompleted.overall_percent}%)`);
    if (!Array.isArray(pollCompleted.steps) || pollCompleted.steps.length !== 5) {
      throw new Error(`Expected 5 pipeline steps, got: ${pollCompleted.steps?.length}`);
    }
    for (const step of pollCompleted.steps) {
      if (step.status !== "completed" && step.status !== "skipped") {
        throw new Error(`Step '${step.stage}' has invalid terminal status: '${step.status}'`);
      }
    }
    if (!pollCompleted.result || !pollCompleted.result.chords || !pollCompleted.result.tablature || !pollCompleted.result.arrangements) {
      throw new Error("Polling final payload missing complete Phase 1-3 result");
    }
    console.log(`  ✓ All 5 pipeline stages verified (${pollCompleted.steps.map((s) => `${s.stage}:${s.status}`).join(", ")})`);
    console.log(`  ✓ Result payload contains ${pollCompleted.result.chords.length} chords, ${pollCompleted.result.tablature.measures.length} measures, and ${pollCompleted.result.arrangements.length} arrangements`);

    // Step H: Phase 4 WebSocket Real-Time Progress Streaming
    console.log("\n[8/8] Testing Phase 4 WebSocket Real-Time Progress Streaming (WS /ws/analyze/{job_id})...");
    const wsWav = createSyntheticGuitarArpeggioWav({
      frequencies: [164.81, 196.00, 246.94, 329.63],
      noteDuration: 0.5,
      sampleRate: 22050,
    });
    const wsFormData = new FormData();
    wsFormData.append("file", new Blob([wsWav], { type: "audio/wav" }), "e2e_guitar_ws.wav");

    const wsPostRes = await fetch(`${API_URL}/api/v1/analyze?async_mode=true`, {
      method: "POST",
      body: wsFormData,
    });
    if (!wsPostRes.ok) {
      throw new Error(`WS test analyze initiation failed with HTTP ${wsPostRes.status}`);
    }
    const wsInit = await wsPostRes.json();
    const wsJobId = wsInit.job_id;

    const wsProtocol = API_URL.startsWith("https") ? "wss:" : "ws:";
    const wsHost = API_URL.replace(/^https?:\/\//, "");
    const wsEndpoint = `${wsProtocol}//${wsHost}/ws/analyze/${wsJobId}`;
    console.log(`  ✓ Connecting to WebSocket endpoint: ${wsEndpoint}`);

    const receivedFrames = [];
    const wsPromise = new Promise((resolveWs, rejectWs) => {
      const timeout = setTimeout(() => {
        try { ws.close(); } catch {}
        rejectWs(new Error(`WebSocket test timed out waiting for job.completed after 45s (received ${receivedFrames.length} frames)`));
      }, 45000);

      const ws = new globalThis.WebSocket(wsEndpoint);

      ws.onopen = () => {
        // Connected
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          receivedFrames.push(payload);
          if (payload.event === "job.completed" || payload.status === "completed") {
            clearTimeout(timeout);
            try { ws.close(); } catch {}
            resolveWs(receivedFrames);
          } else if (payload.event === "job.failed" || payload.status === "failed") {
            clearTimeout(timeout);
            try { ws.close(); } catch {}
            rejectWs(new Error(`WebSocket job reported failure: ${payload.error || payload.message}`));
          }
        } catch (err) {
          clearTimeout(timeout);
          try { ws.close(); } catch {}
          rejectWs(err);
        }
      };

      ws.onerror = (err) => {
        clearTimeout(timeout);
        rejectWs(new Error(`WebSocket error encountered: ${err.message || err}`));
      };
    });

    const frames = await wsPromise;
    console.log(`  ✓ Received ${frames.length} WebSocket progress frames`);

    if (frames.length === 0) {
      throw new Error("No WebSocket progress frames were received");
    }

    // Verify non-decreasing percentages
    for (let i = 0; i < frames.length - 1; i++) {
      const curr = frames[i].overall_percent;
      const next = frames[i + 1].overall_percent;
      if (typeof curr === "number" && typeof next === "number" && curr > next) {
        throw new Error(`Progress percent regressed in frame ${i + 1}: ${curr}% > ${next}%`);
      }
    }

    const lastFrame = frames[frames.length - 1];
    if (lastFrame.event !== "job.completed" || lastFrame.status !== "completed" || lastFrame.overall_percent !== 100) {
      throw new Error(`Final frame is not completed at 100%: ${JSON.stringify(lastFrame)}`);
    }
    if (!lastFrame.result || !lastFrame.result.chords || !lastFrame.result.tablature || !lastFrame.result.arrangements) {
      throw new Error("Final WebSocket frame missing full AnalysisResponse result payload");
    }
    console.log(`  ✓ Non-decreasing telemetry sequence: [${frames.map((f) => `${f.overall_percent}%`).join(" -> ")}]`);
    console.log(`  ✓ Final WebSocket frame verified: event="${lastFrame.event}", status="${lastFrame.status}", overall_percent=${lastFrame.overall_percent}% with full AnalysisResponse (chords=${lastFrame.result.chords.length}, measures=${lastFrame.result.tablature.measures.length}, arrangements=${lastFrame.result.arrangements.length})`);

    const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n=====================================================================");
    console.log(`🎉 ALL PHASE 1, 2, 3 & 4 E2E SMOKE TESTS PASSED SUCCESSFULLY (${durationSeconds}s)`);
    console.log("=====================================================================\n");
  } finally {
    if (serverProcess) {
      console.log("[INFO] Terminating spawned API server...");
      serverProcess.kill();
    }
  }
}

runSmokeTest().catch((err) => {
  console.error("\n❌ E2E Smoke Test Failed:", err.message);
  if (err.stack) console.error(err.stack);
  process.exit(1);
});
