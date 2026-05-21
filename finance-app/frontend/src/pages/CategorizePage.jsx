import { useCallback, useEffect, useState } from "react";
import { api } from "../api";

const CATEGORIES = [
  { key: "Fixed Costs", color: "#ef4444", icon: "🏠" },
  { key: "Groceries & Dining", color: "#22c55e", icon: "🛒" },
  { key: "Travel", color: "#3b82f6", icon: "✈️" },
  { key: "Fun Money", color: "#a855f7", icon: "🎮" },
  { key: "Income", color: "#eab308", icon: "💰" },
  { key: "Savings", color: "#06b6d4", icon: "🏦" },
  { key: "Internal Transfer", color: "#6b7280", icon: "🔄" },
  { key: "Miscellaneous", color: "#78716c", icon: "📦" },
];

const SHORTCUTS = ["1", "2", "3", "4", "5", "6", "7", "8"];

const fmt = (v) =>
  v?.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "";

export default function CategorizePage() {
  const [transactions, setTransactions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [total, setTotal] = useState(0);
  const [flash, setFlash] = useState(null);
  const [finished, setFinished] = useState(false);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const txs = await api.getTransactions({
        category: "Miscellaneous",
        limit: 500,
        sort: "desc",
      });
      setTransactions(txs);
      setTotal(txs.length);
      setCurrentIdx(0);
      setDone(0);
      setSkipped(0);
      setFinished(txs.length === 0);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const current = transactions[currentIdx];
  const progress = total > 0 ? ((done + skipped) / total) * 100 : 0;

  const doFlash = (cat) => {
    setFlash(cat);
    setTimeout(() => setFlash(null), 600);
  };

  const assignCategory = async (category) => {
    if (saving || !current) return;
    setSaving(true);
    try {
      await api.patchTransaction(current.id, { category });
      doFlash(category);
      setDone((d) => d + 1);
      advance();
    } catch (e) {
      console.error(e);
    }
    setSaving(false);
  };

  const skip = () => {
    setSkipped((s) => s + 1);
    advance();
  };

  const advance = () => {
    if (currentIdx + 1 >= transactions.length) {
      setFinished(true);
    } else {
      setCurrentIdx((i) => i + 1);
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKey = (e) => {
      if (finished || saving || !current) return;
      const idx = SHORTCUTS.indexOf(e.key);
      if (idx >= 0 && idx < CATEGORIES.length) {
        e.preventDefault();
        assignCategory(CATEGORIES[idx].key);
      }
      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        skip();
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [finished, saving, current, currentIdx]);

  if (loading) {
    return <p className="text-zinc-500 text-sm p-6">Loading transactions...</p>;
  }

  if (finished) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl font-bold text-zinc-100">All done!</h2>
        <p className="text-zinc-400">
          Categorized <span className="text-green-400 font-semibold">{done}</span> transactions
          {skipped > 0 && <>, skipped <span className="text-zinc-500">{skipped}</span></>}
        </p>
        <button
          onClick={loadTransactions}
          className="mt-4 px-6 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg transition-colors"
        >
          Check for more
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header + progress */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-zinc-100">Categorize Transactions</h2>
          <span className="text-xs text-zinc-500">
            {done + skipped} / {total} &middot;{" "}
            <span className="text-green-400">{done} done</span>
            {skipped > 0 && <> &middot; <span className="text-zinc-500">{skipped} skipped</span></>}
          </span>
        </div>
        <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-amber-500 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Transaction card */}
      <div
        className={`bg-zinc-800 rounded-xl p-6 border transition-colors duration-300 ${
          flash
            ? "border-green-500/50 bg-green-900/10"
            : "border-zinc-700"
        }`}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <p className="text-zinc-200 font-medium text-lg leading-snug">
              {current.description}
            </p>
            <div className="flex items-center gap-3 mt-2 text-xs text-zinc-500">
              <span>{current.date}</span>
              <span className="text-zinc-700">|</span>
              <span style={{ color: BANK_COLORS[current.bank] }}>{current.bank}</span>
              {current.notes && (
                <>
                  <span className="text-zinc-700">|</span>
                  <span className="text-zinc-400">{current.notes}</span>
                </>
              )}
            </div>
          </div>
          <div className="text-right ml-4">
            <p className={`text-2xl font-bold font-mono ${
              current.amount >= 0 ? "text-green-400" : "text-zinc-100"
            }`}>
              {current.amount >= 0 ? "+" : ""}{fmt(current.amount)}
            </p>
            <p className="text-xs text-zinc-500 mt-0.5">{current.currency}</p>
          </div>
        </div>

        {/* Flash feedback */}
        {flash && (
          <div className="text-center text-sm text-green-400 font-medium py-1 animate-pulse">
            {CATEGORIES.find((c) => c.key === flash)?.icon} {flash}
          </div>
        )}
      </div>

      {/* Category buttons */}
      <div className="grid grid-cols-2 gap-2">
        {CATEGORIES.map((cat, i) => (
          <button
            key={cat.key}
            onClick={() => assignCategory(cat.key)}
            disabled={saving}
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-zinc-700 hover:border-zinc-500 bg-zinc-800/50 hover:bg-zinc-800 transition-all text-left group disabled:opacity-40"
          >
            <span className="text-lg">{cat.icon}</span>
            <div className="flex-1">
              <p className="text-sm text-zinc-200 group-hover:text-white transition-colors">
                {cat.key}
              </p>
            </div>
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400 border border-zinc-600">
              {SHORTCUTS[i]}
            </kbd>
          </button>
        ))}
      </div>

      {/* Skip */}
      <div className="flex justify-center">
        <button
          onClick={skip}
          className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors px-4 py-2"
        >
          Skip — keep as Miscellaneous (S)
        </button>
      </div>

      {/* Keyboard hint */}
      <p className="text-center text-[10px] text-zinc-700">
        Press 1-8 to categorize &middot; S to skip &middot; keyboard shortcuts work too
      </p>
    </div>
  );
}

const BANK_COLORS = {
  UBS: "#ef4444",
  BNP: "#22c55e",
  BOURSOBANK: "#60a5fa",
  REVOLUT: "#a78bfa",
};
