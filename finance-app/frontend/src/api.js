const BASE = "/api";

async function req(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
}

export const api = {
  // Ingest
  uploadFile: (file) => {
    const form = new FormData();
    form.append("file", file);
    return req("/ingest", { method: "POST", body: form });
  },

  // Transactions
  getTransactions: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "")
    );
    return req(`/transactions?${q}`);
  },
  patchTransaction: (id, data) =>
    req(`/transactions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  getCategories: () => req("/transactions/meta/categories"),
  getUncategorizedCount: () => req("/transactions/meta/uncategorized-count"),
  getBanks: () => req("/transactions/meta/banks"),
  remapCategory: (from_category, to_category) =>
    req(`/transactions/remap-category?${new URLSearchParams({ from_category, to_category })}`, {
      method: "PATCH",
    }),
  countByDescription: (description) =>
    req(`/transactions/meta/count-by-description?${new URLSearchParams({ description })}`),
  countByKeyword: (keyword) =>
    req(`/transactions/meta/count-by-keyword?${new URLSearchParams({ keyword })}`),
  bulkUpdateByDescription: (description, data) =>
    req(`/transactions/bulk-by-description?${new URLSearchParams({ description })}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  bulkUpdateByKeyword: (keyword, data) =>
    req(`/transactions/bulk-by-keyword?${new URLSearchParams({ keyword })}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),

  // Dashboard
  getSummary: (year, month) => {
    const q = new URLSearchParams({ year });
    if (month) q.set("month", month);
    return req(`/dashboard/summary?${q}`);
  },
  getYears: () => req("/dashboard/years"),

  // Alerts
  getAlerts: (year) => req(`/alerts?year=${year}`),

  // Budgets
  getBudgets: () => req("/budgets"),
  createBudget: (data) =>
    req("/budgets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }),
  deleteBudget: (id) => req(`/budgets/${id}`, { method: "DELETE" }),

  // AI
  getAdvice: (year, month) => req(`/ai/advice?year=${year}&month=${month}`),
  categorizeOthers: () => req("/ai/categorize-others", { method: "POST" }),
  getMonthlyConclusion: (year, month) =>
    req(`/ai/monthly-conclusion?year=${year}&month=${month}`, { method: "POST" }),

  // Wealth (SQL — full CRUD)
  getNetWorth: () => req("/wealth/networth"),
  createNetWorth: (data) => req("/wealth/networth", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  updateNetWorth: (id, data) => req(`/wealth/networth/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  deleteNetWorth: (id) => fetch(`${BASE}/wealth/networth/${id}`, { method: "DELETE" }),

  getPortfolio: () => req("/wealth/portfolio"),
  createPortfolio: (data) => req("/wealth/portfolio", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  updatePortfolio: (id, data) => req(`/wealth/portfolio/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  deletePortfolio: (id) => fetch(`${BASE}/wealth/portfolio/${id}`, { method: "DELETE" }),

  getAccounts: () => req("/wealth/accounts"),
  createAccount: (data) => req("/wealth/accounts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  updateAccount: (id, data) => req(`/wealth/accounts/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  deleteAccount: (id) => fetch(`${BASE}/wealth/accounts/${id}`, { method: "DELETE" }),

  getSalary: () => req("/wealth/salary"),
  createSalary: (data) => req("/wealth/salary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  updateSalary: (id, data) => req(`/wealth/salary/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  deleteSalary: (id) => fetch(`${BASE}/wealth/salary/${id}`, { method: "DELETE" }),

  getLoan: () => req("/wealth/loan"),
  createLoan: (data) => req("/wealth/loan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  updateLoan: (id, data) => req(`/wealth/loan/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) }),
  deleteLoan: (id) => fetch(`${BASE}/wealth/loan/${id}`, { method: "DELETE" }),

  migrateFromExcel: () => req("/wealth/migrate-from-excel", { method: "POST" }),

  // Budget targets
  getBudgetTargets: () => req("/budget-targets/"),
  seedBudgetTargets: () => req("/budget-targets/seed", { method: "POST" }),
  patchBudgetTarget: (category, monthly_target) =>
    req(`/budget-targets/${encodeURIComponent(category)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ monthly_target }),
    }),

  // Analyst
  getAnalystOverview: () => req("/analyst/overview"),
  streamAnalystChat: (messages) =>
    fetch(`${BASE}/analyst/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    }),
  streamStockAnalysis: (ticker) =>
    fetch(`${BASE}/analyst/analyze/${encodeURIComponent(ticker)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    }),
};
