import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { CATEGORY_COLORS } from "../chartTheme";

// Colors come from the shared palette so a category looks the same everywhere.
const CATEGORIES = [
  { key: "Fixed Costs", icon: "🏠" },
  { key: "Groceries & Dining", icon: "🛒" },
  { key: "Travel", icon: "✈️" },
  { key: "Fun Money", icon: "🎮" },
  { key: "Income", icon: "💰" },
  { key: "Savings", icon: "🏦" },
  { key: "Internal Transfer", icon: "🔄" },
  { key: "Miscellaneous", icon: "📦" },
].map((c) => ({ ...c, color: CATEGORY_COLORS[c.key] ?? "#a1a1aa" }));

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
        limit: 2000,
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
    return <p className="text-content-muted text-sm p-6">Loading transactions...</p>;
  }

  if (finished) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="text-6xl">🎉</div>
        <h2 className="text-2xl font-bold text-content">All done!</h2>
        <p className="text-content-secondary">
          Categorized <span className="text-accent font-semibold">{done}</span> transactions
          {skipped > 0 && <>, skipped <span className="text-content-muted">{skipped}</span></>}
        </p>
        <button
          onClick={loadTransactions}
          className="mt-4 px-6 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
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
          <h2 className="text-lg font-semibold text-content">Categorize Transactions</h2>
          <span className="text-xs text-content-muted">
            {done + skipped} / {total} &middot;{" "}
            <span className="text-accent">{done} done</span>
            {skipped > 0 && <> &middot; <span className="text-content-muted">{skipped} skipped</span></>}
          </span>
        </div>
        <div className="h-1.5 bg-surface rounded-full overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Transaction card */}
      <div
        className={`bg-surface rounded-xl p-6 border transition-colors duration-300 ${
          flash
            ? "border-green-500/50 bg-green-900/10"
            : "border-line"
        }`}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="flex-1">
            <p className="text-content font-medium text-lg leading-snug">
              {current.description}
            </p>
            <div className="flex items-center gap-3 mt-2 text-xs text-content-muted">
              <span>{current.date}</span>
              <span className="text-content-muted">|</span>
              <span style={{ color: BANK_COLORS[current.bank] }}>{current.bank}</span>
              {current.notes && (
                <>
                  <span className="text-content-muted">|</span>
                  <span className="text-content-secondary">{current.notes}</span>
                </>
              )}
            </div>
          </div>
          <div className="text-right ml-4">
            <p className={`text-2xl font-bold font-mono ${
              current.amount >= 0 ? "text-accent" : "text-content"
            }`}>
              {current.amount >= 0 ? "+" : ""}{fmt(current.amount)}
            </p>
            <p className="text-xs text-content-muted mt-0.5">{current.currency}</p>
          </div>
        </div>

        {/* Flash feedback */}
        {flash && (
          <div className="text-center text-sm text-accent font-medium py-1 animate-pulse">
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
            className="flex items-center gap-3 px-4 py-3 rounded-lg border border-line hover:border-line bg-surface/50 hover:bg-surface-hover transition-all text-left group disabled:opacity-40"
          >
            <span className="text-lg">{cat.icon}</span>
            <div className="flex-1">
              <p className="text-sm text-content group-hover:text-white transition-colors">
                {cat.key}
              </p>
            </div>
            <kbd className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-hover text-content-secondary border border-line">
              {SHORTCUTS[i]}
            </kbd>
          </button>
        ))}
      </div>

      {/* Skip */}
      <div className="flex justify-center">
        <button
          onClick={skip}
          className="text-xs text-content-muted hover:text-content-secondary transition-colors px-4 py-2"
        >
          Skip — keep as Miscellaneous (S)
        </button>
      </div>

      {/* Keyboard hint */}
      <p className="text-center text-[10px] text-content-muted">
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
