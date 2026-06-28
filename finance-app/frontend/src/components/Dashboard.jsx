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
import { CATEGORY_COLORS, CHART_ACCENT, CHART_NEGATIVE, useChartTheme } from "../chartTheme";

export { CATEGORY_COLORS };

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
  const theme = useChartTheme();
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
        <Tooltip formatter={(v, name) => [fmt(v), name]} contentStyle={theme.tooltip} itemStyle={{ color: theme.text }} />
      </PieChart>
    </ResponsiveContainer>
  );
}

const STACK_CATS = ["Fixed Costs", "Groceries & Dining", "Travel", "Fun Money", "Savings", "Miscellaneous"];

export function MonthlyTrend({ data, incomeTarget, expenseTarget, showAverage }) {
  const theme = useChartTheme();
  if (!data?.length) return <Empty />;

  const avgSpend = showAverage && data.length > 1
    ? Math.round(data.reduce((s, d) => s + (d.expenses || 0), 0) / data.length)
    : null;

  // Show short month name (e.g. "Jan") from a "YYYY-MM" key
  const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const display = data.map((d) => ({ ...d, label: MONTH_NAMES[Number(d.month.slice(5)) - 1] ?? d.month.slice(5) }));

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={display} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
        <XAxis dataKey="label" tick={{ fill: theme.axis, fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: theme.axis, fontSize: 11 }} tickFormatter={fmt} axisLine={false} tickLine={false} width={52} />
        <Tooltip
          formatter={(v, name) => [fmt(v), name]}
          contentStyle={theme.tooltip}
          itemStyle={{ color: theme.text }}
          cursor={{ fill: "rgba(127,127,127,0.08)" }}
        />
        <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
        {STACK_CATS.map((cat) => (
          <Bar key={cat} dataKey={cat} stackId="spend" fill={CATEGORY_COLORS[cat]} name={SHORT[cat] ?? cat} radius={[0,0,0,0]} maxBarSize={28} />
        ))}
        {incomeTarget > 0 && (
          <ReferenceLine y={incomeTarget} stroke={CHART_ACCENT} strokeDasharray="6 3" strokeOpacity={0.5}
            label={{ value: `Target`, fill: CHART_ACCENT, fontSize: 9, position: "insideTopRight" }} />
        )}
        {expenseTarget > 0 && (
          <ReferenceLine y={expenseTarget} stroke={CHART_NEGATIVE} strokeDasharray="6 3" strokeOpacity={0.4}
            label={{ value: `Budget`, fill: CHART_NEGATIVE, fontSize: 9, position: "insideBottomRight" }} />
        )}
        {avgSpend && (
          <ReferenceLine y={avgSpend} stroke={theme.axis} strokeDasharray="4 4" strokeOpacity={0.6}
            label={{ value: `Avg ${fmt(avgSpend)}`, fill: theme.axis, fontSize: 10, position: "insideTopLeft" }} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function SpendingByBank({ data }) {
  const theme = useChartTheme();
  const entries = Object.entries(data || {}).map(([name, value]) => ({ name, value }));
  if (!entries.length) return <Empty />;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <BarChart data={entries} layout="vertical" margin={{ left: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} horizontal={false} />
        <XAxis type="number" tick={{ fill: theme.axis, fontSize: 11 }} tickFormatter={fmt} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="name" tick={{ fill: theme.axis, fontSize: 12 }} width={90} axisLine={false} tickLine={false} />
        <Tooltip formatter={(v) => fmt(v)} contentStyle={theme.tooltip} itemStyle={{ color: theme.text }} cursor={{ fill: "rgba(127,127,127,0.08)" }} />
        <Bar dataKey="value" fill={CHART_ACCENT} name="Spent" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Empty() {
  return <p className="text-content-muted text-sm text-center py-6">No data</p>;
}
