import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import DashboardPage from "./pages/DashboardPage";
import TransactionsPage from "./pages/TransactionsPage";
import AlertsPage from "./pages/AlertsPage";
import BudgetsPage from "./pages/BudgetsPage";
import WealthPage from "./pages/WealthPage";
import SalaryPage from "./pages/SalaryPage";
import AnalystPage from "./pages/AnalystPage";
import StockAnalysisPage from "./pages/StockAnalysisPage";
import DropZone from "./components/DropZone";

const NAV = [
  { to: "/analyst", label: "Analyst" },
  { to: "/analysis", label: "Analysis" },
  { to: "/", label: "Dashboard" },
  { to: "/transactions", label: "Transactions" },
  { to: "/wealth", label: "Wealth" },
  { to: "/salary", label: "Salary" },
  { to: "/alerts", label: "Alerts" },
  { to: "/budgets", label: "Budgets" },
];

export default function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen flex flex-col">
        <header className="bg-zinc-900 border-b border-zinc-800 px-6 py-3 flex items-center justify-between">
          <span className="font-bold text-lg text-amber-500 tracking-tight">Finance Tracker</span>
          <nav className="flex gap-6 text-sm items-center">
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === "/"}
                className={({ isActive }) =>
                  isActive
                    ? "text-amber-400 font-semibold"
                    : "text-zinc-400 hover:text-zinc-100 transition-colors"
                }
              >
                {label}
              </NavLink>
            ))}
            <span className="text-zinc-700">|</span>
            <a href="https://faddyjeros.github.io" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-100 transition-colors" title="Portfolio">
              🌐
            </a>
            <a href="https://github.com/faddyjeros" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-100 transition-colors" title="GitHub">
              ⌥
            </a>
            <a href="https://www.linkedin.com/in/jergros/" target="_blank" rel="noopener noreferrer" className="text-zinc-400 hover:text-zinc-100 transition-colors" title="LinkedIn">
              in
            </a>
          </nav>
        </header>

        <div className="bg-zinc-900 border-b border-zinc-800 px-6 py-2">
          <DropZone />
        </div>

        <main className="flex-1 px-6 py-6 max-w-7xl mx-auto w-full">
          <Routes>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/analyst" element={<AnalystPage />} />
            <Route path="/analysis" element={<StockAnalysisPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/wealth" element={<WealthPage />} />
            <Route path="/salary" element={<SalaryPage />} />
            <Route path="/alerts" element={<AlertsPage />} />
            <Route path="/budgets" element={<BudgetsPage />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}
