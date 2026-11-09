"use client";

import React, { useState } from "react";
import { ExportFormat } from "../types";
import { getExportFormatSpec } from "../lib/export-utils";
import {
  Download,
  FileAudio,
  FileCode2,
  FileText,
  Printer,
  Check,
  Loader2,
  Sparkles,
} from "lucide-react";

export interface ExportHubBarProps {
  jobId: string;
  activeArrangementId: string | null;
  activeTitle: string;
  onExportFormat: (format: ExportFormat) => Promise<void>;
}

const EXPORT_FORMATS: {
  format: ExportFormat;
  badge: string;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
}[] = [
  {
    format: "midi",
    badge: ".mid",
    icon: FileAudio,
    accentClass:
      "hover:border-amber-500/60 hover:bg-amber-500/10 text-amber-300",
  },
  {
    format: "musicxml",
    badge: ".musicxml",
    icon: FileCode2,
    accentClass:
      "hover:border-sky-500/60 hover:bg-sky-500/10 text-sky-300",
  },
  {
    format: "pdf",
    badge: ".pdf",
    icon: Printer,
    accentClass:
      "hover:border-rose-500/60 hover:bg-rose-500/10 text-rose-300",
  },
  {
    format: "ascii",
    badge: ".txt",
    icon: FileText,
    accentClass:
      "hover:border-emerald-500/60 hover:bg-emerald-500/10 text-emerald-300",
  },
];

export function ExportHubBar({
  jobId,
  activeArrangementId,
  activeTitle,
  onExportFormat,
}: ExportHubBarProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>("midi");
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(
    null
  );
  const [recentExport, setRecentExport] = useState<ExportFormat | null>(null);

  const handleTriggerExport = async (fmt: ExportFormat) => {
    setSelectedFormat(fmt);
    setExportingFormat(fmt);
    try {
      await onExportFormat(fmt);
      setRecentExport(fmt);
      setTimeout(() => {
        setRecentExport((curr) => (curr === fmt ? null : curr));
      }, 2500);
    } finally {
      setExportingFormat(null);
    }
  };

  const queryPreview = `format=${selectedFormat}${
    activeArrangementId ? `&arrangement_id=${activeArrangementId}` : ""
  }`;

  return (
    <div
      className="w-full rounded-xl bg-slate-950/80 border border-slate-800/90 p-3.5 space-y-3"
      aria-label="Multi-Format Export Hub"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold uppercase tracking-wider text-slate-200">
            <Download className="w-3.5 h-3.5 text-amber-400" />
            Multi-Format Export Hub
          </span>
          <span className="px-2 py-0.5 text-[10px] font-mono rounded-full bg-slate-900 text-amber-300 border border-slate-800">
            Target: {activeTitle}
          </span>
          <code className="hidden xl:inline-block text-[10px] font-mono text-slate-400 bg-slate-900/90 px-2 py-0.5 rounded border border-slate-800">
            GET /api/v1/analyze/{jobId}/export?{queryPreview}
          </code>
        </div>

        {/* Quick Dropdown + Export CTA */}
        <div className="flex items-center gap-2">
          <select
            aria-label="Select Export Format"
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value as ExportFormat)}
            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500 cursor-pointer"
          >
            <option value="midi">MIDI Sequence (.mid)</option>
            <option value="musicxml">MusicXML / GuitarPro (.musicxml)</option>
            <option value="pdf">Printable Score (.pdf)</option>
            <option value="ascii">ASCII Tablature (.txt)</option>
          </select>

          <button
            type="button"
            disabled={exportingFormat !== null}
            onClick={() => handleTriggerExport(selectedFormat)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold bg-gradient-to-r from-amber-500 to-rose-500 hover:from-amber-400 hover:to-rose-400 text-slate-950 shadow-md shadow-amber-500/20 cursor-pointer disabled:opacity-50"
          >
            {exportingFormat === selectedFormat ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>
              Export {getExportFormatSpec(selectedFormat).label.split(" ")[0]}
            </span>
          </button>
        </div>
      </div>

      {/* 4 Direct Format Action Cards (MIDI, MusicXML, PDF, ASCII) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {EXPORT_FORMATS.map(({ format, badge, icon: Icon, accentClass }) => {
          const spec = getExportFormatSpec(format);
          const isBusy = exportingFormat === format;
          const isDone = recentExport === format;

          return (
            <button
              key={format}
              type="button"
              disabled={exportingFormat !== null}
              onClick={() => handleTriggerExport(format)}
              className={`group flex flex-col justify-between p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 transition-all text-left cursor-pointer ${accentClass}`}
            >
              <div className="flex items-center justify-between w-full gap-1">
                <div className="flex items-center gap-1.5">
                  {isBusy ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                  ) : isDone ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Icon className="w-3.5 h-3.5" />
                  )}
                  <span className="text-xs font-mono font-bold text-white">
                    {format.toUpperCase()}
                  </span>
                </div>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">
                  {badge}
                </span>
              </div>
              <p className="text-[10px] font-mono text-slate-400 mt-1 line-clamp-1">
                {isDone ? (
                  <span className="text-emerald-300 inline-flex items-center gap-1">
                    <Sparkles className="w-2.5 h-2.5" /> Downloaded!
                  </span>
                ) : (
                  spec.shortDesc
                )}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
