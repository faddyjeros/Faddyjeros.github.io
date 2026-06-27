import { useEffect, useState, useCallback } from "react";
import {
  Bar, BarChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api";
import EditableTable from "../components/EditableTable";

const fmt = (v) => v?.toLocaleString("fr-CH", { maximumFractionDigits: 0 }) ?? "—";

const COMPANY_COLORS = {
  Accuracy: "#7209b7",
  FTI:      "#4361ee",
  Epiq:     "#06d6a0",
};

const JURISDICTION_LABELS = {
  Germany: "DE",
  France:  "FR",
  Swiss:   "CH",
};

const SALARY_COLUMNS = [
  { key: "date", label: "Date", type: "date", width: "120px" },
  { key: "company", label: "Company", type: "text", width: "110px" },
  { key: "jurisdiction", label: "Country", type: "select", options: ["France", "Germany", "Swiss", "UK", "US"], width: "100px" },
  { key: "gross", label: "Gross", type: "number", width: "100px" },
  { key: "overtime", label: "Overtime", type: "number", width: "90px" },
  { key: "extras", label: "Extras", type: "number", width: "90px" },
  { key: "bonus", label: "Bonus", type: "number", width: "90px" },
  { key: "net", label: "Net", type: "number", width: "100px" },
  { key: "comment", label: "Notes", type: "text" },
];

export default function SalaryPage() {
  const [salary, setSalary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(() => {
    setLoading(true);
    api.getSalary()
      .then(setSalary)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  if (loading) return <p className="text-content-muted text-sm p-6">Loading salary data...</p>;
  if (error) return <p className="text-red-400 text-sm p-6">Could not load: {error}</p>;

  const latest = [...salary].reverse().find((s) => s.net > 0);
  const latestNormal = [...salary].reverse().find((s) => s.net > 0 && !s.bonus && !s.overtime);
  const totalNet = salary.reduce((s, r) => s + r.net, 0);
  const totalBonus = salary.reduce((s, r) => s + r.bonus, 0);

  // Chart data
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
      <h2 className="text-lg font-semibold text-content">Salary History</h2>

      {/* KPIs */}
      <div className="grid grid-cols-4 gap-4">
        <SKpi label="Current Gross / mo" value={fmt(latest?.gross)}
          sub={`~${fmt(latestNormal?.net)} net / mo`} color="text-accent" />
        <SKpi label="Current Company" value={latest?.company ?? "—"}
          sub={`${JURISDICTION_LABELS[latest?.jurisdiction] ?? ""} ${latest?.jurisdiction ?? ""}`} color="text-accent" />
        <SKpi label="Total Net Earned" value={fmt(Math.round(totalNet))}
          sub="since Aug 2019" color="text-content" />
        <SKpi label="Total Bonuses" value={fmt(Math.round(totalBonus))}
          sub="across all jobs" color="text-yellow-400" />
      </div>

      {/* Bar chart */}
      <div className="bg-surface rounded-xl p-4">
        <h3 className="text-sm font-semibold text-content mb-1">Gross Pay Breakdown per Month</h3>
        <p className="text-xs text-content-muted mb-4">Stacked by component</p>
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

        <div className="flex gap-4 mt-3 justify-center flex-wrap">
          {[["Base","#4361ee"],["Overtime","#ffd166"],["Bonus","#f72585"],["Extras","#06d6a0"]].map(([label, color]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm" style={{ background: color }} />
              <span className="text-xs text-content-muted">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Editable salary table */}
      <EditableTable
        title="Salary Records"
        columns={SALARY_COLUMNS}
        data={salary}
        defaultSort={{ key: "date", dir: "desc" }}
        exportEntity="salary"
        defaultNew={{
          date: new Date().toISOString().slice(0, 10),
          company: latest?.company ?? "",
          jurisdiction: latest?.jurisdiction ?? "",
          gross: 0, overtime: 0, extras: 0, bonus: 0, net: 0, comment: "",
        }}
        onSave={async (id, data) => { await api.updateSalary(id, data); reload(); }}
        onCreate={async (data) => { const r = await api.createSalary(data); reload(); return r; }}
        onDelete={async (id) => { await api.deleteSalary(id); reload(); }}
      />
    </div>
  );
}

function SKpi({ label, value, sub, color }) {
  return (
    <div className="bg-surface rounded-xl p-4">
      <p className="text-xs text-content-muted uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
      {sub && <p className="text-xs text-content-muted mt-1">{sub}</p>}
    </div>
  );
}

function SalaryTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const total = (d?.base ?? 0) + (d?.overtime ?? 0) + (d?.bonus ?? 0) + (d?.extras ?? 0);
  return (
    <div className="bg-base border border-line rounded-lg p-3 text-xs space-y-1">
      <p className="text-content-secondary font-semibold">{label}</p>
      <p className="font-semibold" style={{ color: COMPANY_COLORS[d?.company] ?? "#9ca3af" }}>{d?.company}</p>
      <div className="border-t border-line pt-1 mt-1 space-y-0.5">
        <p className="text-blue-400">Base: {fmt(d?.base)}</p>
        {d?.overtime > 0 && <p className="text-yellow-400">Overtime: +{fmt(d.overtime)}</p>}
        {d?.bonus > 0 && <p className="text-pink-400">Bonus: +{fmt(d.bonus)}</p>}
        {d?.extras > 0 && <p className="text-accent">Extras: +{fmt(d.extras)}</p>}
        <p className="text-content-secondary font-semibold border-t border-line pt-1">Total gross: {fmt(total)}</p>
        <p className="text-content-muted">Net: ~{fmt(d?.net)}</p>
      </div>
    </div>
  );
}
