import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
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

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Drop target */}
      <div
        {...getRootProps()}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed cursor-pointer text-sm transition-colors ${
          isDragActive
            ? "border-brand-500 bg-brand-50/10 text-brand-500"
            : "border-gray-600 text-gray-400 hover:border-gray-400 hover:text-gray-200"
        }`}
      >
        <input {...getInputProps()} />
        {loading ? (
          <span className="animate-pulse">Importing…</span>
        ) : isDragActive ? (
          <span>Drop to import</span>
        ) : (
          <span>Drop bank exports here (CSV / XLS / XLSX)</span>
        )}
      </div>

      {/* Toggle badge */}
      {history.length > 0 && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors"
        >
          <span className={`w-1.5 h-1.5 rounded-full ${history[0].ok ? "bg-green-400" : "bg-red-400"}`} />
          {history.length} import{history.length > 1 ? "s" : ""}
          {totalNew > 0 && <span className="text-green-400 font-semibold">· +{totalNew} new</span>}
          <span className="text-gray-600">{open ? "▲" : "▼"}</span>
        </button>
      )}

      {/* Clear */}
      {history.length > 0 && (
        <button
          onClick={() => { setHistory([]); setOpen(false); }}
          className="text-xs text-gray-700 hover:text-gray-400 transition-colors"
        >
          Clear
        </button>
      )}

      {/* History panel — renders below via a portal-like wrapper in App, but inline works fine */}
      {open && history.length > 0 && (
        <div className="w-full mt-1 bg-gray-950 border border-gray-800 rounded-xl overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-800 text-gray-600">
                <th className="px-3 py-1.5 text-left font-medium">Time</th>
                <th className="px-3 py-1.5 text-left font-medium">Bank</th>
                <th className="px-3 py-1.5 text-left font-medium">File</th>
                <th className="px-3 py-1.5 text-right font-medium text-green-600">New</th>
                <th className="px-3 py-1.5 text-right font-medium text-gray-600">Dupes</th>
                <th className="px-3 py-1.5 text-left font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r, i) => (
                <tr key={i} className="border-b border-gray-800/50 last:border-0">
                  <td className="px-3 py-1.5 text-gray-600 font-mono">{r.ts}</td>
                  <td className="px-3 py-1.5 font-semibold" style={{ color: BANK_COLOR[r.bank] ?? "#9ca3af" }}>
                    {r.ok ? r.bank : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500 max-w-48 truncate">{r.filename}</td>
                  <td className="px-3 py-1.5 text-right font-mono font-semibold text-green-400">
                    {r.ok ? `+${r.new}` : <span className="text-red-400">error</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-gray-600">
                    {r.ok ? r.duplicates : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500">
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
