import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Legend,
} from "recharts";

export const CATEGORY_COLORS = {
  "Fixed Costs":       "#4361ee",
  "Groceries & Dining":"#06d6a0",
  "Travel":            "#ffd166",
  "Fun Money":         "#f72585",
  "Savings":           "#4cc9f0",
  "Miscellaneous":     "#6b7280",
};

const COLORS = Object.values(CATEGORY_COLORS);
const SHORT = {
  "Groceries & Dining": "Food",
  "Fun Money": "Fun",
  "Fixed Costs": "Fixed",
  "Miscellaneous": "Misc",
  "Internal Transfer": "Transfers",
};

const fmt = (v) => v?.toLocaleString("fr-CH", { maximumFractionDigits: 0 }) ?? "—";

export function SpendingByCategory({ data }) {
  const entries = Object.entries(data || {})
    .map(([name, value]) => ({ name, value }))
    .slice(0, 8);

  if (!entries.length) return <Empty />;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie
          data={entries}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={80}
          label={({ name, percent }) =>
            percent >= 0.06 ? `${SHORT[name] ?? name} ${(percent * 100).toFixed(0)}%` : ""
          }
          labelLine={({ percent }) => percent >= 0.06}
        >
          {entries.map((entry, i) => (
            <Cell key={i} fill={CATEGORY_COLORS[entry.name] ?? COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip formatter={(v, name) => [fmt(v), name]} contentStyle={{ background: "#111827", border: "1px solid #374151" }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

const STACK_CATS = ["Fixed Costs", "Groceries & Dining", "Travel", "Fun Money", "Savings", "Miscellaneous"];

export function MonthlyTrend({ data, incomeTarget, expenseTarget, showAverage }) {
  if (!data?.length) return <Empty />;

  const avgSpend = showAverage && data.length > 1
    ? Math.round(data.reduce((s, d) => s + (d.expenses || 0), 0) / data.length)
    : null;

  // Show short month label
  const display = data.map((d) => ({ ...d, label: d.month.slice(5) }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={display} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
        <XAxis dataKey="label" tick={{ fill: "#6b7280", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={fmt} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          formatter={(v, name) => [fmt(v), name]}
          contentStyle={{ background: "#111827", border: "1px solid #374151", borderRadius: 8 }}
          cursor={{ fill: "rgba(255,255,255,0.04)" }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        {STACK_CATS.map((cat) => (
          <Bar key={cat} dataKey={cat} stackId="spend" fill={CATEGORY_COLORS[cat]} name={SHORT[cat] ?? cat} radius={[0,0,0,0]} maxBarSize={28} />
        ))}
        {incomeTarget > 0 && (
          <ReferenceLine y={incomeTarget} stroke="#06d6a0" strokeDasharray="6 3" strokeOpacity={0.4}
            label={{ value: `Target`, fill: "#06d6a0", fontSize: 9, position: "insideTopRight" }} />
        )}
        {expenseTarget > 0 && (
          <ReferenceLine y={expenseTarget} stroke="#ef476f" strokeDasharray="6 3" strokeOpacity={0.4}
            label={{ value: `Budget`, fill: "#ef476f", fontSize: 9, position: "insideBottomRight" }} />
        )}
        {avgSpend && (
          <ReferenceLine y={avgSpend} stroke="#e5e7eb" strokeDasharray="4 4" strokeOpacity={0.5}
            label={{ value: `Avg ${fmt(avgSpend)}`, fill: "#9ca3af", fontSize: 10, position: "insideTopLeft" }} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SpendingByBank({ data }) {
  const entries = Object.entries(data || {}).map(([name, value]) => ({ name, value }));
  if (!entries.length) return <Empty />;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={entries} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
        <XAxis type="number" tick={{ fill: "#6b7280", fontSize: 11 }} tickFormatter={fmt} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fill: "#9ca3af", fontSize: 12 }} width={90} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => fmt(v)} contentStyle={{ background: "#111827", border: "1px solid #374151" }} />
        <Bar dataKey="value" fill="#4361ee" name="Spent" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Empty() {
  return <p className="text-content-muted text-sm text-center py-6">No data</p>;
}
