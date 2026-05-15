import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { MonthlyTrend, CATEGORY_COLORS } from "../components/Dashboard";
import AIAdvice from "../components/AIAdvice";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const EXPENSE_CATEGORY_ORDER = [
  "Fixed Costs", "Groceries & Dining", "Travel", "Fun Money", "Savings", "Miscellaneous",
];

export default function DashboardPage() {
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [years, setYears] = useState([]);
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(currentMonth);
  const [summary, setSummary] = useState(null);
  const [targets, setTargets] = useState({});
  const [recentTx, setRecentTx] = useState([]);
  const [netWorth, setNetWorth] = useState([]);
  const [loading, setLoading] = useState(false);
  const [editingTarget, setEditingTarget] = useState(null);
  const [editValue, setEditValue] = useState("");
  const [conclusion, setConclusion] = useState(null);
  const [conclusionLoading, setConclusionLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.getYears().then((y) => setYears(y.length ? y : [currentYear])).catch(() => {});
    api.getBudgetTargets()
      .then((rows) => {
        if (!rows.length) return api.seedBudgetTargets().then(() => api.getBudgetTargets());
        return rows;
      })
      .then((rows) => {
        const map = {};
        rows.forEach((r) => { map[r.category] = r.monthly_target; });
        setTargets(map);
      })
      .catch(() => {});
    api.getTransactions({ limit: 12 }).then(setRecentTx).catch(() => {});
    api.getNetWorth().then(setNetWorth).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    setConclusion(null);
    api.getSummary(year, month)
      .then(setSummary)
      .catch(() => setSummary(null))
      .finally(() => setLoading(false));
  }, [year, month]);

  async function fetchConclusion() {
    if (!month) return;
    setConclusionLoading(true);
    try {
      const res = await api.getMonthlyConclusion(year, month);
      setConclusion(res);
    } catch (e) {
      setConclusion({ conclusion: "Could not generate: " + e.message });
    } finally {
      setConclusionLoading(false);
    }
  }

  async function saveTarget(category, value) {
    const num = parseFloat(value);
    if (isNaN(num) || num < 0) return;
    await api.patchBudgetTarget(category, num).catch(() => {});
    setTargets((t) => ({ ...t, [category]: num }));
    setEditingTarget(null);
  }

  function drillDown(category) {
    const params = new URLSearchParams({ category });
    if (month) {
      const lastDay = new Date(year, month, 0).getDate();
      params.set("date_from", `${year}-${String(month).padStart(2, "0")}-01`);
      params.set("date_to", `${year}-${String(month).padStart(2, "0")}-${lastDay}`);
    } else {
      params.set("date_from", `${year}-01-01`);
      params.set("date_to", `${year}-12-31`);
    }
    navigate(`/transactions?${params.toString()}`);
  }

  const fmt = (v) => v?.toLocaleString("fr-CH", { maximumFractionDigits: 0 }) ?? "—";
  const monthMultiplier = month ? 1 : (year < currentYear ? 12 : currentMonth);
  const incomeTarget = (targets["Income"] || 7500) * monthMultiplier;
  const expenseTarget = EXPENSE_CATEGORY_ORDER.reduce((s, c) => s + (targets[c] || 0), 0) * monthMultiplier;
  const netTarget = incomeTarget - expenseTarget;

  return (
    <div className="space-y-4">
      {/* Period picker */}
      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-1.5 text-sm"
        >
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button
          onClick={() => setMonth(null)}
          className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${!month ? "border-brand-500 text-brand-500" : "border-gray-800 text-gray-500 hover:border-gray-600"}`}
        >
          Full year
        </button>
        {MONTHS.map((m, i) => (
          <button
            key={i}
            onClick={() => setMonth(i + 1)}
            className={`text-sm px-2.5 py-1.5 rounded-lg border transition-colors ${month === i + 1 ? "border-brand-500 text-brand-500" : "border-gray-800 text-gray-500 hover:border-gray-600"}`}
          >
            {m}
          </button>
        ))}
      </div>

      {loading && <p className="text-gray-600 text-sm">Loading…</p>}

      {summary && (
        <div className="flex gap-5">

          {/* ── LEFT / MAIN ── */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* KPI row */}
            <div className="grid grid-cols-4 gap-3">
              <KpiCard label="Income" value={fmt(summary.total_income)}
                target={month ? fmt(incomeTarget) : null}
                delta={month ? summary.total_income - incomeTarget : null}
                color="text-green-400" />
              <KpiCard label="Expenses" value={fmt(summary.total_expenses)}
                target={month ? fmt(expenseTarget) : null}
                delta={month ? -(summary.total_expenses - expenseTarget) : null}
                color="text-red-400" />
              <KpiCard label="Net"
                value={`${summary.net >= 0 ? "+" : ""}${fmt(summary.net)}`}
                target={month ? `${netTarget >= 0 ? "+" : ""}${fmt(netTarget)}` : null}
                delta={month ? summary.net - netTarget : null}
                color={summary.net >= 0 ? "text-green-400" : "text-red-400"} />
              <KpiCard label="Transfers"
                value={`${summary.total_transfers >= 0 ? "+" : ""}${fmt(summary.total_transfers)}`}
                color="text-gray-500" note="excluded" />
            </div>

            {/* AI conclusion bar */}
            {month && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 flex items-center gap-3">
                <div className="flex-1 text-sm text-gray-300">
                  {conclusion
                    ? conclusion.conclusion
                    : <span className="text-gray-600 italic">No summary yet — click to generate</span>}
                </div>
                <button
                  onClick={fetchConclusion}
                  disabled={conclusionLoading}
                  className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-purple-900 hover:bg-purple-800 disabled:opacity-50 text-purple-200 transition-colors"
                >
                  {conclusionLoading ? <><span className="animate-pulse">✦</span> Generating…</> : <><span>✦</span> Summarise</>}
                </button>
              </div>
            )}

            {/* Stacked bar chart */}
            {summary.monthly_trend?.length > 0 && (
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <h3 className="text-sm font-semibold text-gray-300 mb-3">Monthly Spending by Category</h3>
                <MonthlyTrend data={summary.monthly_trend} incomeTarget={incomeTarget} expenseTarget={expenseTarget} showAverage={!month} />
              </div>
            )}

            {/* Budget progress — full width */}
            <div className="grid grid-cols-1 gap-4">
              <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                <div className="flex items-baseline gap-2 mb-3">
                  <h3 className="text-sm font-semibold text-gray-300">Budget</h3>
                  {!month && (
                    <span className="text-xs text-gray-600">
                      {year < currentYear ? "×12" : `×${currentMonth} (Jan–${MONTHS[currentMonth-1]})`}
                    </span>
                  )}
                </div>
                <div className="space-y-2.5">
                  {EXPENSE_CATEGORY_ORDER.map((cat) => {
                    const actual = summary.by_category[cat] || 0;
                    const target = (targets[cat] || 0) * monthMultiplier;
                    if (!actual && !target) return null;
                    const pct = target > 0 ? Math.min((actual / target) * 100, 115) : 0;
                    const over = target > 0 && actual > target;
                    const barColor = over ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "";
                    const dotColor = CATEGORY_COLORS[cat] ?? "#6b7280";

                    return (
                      <div key={cat}>
                        <div className="flex items-center justify-between mb-1">
                          <button
                            onClick={() => drillDown(cat)}
                            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
                          >
                            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: dotColor }} />
                            {cat}
                          </button>
                          <div className="flex items-center gap-1.5 text-xs">
                            <span className={over ? "text-red-400 font-semibold" : "text-gray-300"}>{fmt(actual)}</span>
                            <span className="text-gray-700">/</span>
                            {editingTarget === cat ? (
                              <form onSubmit={(e) => { e.preventDefault(); saveTarget(cat, editValue); }}>
                                <input autoFocus type="number" value={editValue}
                                  onChange={(e) => setEditValue(e.target.value)}
                                  onBlur={() => saveTarget(cat, editValue)}
                                  className="w-20 bg-gray-800 border border-brand-500 rounded px-1 py-0 text-xs text-right" />
                              </form>
                            ) : (
                              <button
                                onClick={() => { setEditingTarget(cat); setEditValue(String(targets[cat] || "")); }}
                                className="text-gray-600 hover:text-gray-400 underline decoration-dashed underline-offset-2"
                              >
                                {target ? fmt(target) : "set"}
                              </button>
                            )}
                          </div>
                        </div>
                        {target > 0 && (
                          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${barColor}`}
                              style={{ width: `${pct}%`, background: barColor ? undefined : dotColor, opacity: 0.8 }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

            </div>

            {/* AI Advice */}
            <AIAdvice year={year} month={month || currentMonth} />
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div className="w-64 shrink-0 space-y-4">

            {/* Net worth widget */}
            {netWorth.length > 0 && (
              <NetWorthWidget netWorth={netWorth} onClick={() => navigate("/wealth")} />
            )}

            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 sticky top-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-300">Recent</h3>
                <button onClick={() => navigate("/transactions")} className="text-xs text-gray-600 hover:text-brand-400 transition-colors">
                  View all →
                </button>
              </div>
              <div className="space-y-2">
                {recentTx.map((tx) => (
                  <div key={tx.id} className="flex items-start justify-between gap-2 py-1.5 border-b border-gray-800 last:border-0">
                    <div className="min-w-0">
                      <p className="text-xs text-gray-300 truncate">{tx.description.split("|")[0].trim()}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{tx.category}</p>
                    </div>
                    <span className={`text-xs font-mono shrink-0 ${tx.amount >= 0 ? "text-green-400" : "text-gray-400"}`}>
                      {tx.amount >= 0 ? "+" : ""}{tx.amount.toLocaleString("fr-CH", { maximumFractionDigits: 0 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

function KpiCard({ label, value, color, note, target, delta }) {
  const deltaColor = delta == null ? "" : delta > 0 ? "text-green-400" : "text-red-400";
  const deltaSign = delta == null ? "" : delta > 0 ? "+" : "";
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-3">
      <p className="text-xs text-gray-600 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
      {target && <p className="text-xs text-gray-700 mt-0.5">target {target}</p>}
      {delta != null && (
        <p className={`text-xs font-semibold mt-0.5 ${deltaColor}`}>
          {deltaSign}{Math.round(delta).toLocaleString("fr-CH")}
        </p>
      )}
      {note && <p className="text-xs text-gray-700 mt-0.5">{note}</p>}
    </div>
  );
}

function NetWorthWidget({ netWorth, onClick }) {
  const latest = netWorth[netWorth.length - 1];
  const prev = netWorth[netWorth.length - 2];
  const delta = prev ? latest.value - prev.value : null;
  const fmtK = (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : Math.round(v).toLocaleString("fr-CH");
  return (
    <button onClick={onClick}
      className="w-full bg-gray-900 border border-gray-800 rounded-xl p-4 text-left hover:border-gray-700 transition-colors">
      <p className="text-xs text-gray-600 uppercase tracking-wide mb-1">Net Worth</p>
      <p className="text-2xl font-bold font-mono text-green-400">€{fmtK(latest.value)}</p>
      {delta != null && (
        <p className={`text-xs mt-1 font-semibold ${delta >= 0 ? "text-green-500" : "text-red-400"}`}>
          {delta >= 0 ? "+" : ""}€{fmtK(Math.abs(delta))} since last snapshot
        </p>
      )}
      <p className="text-xs text-gray-700 mt-1">{latest.date} · click to view →</p>
    </button>
  );
}
