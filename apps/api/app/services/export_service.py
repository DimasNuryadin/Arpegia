"""Multi-format score and tablature export serializer for MIDI, MusicXML 4.0, PDF, and ASCII.

Provides self-contained binary and text serializers for `GET /api/v1/analyze/{job_id}/export`
with optional delegation to `services/audio-engine` exporters when available.
"""

import logging
import re
import struct
from typing import Dict, List, Optional, Tuple
from xml.sax.saxutils import escape

from app.schemas.analysis import (
    AnalysisMetadata,
    AnalysisResponse,
    ArrangementVariation,
    ChordItem,
    ExportFormat,
    TablatureData,
    TabNote,
)
from app.services.analyzer_service import render_ascii_tab

logger = logging.getLogger(__name__)

EXPORT_CONTENT_TYPES: Dict[str, str] = {
    "midi": "audio/midi",
    "musicxml": "application/vnd.recordare.musicxml+xml",
    "ascii": "text/plain; charset=utf-8",
    "pdf": "application/pdf",
}

EXPORT_EXTENSIONS: Dict[str, str] = {
    "midi": "mid",
    "musicxml": "musicxml",
    "ascii": "txt",
    "pdf": "pdf",
}


def _encode_vlq(value: int) -> bytes:
    """Encode a non-negative integer as a Standard MIDI File Variable-Length Quantity (VLQ)."""
    val = max(0, int(value))
    buffer = [val & 0x7F]
    val >>= 7
    while val > 0:
        buffer.append((val & 0x7F) | 0x80)
        val >>= 7
    buffer.reverse()
    return bytes(buffer)


def serialize_midi(
    tablature: TablatureData,
    metadata: AnalysisMetadata,
) -> bytes:
    """Serialize TablatureData into a valid Standard MIDI File (Format 0, MThd + MTrk)."""
    ticks_per_beat = 480
    bpm = max(20.0, min(300.0, float(metadata.bpm or 105.0)))
    tempo_us = int(round(60_000_000.0 / bpm))

    # Collect all notes across all measures
    all_notes: List[TabNote] = []
    for measure in tablature.measures:
        all_notes.extend(measure.notes)

    if not all_notes:
        all_notes = [
            TabNote(
                id="fallback-1",
                start_time=0.0,
                duration=0.6,
                string=6,
                fret=3,
                midi=43,
                note_name="G2",
                confidence=0.95,
                technique="normal",
                voice="bass",
            )
        ]

    def seconds_to_ticks(sec: float) -> int:
        beats = (max(0.0, sec) * bpm) / 60.0
        return int(round(beats * ticks_per_beat))

    # Build absolute tick events: (tick, sort_priority, raw_midi_bytes)
    abs_events: List[Tuple[int, int, bytes]] = []

    # Track Name meta event (FF 03)
    track_title = f"Arpegia - {metadata.filename}".encode("ascii", errors="replace")[:64]
    abs_events.append((0, 0, b"\xFF\x03" + _encode_vlq(len(track_title)) + track_title))

    # Set Tempo meta event (FF 51 03 tt tt tt)
    tempo_bytes = tempo_us.to_bytes(3, byteorder="big")
    abs_events.append((0, 1, b"\xFF\x51\x03" + tempo_bytes))

    # Time Signature meta event (FF 58 04 nn dd cc bb) -> 4/4
    abs_events.append((0, 2, b"\xFF\x58\x04\x04\x02\x18\x08"))

    # Program Change: Acoustic Guitar (Nylon = 24, Steel = 25) on channel 0
    abs_events.append((0, 3, bytes([0xC0, 24])))

    for note in all_notes:
        start_tick = seconds_to_ticks(note.start_time)
        dur_ticks = max(60, seconds_to_ticks(note.duration if note.duration > 0 else 0.5))
        end_tick = start_tick + dur_ticks
        pitch = max(0, min(127, int(note.midi)))
        velocity = max(45, min(127, int(round((note.confidence or 0.9) * 110))))
        if note.voice == "bass":
            velocity = min(127, velocity + 8)
        elif note.voice == "percussive":
            velocity = min(127, velocity + 12)

        # Note On (0x90) and Note Off (0x80)
        abs_events.append((start_tick, 10, bytes([0x90, pitch, velocity])))
        abs_events.append((end_tick, 5, bytes([0x80, pitch, 0])))

    abs_events.sort(key=lambda item: (item[0], item[1]))

    track_data = bytearray()
    last_tick = 0
    for tick, _prio, event_bytes in abs_events:
        delta = max(0, tick - last_tick)
        track_data.extend(_encode_vlq(delta))
        track_data.extend(event_bytes)
        last_tick = tick

    # End of Track meta event (FF 2F 00)
    track_data.extend(_encode_vlq(0))
    track_data.extend(b"\xFF\x2F\x00")

    header_chunk = b"MThd" + struct.pack(">IHHH", 6, 0, 1, ticks_per_beat)
    track_chunk = b"MTrk" + struct.pack(">I", len(track_data)) + bytes(track_data)
    return header_chunk + track_chunk


def _parse_step_alter_octave(note_name: str, midi_val: int) -> Tuple[str, int, int]:
    """Extract MusicXML (<step>, <alter>, <octave>) from note_name or MIDI number."""
    match = re.match(r"^([A-Ga-g])([#bB]?)(-?\d+)$", (note_name or "").strip())
    if match:
        step = match.group(1).upper()
        acc = match.group(2)
        octave = int(match.group(3))
        alter = 1 if acc == "#" else (-1 if acc in ("b", "B") else 0)
        return step, alter, octave

    # Fallback from MIDI
    clamped = max(0, min(127, int(midi_val)))
    octave = (clamped // 12) - 1
    semitone = clamped % 12
    step_map = [
        ("C", 0),
        ("C", 1),
        ("D", 0),
        ("D", 1),
        ("E", 0),
        ("F", 0),
        ("F", 1),
        ("G", 0),
        ("G", 1),
        ("A", 0),
        ("A", 1),
        ("B", 0),
    ]
    step, alter = step_map[semitone]
    return step, alter, octave


def serialize_musicxml(
    tablature: TablatureData,
    metadata: AnalysisMetadata,
    chords: Optional[List[ChordItem]] = None,
    title: Optional[str] = None,
) -> bytes:
    """Serialize TablatureData into a MusicXML 4.0 score-partwise document with Guitar Tab technical tags."""
    work_title = escape(title or f"{metadata.filename} ({metadata.key})")
    tuning = (
        tablature.tuning
        if (tablature.tuning and len(tablature.tuning) == 6)
        else ["E2", "A2", "D3", "G3", "B3", "E4"]
    )
    bpm = int(round(float(metadata.bpm or 105)))

    voice_map = {
        "melody": "1",
        "harmony": "2",
        "bass": "3",
        "percussive": "4",
    }

    lines: List[str] = [
        '<?xml version="1.0" encoding="UTF-8" standalone="no"?>',
        '<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">',
        '<score-partwise version="4.0">',
        "  <work>",
        f"    <work-title>{work_title}</work-title>",
        "  </work>",
        "  <identification>",
        '    <creator type="composer">Arpegia AI Guitar Intelligence</creator>',
        "  </identification>",
        "  <part-list>",
        '    <score-part id="P1">',
        "      <part-name>Acoustic Guitar (Tablature)</part-name>",
        "    </score-part>",
        "  </part-list>",
        '  <part id="P1">',
    ]

    measures = tablature.measures or []
    for m_idx, measure in enumerate(measures):
        m_num = measure.measure_number if measure.measure_number >= 1 else (m_idx + 1)
        lines.append(f'    <measure number="{m_num}">')

        if m_idx == 0:
            lines.extend(
                [
                    "      <attributes>",
                    "        <divisions>4</divisions>",
                    "        <key>",
                    "          <fifths>0</fifths>",
                    "        </key>",
                    "        <time>",
                    "          <beats>4</beats>",
                    "          <beat-type>4</beat-type>",
                    "        </time>",
                    "        <clef>",
                    "          <sign>TAB</sign>",
                    "          <line>5</line>",
                    "        </clef>",
                    f'        <staff-details capo="{tablature.capo}">',
                    "          <staff-lines>6</staff-lines>",
                ]
            )
            # tuning is ordered Low E (line 1 in MusicXML staff-tuning or 6->1)
            for idx, pitch_str in enumerate(tuning, start=1):
                t_step, t_alter, t_oct = _parse_step_alter_octave(pitch_str, 40)
                lines.append(f'          <staff-tuning line="{idx}">')
                lines.append(f"            <tuning-step>{t_step}</tuning-step>")
                if t_alter != 0:
                    lines.append(f"            <tuning-alter>{t_alter}</tuning-alter>")
                lines.append(f"            <tuning-octave>{t_oct}</tuning-octave>")
                lines.append("          </staff-tuning>")
            lines.extend(
                [
                    "        </staff-details>",
                    "      </attributes>",
                    '      <direction placement="above">',
                    "        <direction-type>",
                    "          <metronome>",
                    "            <beat-unit>quarter</beat-unit>",
                    f"            <per-minute>{bpm}</per-minute>",
                    "          </metronome>",
                    "        </direction-type>",
                    f'        <sound tempo="{bpm}"/>',
                    "      </direction>",
                ]
            )

        sorted_notes = sorted(measure.notes, key=lambda n: (n.start_time, n.id))
        for note in sorted_notes:
            step, alter, octave = _parse_step_alter_octave(note.note_name, note.midi)
            voice_num = voice_map.get(note.voice or "melody", "1")
            dur_divs = max(1, int(round((note.duration or 0.5) * (bpm / 60.0) * 4)))
            note_type = "quarter" if dur_divs <= 4 else "half"

            lines.append("      <note>")
            lines.append("        <pitch>")
            lines.append(f"          <step>{step}</step>")
            if alter != 0:
                lines.append(f"          <alter>{alter}</alter>")
            lines.append(f"          <octave>{octave}</octave>")
            lines.append("        </pitch>")
            lines.append(f"        <duration>{dur_divs}</duration>")
            lines.append(f"        <voice>{voice_num}</voice>")
            lines.append(f"        <type>{note_type}</type>")
            lines.append("        <notations>")
            lines.append("          <technical>")
            lines.append(f"            <string>{note.string}</string>")
            lines.append(f"            <fret>{note.fret}</fret>")
            if note.technique == "hammer-on":
                lines.append('            <hammer-on type="start">H</hammer-on>')
            elif note.technique == "pull-off":
                lines.append('            <pull-off type="start">P</pull-off>')
            elif note.technique == "slide":
                lines.append('            <slide type="start"/>')
            elif note.technique == "bend":
                lines.append("            <bend><bend-alter>2</bend-alter></bend>")
            lines.append("          </technical>")
            lines.append("        </notations>")
            lines.append("      </note>")

        lines.append("    </measure>")

    lines.extend(
        [
            "  </part>",
            "</score-partwise>",
        ]
    )
    return ("\n".join(lines) + "\n").encode("utf-8")


def serialize_ascii(
    tablature: TablatureData,
    metadata: AnalysisMetadata,
    chords: Optional[List[ChordItem]] = None,
    variation: Optional[ArrangementVariation] = None,
) -> bytes:
    """Serialize TablatureData into a 6-line ASCII tablature text document."""
    ascii_staff = (tablature.ascii_tab or "").strip()
    if not ascii_staff or len(ascii_staff.splitlines()) < 6:
        ascii_staff = render_ascii_tab(tablature.measures, tablature.tuning)

    header_lines: List[str] = [
        f"# Arpegia Guitar Tablature — {metadata.filename}",
        f"# Key: {metadata.key} | BPM: {metadata.bpm} | Time: {metadata.time_signature} | Capo: {tablature.capo} | Difficulty: {tablature.difficulty}",
    ]
    if variation is not None:
        header_lines.append(
            f"# Arrangement: {variation.title} ({variation.style}) — Chords: {', '.join(variation.chords_used)}"
        )
    elif chords:
        chord_seq = ", ".join(c.chord for c in chords)
        header_lines.append(f"# Chords: {chord_seq}")

    content = "\n".join(header_lines) + "\n\n" + ascii_staff + "\n"
    return content.encode("utf-8")


def _pdf_escape(text: str) -> str:
    """Escape characters for PDF literal strings."""
    cleaned = text.encode("ascii", errors="replace").decode("ascii")
    return cleaned.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def serialize_pdf(
    tablature: TablatureData,
    metadata: AnalysisMetadata,
    chords: Optional[List[ChordItem]] = None,
    variation: Optional[ArrangementVariation] = None,
) -> bytes:
    """Generate a valid standalone binary PDF 1.4 document with song metadata, chords, and monospace ASCII tab."""
    ascii_staff = (tablature.ascii_tab or "").strip()
    if not ascii_staff:
        ascii_staff = render_ascii_tab(tablature.measures, tablature.tuning)

    title_str = (
        f"Arpegia Score: {variation.title}"
        if variation
        else f"Arpegia Guitar Tablature: {metadata.filename}"
    )
    meta_str = (
        f"File: {metadata.filename} | Key: {metadata.key} | BPM: {metadata.bpm} | "
        f"Time: {metadata.time_signature} | Capo: {tablature.capo} | Difficulty: {tablature.difficulty}"
    )
    if variation and variation.chords_used:
        chord_str = "Chords Used: " + " - ".join(variation.chords_used)
    elif chords:
        chord_str = "Chords: " + " - ".join(c.chord for c in chords)
    else:
        chord_str = "Chords: G - Em - C - D"

    tuning_str = "Tuning (6->1): " + " ".join(tablature.tuning)

    stream_ops: List[str] = [
        "BT",
        "/F1 14 Tf",
        "50 750 Td",
        f"({_pdf_escape(title_str)}) Tj",
        "/F1 10 Tf",
        "0 -22 Td",
        f"({_pdf_escape(meta_str)}) Tj",
        "0 -16 Td",
        f"({_pdf_escape(chord_str)}) Tj",
        "0 -16 Td",
        f"({_pdf_escape(tuning_str)}) Tj",
    ]

    if variation and variation.description:
        stream_ops.extend(
            [
                "0 -16 Td",
                f"({_pdf_escape(variation.description[:95])}) Tj",
            ]
        )

    stream_ops.append("0 -26 Td")
    for line in ascii_staff.splitlines():
        stream_ops.append(f"({_pdf_escape(line)}) Tj")
        stream_ops.append("0 -14 Td")
    stream_ops.append("ET")

    content_bytes = ("\n".join(stream_ops) + "\n").encode("ascii")

    objects: List[bytes] = [
        b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n",
        b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n",
        (
            b"3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] "
            b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n"
        ),
        b"4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n",
        (
            f"5 0 obj\n<< /Length {len(content_bytes)} >>\nstream\n".encode("ascii")
            + content_bytes
            + b"endstream\nendobj\n"
        ),
    ]

    pdf_buf = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets: List[int] = []
    for obj in objects:
        offsets.append(len(pdf_buf))
        pdf_buf.extend(obj)

    xref_offset = len(pdf_buf)
    xref_lines = [f"xref\n0 {len(objects) + 1}\n", "0000000000 65535 f \n"]
    for off in offsets:
        xref_lines.append(f"{off:010d} 00000 n \n")
    pdf_buf.extend("".join(xref_lines).encode("ascii"))

    trailer = (
        f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\n"
        f"startxref\n{xref_offset}\n%%EOF\n"
    )
    pdf_buf.extend(trailer.encode("ascii"))
    return bytes(pdf_buf)


class ExportService:
    """Service responsible for resolving target tablature and serializing multi-format exports."""

    def export_job(
        self,
        job: AnalysisResponse,
        export_format: ExportFormat,
        arrangement_id: Optional[str] = None,
    ) -> Tuple[bytes, str, str]:
        """Serialize a job's primary tablature or a specific ArrangementVariation into the requested format.

        Returns `(payload_bytes, media_type, content_disposition_filename)`.
        """
        target_tab: TablatureData = job.tablature
        matched_variation: Optional[ArrangementVariation] = None

        if arrangement_id is not None:
            for arr in job.arrangements:
                if arr.arrangement_id == arrangement_id:
                    matched_variation = arr
                    target_tab = arr.tablature
                    break
            if matched_variation is None:
                raise LookupError(f"Arrangement '{arrangement_id}' not found on job '{job.job_id}'.")

        # Try delegating to audio-engine exporter if available, with guaranteed self-contained fallback
        engine_bytes = self._try_audio_engine_export(
            target_tab, job.metadata, job.chords, export_format, matched_variation
        )
        if engine_bytes:
            payload = engine_bytes
        elif export_format == "midi":
            payload = serialize_midi(target_tab, job.metadata)
        elif export_format == "musicxml":
            payload = serialize_musicxml(
                target_tab,
                job.metadata,
                chords=job.chords,
                title=matched_variation.title if matched_variation else None,
            )
        elif export_format == "ascii":
            payload = serialize_ascii(
                target_tab, job.metadata, chords=job.chords, variation=matched_variation
            )
        elif export_format == "pdf":
            payload = serialize_pdf(
                target_tab, job.metadata, chords=job.chords, variation=matched_variation
            )
        else:
            raise ValueError(f"Unsupported export format: {export_format}")

        media_type = EXPORT_CONTENT_TYPES[export_format]
        ext = EXPORT_EXTENSIONS[export_format]
        filename = f"arpegia-{job.job_id}.{ext}"
        return payload, media_type, filename

    def _try_audio_engine_export(
        self,
        tablature: TablatureData,
        metadata: AnalysisMetadata,
        chords: List[ChordItem],
        export_format: ExportFormat,
        variation: Optional[ArrangementVariation],
    ) -> Optional[bytes]:
        """Attempt to invoke `services/audio-engine` export module if present and valid."""
        try:
            from engine import exporter as engine_exporter  # type: ignore

            if hasattr(engine_exporter, "export_tablature"):
                result = engine_exporter.export_tablature(
                    tablature=tablature.model_dump(),
                    metadata=metadata.model_dump(),
                    export_format=export_format,
                    chords=[c.model_dump() for c in chords],
                    arrangement=variation.model_dump() if variation else None,
                )
                if isinstance(result, str):
                    result = result.encode("utf-8")
                if isinstance(result, (bytes, bytearray)) and len(result) > 0:
                    data = bytes(result)
                    if export_format == "midi" and data.startswith(b"MThd"):
                        return data
                    if export_format == "musicxml" and b"<score-partwise" in data:
                        return data
                    if export_format == "pdf" and data.startswith(b"%PDF-"):
                        return data
                    if export_format == "ascii" and len(data.decode("utf-8", errors="ignore").splitlines()) >= 6:
                        return data
        except Exception as exc:
            logger.debug("Using built-in ExportService serializer (%s)", exc)
        return None


export_service = ExportService()
