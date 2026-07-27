import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area, AreaChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api";
import { CHART_ACCENT, useChartTheme } from "../chartTheme";

const eur = (v) =>
  v == null || !isFinite(v)
    ? "—"
    : new Intl.NumberFormat("fr-CH", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const eurK = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`);

// Emerald-anchored allocation palette, consistent with the rest of the app.
const ALLOC_COLORS = ["#10b981", "#0ea5e9", "#f59e0b", "#8b5cf6", "#f43f5e", "#14b8a6", "#a1a1aa"];

export default function DashboardPage() {
  const theme = useChartTheme();
  const navigate = useNavigate();
  const [networth, setNetworth] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    api.getNetWorth().then(setNetworth).catch(() => {});
    api.getPortfolio().then(setPortfolio).catch(() => {});
    api.getAccounts().then(setAccounts).catch(() => {});
  }, []);

  const latest = networth.length ? networth[networth.length - 1] : null;
  const prev = networth.length > 1 ? networth[networth.length - 2] : null;
  const delta = latest && prev ? latest.value - prev.value : null;

  const portfolioTotal = portfolio?.total_eur ?? 0;
  const cash = accounts.reduce((sum, a) => sum + (a.amount_eur || 0), 0);

  const allocation = [
    ...((portfolio?.dynamic) || []).map((h) => ({ name: h.ticker || h.name, value: h.live_value || h.value_eur })),
    ...((portfolio?.flat) || []).map((h) => ({ name: h.name, value: h.value_eur })),
  ]
    .filter((h) => h.value > 0)
    .sort((a, b) => b.value - a.value);

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-content">Overview</h2>
        {latest && <span className="text-xs text-content-muted font-mono">as of {latest.date}</span>}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Net worth" value={eur(latest?.value)} accent
          sub={delta != null ? `${delta >= 0 ? "+" : ""}${eur(delta)} this month` : null}
          subColor={delta != null ? (delta >= 0 ? "text-accent" : "text-red-400") : ""} />
        <Kpi label="Investments" value={eur(portfolioTotal)}
          sub={`${allocation.length} position${allocation.length === 1 ? "" : "s"}`} />
        <Kpi label="Cash" value={eur(cash)}
          sub={`${accounts.length} account${accounts.length === 1 ? "" : "s"}`} />
        <Kpi label="Invested share" value={portfolioTotal + cash > 0 ? `${Math.round((portfolioTotal / (portfolioTotal + cash)) * 100)}%` : "—"}
          sub="of liquid assets" />
      </div>

      {/* Net worth trend */}
      <div className="bg-surface border border-line rounded-xl p-4">
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="text-sm font-semibold text-content">Net worth</h3>
          <button onClick={() => navigate("/wealth")} className="text-xs text-content-muted hover:text-accent transition-colors">
            Manage details →
          </button>
        </div>
        <p className="text-xs text-content-muted mb-4">Monthly snapshots</p>
        {networth.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={networth} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="nwDash" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_ACCENT} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_ACCENT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: theme.axis, fontSize: 11 }} axisLine={false} tickLine={false}
                tickFormatter={(d) => d.slice(0, 7)} interval="preserveStartEnd" />
              <YAxis tick={{ fill: theme.axis, fontSize: 11 }} tickFormatter={eurK} axisLine={false} tickLine={false} width={44} />
              <Tooltip contentStyle={theme.tooltip} itemStyle={{ color: theme.text }}
                formatter={(v) => [eur(v), "Net worth"]} />
              <Area type="monotone" dataKey="value" stroke={CHART_ACCENT} strokeWidth={2} fill="url(#nwDash)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-content-muted text-sm text-center py-10">No net worth data yet — add snapshots on the Wealth page.</p>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Allocation */}
        <div className="bg-surface border border-line rounded-xl p-4">
          <h3 className="text-sm font-semibold text-content mb-1">Allocation</h3>
          <p className="text-xs text-content-muted mb-3">By holding</p>
          {allocation.length > 0 ? (
            <div className="flex items-center gap-4">
              <ResponsiveContainer width="50%" height={180}>
                <PieChart>
                  <Pie data={allocation} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={44} outerRadius={72}>
                    {allocation.map((_, i) => <Cell key={i} fill={ALLOC_COLORS[i % ALLOC_COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={theme.tooltip} itemStyle={{ color: theme.text }} formatter={(v) => eur(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1.5">
                {allocation.slice(0, 6).map((h, i) => (
                  <div key={h.name} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 text-content-secondary min-w-0">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ALLOC_COLORS[i % ALLOC_COLORS.length] }} />
                      <span className="truncate">{h.name}</span>
                    </span>
                    <span className="font-mono text-content shrink-0">{eur(h.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-content-muted text-sm text-center py-10">No holdings yet.</p>
          )}
        </div>

        {/* FIRE snapshot CTA */}
        <button
          onClick={() => navigate("/planner")}
          className="bg-surface border border-line rounded-xl p-4 text-left hover:border-accent transition-colors group"
        >
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-content">FIRE Planner</h3>
            <span className="text-xs text-content-muted group-hover:text-accent transition-colors">Open →</span>
          </div>
          <p className="text-xs text-content-muted mb-4">Project your path to financial independence.</p>
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-3xl font-semibold text-accent tracking-tight">{eur(latest?.value)}</span>
            <span className="text-xs text-content-muted">today</span>
          </div>
          <p className="text-xs text-content-secondary mt-3 leading-relaxed">
            Model contributions, returns, and inflation against FIRE, FatFIRE, and CoastFIRE targets.
          </p>
        </button>
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, subColor, accent }) {
  return (
    <div className="bg-surface border border-line rounded-xl p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-content-muted mb-1.5">{label}</div>
      <div className={`font-mono text-2xl font-semibold tracking-tight ${accent ? "text-accent" : "text-content"}`}>{value}</div>
      {sub && <div className={`text-xs mt-1 font-mono ${subColor || "text-content-muted"}`}>{sub}</div>}
    </div>
  );
}
