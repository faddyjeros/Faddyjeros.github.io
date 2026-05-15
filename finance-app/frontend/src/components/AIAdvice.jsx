import { useState } from "react";
import { api } from "../api";

export default function AIAdvice({ year, month }) {
  const [state, setState] = useState("idle");
  const [advice, setAdvice] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    setState("loading");
    setError(null);
    try {
      const data = await api.getAdvice(year, month);
      setAdvice(data.advice);
      setState("done");
    } catch (e) {
      setError(e.message);
      setState("error");
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-200">AI Spending Advice</h3>
        <button
          onClick={load}
          disabled={state === "loading"}
          className="text-xs px-3 py-1.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:opacity-50 transition-colors"
        >
          {state === "loading" ? "Analyzing..." : "Analyze month"}
        </button>
      </div>

      {state === "idle" && (
        <p className="text-sm text-gray-500">
          Click to get personalized advice based on this month's spending.
        </p>
      )}

      {state === "error" && (
        <p className="text-sm text-red-400">{error}</p>
      )}

      {state === "done" && advice && (
        <div className="text-sm text-gray-300 whitespace-pre-line leading-relaxed">
          {advice}
        </div>
      )}
    </div>
  );
}
