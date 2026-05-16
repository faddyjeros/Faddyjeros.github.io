import { useEffect, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, ComposedChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, ReferenceLine,
} from "recharts";
import { api } from "../api";

const fmt = (v) => v?.toLocaleString("fr-CH", { maximumFractionDigits: 0 }) ?? "—";

const COMPANY_COLORS = {
  Accuracy: "#7209b7",
  FTI:      "#4361ee",
  Epiq:     "#06d6a0",
};

const JURISDICTION_LABELS = {
  Germany: "🇩🇪",
  France:  "🇫🇷",
  Swiss:   "🇨🇭",
};

export default function SalaryPage() {
  const [salary, setSalary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getSalary()
      .then(setSalary)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-zinc-500 text-sm p-6">Loading salary data…</p>;
  if (error) return <p className="text-red-400 text-sm p-6">Could not load: {error}</p>;

  const latest = [...salary].reverse().find((s) => s.net > 0);
  const latestNormal = [...salary].reverse().find((s) => s.net > 0 && !s.bonus && !s.overtime);
  const totalNet = salary.reduce((s, r) => s + r.net, 0);
  const totalGross = salary.reduce((s, r) => s + r.gross + r.overtime + r.bonus + r.extras, 0);
  const totalBonus = salary.reduce((s, r) => s + r.bonus, 0);

  // Chart data — stacked gross components + net line
  const chartData = salary.map((s) => ({
    date: s.date.slice(0, 7),
    base: s.gross,
    overtime: s.overtime || 0,
    bonus: s.bonus || 0,
    extras: s.extras || 0,
    net: s.net,
    company: s.company,
  }));

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-zinc-100">Salary History</h2>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <SKpi label="Current Gross / mo" value={fmt(latest?.gross)}
          sub={`~${fmt(latestNormal?.net)} net / mo`} color="text-green-400" />
        <SKpi label="Current Company" value={latest?.company ?? "—"}
          sub={`${JURISDICTION_LABELS[latest?.jurisdiction] ?? ""} ${latest?.jurisdiction}`} color="text-amber-400" />
        <SKpi label="Total Net Earned" value={`${fmt(Math.round(totalNet))}`}
          sub="since Aug 2019" color="text-zinc-200" />
        <SKpi label="Total Bonuses" value={`${fmt(Math.round(totalBonus))}`}
          sub="across all jobs" color="text-yellow-400" />
      </div>

      {/* Bar chart */}
      <div className="bg-zinc-800 rounded-xl p-4">
        <h3 className="text-sm font-semibold text-zinc-100 mb-1">Gross Pay Breakdown per Month</h3>
        <p className="text-xs text-zinc-500 mb-4">Stacked by component · dashed line = net after tax</p>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: "#6b7280", fontSize: 10 }} axisLine={false} tickLine={false} interval={5} />
            <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`}
              axisLine={false} tickLine={false} width={36} />
            <Tooltip content={<SalaryTooltip />} />
            <Bar dataKey="base"     stackId="a" maxBarSize={14} fill="#4361ee" name="Base" />
            <Bar dataKey="overtime" stackId="a" maxBarSize={14} fill="#ffd166" name="Overtime" />
            <Bar dataKey="bonus"    stackId="a" maxBarSize={14} fill="#f72585" name="Bonus" radius={[2,2,0,0]} />
            <Bar dataKey="extras"   stackId="a" maxBarSize={14} fill="#06d6a0" name="Extras" radius={[2,2,0,0]} />
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex gap-4 mt-3 justify-center flex-wrap">
          {[["Base","#4361ee"],["Overtime","#ffd166"],["Bonus","#f72585"],["Extras","#06d6a0"]].map(([label, color]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
              <span className="text-xs text-zinc-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Full history table */}
      <div className="bg-zinc-800 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-700">
          <h3 className="text-sm font-semibold text-zinc-100">Full History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-700">
                {["Date","Company","Country","Gross","Overtime","Bonus","Extras","Net","Notes"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left text-zinc-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...salary].reverse().map((row, i) => {
                const color = COMPANY_COLORS[row.company] ?? "#6b7280";
                return (
                  <tr key={i} className="border-b border-zinc-700/50 hover:bg-zinc-700/30 transition-colors">
                    <td className="px-3 py-2 text-zinc-400 font-mono">{row.date.slice(0, 7)}</td>
                    <td className="px-3 py-2">
                      <span className="font-semibold" style={{ color }}>{row.company}</span>
                    </td>
                    <td className="px-3 py-2 text-zinc-500">
                      {JURISDICTION_LABELS[row.jurisdiction] ?? ""} {row.jurisdiction}
                    </td>
                    <td className="px-3 py-2 text-zinc-300 font-mono text-right">{fmt(row.gross)}</td>
                    <td className="px-3 py-2 text-right font-mono"
                      style={{ color: row.overtime ? "#ffd166" : "#4b5563" }}>
                      {row.overtime ? fmt(row.overtime) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono"
                      style={{ color: row.bonus ? "#f72585" : "#4b5563" }}>
                      {row.bonus ? fmt(row.bonus) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-zinc-500">
                      {row.extras ? fmt(row.extras) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-green-400 font-semibold">
                      {fmt(row.net)}
                    </td>
                    <td className="px-3 py-2 text-zinc-500 max-w-48 truncate">{row.comment ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SKpi({ label, value, sub, color }) {
  return (
    <div className="bg-zinc-800 rounded-xl p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

function SalaryTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const total = (d?.base ?? 0) + (d?.overtime ?? 0) + (d?.bonus ?? 0) + (d?.extras ?? 0);
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-3 text-xs space-y-1">
      <p className="text-zinc-400 font-semibold">{label}</p>
      <p className="font-semibold" style={{ color: COMPANY_COLORS[d?.company] ?? "#9ca3af" }}>{d?.company}</p>
      <div className="border-t border-zinc-700 pt-1 mt-1 space-y-0.5">
        <p className="text-blue-400">Base: {fmt(d?.base)}</p>
        {d?.overtime > 0 && <p className="text-yellow-400">Overtime: +{fmt(d.overtime)}</p>}
        {d?.bonus > 0 && <p className="text-pink-400">Bonus: +{fmt(d.bonus)}</p>}
        {d?.extras > 0 && <p className="text-green-400">Extras: +{fmt(d.extras)}</p>}
        <p className="text-zinc-300 font-semibold border-t border-zinc-700 pt-1">Total gross: {fmt(total)}</p>
        <p className="text-zinc-500">Net: ~{fmt(d?.net)}</p>
      </div>
    </div>
  );
}
