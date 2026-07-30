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
  // Wealth
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
  syncExcel: (file) => {
    const form = new FormData();
    form.append("file", file);
    return req("/wealth/sync-excel", { method: "POST", body: form });
  },

  // Analyst + stock analysis
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
