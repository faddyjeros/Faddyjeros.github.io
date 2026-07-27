import { useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { api } from "../api";
import { CHART_ACCENT, useChartTheme } from "../chartTheme";

const eur = (v) =>
  v == null || !isFinite(v)
    ? "—"
    : new Intl.NumberFormat("fr-CH", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v);
const eurK = (v) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : `${Math.round(v)}`);

const FAT_COLOR = "#8b5cf6"; // violet
const COAST_COLOR = "#0ea5e9"; // sky

// Persist the assumptions so the planner remembers your last scenario.
const STORE_KEY = "fire-planner-v1";
const DEFAULTS = {
  startNW: 195000,
  monthly: 3000,
  ret: 7,
  inflation: 2,
  annualSpend: 40000,
  withdrawal: 4,
  currentAge: 30,
  coastAge: 60,
  fatMultiple: 2,
};

function loadStored() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export default function PlannerPage() {
  const theme = useChartTheme();
  const [s, setS] = useState(loadStored);
  const [nwLoaded, setNwLoaded] = useState(false);

  // Prefill starting net worth from the latest snapshot (once, unless user edited).
  useEffect(() => {
    api.getNetWorth()
      .then((rows) => {
        if (rows?.length && !localStorage.getItem(STORE_KEY)) {
          const latest = rows[rows.length - 1].value;
          setS((prev) => ({ ...prev, startNW: Math.round(latest) }));
        }
      })
      .catch(() => {})
      .finally(() => setNwLoaded(true));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  }, [s]);

  const set = (k) => (e) => {
    const raw = e.target.value;
    setS((prev) => ({ ...prev, [k]: raw === "" ? "" : Number(raw) }));
  };

  const model = useMemo(() => {
    const n = (v, d = 0) => (typeof v === "number" && isFinite(v) ? v : d);
    const startNW = n(s.startNW);
    const annualContrib = n(s.monthly) * 12;
    const realReturn = (1 + n(s.ret) / 100) / (1 + n(s.inflation) / 100) - 1;
    const multiple = n(s.withdrawal) > 0 ? 100 / n(s.withdrawal) : 25;
    const fireNumber = n(s.annualSpend) * multiple;
    const fatNumber = fireNumber * n(s.fatMultiple, 2);
    const currentAge = n(s.currentAge, 30);
    const coastAge = Math.max(currentAge + 1, n(s.coastAge, 60));

    // Project net worth in today's money (real return) year by year.
    const data = [];
    let nw = startNW;
    let fireAge = null;
    let fatAge = null;
    const endAge = Math.min(currentAge + 60, 95);
    for (let age = currentAge; age <= endAge; age++) {
      if (age > currentAge) nw = nw * (1 + realReturn) + annualContrib;
      data.push({ age, value: Math.round(nw) });
      if (fireAge === null && nw >= fireNumber) fireAge = age;
      if (fatAge === null && nw >= fatNumber) fatAge = age;
      // Stop a few years after FatFIRE to keep the chart focused.
      if (fatAge !== null && age >= fatAge + 3) break;
    }

    // CoastFIRE: amount needed today so that, with NO further contributions,
    // it compounds to the FIRE number by the coast age.
    const yearsToCoast = coastAge - currentAge;
    const coastNumber = fireNumber / Math.pow(1 + realReturn, yearsToCoast);
    const isCoasting = startNW >= coastNumber;

    return {
      realReturn, fireNumber, fatNumber, coastNumber, isCoasting,
      currentAge, coastAge, data,
      fireAge, fatAge,
      yearsToFire: fireAge != null ? fireAge - currentAge : null,
      yearsToFat: fatAge != null ? fatAge - currentAge : null,
      coastGap: Math.max(0, coastNumber - startNW),
    };
  }, [s]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-content">FIRE Planner</h2>
        <p className="text-sm text-content-muted mt-0.5">
          Project your path to financial independence. All figures in today's euros (inflation-adjusted).
        </p>
      </div>

      {/* Headline targets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="FIRE number"
          value={eur(model.fireNumber)}
          sub={model.yearsToFire != null ? `in ${model.yearsToFire} yrs · age ${model.fireAge}` : "not reached by 95"}
          accent
        />
        <Stat
          label="FatFIRE number"
          value={eur(model.fatNumber)}
          sub={model.yearsToFat != null ? `in ${model.yearsToFat} yrs · age ${model.fatAge}` : "not reached by 95"}
          color={FAT_COLOR}
        />
        <Stat
          label="CoastFIRE number"
          value={eur(model.coastNumber)}
          sub={`to coast from age ${model.currentAge} → ${model.coastAge}`}
          color={COAST_COLOR}
        />
        <Stat
          label="Coast status"
          value={model.isCoasting ? "On track" : "Not yet"}
          sub={model.isCoasting ? "you can stop contributing" : `${eur(model.coastGap)} to go`}
          color={model.isCoasting ? CHART_ACCENT : undefined}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Controls */}
        <div className="bg-surface border border-line rounded-xl p-4 space-y-4 lg:col-span-1">
          <h3 className="text-sm font-semibold text-content">Assumptions</h3>

          <NumField label="Starting net worth" value={s.startNW} onChange={set("startNW")} prefix="€" />
          <NumField label="Monthly contribution" value={s.monthly} onChange={set("monthly")} prefix="€" />
          <SliderField label="Expected return" value={s.ret} onChange={set("ret")} min={1} max={12} step={0.5} suffix="%" />
          <SliderField label="Inflation" value={s.inflation} onChange={set("inflation")} min={0} max={6} step={0.5} suffix="%" />
          <div className="text-xs text-content-muted -mt-2 font-mono">
            Real return ≈ {(model.realReturn * 100).toFixed(1)}%
          </div>
          <NumField label="Annual spending (retired)" value={s.annualSpend} onChange={set("annualSpend")} prefix="€" />
          <SliderField label="Withdrawal rate" value={s.withdrawal} onChange={set("withdrawal")} min={2.5} max={5} step={0.25} suffix="%" />
          <div className="text-xs text-content-muted -mt-2 font-mono">
            = {Math.round(100 / (s.withdrawal || 4))}× annual spending
          </div>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="Current age" value={s.currentAge} onChange={set("currentAge")} />
            <NumField label="Coast to age" value={s.coastAge} onChange={set("coastAge")} />
          </div>
          <NumField label="FatFIRE multiple" value={s.fatMultiple} onChange={set("fatMultiple")} suffix="×" />

          <button
            onClick={() => { localStorage.removeItem(STORE_KEY); setS({ ...DEFAULTS }); }}
            className="text-xs text-content-muted hover:text-content transition-colors"
          >
            Reset to defaults
          </button>
        </div>

        {/* Projection chart */}
        <div className="bg-surface border border-line rounded-xl p-4 lg:col-span-2">
          <div className="flex items-baseline justify-between mb-1">
            <h3 className="text-sm font-semibold text-content">Projected net worth</h3>
            <span className="text-xs text-content-muted font-mono">real terms</span>
          </div>
          <p className="text-xs text-content-muted mb-4">
            {model.yearsToFire != null
              ? `You reach FIRE at age ${model.fireAge} (${model.yearsToFire} years).`
              : "FIRE not reached within the projection — raise contributions or return."}
          </p>
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={model.data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="fireGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_ACCENT} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_ACCENT} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={theme.grid} vertical={false} />
              <XAxis
                dataKey="age"
                tick={{ fill: theme.axis, fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(a) => `${a}`}
              />
              <YAxis
                tick={{ fill: theme.axis, fontSize: 11 }}
                tickFormatter={eurK}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                contentStyle={theme.tooltip}
                itemStyle={{ color: theme.text }}
                labelFormatter={(a) => `Age ${a}`}
                formatter={(v) => [eur(v), "Net worth"]}
              />
              <Area type="monotone" dataKey="value" stroke={CHART_ACCENT} strokeWidth={2} fill="url(#fireGrad)" dot={false} />
              <ReferenceLine y={model.fireNumber} stroke={CHART_ACCENT} strokeDasharray="6 3" strokeOpacity={0.7}
                label={{ value: "FIRE", fill: CHART_ACCENT, fontSize: 10, position: "insideTopLeft" }} />
              <ReferenceLine y={model.fatNumber} stroke={FAT_COLOR} strokeDasharray="6 3" strokeOpacity={0.7}
                label={{ value: "FatFIRE", fill: FAT_COLOR, fontSize: 10, position: "insideTopLeft" }} />
              {model.fireAge != null && (
                <ReferenceLine x={model.fireAge} stroke={CHART_ACCENT} strokeDasharray="2 2" strokeOpacity={0.5} />
              )}
            </AreaChart>
          </ResponsiveContainer>
          <p className="text-[11px] text-content-muted mt-3">
            Projection compounds your starting net worth and contributions at the real return
            ({(model.realReturn * 100).toFixed(1)}%). FIRE number = annual spending ÷ withdrawal rate
            (the {Math.round(100 / (s.withdrawal || 4))}× rule). Estimates only — not financial advice.
          </p>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, accent, color }) {
  const valColor = accent ? "text-accent" : undefined;
  return (
    <div className="bg-surface border border-line rounded-xl p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-content-muted mb-1.5">{label}</div>
      <div className={`font-mono text-2xl font-semibold tracking-tight ${valColor || "text-content"}`} style={color ? { color } : undefined}>
        {value}
      </div>
      {sub && <div className="text-xs text-content-muted mt-1 font-mono">{sub}</div>}
    </div>
  );
}

function NumField({ label, value, onChange, prefix, suffix }) {
  return (
    <label className="block">
      <span className="text-xs text-content-secondary">{label}</span>
      <div className="mt-1 flex items-center gap-1.5 rounded-md border border-line bg-base px-2 focus-within:border-accent transition-colors">
        {prefix && <span className="text-content-muted text-sm">{prefix}</span>}
        <input
          type="number"
          value={value}
          onChange={onChange}
          className="w-full bg-transparent py-1.5 text-sm font-mono text-content outline-none"
        />
        {suffix && <span className="text-content-muted text-sm">{suffix}</span>}
      </div>
    </label>
  );
}

function SliderField({ label, value, onChange, min, max, step, suffix }) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-content-secondary">{label}</span>
        <span className="text-sm font-mono text-content">{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={onChange} className="w-full mt-1.5" />
    </label>
  );
}
