import { useRef, useState } from "react";
import { api } from "../api";
import ChatMessage from "../components/ChatMessage";

const EXAMPLE_TICKERS = ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "TSLA", "META"];

export default function StockAnalysisPage() {
  const [ticker, setTicker] = useState("");
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [dataStatus, setDataStatus] = useState(null);
  const scrollRef = useRef(null);

  const runAnalysis = async (inputTicker) => {
    const t = (inputTicker || ticker).trim().toUpperCase();
    if (!t || loading) return;

    setTicker(t);
    setReport("");
    setError(null);
    setLoading(true);
    setDataStatus("Fetching financial data...");

    try {
      const response = await api.streamStockAnalysis(t);
      if (!response.ok) {
        const err = await response.text();
        setError(err);
        setLoading(false);
        setDataStatus(null);
        return;
      }

      setDataStatus("Analyzing...");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const event = JSON.parse(data);
            if (event.type === "text") {
              fullText += event.content;
              setReport(fullText);
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
            } else if (event.type === "done") {
              break;
            }
          } catch {
            // ignore
          }
        }
      }
    } catch (e) {
      setError(`Connection error: ${e.message}`);
    } finally {
      setLoading(false);
      setDataStatus(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-zinc-50">Fundamental Analysis</h1>
        <p className="text-zinc-400 text-sm mt-1">
          Enter a ticker symbol for a comprehensive financial analysis using live market data, financial statements, and SEC filings.
        </p>
      </div>

      {/* Input */}
      <div className="bg-zinc-800 rounded-xl p-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            runAnalysis();
          }}
          className="flex gap-3"
        >
          <input
            type="text"
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            placeholder="Enter ticker (e.g., AAPL, MSFT, NVDA)"
            disabled={loading}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-4 py-3 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 disabled:opacity-50 text-lg font-mono"
          />
          <button
            type="submit"
            disabled={loading || !ticker.trim()}
            className="bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-600 text-zinc-900 font-semibold px-6 py-3 rounded-lg transition-colors"
          >
            {loading ? "Analyzing..." : "Run Analysis"}
          </button>
        </form>

        {/* Quick picks */}
        <div className="flex flex-wrap gap-2 mt-3">
          {EXAMPLE_TICKERS.map((t) => (
            <button
              key={t}
              onClick={() => {
                setTicker(t);
                runAnalysis(t);
              }}
              disabled={loading}
              className="text-xs bg-zinc-700/50 hover:bg-zinc-700 disabled:opacity-50 text-zinc-300 rounded-md px-2.5 py-1.5 font-mono transition-colors"
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Status */}
      {loading && dataStatus && (
        <div className="flex items-center gap-3 text-amber-400 text-sm">
          <span className="animate-pulse">●</span>
          <span>{dataStatus}</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-4 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* Report */}
      {report && (
        <div ref={scrollRef} className="bg-zinc-800 rounded-xl p-6 overflow-y-auto max-h-[calc(100vh-320px)]">
          <ChatMessage message={{ role: "assistant", content: report }} />
        </div>
      )}
    </div>
  );
}
