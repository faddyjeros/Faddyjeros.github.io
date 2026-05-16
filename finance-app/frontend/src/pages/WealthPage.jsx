import { useEffect, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ComposedChart, Line,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api";

const fmt = (v) => v?.toLocaleString("fr-CH", { maximumFractionDigits: 0 }) ?? "—";
const fmtK = (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : fmt(v);

const COMPANY_COLORS = {
  Accuracy: "#7209b7",
  FTI: "#4361ee",
  Epiq: "#06d6a0",
};

const TYPE_COLORS = {
  Index: "#4361ee",
  Stock: "#f72585",
  Pension: "#06d6a0",
  Loan: "#ef476f",
  SCI: "#ffd166",
};

export default function WealthPage() {
  const [networth, setNetworth] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getNetWorth(),
      api.getPortfolio(),
      api.getLoan(),
    ])
      .then(([nw, p, l]) => {
        setNetworth(nw);
        setPortfolio(p);
        setLoan(l);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-zinc-500 text-sm p-6">Loading wealth data…</p>;
  if (error) return <p className="text-red-400 text-sm p-6">Could not load accounting file: {error}</p>;

  const latest = networth[networth.length - 1];
  const prev = networth[networth.length - 2];
  const delta = latest && prev ? latest.value - prev.value : null;

  const investableTotal = portfolio?.dynamic.reduce((s, h) => s + h.value_eur, 0) ?? 0;
  const loanRemaining = loan?.summary.capital_remaining ?? 0;

  // Loan chart data: past = solid area, future = dashed line
  const loanChart = (loan?.schedule ?? []).map((p) => ({
    date: p.date.slice(0, 7),
    past: p.is_past ? p.remaining : null,
    future: !p.is_past ? p.remaining : null,
    // bridge point: both set at the transition
  }));
  // Add bridge: last past point also shown as first future point
  const bridgeIdx = loanChart.findLastIndex((p) => p.past !== null);
  if (bridgeIdx >= 0 && bridgeIdx < loanChart.length - 1) {
    loanChart[bridgeIdx + 1].future = loanChart[bridgeIdx].past;
  }

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-zinc-100">Net Worth & Wealth</h2>

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <WKpi label="Net Worth" value={`€${fmtK(latest?.value ?? 0)}`} color="text-green-400"
          sub={delta != null ? `${delta >= 0 ? "+" : ""}€${fmtK(Math.abs(delta))} since last` : null}
          subColor={delta >= 0 ? "text-green-500" : "text-red-400"} />
        <WKpi label="Investable Assets" value={`€${fmtK(investableTotal)}`} color="text-amber-400"
          sub="Index funds + stocks" />
        <WKpi label="Loan Remaining" value={`€${fmtK(loanRemaining)}`} color="text-red-400"
          sub="Due Sep 2027" />
        <WKpi label="SCI Le Boudou" value="€160k" color="text-yellow-400"
          sub="Estimated valuation" />
      </div>

      {/* Net worth timeline */}
      <div className="bg-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-100 mb-1">Net Worth Timeline</h3>
        <p className="text-xs text-zinc-500 mb-4">Excluding Boudou SCI · Pensions excluded from Feb 2026</p>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={networth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#4361ee" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#4361ee" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={(d) => d.slice(0, 7)} interval="preserveStartEnd" />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={fmtK} axisLine={false} tickLine={false} width={48} />
            <Tooltip
              formatter={(v) => [`€${fmt(v)}`, "Net Worth"]}
              labelFormatter={(l) => l}
              content={<CustomNWTooltip data={networth} />}
              contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }}
            />
            <Area type="monotone" dataKey="value" stroke="#4361ee" strokeWidth={2}
              fill="url(#nwGrad)" dot={false} activeDot={{ r: 4, fill: "#4361ee" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Portfolio + Loan side by side */}
      <div className="grid grid-cols-2 gap-6">

        {/* Portfolio */}
        <div className="bg-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-zinc-100 mb-4">Portfolio</h3>
          <div className="space-y-1 mb-4">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Live positions</p>
            {portfolio?.dynamic.map((h) => (
              <div key={h.ticker} className="flex items-center justify-between py-1.5 border-b border-zinc-700">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-semibold w-14"
                    style={{ color: TYPE_COLORS[h.type] ?? "#9ca3af" }}>{h.ticker}</span>
                  <span className="text-xs text-zinc-500">{h.volume} × €{fmt(h.price)}</span>
                </div>
                <span className="text-sm font-semibold text-zinc-200">€{fmt(h.value_eur)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1">
            <p className="text-xs text-zinc-500 uppercase tracking-wide mt-3 mb-1">Other holdings</p>
            {portfolio?.flat.map((h) => (
              <div key={h.name} className="flex items-center justify-between py-1 border-b border-zinc-700">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: TYPE_COLORS[h.type] ?? "#6b7280" }} />
                  <span className="text-xs text-zinc-400">{h.name}</span>
                </div>
                <span className={`text-sm font-semibold ${h.value_eur < 0 ? "text-red-400" : "text-zinc-200"}`}>
                  {h.value_eur < 0 ? "-" : ""}€{fmt(Math.abs(h.value_eur))}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-3 mt-2 border-t border-zinc-700">
            <span className="text-sm text-zinc-400">Total (excl. Boudou)</span>
            <span className="text-sm font-bold text-green-400">€{fmt(portfolio?.total_eur ?? 0)}</span>
          </div>
        </div>

        {/* Loan */}
        <div className="bg-zinc-800 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-zinc-100 mb-1">Student Loan</h3>
          <p className="text-xs text-zinc-500 mb-3">Monthly repayment schedule · matures Aug 2027</p>

          {/* Progress bar */}
          <div className="mb-4">
            <div className="flex justify-between text-xs text-zinc-500 mb-1">
              <span>€{fmt(loan?.summary.capital_paid)} paid</span>
              <span>€{fmt(loan?.summary.capital_remaining)} left</span>
            </div>
            <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
              <div className="h-full bg-green-500 rounded-full transition-all"
                style={{ width: `${((loan?.summary.capital_paid ?? 0) / 19000) * 100}%` }} />
            </div>
            <div className="flex justify-between text-xs text-zinc-500 mt-1">
              <span>Aug 2021</span>
              <span className="text-green-500 font-semibold">
                {Math.round(((loan?.summary.capital_paid ?? 0) / 19000) * 100)}% repaid
              </span>
              <span>Aug 2027</span>
            </div>
          </div>

          {/* Remaining balance chart */}
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={loanChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false}
                interval="preserveStartEnd" />
              <YAxis tick={{ fill: "#6b7280", fontSize: 10 }} tickFormatter={fmtK} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                formatter={(v, name) => v != null ? [`€${fmt(v)}`, name === "past" ? "Paid down" : "Projected"] : [null]}
                contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }}
              />
              <Area type="monotone" dataKey="past" stroke="#06d6a0" strokeWidth={2}
                fill="#06d6a020" dot={false} name="past" connectNulls={false} />
              <Line type="monotone" dataKey="future" stroke="#06d6a0" strokeWidth={2}
                strokeDasharray="6 4" dot={false} name="future" connectNulls={false} />
              <ReferenceLine x={new Date().toISOString().slice(0, 7)} stroke="#6b7280"
                strokeDasharray="4 4" label={{ value: "Today", fill: "#6b7280", fontSize: 9 }} />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-zinc-700 text-xs text-zinc-500">
            <span>Interest paid: €{fmt(loan?.summary.interest_paid)}</span>
            <span className="text-right">Interest left: €{fmt(loan?.summary.interest_remaining)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function WKpi({ label, value, color, sub, subColor }) {
  return (
    <div className="bg-zinc-800 rounded-xl p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${subColor ?? "text-zinc-500"}`}>{sub}</p>}
    </div>
  );
}

function CustomNWTooltip({ active, payload, label, data }) {
  if (!active || !payload?.length) return null;
  const point = data?.find((d) => d.date === label);
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs">
      <p className="text-zinc-400 mb-1">{label}</p>
      <p className="text-green-400 font-semibold text-sm">€{fmt(payload[0]?.value)}</p>
      {point?.comment && <p className="text-zinc-500 mt-1 max-w-48">{point.comment}</p>}
    </div>
  );
}
