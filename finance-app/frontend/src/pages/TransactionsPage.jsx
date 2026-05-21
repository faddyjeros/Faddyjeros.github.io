import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import TransactionTable from "../components/TransactionTable";

const ACCOUNT_LABELS = {
  "UBS Debit":              { label: "UBS",        color: "text-red-400" },
  "BNP Courant":            { label: "BNP",        color: "text-green-400" },
  "Boursobank Courant":     { label: "BOURSO",     color: "text-blue-400" },
  "Revolut Consolidated":   { label: "REVOLUT",    color: "text-purple-400" },
};

function AccountBar() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => { api.getAccounts().then(setAccounts).catch(() => {}); }, []);
  if (!accounts.length) return null;
  const fmt = (v) => v?.toLocaleString("fr-CH", { maximumFractionDigits: 0 }) ?? "—";
  return (
    <div className="grid grid-cols-4 gap-3">
      {accounts.map((acc) => {
        const name = acc.account_name ?? acc.account;
        const meta = ACCOUNT_LABELS[name] ?? { label: name, color: "text-zinc-300" };
        return (
          <div key={name} className="bg-zinc-800 rounded-xl px-4 py-3">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{meta.label}</p>
            <p className={`text-lg font-bold font-mono ${meta.color}`}>{fmt(acc.amount_local)}</p>
            {acc.amount_eur !== acc.amount_local && (
              <p className="text-xs text-zinc-500 mt-0.5">≈ €{fmt(acc.amount_eur)}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function TransactionsPage() {
  const [searchParams] = useSearchParams();
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [banks, setBanks] = useState([]);
  const [filters, setFilters] = useState({
    bank: "",
    category: searchParams.get("category") || "",
    search: "",
    date_from: searchParams.get("date_from") || "",
    date_to: searchParams.get("date_to") || "",
  });
  const [loading, setLoading] = useState(false);
  const [aiState, setAiState] = useState("idle"); // idle | running | done | error
  const [aiResult, setAiResult] = useState(null);
  useEffect(() => {
    api.getCategories().then(c => setCategories([...c].sort())).catch(() => {});
    api.getBanks().then(b => setBanks([...b].sort())).catch(() => {});
  }, []);

  function reload() {
    api.getTransactions({ ...filters, limit: 500 }).then(setTransactions);
  }

  async function runAICategorize() {
    setAiState("running");
    setAiResult(null);
    try {
      const result = await api.categorizeOthers();
      setAiResult(result);
      setAiState("done");
      reload();
    } catch (e) {
      setAiResult({ message: e.message });
      setAiState("error");
    }
  }

  useEffect(() => {
    setLoading(true);
    api.getTransactions({ ...filters, limit: 500 })
      .then(setTransactions)
      .catch(() => setTransactions([]))
      .finally(() => setLoading(false));
  }, [filters]);

  function setFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="space-y-4">
      <AccountBar />
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="text"
          placeholder="Search description..."
          value={filters.search}
          onChange={(e) => setFilter("search", e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm w-56"
        />
        <select
          value={filters.bank}
          onChange={(e) => setFilter("bank", e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">All banks</option>
          {banks.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select
          value={filters.category}
          onChange={(e) => setFilter("category", e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm"
        >
          <option value="">All categories</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <input
          type="date"
          value={filters.date_from}
          onChange={(e) => setFilter("date_from", e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm"
        />
        <span className="text-zinc-500">→</span>
        <input
          type="date"
          value={filters.date_to}
          onChange={(e) => setFilter("date_to", e.target.value)}
          className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm"
        />
        <span className="text-xs text-zinc-500 ml-auto">{transactions.length} transactions</span>

        <button
          onClick={runAICategorize}
          disabled={aiState === "running"}
          title="Send all 'Other' transactions to Claude for automatic categorization"
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 disabled:opacity-50 text-amber-400 transition-colors shrink-0"
        >
          {aiState === "running" ? (
            <><span className="animate-pulse">✦</span> Categorizing...</>
          ) : (
            <><span>✦</span> Auto-categorize Miscellaneous</>
          )}
        </button>
        {aiState === "done" && aiResult && (
          <span className="text-xs text-green-400">{aiResult.message}</span>
        )}
        {aiState === "error" && aiResult && (
          <span className="text-xs text-red-400">{aiResult.message}</span>
        )}
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm">Loading...</p>
      ) : (
        <TransactionTable
          transactions={transactions}
          categories={categories}
          onUpdated={reload}
        />
      )}
    </div>
  );
}
