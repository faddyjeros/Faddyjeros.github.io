import { useEffect, useState } from "react";
import { api } from "../api";
import TransactionTable from "../components/TransactionTable";

export default function AlertsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [alerts, setAlerts] = useState(null);
  const [categories, setCategories] = useState([]);

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {});
  }, []);

  useEffect(() => {
    api.getAlerts(year).then(setAlerts).catch(() => setAlerts(null));
  }, [year]);

  function refresh() {
    api.getAlerts(year).then(setAlerts);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="font-semibold text-lg">Alerts</h2>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm"
        >
          {[currentYear, currentYear - 1, currentYear - 2].map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {/* Transaction gaps */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <h3 className="font-semibold text-gray-200 mb-3">
          Transaction Gaps
          {alerts?.gaps.length > 0 && (
            <span className="ml-2 text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded-full">
              {alerts.gaps.length}
            </span>
          )}
        </h3>
        {!alerts ? (
          <p className="text-sm text-gray-500">Loading...</p>
        ) : alerts.gaps.length === 0 ? (
          <p className="text-sm text-green-400">No suspicious gaps found.</p>
        ) : (
          <ul className="space-y-2">
            {alerts.gaps.map((g, i) => (
              <li key={i} className="flex items-center gap-3 text-sm">
                <span className="text-yellow-400">⚠</span>
                <span className="text-gray-300">
                  {g.start} → {g.end}
                </span>
                <span className="text-gray-500">{g.days} days with no transactions</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Cash / pending annotation queue */}
      <div className="bg-gray-900 rounded-xl border border-gray-800 p-4">
        <h3 className="font-semibold text-gray-200 mb-3">
          Pending Annotations — Cash & Withdrawals
          {alerts?.pending_annotations.length > 0 && (
            <span className="ml-2 text-xs bg-orange-900 text-orange-300 px-2 py-0.5 rounded-full">
              {alerts.pending_annotations.length}
            </span>
          )}
        </h3>
        <p className="text-xs text-gray-500 mb-3">
          Click a row to add a note and clear the warning flag.
        </p>
        {alerts?.pending_annotations.length > 0 ? (
          <TransactionTable
            transactions={alerts.pending_annotations}
            categories={categories}
            onUpdated={refresh}
          />
        ) : (
          <p className="text-sm text-green-400">No transactions awaiting annotation.</p>
        )}
      </div>
    </div>
  );
}
