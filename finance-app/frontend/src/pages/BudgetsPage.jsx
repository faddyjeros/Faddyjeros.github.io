import { useEffect, useState } from "react";
import { api } from "../api";

export default function BudgetsPage() {
  const [budgets, setBudgets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    name: "",
    budget_amount: "",
    currency: "EUR",
    start_date: "",
    end_date: "",
    category_filter: [],
    description: "",
  });
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    api.getBudgets().then(setBudgets).catch(() => {});
    api.getCategories().then(setCategories).catch(() => {});
  }, []);

  async function createBudget() {
    const payload = {
      ...form,
      budget_amount: parseFloat(form.budget_amount),
      category_filter: form.category_filter.length
        ? JSON.stringify(form.category_filter)
        : null,
      end_date: form.end_date || null,
    };
    const created = await api.createBudget(payload);
    setBudgets((b) => [created, ...b]);
    setShowForm(false);
    setForm({ name: "", budget_amount: "", currency: "EUR", start_date: "", end_date: "", category_filter: [], description: "" });
  }

  async function deleteBudget(id) {
    await api.deleteBudget(id);
    setBudgets((b) => b.filter((e) => e.id !== id));
  }

  function toggleCategory(cat) {
    setForm((f) => ({
      ...f,
      category_filter: f.category_filter.includes(cat)
        ? f.category_filter.filter((c) => c !== cat)
        : [...f.category_filter, cat],
    }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-lg">Budget Envelopes</h2>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="text-sm px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 transition-colors"
        >
          {showForm ? "Cancel" : "+ New envelope"}
        </button>
      </div>

      {showForm && (
        <div className="bg-zinc-800 rounded-xl p-5 space-y-4">
          <h3 className="font-semibold text-zinc-100">New budget envelope</h3>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Name (e.g. Rome Trip May)">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} />
            </Field>
            <Field label="Budget amount">
              <div className="flex gap-2">
                <input type="number" value={form.budget_amount} onChange={(e) => setForm({ ...form, budget_amount: e.target.value })} className={input} />
                <select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })} className={`${input} w-20`}>
                  <option>EUR</option>
                  <option>CHF</option>
                </select>
              </div>
            </Field>
            <Field label="Start date">
              <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className={input} />
            </Field>
            <Field label="End date (optional)">
              <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className={input} />
            </Field>
          </div>
          <Field label="Track these categories (leave empty for all)">
            <div className="flex flex-wrap gap-2 mt-1">
              {categories.map((c) => (
                <button
                  key={c}
                  onClick={() => toggleCategory(c)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    form.category_filter.includes(c)
                      ? "border-amber-500 bg-amber-600/30 text-amber-400"
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Description (optional)">
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={input} />
          </Field>
          <button
            onClick={createBudget}
            disabled={!form.name || !form.budget_amount || !form.start_date}
            className="text-sm px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:opacity-40 transition-colors"
          >
            Create envelope
          </button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {budgets.map((env) => {
          const pct = Math.min(100, (env.spent / env.budget_amount) * 100);
          const over = env.spent > env.budget_amount;
          return (
            <div key={env.id} className="bg-zinc-800 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-zinc-100">{env.name}</p>
                  {env.description && <p className="text-xs text-zinc-500">{env.description}</p>}
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {env.start_date}{env.end_date ? ` → ${env.end_date}` : ""}
                  </p>
                </div>
                <button
                  onClick={() => deleteBudget(env.id)}
                  className="text-zinc-500 hover:text-red-400 text-lg leading-none transition-colors"
                >
                  ×
                </button>
              </div>

              <div className="flex justify-between text-sm mb-1.5">
                <span className={over ? "text-red-400 font-semibold" : "text-zinc-300"}>
                  {env.spent.toFixed(0)} {env.currency} spent
                </span>
                <span className="text-zinc-500">
                  / {env.budget_amount.toFixed(0)} {env.currency}
                </span>
              </div>

              <div className="h-2 bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${over ? "bg-red-500" : "bg-amber-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>

              <p className="text-xs text-zinc-500 mt-1.5">
                {over
                  ? `Over budget by ${(env.spent - env.budget_amount).toFixed(0)} ${env.currency}`
                  : `${(env.budget_amount - env.spent).toFixed(0)} ${env.currency} remaining`}
              </p>
            </div>
          );
        })}
      </div>

      {budgets.length === 0 && !showForm && (
        <p className="text-zinc-500 text-sm">No envelopes yet. Create one for a trip or monthly goal.</p>
      )}
    </div>
  );
}

const input = "w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm focus:border-amber-500 focus:outline-none";

function Field({ label, children }) {
  return (
    <div>
      <label className="text-xs text-zinc-400 block mb-1">{label}</label>
      {children}
    </div>
  );
}
