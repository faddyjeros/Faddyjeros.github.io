import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Link } from "react-router-dom";
import { api } from "../api";

const TS = () => new Date().toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" });

export default function DropZone() {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]); // [{ ts, ok, ...result }]
  const [open, setOpen] = useState(false);

  const onDrop = useCallback(async (files) => {
    setLoading(true);
    const batch = [];
    for (const file of files) {
      try {
        const result = await api.uploadFile(file);
        batch.push({ ts: TS(), ok: true, ...result });
      } catch (e) {
        batch.push({ ts: TS(), ok: false, filename: file.name, error: e.message });
      }
    }
    setHistory((h) => [...batch, ...h]);
    setOpen(true);
    setLoading(false);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "text/csv": [".csv"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
  });

  const totalNew = history.filter((r) => r.ok).reduce((s, r) => s + (r.new ?? 0), 0);
  const totalNeedsAnnotation = history.filter((r) => r.ok).reduce((s, r) => s + (r.needs_annotation ?? 0), 0);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Drop target */}
      <div
        {...getRootProps()}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed cursor-pointer text-sm transition-colors ${
          isDragActive
            ? "border-accent bg-accent/10 text-accent"
            : "border-line text-content-secondary hover:border-content-muted hover:text-content"
        }`}
      >
        <input {...getInputProps()} />
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
        </svg>
        {loading ? (
          <span className="animate-pulse">Importing…</span>
        ) : isDragActive ? (
          <span>Drop to import</span>
        ) : (
          <span>Drop bank exports here <span className="text-content-muted">(CSV / XLS / XLSX)</span></span>
        )}
      </div>

      {/* Toggle badge */}
      {history.length > 0 && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-surface hover:bg-surface-hover text-content-secondary transition-colors"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${history[0].ok ? "bg-green-400" : "bg-red-400"}`} />
          {history.length} import{history.length > 1 ? "s" : ""}
          {totalNew > 0 && <span className="text-accent font-semibold">· +{totalNew} new</span>}
          <span className="text-content-muted">{open ? "▲" : "▼"}</span>
        </button>
      )}

      {/* Categorize CTA */}
      {totalNew > 0 && (
        <Link
          to="/categorize"
          className="text-xs px-3 py-1 rounded-lg bg-accent/80 hover:bg-accent-hover text-white transition-colors font-medium"
        >
          Categorize {totalNew} new →
        </Link>
      )}

      {/* Clear */}
      {history.length > 0 && (
        <button
          onClick={() => { setHistory([]); setOpen(false); }}
          className="text-xs text-content-muted hover:text-content-secondary transition-colors"
        >
          Clear
        </button>
      )}

      {/* History panel — renders below via a portal-like wrapper in App, but inline works fine */}
      {open && history.length > 0 && (
        <div className="w-full mt-1 bg-base border border-line rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-line text-content-muted">
                <th className="px-3 py-1.5 text-left font-medium">Time</th>
                <th className="px-3 py-1.5 text-left font-medium">Bank</th>
                <th className="px-3 py-1.5 text-left font-medium">File</th>
                <th className="px-3 py-1.5 text-right font-medium text-accent">New</th>
                <th className="px-3 py-1.5 text-right font-medium text-content-muted">Dupes</th>
                <th className="px-3 py-1.5 text-left font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r, i) => (
                <tr key={i} className="border-b border-line/50 last:border-0">
                  <td className="px-3 py-1.5 text-content-muted font-mono">{r.ts}</td>
                  <td className="px-3 py-1.5 font-semibold" style={{ color: BANK_COLOR[r.bank] ?? "#9ca3af" }}>
                    {r.ok ? r.bank : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-content-muted max-w-48 truncate">{r.filename}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-semibold text-accent">
                    {r.ok ? `+${r.new}` : <span className="text-red-400">error</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-content-muted">
                    {r.ok ? r.duplicates : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-content-muted">
                    {!r.ok && r.error}
                    {r.ok && r.needs_annotation > 0 && `${r.needs_annotation} need annotation`}
                    {r.ok && r.errors?.length > 0 && `⚠ ${r.errors.slice(0, 2).join(" | ")}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const BANK_COLOR = {
  UBS: "#ef4444",
  BNP: "#22c55e",
  BOURSOBANK: "#60a5fa",
  REVOLUT: "#a78bfa",
};
