import { useState } from "react";
import { api } from "../api";

const BANK_COLORS = {
  UBS: "bg-red-900 text-red-300",
  REVOLUT: "bg-purple-900 text-purple-300",
  BNP: "bg-green-900 text-accent",
  BOURSOBANK: "bg-blue-900 text-blue-300",
};

export default function TransactionTable({ transactions, categories, onUpdated }) {
  const [editing, setEditing] = useState(null);
  const [bulkPrompt, setBulkPrompt] = useState(null); // { description, data, count }

  // Extract a stable keyword from description (strip trailing numbers/amounts in parens)
  function extractKeyword(description) {
    return description
      .replace(/\(.*?\)/g, "")   // remove anything in parentheses
      .replace(/\s+\d[\d.,]*\s*$/, "") // remove trailing number
      .trim()
      .slice(0, 40);
  }

  async function save(id, data, description) {
    await api.patchTransaction(id, data);
    setEditing(null);
    onUpdated?.();

    if (data.category && description) {
      try {
        const keyword = extractKeyword(description);
        const [{ count: exactCount }, { count: keywordCount }] = await Promise.all([
          api.countByDescription(description),
          keyword !== description ? api.countByKeyword(keyword) : Promise.resolve({ count: 0 }),
        ]);
        const showExact = exactCount > 1;
        const showKeyword = keywordCount > exactCount;
        if (showExact || showKeyword) {
          setBulkPrompt({ description, keyword, data, exactCount, keywordCount });
          setTimeout(() => setBulkPrompt(null), 15000);
        }
      } catch (e) { /* ignore */ }
    }
  }

  async function applyBulk(mode) {
    if (!bulkPrompt) return;
    if (mode === "exact") {
      await api.bulkUpdateByDescription(bulkPrompt.description, bulkPrompt.data);
    } else {
      await api.bulkUpdateByKeyword(bulkPrompt.keyword, bulkPrompt.data);
    }
    setBulkPrompt(null);
    onUpdated?.();
  }

  return (
    <div className="space-y-2">
    {bulkPrompt && (
      <div className="bg-indigo-950 border border-indigo-500 rounded-lg px-4 py-3 text-sm space-y-2">
        <p className="text-indigo-200">
          Apply <strong>&ldquo;{bulkPrompt.data.category}&rdquo;</strong> to other transactions?
        </p>
        <div className="flex flex-wrap gap-2">
          {bulkPrompt.exactCount > 1 && (
            <button onClick={() => applyBulk("exact")} className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded text-white text-xs font-medium">
              Exact match ({bulkPrompt.exactCount - 1} others)
            </button>
          )}
          {bulkPrompt.keywordCount > bulkPrompt.exactCount && (
            <button onClick={() => applyBulk("keyword")} className="px-3 py-1.5 bg-indigo-800 hover:bg-indigo-700 rounded text-indigo-200 text-xs font-medium">
              Contains &ldquo;{bulkPrompt.keyword}&rdquo; ({bulkPrompt.keywordCount} total)
            </button>
          )}
          <button onClick={() => setBulkPrompt(null)} className="px-3 py-1.5 text-content-muted hover:text-content-secondary text-xs">
            Skip
          </button>
        </div>
      </div>
    )}
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-surface text-content-secondary text-left">
            <th className="px-3 py-2 font-medium">Date</th>
            <th className="px-3 py-2 font-medium">Bank</th>
            <th className="px-3 py-2 font-medium">Description</th>
            <th className="px-3 py-2 font-medium">Category</th>
            <th className="px-3 py-2 font-medium text-right">Amount</th>
            <th className="px-3 py-2 font-medium">Notes</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const isEditing = editing === tx.id;
            return (
              <tr
                key={tx.id}
                className={`border-t border-line hover:bg-surface/50 transition-colors ${
                  tx.needs_annotation ? "bg-yellow-950/30" : ""
                }`}
                onClick={() => setEditing(isEditing ? null : tx.id)}
              >
                <td className="px-3 py-2 text-content-secondary whitespace-nowrap">{tx.date}</td>
                <td className="px-3 py-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${BANK_COLORS[tx.bank] || "bg-surface-hover text-content-secondary"}`}>
                    {tx.bank}
                  </span>
                </td>
                <td className={`px-3 py-2 text-content ${isEditing ? "whitespace-normal break-words max-w-md" : "max-w-xs truncate"}`} title={isEditing ? undefined : tx.description}>
                  {tx.needs_annotation && (
                    <span className="mr-1 text-yellow-400" title="Needs annotation">⚠</span>
                  )}
                  {tx.description}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <select
                      className="bg-surface border border-line rounded px-2 py-0.5 text-xs"
                      defaultValue={tx.category || ""}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => save(tx.id, { category: e.target.value }, tx.description)}
                    >
                      <option value="">—</option>
                      {categories.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="text-xs text-content-secondary">{tx.category || "—"}</span>
                  )}
                </td>
                <td className={`px-3 py-2 text-right font-mono font-medium whitespace-nowrap ${tx.amount < 0 ? "text-red-400" : "text-accent"}`}>
                  {tx.amount < 0 ? "−" : "+"}{Math.abs(tx.amount).toFixed(2)} {tx.currency}
                </td>
                <td className="px-3 py-2">
                  {isEditing ? (
                    <input
                      className="bg-surface border border-line rounded px-2 py-0.5 text-xs w-36"
                      defaultValue={tx.notes || ""}
                      placeholder="Add note..."
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => save(tx.id, { notes: e.target.value, needs_annotation: false }, null)}
                    />
                  ) : (
                    <span className="text-xs text-content-muted">{tx.notes || ""}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
    </div>
  );
}
