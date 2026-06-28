import { ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { CHART_ACCENT, useChartTheme } from "../chartTheme";

// Emerald-anchored categorical palette, consistent with the rest of the app.
const CHART_COLORS = ["#10b981", "#0ea5e9", "#f59e0b", "#f43f5e", "#8b5cf6", "#a1a1aa"];

function InlineChart({ config }) {
  const theme = useChartTheme();
  const { type, data, xKey, yKey, title } = config;
  if (!data || !Array.isArray(data) || data.length === 0) return null;

  return (
    <div className="my-3 bg-base rounded-lg p-3">
      {title && <div className="text-xs text-content-secondary mb-2">{title}</div>}
      <ResponsiveContainer width="100%" height={160}>
        {type === "line" ? (
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
            <XAxis dataKey={xKey} tick={{ fill: theme.axis, fontSize: 10 }} />
            <YAxis tick={{ fill: theme.axis, fontSize: 10 }} />
            <Tooltip contentStyle={theme.tooltip} itemStyle={{ color: theme.text }} />
            <Line type="monotone" dataKey={yKey} stroke={CHART_ACCENT} strokeWidth={2} dot={false} />
          </LineChart>
        ) : type === "bar" ? (
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} />
            <XAxis dataKey={xKey} tick={{ fill: theme.axis, fontSize: 10 }} />
            <YAxis tick={{ fill: theme.axis, fontSize: 10 }} />
            <Tooltip contentStyle={theme.tooltip} itemStyle={{ color: theme.text }} />
            <Bar dataKey={yKey} fill={CHART_ACCENT} radius={[4, 4, 0, 0]} />
          </BarChart>
        ) : type === "pie" ? (
          <PieChart>
            <Pie data={data} dataKey={yKey || "value"} nameKey={xKey || "name"} cx="50%" cy="50%" outerRadius={60}>
              {data.map((_, i) => (
                <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        ) : null}
      </ResponsiveContainer>
    </div>
  );
}

function renderContent(text) {
  const parts = [];
  const chartRegex = /```chart\s*\n([\s\S]*?)\n```/g;
  let lastIndex = 0;
  let match;

  while ((match = chartRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: "text", content: text.slice(lastIndex, match.index) });
    }
    try {
      const config = JSON.parse(match[1]);
      parts.push({ type: "chart", config });
    } catch {
      parts.push({ type: "text", content: match[0] });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push({ type: "text", content: text.slice(lastIndex) });
  }

  return parts.map((part, i) => {
    if (part.type === "chart") {
      return <InlineChart key={i} config={part.config} />;
    }
    return <MarkdownText key={i} text={part.content} />;
  });
}

function MarkdownText({ text }) {
  const lines = text.split("\n");
  const elements = [];
  let tableLines = [];
  let inTable = false;

  const flushTable = () => {
    if (tableLines.length < 2) {
      elements.push(...tableLines.map((l, i) => <p key={`t${elements.length}-${i}`} className="whitespace-pre-wrap">{l}</p>));
    } else {
      const headers = tableLines[0].split("|").filter(Boolean).map((h) => h.trim());
      const rows = tableLines.slice(2).map((r) => r.split("|").filter(Boolean).map((c) => c.trim()));
      elements.push(
        <div key={`table-${elements.length}`} className="overflow-x-auto my-2">
          <table className="w-full text-xs">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th key={i} className="text-left pb-1 text-content-secondary font-medium px-2">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, ri) => (
                <tr key={ri} className="border-t border-line">
                  {row.map((cell, ci) => (
                    <td key={ci} className="py-1 px-2 text-content-secondary">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    tableLines = [];
    inTable = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.includes("|") && !line.startsWith("```")) {
      if (!inTable) inTable = true;
      tableLines.push(line);
      continue;
    }

    if (inTable) flushTable();

    if (line.startsWith("### ")) {
      elements.push(<h4 key={i} className="font-semibold text-content mt-2">{line.slice(4)}</h4>);
    } else if (line.startsWith("## ")) {
      elements.push(<h3 key={i} className="font-bold text-content mt-2">{line.slice(3)}</h3>);
    } else if (line.startsWith("# ")) {
      elements.push(<h2 key={i} className="font-bold text-zinc-50 mt-2 text-base">{line.slice(2)}</h2>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(<li key={i} className="ml-4 list-disc text-content-secondary">{formatInline(line.slice(2))}</li>);
    } else if (/^\d+\.\s/.test(line)) {
      elements.push(<li key={i} className="ml-4 list-decimal text-content-secondary">{formatInline(line.replace(/^\d+\.\s/, ""))}</li>);
    } else if (line.trim() === "") {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="text-content-secondary whitespace-pre-wrap">{formatInline(line)}</p>);
    }
  }

  if (inTable) flushTable();

  return <>{elements}</>;
}

function formatInline(text) {
  const parts = text.split(/(\*\*[^*]+\*\*|\`[^`]+\`)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-content font-semibold">{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={i} className="bg-surface-hover px-1 rounded text-accent text-xs">{part.slice(1, -1)}</code>;
    }
    return part;
  });
}

export default function ChatMessage({ message }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
          isUser
            ? "bg-accent/20 text-accent border border-accent/30"
            : "bg-base text-content"
        }`}
      >
        {isUser ? (
          <p>{message.content}</p>
        ) : (
          <div className="space-y-1">{renderContent(message.content)}</div>
        )}
      </div>
    </div>
  );
}
