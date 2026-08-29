import { useEffect, useState, useCallback } from "react";
import {
  Area, AreaChart, CartesianGrid, ComposedChart, Line,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api";
import EditableTable from "../components/EditableTable";
import { CHART_ACCENT, useChartTheme } from "../chartTheme";

const fmt = (v) => v?.toLocaleString("fr-CH", { maximumFractionDigits: 0 }) ?? "—";
const fmtK = (v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : fmt(v);

const TYPE_COLORS = {
  Index: "#10b981",   // emerald
  Stock: "#0ea5e9",   // sky
  Pension: "#8b5cf6", // violet
  Loan: "#f43f5e",    // rose
  SCI: "#f59e0b",     // amber
};

// Column definitions for each editable table
const NW_COLUMNS = [
  { key: "date", label: "Date", type: "date", width: "130px" },
  { key: "value", label: "Value (EUR)", type: "number", width: "140px" },
  { key: "comment", label: "Comment", type: "text" },
];

const PORTFOLIO_COLUMNS = [
  { key: "name", label: "Name", type: "text" },
  { key: "holding_type", label: "Type", type: "select", options: ["Index", "Stock", "Pension", "SCI", "Other"], width: "100px" },
  { key: "ticker", label: "Ticker", type: "text", width: "100px" },
  { key: "volume", label: "Volume", type: "number", width: "90px" },
  { key: "price", label: "Price", type: "number", width: "100px" },
  { key: "avg_cost", label: "Avg Cost", type: "number", width: "100px" },
  { key: "value_eur", label: "Value EUR", type: "number", width: "110px" },
  { key: "is_dynamic", label: "Live price", type: "select", options: ["true", "false"], width: "90px" },
];

const ACCOUNT_COLUMNS = [
  { key: "account_name", label: "Account", type: "text" },
  { key: "amount_local", label: "Local Currency", type: "number", width: "130px" },
  { key: "amount_eur", label: "EUR", type: "number", width: "130px" },
];

const LOAN_COLUMNS = [
  { key: "date", label: "Date", type: "date", width: "130px" },
  { key: "capital", label: "Capital", type: "number", width: "110px" },
  { key: "interest", label: "Interest", type: "number", width: "110px" },
  { key: "insurance", label: "Insurance", type: "number", width: "110px" },
];

export default function WealthPage() {
  const theme = useChartTheme();
  const [networth, setNetworth] = useState([]);
  const [portfolio, setPortfolio] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [loan, setLoan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.getNetWorth(),
      api.getPortfolio(),
      api.getAccounts(),
      api.getLoan(),
    ])
      .then(([nw, p, a, l]) => {
        setNetworth(nw);
        setPortfolio(p);
        setAccounts(a);
        setLoan(l);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  async function handleImport(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.syncExcel(file);
      setSyncResult(res);
      reload();
    } catch (err) {
      setSyncResult({ error: err.message || "Import failed" });
    } finally {
      setSyncing(false);
    }
  }

  if (loading) return <p className="text-content-muted text-sm p-6">Loading wealth data...</p>;
  if (error) return <p className="text-red-400 text-sm p-6">Failed to load: {error}</p>;

  const latest = networth[networth.length - 1];
  const prev = networth[networth.length - 2];
  const delta = latest && prev ? latest.value - prev.value : null;

  const investableTotal = portfolio?.dynamic?.reduce((s, h) => s + h.value_eur, 0) ?? 0;
  const loanRemaining = loan?.summary?.capital_remaining ?? 0;

  // Loan chart data
  const loanChart = (loan?.schedule ?? []).map((p) => ({
    date: p.date.slice(0, 7),
    past: p.is_past ? p.remaining : null,
    future: !p.is_past ? p.remaining : null,
  }));
  const bridgeIdx = loanChart.findLastIndex((p) => p.past !== null);
  if (bridgeIdx >= 0 && bridgeIdx < loanChart.length - 1) {
    loanChart[bridgeIdx + 1].future = loanChart[bridgeIdx].past;
  }

  // Flatten portfolio holdings for editing
  const allHoldings = [
    ...(portfolio?.dynamic ?? []).map((h) => ({ ...h, is_dynamic: "true" })),
    ...(portfolio?.flat ?? []).map((h) => ({ ...h, is_dynamic: "false" })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold text-content">Net Worth & Wealth</h2>
        <label
          className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border transition-colors ${
            syncing
              ? "border-line text-content-muted cursor-default"
              : "border-line text-content-secondary hover:text-content hover:border-content-muted cursor-pointer"
          }`}
          title="Sync new rows from your accounting spreadsheet"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${syncing ? "animate-pulse" : ""}`} aria-hidden="true">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
          </svg>
          {syncing ? "Syncing…" : "Import from Excel"}
          <input type="file" accept=".xlsx,.xls" onChange={handleImport} disabled={syncing} className="hidden" />
        </label>
      </div>

      {/* Sync result */}
      {syncResult && (
        <div className={`rounded-lg border px-4 py-2.5 text-xs flex items-center justify-between gap-3 ${
          syncResult.error
            ? "border-red-500/30 bg-red-500/10 text-red-400"
            : "border-accent/30 bg-accent/10 text-content-secondary"
        }`}>
          {syncResult.error ? (
            <span>Import failed: {syncResult.error}</span>
          ) : (
            <span className="font-mono">
              <span className="text-accent font-semibold">+{syncResult.total_added} added</span>
              {" · "}{syncResult.total_updated} updated
              {syncResult.total_removed > 0 && ` · ${syncResult.total_removed} removed`}
              {Object.entries(syncResult.synced || {})
                .filter(([, c]) => c.added || c.updated || c.removed)
                .map(([k, c]) => `  ·  ${k.replace("_", " ")} +${c.added}/${c.updated}${c.removed ? `/-${c.removed}` : ""}`)
                .join("")}
            </span>
          )}
          <button onClick={() => setSyncResult(null)} className="text-content-muted hover:text-content shrink-0" aria-label="Dismiss">✕</button>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-4 gap-4">
        <WKpi label="Net Worth" value={`${fmtK(latest?.value ?? 0)}`} color="text-accent"
          sub={delta != null ? `${delta >= 0 ? "+" : ""}${fmtK(Math.abs(delta))} since last` : null}
          subColor={delta >= 0 ? "text-accent" : "text-red-400"} />
        <WKpi label="Investable Assets" value={`${fmtK(investableTotal)}`} color="text-accent"
          sub="Index funds + stocks" />
        <WKpi label="Loan Remaining" value={`${fmtK(loanRemaining)}`} color="text-red-400"
          sub={`${loan?.schedule?.length ?? 0} payments tracked`} />
        <WKpi label="Cash Accounts" value={`${fmtK(accounts.reduce((s, a) => s + a.amount_eur, 0))}`} color="text-blue-400"
          sub={`${accounts.length} accounts`} />
      </div>

      {/* Net worth timeline chart */}
      <div className="bg-surface rounded-xl p-4">
        <h3 className="text-sm font-semibold text-content mb-1">Net Worth Timeline</h3>
        <p className="text-xs text-content-muted mb-4">Monthly snapshots</p>
        <ResponsiveContainer width="100%" height={280}>
          <AreaChart data={networth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART_ACCENT} stopOpacity={0.3} />
                <stop offset="95%" stopColor={CHART_ACCENT} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
            <XAxis dataKey="date" tick={{ fill: theme.axis, fontSize: 11 }} axisLine={false} tickLine={false}
              tickFormatter={(d) => d.slice(0, 7)} interval="preserveStartEnd" />
            <YAxis tick={{ fill: theme.axis, fontSize: 11 }} tickFormatter={fmtK} axisLine={false} tickLine={false} width={48} />
            <Tooltip content={<CustomNWTooltip data={networth} />} />
            <Area type="monotone" dataKey="value" stroke={CHART_ACCENT} strokeWidth={2}
              fill="url(#nwGrad)" dot={false} activeDot={{ r: 4, fill: CHART_ACCENT }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Portfolio + Loan charts side by side */}
      <div className="grid grid-cols-2 gap-6">
        {/* Portfolio summary */}
        <div className="bg-surface rounded-xl p-4">
          <h3 className="text-sm font-semibold text-content mb-4">Portfolio</h3>
          <div className="space-y-1 mb-4">
            <p className="text-xs text-content-muted uppercase tracking-wide">Live positions</p>
            {portfolio?.dynamic.map((h) => {
              const gainPct = h.avg_cost ? ((h.price - h.avg_cost) / h.avg_cost) * 100 : null;
              const px = (v) => v?.toLocaleString("fr-CH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? "—";
              return (
                <div key={h.ticker || h.name} className="flex items-start justify-between py-1.5 border-b border-line">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold w-14 shrink-0"
                        style={{ color: TYPE_COLORS[h.type ?? h.holding_type] ?? "#9ca3af" }}>{h.ticker}</span>
                      <span className="text-xs text-content-muted">{h.volume} × {px(h.price)}</span>
                    </div>
                    {h.avg_cost != null && (
                      <div className="text-[11px] font-mono text-content-muted mt-0.5 ml-16">
                        avg {px(h.avg_cost)}
                        {gainPct != null && (
                          <span className={gainPct >= 0 ? "text-accent" : "text-red-400"}>
                            {"  "}{gainPct >= 0 ? "+" : ""}{gainPct.toFixed(1)}%
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-content shrink-0">{fmt(h.value_eur)}</span>
                </div>
              );
            })}
          </div>
          <div className="space-y-1">
            <p className="text-xs text-content-muted uppercase tracking-wide mt-3 mb-1">Other holdings</p>
            {portfolio?.flat.map((h) => (
              <div key={h.name} className="flex items-center justify-between py-1 border-b border-line">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: TYPE_COLORS[h.type ?? h.holding_type] ?? "#6b7280" }} />
                  <span className="text-xs text-content-secondary">{h.name}</span>
                </div>
                <span className={`text-sm font-semibold ${h.value_eur < 0 ? "text-red-400" : "text-content"}`}>
                  {h.value_eur < 0 ? "-" : ""}{fmt(Math.abs(h.value_eur))}
                </span>
              </div>
            ))}
          </div>
          <div className="flex justify-between pt-3 mt-2 border-t border-line">
            <span className="text-sm text-content-secondary">Total (excl. SCI)</span>
            <span className="text-sm font-bold text-accent">{fmt(portfolio?.total_eur ?? 0)}</span>
          </div>
        </div>

        {/* Loan chart */}
        <div className="bg-surface rounded-xl p-4">
          <h3 className="text-sm font-semibold text-content mb-1">Student Loan</h3>
          <p className="text-xs text-content-muted mb-3">Repayment schedule</p>
          <div className="mb-4">
            <div className="flex justify-between text-xs text-content-muted mb-1">
              <span>€{fmt(loan?.summary?.capital_paid)} paid</span>
              <span>€{fmt(loan?.summary?.capital_remaining)} left</span>
            </div>
            <div className="h-2 bg-surface-hover rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${((loan?.summary?.capital_paid ?? 0) / (loan?.initial_balance ?? 19000)) * 100}%` }} />
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={loanChart} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
              <XAxis dataKey="date" tick={{ fill: theme.axis, fontSize: 10 }} axisLine={false} tickLine={false}
                interval="preserveStartEnd" />
              <YAxis tick={{ fill: theme.axis, fontSize: 10 }} tickFormatter={fmtK} axisLine={false} tickLine={false} width={40} />
              <Tooltip
                formatter={(v, name) => v != null ? [fmt(v), name === "past" ? "Paid down" : "Projected"] : [null]}
                contentStyle={theme.tooltip}
                itemStyle={{ color: theme.text }}
              />
              <Area type="monotone" dataKey="past" stroke={CHART_ACCENT} strokeWidth={2}
                fill={`${CHART_ACCENT}20`} dot={false} name="past" connectNulls={false} />
              <Line type="monotone" dataKey="future" stroke={CHART_ACCENT} strokeWidth={2}
                strokeDasharray="6 4" dot={false} name="future" connectNulls={false} />
              <ReferenceLine x={new Date().toISOString().slice(0, 7)} stroke={theme.axis}
                strokeDasharray="4 4" label={{ value: "Today", fill: theme.axis, fontSize: 9 }} />
            </ComposedChart>
          </ResponsiveContainer>

          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-line text-xs text-content-muted">
            <span>Interest paid: €{fmt(loan?.summary?.interest_paid)}</span>
            <span className="text-right">Interest left: €{fmt(loan?.summary?.interest_remaining)}</span>
          </div>
        </div>
      </div>

      {/* Editable data tables */}
      <EditableTable
        title="Net Worth Snapshots"
        columns={NW_COLUMNS}
        data={networth}
        exportEntity="networth"
        defaultSort={{ key: "date", dir: "desc" }}
        defaultNew={{ date: new Date().toISOString().slice(0, 10), value: 0, comment: "" }}
        onSave={async (id, data) => { await api.updateNetWorth(id, data); reload(); }}
        onCreate={async (data) => { const r = await api.createNetWorth(data); reload(); return r; }}
        onDelete={async (id) => { await api.deleteNetWorth(id); reload(); }}
      />

      <EditableTable
        title="Portfolio Holdings"
        columns={PORTFOLIO_COLUMNS}
        data={allHoldings}
        exportEntity="portfolio"
        defaultSort={{ key: "value_eur", dir: "desc" }}
        defaultNew={{ name: "", holding_type: "Index", ticker: "", volume: 0, price: 0, value_eur: 0, is_dynamic: "true" }}
        onSave={async (id, data) => {
          const d = { ...data, is_dynamic: data.is_dynamic === "true" || data.is_dynamic === true };
          await api.updatePortfolio(id, d);
          reload();
        }}
        onCreate={async (data) => {
          const d = { ...data, is_dynamic: data.is_dynamic === "true" || data.is_dynamic === true };
          const r = await api.createPortfolio(d);
          reload();
          return r;
        }}
        onDelete={async (id) => { await api.deletePortfolio(id); reload(); }}
      />

      <EditableTable
        title="Bank Accounts"
        columns={ACCOUNT_COLUMNS}
        data={accounts}
        exportEntity="accounts"
        defaultNew={{ account_name: "", amount_local: 0, amount_eur: 0 }}
        onSave={async (id, data) => { await api.updateAccount(id, data); reload(); }}
        onCreate={async (data) => { const r = await api.createAccount(data); reload(); return r; }}
        onDelete={async (id) => { await api.deleteAccount(id); reload(); }}
      />

      <EditableTable
        title="Loan Payments"
        columns={LOAN_COLUMNS}
        data={loan?.schedule ?? []}
        exportEntity="loan"
        defaultSort={{ key: "date", dir: "desc" }}
        defaultNew={{ date: "", capital: 0, interest: 0, insurance: 0 }}
        onSave={async (id, data) => { await api.updateLoan(id, data); reload(); }}
        onCreate={async (data) => { const r = await api.createLoan(data); reload(); return r; }}
        onDelete={async (id) => { await api.deleteLoan(id); reload(); }}
      />
    </div>
  );
}

function WKpi({ label, value, color, sub, subColor }) {
  return (
    <div className="bg-surface rounded-xl p-4">
      <p className="text-xs text-content-muted uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className={`text-xs mt-1 ${subColor ?? "text-content-muted"}`}>{sub}</p>}
    </div>
  );
}

function CustomNWTooltip({ active, payload, label, data }) {
  if (!active || !payload?.length) return null;
  const point = data?.find((d) => d.date === label);
  return (
    <div className="bg-base border border-line rounded-lg p-3 text-xs">
      <p className="text-content-secondary mb-1">{label}</p>
      <p className="text-accent font-semibold text-sm">{fmt(payload[0]?.value)}</p>
      {point?.comment && <p className="text-content-muted mt-1 max-w-48">{point.comment}</p>}
    </div>
  );
}
