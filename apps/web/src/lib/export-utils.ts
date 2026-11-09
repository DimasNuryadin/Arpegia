import {
  DEFAULT_GUITAR_TUNING,
  ExportFormat,
  SongMetadata,
  TablatureData,
} from "../types";

export interface ClientExportMetadata {
  jobId: string;
  title?: string;
  style?: string;
  arrangementId?: string | null;
  songMetadata?: SongMetadata;
}

/**
 * Encodes a non-negative integer into standard MIDI Variable Length Quantity (VLQ) bytes.
 */
function encodeVlq(value: number): number[] {
  let v = Math.max(0, Math.round(value));
  const bytes: number[] = [v & 0x7f];
  v >>= 7;
  while (v > 0) {
    bytes.unshift((v & 0x7f) | 0x80);
    v >>= 7;
  }
  return bytes;
}

/**
 * Builds a valid Standard MIDI File (Format 0, 1 track, 480 ticks per quarter note)
 * from TablatureData so downloaded .mid files open in any DAW or notation software.
 */
export function generateClientMidiBytes(
  tablature: TablatureData,
  bpm = 105
): Uint8Array {
  const ticksPerBeat = 480;
  const safeBpm = Math.max(40, Math.min(240, Math.round(bpm || 105)));
  const microsecondsPerBeat = Math.round(60_000_000 / safeBpm);

  const secToTicks = (sec: number): number => {
    const beats = (sec * safeBpm) / 60;
    return Math.max(0, Math.round(beats * ticksPerBeat));
  };

  interface MidiEvent {
    tick: number;
    bytes: number[];
  }

  const events: MidiEvent[] = [];

  // Tempo meta event at tick 0 (FF 51 03 tt tt tt)
  events.push({
    tick: 0,
    bytes: [
      0xff,
      0x51,
      0x03,
      (microsecondsPerBeat >> 16) & 0xff,
      (microsecondsPerBeat >> 8) & 0xff,
      microsecondsPerBeat & 0xff,
    ],
  });

  // Program Change to Acoustic Guitar (Nylon = 24 / Steel = 25) on channel 0
  events.push({
    tick: 0,
    bytes: [0xc0, 25],
  });

  const allNotes = (tablature.measures || [])
    .flatMap((m) => m.notes || [])
    .sort((a, b) => a.start_time - b.start_time);

  for (const note of allNotes) {
    const startTick = secToTicks(note.start_time);
    const durTicks = Math.max(60, secToTicks(note.duration || 0.5));
    const endTick = startTick + durTicks;
    const midiPitch = Math.max(0, Math.min(127, Math.round(note.midi || 60)));
    const velocity =
      note.voice === "bass"
        ? 96
        : note.voice === "melody"
        ? 104
        : note.voice === "percussive"
        ? 72
        : 84;

    events.push({
      tick: startTick,
      bytes: [0x90, midiPitch, velocity],
    });
    events.push({
      tick: endTick,
      bytes: [0x80, midiPitch, 0x00],
    });
  }

  events.sort((a, b) => a.tick - b.tick);

  const trackData: number[] = [];
  let lastTick = 0;

  for (const ev of events) {
    const delta = Math.max(0, ev.tick - lastTick);
    lastTick = ev.tick;
    trackData.push(...encodeVlq(delta), ...ev.bytes);
  }

  // End of Track meta event (00 FF 2F 00)
  trackData.push(0x00, 0xff, 0x2f, 0x00);

  const trackLen = trackData.length;
  const headerAndTrack: number[] = [
    // "MThd"
    0x4d, 0x54, 0x68, 0x64,
    // Header length = 6
    0x00, 0x00, 0x00, 0x06,
    // Format 0
    0x00, 0x00,
    // 1 track
    0x00, 0x01,
    // Division = 480 ticks/quarter
    (ticksPerBeat >> 8) & 0xff,
    ticksPerBeat & 0xff,
    // "MTrk"
    0x4d, 0x54, 0x72, 0x6b,
    // Track byte length
    (trackLen >> 24) & 0xff,
    (trackLen >> 16) & 0xff,
    (trackLen >> 8) & 0xff,
    trackLen & 0xff,
    ...trackData,
  ];

  return new Uint8Array(headerAndTrack);
}

/**
 * Generates a MusicXML 4.0 score-partwise document with 6-string guitar tuning,
 * tablature staff details (<string> and <fret> technical notations), and voice annotations.
 */
export function generateClientMusicXml(
  tablature: TablatureData,
  meta: ClientExportMetadata
): string {
  const title = meta.title || meta.songMetadata?.filename || "Arpegia Guitar Arrangement";
  const tuning =
    tablature.tuning && tablature.tuning.length === 6
      ? tablature.tuning
      : DEFAULT_GUITAR_TUNING;

  const parseStepAlterOctave = (noteName: string) => {
    const match = (noteName || "E4").trim().match(/^([A-G])(#|b)?(-?\d+)$/i);
    if (!match) {
      return { step: "E", alter: 0, octave: 4 };
    }
    const step = match[1].toUpperCase();
    const alter = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
    const octave = parseInt(match[3], 10);
    return { step, alter, octave };
  };

  const tuningXml = tuning
    .map((t, idx) => {
      const lineNum = idx + 1;
      const { step, alter, octave } = parseStepAlterOctave(t);
      return `          <staff-tuning line="${lineNum}">
            <tuning-step>${step}</tuning-step>${
              alter !== 0 ? `\n            <tuning-alter>${alter}</tuning-alter>` : ""
            }
            <tuning-octave>${octave}</tuning-octave>
          </staff-tuning>`;
    })
    .join("\n");

  const measuresXml = (tablature.measures || [])
    .map((m, idx) => {
      const sortedNotes = [...(m.notes || [])].sort(
        (a, b) => a.start_time - b.start_time
      );

      const notesXml =
        sortedNotes.length === 0
          ? `      <note>
        <rest/>
        <duration>16</duration>
        <type>whole</type>
      </note>`
          : sortedNotes
              .map((n) => {
                const { step, alter, octave } = parseStepAlterOctave(n.note_name);
                const voiceIndex =
                  n.voice === "bass"
                    ? 2
                    : n.voice === "harmony"
                    ? 3
                    : n.voice === "percussive"
                    ? 4
                    : 1;
                return `      <note>
        <pitch>
          <step>${step}</step>${
            alter !== 0 ? `\n          <alter>${alter}</alter>` : ""
          }
          <octave>${octave}</octave>
        </pitch>
        <duration>4</duration>
        <voice>${voiceIndex}</voice>
        <type>quarter</type>
        <notations>
          <technical>
            <string>${n.string}</string>
            <fret>${n.fret}</fret>
          </technical>
        </notations>
      </note>`;
              })
              .join("\n");

      const attributesBlock =
        idx === 0
          ? `      <attributes>
        <divisions>4</divisions>
        <key>
          <fifths>1</fifths>
        </key>
        <time>
          <beats>4</beats>
          <beat-type>4</beat-type>
        </time>
        <clef>
          <sign>TAB</sign>
          <line>5</line>
        </clef>
        <staff-details>
          <staff-lines>6</staff-lines>
          <capo>${tablature.capo || 0}</capo>
${tuningXml}
        </staff-details>
      </attributes>\n`
          : "";

      return `    <measure number="${m.measure_number}">
${attributesBlock}${notesXml}
    </measure>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="4.0">
  <work>
    <work-title>${title.replace(/[<>&"']/g, "")}</work-title>
  </work>
  <identification>
    <creator type="software">Arpegia Phase 3 AI Music Intelligence</creator>
  </identification>
  <part-list>
    <score-part id="P1">
      <part-name>Acoustic Guitar (${meta.style || "Fingerstyle"})</part-name>
    </score-part>
  </part-list>
  <part id="P1">
${measuresXml}
  </part>
</score-partwise>
`;
}

/**
 * Generates a formatted ASCII Tablature text document (.txt).
 */
export function generateClientAsciiText(
  tablature: TablatureData,
  meta: ClientExportMetadata
): string {
  const tuning = (tablature.tuning || DEFAULT_GUITAR_TUNING).join(" ");
  const headerLines = [
    "==================================================================",
    `ARPEGIA AI GUITAR INTELLIGENCE — TABLATURE & ARRANGEMENT EXPORT`,
    "==================================================================",
    `Job ID      : ${meta.jobId}`,
    `Title       : ${meta.title || meta.songMetadata?.filename || "Guitar Transcription"}`,
    `Style       : ${meta.style || "Original Transcription"}`,
    `Difficulty  : ${tablature.difficulty}`,
    `Tuning (6-1): ${tuning}`,
    `Capo        : ${tablature.capo || 0}`,
    meta.songMetadata
      ? `Key / BPM   : ${meta.songMetadata.key} @ ${meta.songMetadata.bpm} BPM (${meta.songMetadata.time_signature})`
      : "",
    `Legend      : h = hammer-on | p = pull-off | / = slide | b = bend`,
    "==================================================================",
    "",
    tablature.ascii_tab,
    "",
  ].filter(Boolean);

  return headerLines.join("\n");
}

/**
 * Generates a valid, self-contained single-page PDF 1.4 binary document
 * containing the arrangement header and monospace 6-line ASCII tablature.
 */
export function generateClientPdfBytes(
  tablature: TablatureData,
  meta: ClientExportMetadata
): Uint8Array {
  const escapePdfText = (input: string) =>
    input
      .replace(/\\/g, "\\\\")
      .replace(/\(/g, "\\(")
      .replace(/\)/g, "\\)");

  const title = meta.title || meta.songMetadata?.filename || "Arpegia Guitar Score";
  const subtitle = `Style: ${meta.style || "Original"} | Difficulty: ${
    tablature.difficulty
  } | Tuning: ${(tablature.tuning || DEFAULT_GUITAR_TUNING).join(" ")} | Capo: ${
    tablature.capo || 0
  }`;
  const metaLine = meta.songMetadata
    ? `Key: ${meta.songMetadata.key} | Tempo: ${meta.songMetadata.bpm} BPM | Time: ${meta.songMetadata.time_signature} | Job: ${meta.jobId}`
    : `Job ID: ${meta.jobId}`;

  const asciiLines = (tablature.ascii_tab || "").split(/\r?\n/);

  const contentCommands: string[] = [
    "BT",
    "/F1 14 Tf",
    "48 750 Td",
    `(${escapePdfText(`Arpegia AI Guitar Score - ${title}`)}) Tj`,
    "/F1 10 Tf",
    "0 -18 Td",
    `(${escapePdfText(subtitle)}) Tj`,
    "0 -14 Td",
    `(${escapePdfText(metaLine)}) Tj`,
    "0 -22 Td",
    "(------------------------------------------------------------------------) Tj",
  ];

  for (const line of asciiLines.slice(0, 42)) {
    contentCommands.push("0 -13 Td");
    contentCommands.push(`(${escapePdfText(line)}) Tj`);
  }

  contentCommands.push("ET");
  const streamBody = contentCommands.join("\n");

  const objects: string[] = [
    "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
    "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
    "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n",
    "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n",
    `5 0 obj\n<< /Length ${streamBody.length} >>\nstream\n${streamBody}\nendstream\nendobj\n`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];

  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }

  const xrefStart = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    const offStr = String(offsets[i]).padStart(10, "0");
    pdf += `${offStr} 00000 n \n`;
  }

  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  const encoder = new TextEncoder();
  return encoder.encode(pdf);
}

/**
 * Returns the canonical file extension and MIME type per docs/api-contract.md Section 3.5.
 */
export function getExportFormatSpec(format: ExportFormat): {
  ext: string;
  mimeType: string;
  label: string;
  shortDesc: string;
} {
  switch (format) {
    case "midi":
      return {
        ext: "mid",
        mimeType: "audio/midi",
        label: "MIDI (.mid)",
        shortDesc: "Standard MIDI sequence for DAWs & synths",
      };
    case "musicxml":
      return {
        ext: "musicxml",
        mimeType: "application/vnd.recordare.musicxml+xml",
        label: "MusicXML (.musicxml)",
        shortDesc: "GuitarPro, MuseScore & Finale compatible score",
      };
    case "pdf":
      return {
        ext: "pdf",
        mimeType: "application/pdf",
        label: "PDF Score (.pdf)",
        shortDesc: "Printable 6-string guitar tablature sheet",
      };
    case "ascii":
    default:
      return {
        ext: "txt",
        mimeType: "text/plain; charset=utf-8",
        label: "ASCII Tab (.txt)",
        shortDesc: "Plain-text 6-line monospace guitar tab",
      };
  }
}

/**
 * Generates a client-side Blob and canonical filename (`arpegia-<job_id>.<ext>`)
 * for instant download when in Mock/Demo mode or when the backend is offline.
 */
export function createClientFallbackExportBlob(
  format: ExportFormat,
  tablature: TablatureData,
  meta: ClientExportMetadata
): { blob: Blob; filename: string } {
  const spec = getExportFormatSpec(format);
  const safeJobId = (meta.jobId || "demo").replace(/[^a-zA-Z0-9_-]/g, "-");
  const suffix = meta.arrangementId
    ? `-${meta.arrangementId.replace(/[^a-zA-Z0-9_-]/g, "-")}`
    : "";
  const filename = `arpegia-${safeJobId}${suffix}.${spec.ext}`;

  if (format === "midi") {
    const bytes = generateClientMidiBytes(
      tablature,
      meta.songMetadata?.bpm || 105
    );
    return {
      blob: new Blob([bytes.buffer as ArrayBuffer], { type: spec.mimeType }),
      filename,
    };
  }

  if (format === "musicxml") {
    const xml = generateClientMusicXml(tablature, meta);
    return {
      blob: new Blob([xml], { type: spec.mimeType }),
      filename,
    };
  }

  if (format === "pdf") {
    const pdfBytes = generateClientPdfBytes(tablature, meta);
    return {
      blob: new Blob([pdfBytes.buffer as ArrayBuffer], { type: spec.mimeType }),
      filename,
    };
  }

  const txt = generateClientAsciiText(tablature, meta);
  return {
    blob: new Blob([txt], { type: spec.mimeType }),
    filename,
  };
}

/**
 * Triggers a browser file download from a Blob and filename.
 */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
