#!/usr/bin/env node
/**
 * Arpegia Phase 2 End-to-End (E2E) Integration & Smoke Test
 *
 * Verifies live communication across services:
 * 1. Checks GET /health -> asserts 200 OK.
 * 2. Generates a synthetic multi-note guitar WAV file (arpeggiated E Minor melody).
 * 3. Uploads audio to POST /api/v1/analyze.
 * 4. Asserts 200 OK and validates Phase 2 chord_diagrams (6-string frets & fingers)
 *    and tablature (tuning, capo, difficulty, measures with strings 1-6 & frets 0-24, 6-line ascii_tab).
 * 5. Sends PUT /api/v1/analyze/{job_id}/tablature modifying the first note's fret and technique ("slide").
 * 6. Asserts 200 OK, verifies returned ascii_tab and note metadata, and verifies GET persistence.
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
  buffer.writeUInt32LE(sampleRate * 2, 28); // ByteRate (sampleRate * channels * 2)
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
 * Main E2E runner.
 */
async function runSmokeTest() {
  console.log("\n🎸 ===================================================================");
  console.log("   Arpegia Phase 2 E2E Integration & Smoke Test (Live API)");
  console.log("=====================================================================\n");

  const startTime = Date.now();
  let serverProcess = null;

  // 1. Ensure API server is accessible
  console.log(`[1/5] Checking API gateway health at ${API_URL}/health ...`);
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

    // Wait up to 15s for server to become healthy
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

  // Step A: Healthcheck Assertion
  const healthRes = await fetch(`${API_URL}/health`);
  if (!healthRes.ok) {
    throw new Error(`Healthcheck failed with HTTP ${healthRes.status}: ${healthRes.statusText}`);
  }
  const healthData = await healthRes.json();
  console.log(`  ✓ GET /health returned 200 OK (service: "${healthData.service || "arpegia-api"}", status: "${healthData.status}")`);

  try {
    // Step B: Generate synthetic multi-note guitar WAV file
    console.log("\n[2/5] Synthesizing multi-note guitar WAV file (E Minor arpeggio)...");
    const wavBuffer = createSyntheticGuitarArpeggioWav({
      frequencies: [164.81, 196.00, 246.94, 329.63], // E3, G3, B3, E4
      noteDuration: 0.5,
      sampleRate: 22050,
    });
    console.log(`  ✓ Generated 16-bit PCM WAV (${wavBuffer.byteLength} bytes, 2.0s duration, 22050 Hz)`);

    // Step C: Upload to POST /api/v1/analyze
    console.log("\n[3/5] Uploading audio to POST /api/v1/analyze (Guitar Intelligence Pipeline)...");
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

    // Validate top-level fields
    if (!analysis.job_id || analysis.status !== "completed") {
      throw new Error(`Invalid analysis response: status='${analysis.status}', job_id='${analysis.job_id}'`);
    }
    console.log(`  ✓ Metadata: key="${analysis.metadata?.key}", bpm=${analysis.metadata?.bpm}, duration=${analysis.metadata?.duration}s`);

    // Validate chord_diagrams
    const diagrams = analysis.chord_diagrams;
    if (!Array.isArray(diagrams) || diagrams.length === 0) {
      throw new Error("Missing or empty chord_diagrams in analysis response");
    }
    for (const d of diagrams) {
      if (typeof d.chord !== "string" || !Array.isArray(d.frets) || d.frets.length !== 6 || !Array.isArray(d.fingers) || d.fingers.length !== 6) {
        throw new Error(`Malformed chord diagram: ${JSON.stringify(d)}`);
      }
    }
    console.log(`  ✓ Validated ${diagrams.length} chord diagrams with 6-string frets & fingers`);

    // Validate tablature
    const tab = analysis.tablature;
    if (!tab || !Array.isArray(tab.measures) || tab.measures.length === 0) {
      throw new Error("Missing or empty tablature.measures in analysis response");
    }
    if (!tab.tuning || tab.tuning.length !== 6) {
      throw new Error(`Invalid tablature tuning: ${JSON.stringify(tab?.tuning)}`);
    }

    const m1Notes = tab.measures[0]?.notes || [];
    if (m1Notes.length === 0) {
      throw new Error("Tablature measure 1 contains no transcribed notes");
    }

    for (const note of m1Notes) {
      if (note.string < 1 || note.string > 6 || note.fret < 0 || note.fret > 24) {
        throw new Error(`Out of range note (string=${note.string}, fret=${note.fret}) in measure 1`);
      }
      if (!["normal", "hammer-on", "pull-off", "slide", "bend"].includes(note.technique)) {
        throw new Error(`Invalid technique '${note.technique}' on note ${note.id}`);
      }
    }
    console.log(`  ✓ Validated ${tab.measures.length} measure(s) with ${m1Notes.length} notes in Measure 1 (Strings 1-6, Frets 0-24)`);

    // Validate 6-line ascii_tab
    const asciiLines = tab.ascii_tab.trim().split("\n");
    if (asciiLines.length !== 6) {
      throw new Error(`Expected 6 lines in ascii_tab, got ${asciiLines.length}`);
    }
    console.log("  ✓ Validated canonical 6-line ASCII tab rendering:\n");
    console.log(tab.ascii_tab.split("\n").map((l) => `     ${l}`).join("\n"));

    // Step D: Interactive Tab Note Edit (PUT /api/v1/analyze/{job_id}/tablature)
    console.log("\n[4/5] Testing Interactive Tab Editor (PUT /api/v1/analyze/{job_id}/tablature)...");
    const targetNote = m1Notes[0];
    const originalFret = targetNote.fret;
    const originalTech = targetNote.technique;
    const targetFret = 4;
    const targetTech = "slide";

    console.log(`  • Modifying Note '${targetNote.id}' (String ${targetNote.string}): Fret ${originalFret} -> ${targetFret}, Technique '${originalTech}' -> '${targetTech}'`);

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
    const updatedM1Notes = updatedAnalysis.tablature.measures[0]?.notes || [];
    const updatedTarget = updatedM1Notes.find((n) => n.id === targetNote.id);

    if (!updatedTarget) {
      throw new Error(`Updated note '${targetNote.id}' not found in returned response measures`);
    }
    if (updatedTarget.fret !== targetFret || updatedTarget.technique !== targetTech) {
      throw new Error(`Edit not reflected in note: expected fret=${targetFret}, tech='${targetTech}', got fret=${updatedTarget.fret}, tech='${updatedTarget.technique}'`);
    }
    console.log(`  ✓ Note updated successfully: Pitch=${updatedTarget.note_name} (MIDI ${updatedTarget.midi}), Articulation='${updatedTarget.technique}'`);

    // Verify regenerated ASCII tab contains slide marker '4/'
    const updatedAscii = updatedAnalysis.tablature.ascii_tab;
    if (!updatedAscii.includes("4/")) {
      throw new Error(`Regenerated ASCII tab does not contain slide marker '4/':\n${updatedAscii}`);
    }
    console.log("  ✓ Canonical 6-line ASCII tab regenerated with slide articulation marker ('4/'):\n");
    console.log(updatedAscii.split("\n").map((l) => `     ${l}`).join("\n"));

    // Step E: Verify persistence via GET /api/v1/analyze/{job_id}
    console.log("\n[5/5] Verifying persistent store via GET /api/v1/analyze/{job_id}...");
    const getRes = await fetch(`${API_URL}/api/v1/analyze/${analysis.job_id}`);
    if (!getRes.ok) {
      throw new Error(`GET /api/v1/analyze/{job_id} failed with HTTP ${getRes.status}`);
    }

    const retrievedAnalysis = await getRes.json();
    const persistedTarget = retrievedAnalysis.tablature.measures[0]?.notes.find((n) => n.id === targetNote.id);
    if (!persistedTarget || persistedTarget.fret !== targetFret || persistedTarget.technique !== targetTech) {
      throw new Error("Persisted note in GET response did not match edited values");
    }
    if (!retrievedAnalysis.tablature.ascii_tab.includes("4/")) {
      throw new Error("Persisted ASCII tab does not contain edited note marker");
    }
    console.log(`  ✓ GET /api/v1/analyze/${analysis.job_id} confirmed persisted edit & regenerated ASCII tab.`);

    const durationSeconds = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log("\n=====================================================================");
    console.log(`🎉 ALL PHASE 2 E2E SMOKE TESTS PASSED SUCCESSFULLY (${durationSeconds}s)`);
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
