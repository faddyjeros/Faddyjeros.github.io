import { useEffect, useState } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar,
} from "recharts";
import { api } from "../api";
import AnalystChat from "../components/AnalystChat";

const COLORS = ["#f59e0b", "#fbbf24", "#4ade80", "#fb923c", "#a78bfa", "#60a5fa"];

function SummaryCard({ label, value, sublabel }) {
  return (
    <div className="bg-surface rounded-xl p-4">
      <div className="text-content-secondary text-xs uppercase tracking-wide">{label}</div>
      <div className="text-2xl font-bold text-zinc-50 mt-1">{value}</div>
      {sublabel && <div className="text-xs text-content-muted mt-1">{sublabel}</div>}
    </div>
  );
}

function fmt(n) {
  if (n == null) return "—";
  return new Intl.NumberFormat("fr-CH", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);
}

export default function AnalystPage() {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [chatOpen, setChatOpen] = useState(true);

  useEffect(() => {
    api.getAnalystOverview()
      .then(setOverview)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-content-secondary animate-pulse">Loading analyst data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-300">
        Failed to load: {error}
      </div>
    );
  }

  const { summary, holdings, net_worth_history, live_prices } = overview;

  const allocationData = (holdings?.dynamic || [])
    .filter((h) => h.value_eur > 0)
    .map((h) => ({ name: h.ticker, value: h.live_value || h.value_eur }));

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Dashboard column */}
      <div className={`flex-1 overflow-y-auto pr-2 space-y-4 ${chatOpen ? "" : "max-w-full"}`}>
        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryCard label="Net Worth" value={fmt(summary.net_worth)} />
          <SummaryCard label="Portfolio" value={fmt(summary.portfolio_value)} />
          <SummaryCard label="Cash" value={fmt(summary.cash)} />
          <SummaryCard
            label="Savings Rate"
            value={`${summary.savings_rate}%`}
            sublabel={`${fmt(summary.investable_now)} investable`}
          />
        </div>

        {/* Net worth trend */}
        {net_worth_history && net_worth_history.length > 0 && (
          <div className="bg-surface rounded-xl p-4">
            <h3 className="text-sm font-medium text-content-secondary mb-3">Net Worth Trend</h3>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={net_worth_history}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#a1a1aa", fontSize: 11 }}
                  tickFormatter={(d) => d.slice(0, 7)}
                />
                <YAxis tick={{ fill: "#a1a1aa", fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  contentStyle={{ background: "#27272a", border: "none", borderRadius: 8 }}
                  labelStyle={{ color: "#fafafa" }}
                  formatter={(v) => [fmt(v), "Net Worth"]}
                />
                <Line type="monotone" dataKey="value" stroke="#f59e0b" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Allocation + Holdings */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Allocation pie */}
          {allocationData.length > 0 && (
            <div className="bg-surface rounded-xl p-4">
              <h3 className="text-sm font-medium text-content-secondary mb-3">Allocation</h3>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={allocationData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  >
                    {allocationData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v) => fmt(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Holdings table */}
          <div className="bg-surface rounded-xl p-4">
            <h3 className="text-sm font-medium text-content-secondary mb-3">Holdings</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-content-muted text-xs uppercase">
                    <th className="text-left pb-2">Ticker</th>
                    <th className="text-right pb-2">Price</th>
                    <th className="text-right pb-2">Change</th>
                    <th className="text-right pb-2">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(holdings?.dynamic || []).map((h) => {
                    const quote = live_prices?.[h.ticker];
                    const change = quote?.changePercent;
                    return (
                      <tr key={h.ticker} className="border-t border-line">
                        <td className="py-2 text-content font-medium">{h.ticker}</td>
                        <td className="py-2 text-right text-content-secondary">
                          {quote?.price ? `$${quote.price.toFixed(2)}` : "—"}
                        </td>
                        <td className={`py-2 text-right ${change > 0 ? "text-accent" : change < 0 ? "text-orange-400" : "text-content-secondary"}`}>
                          {change != null ? `${change > 0 ? "+" : ""}${change.toFixed(2)}%` : "—"}
                        </td>
                        <td className="py-2 text-right text-content-secondary">
                          {fmt(h.live_value || h.value_eur)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Chat sidebar */}
      {chatOpen ? (
        <div className="w-[380px] shrink-0 flex flex-col bg-surface rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-line">
            <h3 className="text-sm font-medium text-accent">AI Analyst</h3>
            <button onClick={() => setChatOpen(false)} className="text-content-muted hover:text-content-secondary text-lg">×</button>
          </div>
          <AnalystChat />
        </div>
      ) : (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed bottom-6 right-6 bg-accent hover:bg-accent-hover text-zinc-900 font-medium px-4 py-3 rounded-full shadow-lg transition-colors"
        >
          AI Analyst
        </button>
      )}
    </div>
  );
}
