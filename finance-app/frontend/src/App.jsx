import { useEffect, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import TransactionsPage from "./pages/TransactionsPage";
import AlertsPage from "./pages/AlertsPage";
import BudgetsPage from "./pages/BudgetsPage";
import WealthPage from "./pages/WealthPage";
import SalaryPage from "./pages/SalaryPage";
import AnalystPage from "./pages/AnalystPage";
import StockAnalysisPage from "./pages/StockAnalysisPage";
import CategorizePage from "./pages/CategorizePage";
import DropZone from "./components/DropZone";
import { api } from "./api";

const NAV = [
  { to: "/", label: "Dashboard", icon: "dashboard" },
  { to: "/analyst", label: "Analyst", icon: "analyst" },
  { to: "/analysis", label: "Analysis", icon: "analysis" },
  { to: "/wealth", label: "Wealth", icon: "wealth" },
  { to: "/salary", label: "Salary", icon: "salary" },
  { to: "/transactions", label: "Transactions", icon: "transactions" },
  { to: "/budgets", label: "Budgets", icon: "budgets" },
  { to: "/alerts", label: "Alerts", icon: "alerts" },
  { to: "/categorize", label: "Categorize", icon: "categorize" },
];

// Minimal inline stroke icons (18px, currentColor) — no icon-font dependency
const ICON_PATHS = {
  dashboard: "M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 14h7v7H3z",
  analyst: "M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4zM18 16v4M16 18h4",
  analysis: "M3 3v18h18M7 14l3-3 3 2 5-6",
  wealth: "M3 7h18v12H3zM3 7l3-4h12l3 4M16 13h.01",
  salary: "M3 6h18v12H3zM12 9a3 3 0 100 6 3 3 0 000-6M6 9v.01M18 15v.01",
  transactions: "M7 7h13M7 7l3-3M7 7l3 3M17 17H4M17 17l-3-3M17 17l-3 3",
  budgets: "M12 3a9 9 0 109 9h-9z M12 3v9h9",
  alerts: "M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0",
  categorize: "M7 7h.01M3 5l8-2 10 10-8 8L3 13z",
};

function Icon({ name, className = "" }) {
  const d = ICON_PATHS[name];
  if (!d) return null;
  return (
    <svg
      className={className}
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

const MoonIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />
  </svg>
);

function useTheme() {
  const [theme, setTheme] = useState(() =>
    typeof document !== "undefined" && document.documentElement.classList.contains("light")
      ? "light"
      : "dark"
  );
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    try {
      localStorage.setItem("theme", theme);
    } catch (e) {
      /* ignore */
    }
  }, [theme]);
  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}

function ThemeToggle({ theme, onToggle }) {
  return (
    <button
      onClick={onToggle}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="flex items-center justify-center w-8 h-8 rounded-md border border-line text-content-secondary hover:text-content hover:bg-surface-hover transition-colors"
      aria-label="Toggle theme"
    >
      {theme === "dark" ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
      <span className="font-semibold text-[15px] tracking-tight text-content">Finance</span>
    </div>
  );
}

function NavBadge({ count }) {
  if (!count) return null;
  return (
    <span className="ml-auto text-[10px] font-semibold font-mono bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">
      {count}
    </span>
  );
}

export default function App() {
  const [miscCount, setMiscCount] = useState(0);
  const [theme, toggleTheme] = useTheme();

  useEffect(() => {
    api.getUncategorizedCount().then((r) => setMiscCount(r.count)).catch(() => {});
  }, []);

  return (
    <BrowserRouter>
      <div className="min-h-screen md:flex">
        {/* ── Desktop sidebar ── */}
        <aside className="hidden md:flex md:flex-col md:w-[220px] md:fixed md:inset-y-0 bg-surface border-r border-line">
          <div className="px-5 h-16 flex items-center border-b border-line">
            <Brand />
          </div>
          <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
            {NAV.map(({ to, label, icon }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
                    isActive
                      ? "bg-surface-hover text-content border-l-2 border-accent pl-[10px]"
                      : "text-content-secondary hover:text-content hover:bg-surface-hover"
                  }`
                }
              >
                <Icon name={icon} className="shrink-0" />
                <span>{label}</span>
                {to === "/categorize" && <NavBadge count={miscCount} />}
              </NavLink>
            ))}
          </nav>
          <div className="px-5 py-4 border-t border-line space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-content-muted">Theme</span>
              <ThemeToggle theme={theme} onToggle={toggleTheme} />
            </div>
            <div className="flex items-center gap-3 text-content-muted">
              <a href="https://faddyjeros.github.io" target="_blank" rel="noopener noreferrer" className="hover:text-content transition-colors text-xs" title="Portfolio">Portfolio</a>
              <a href="https://github.com/faddyjeros" target="_blank" rel="noopener noreferrer" className="hover:text-content transition-colors text-xs" title="GitHub">GitHub</a>
              <a href="https://www.linkedin.com/in/jergros/" target="_blank" rel="noopener noreferrer" className="hover:text-content transition-colors text-xs" title="LinkedIn">LinkedIn</a>
            </div>
          </div>
        </aside>

        {/* ── Mobile top bar + swipeable tabs ── */}
        <div className="md:hidden sticky top-0 z-20 bg-surface border-b border-line">
          <div className="h-14 px-4 flex items-center justify-between">
            <Brand />
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
          </div>
          <nav className="flex gap-1 px-2 overflow-x-auto no-scrollbar border-t border-line">
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  `shrink-0 px-3 py-2.5 text-[13px] font-medium whitespace-nowrap border-b-2 transition-colors ${
                    isActive
                      ? "text-content border-accent"
                      : "text-content-secondary border-transparent hover:text-content"
                  }`
                }
              >
                {label}
                {to === "/categorize" && miscCount > 0 && (
                  <span className="ml-1.5 text-[10px] font-mono bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">
                    {miscCount}
                  </span>
                )}
              </NavLink>
            ))}
          </nav>
        </div>

        {/* ── Main content ── */}
        <main className="flex-1 md:ml-[220px] min-w-0">
          <div className="border-b border-line bg-surface px-4 md:px-10 py-2.5">
            <DropZone />
          </div>
          <div className="px-4 md:px-10 py-5 md:py-8 max-w-[1100px] mx-auto w-full">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/analyst" element={<AnalystPage />} />
              <Route path="/analysis" element={<StockAnalysisPage />} />
              <Route path="/transactions" element={<TransactionsPage />} />
              <Route path="/wealth" element={<WealthPage />} />
              <Route path="/salary" element={<SalaryPage />} />
              <Route path="/alerts" element={<AlertsPage />} />
              <Route path="/budgets" element={<BudgetsPage />} />
              <Route path="/categorize" element={<CategorizePage />} />
            </Routes>
          </div>
        </main>
      </div>
    </BrowserRouter>
  );
}
