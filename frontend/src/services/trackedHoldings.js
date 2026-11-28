import API from "./api";

/*
 * SIPs, US holdings and the fund watchlist used to live only in this
 * browser's localStorage. They now live in the account. The first time a
 * signed-in user opens a screen that uses them, whatever this device still
 * has is sent once to the server (which skips duplicates) and then cleared.
 */

export const LEGACY_KEYS = {
  sips: "fintwin-sips",
  usHoldings: "fintwin-us-holdings",
  watchlist: "fintwin-mf-watchlist",
  goalSipLinks: "fintwin-goal-sip-links",
};

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

const num = (v) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : null;
};
const date = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v : null);

/** What this device has saved, shaped for POST /device-data/import. Null when there's nothing. */
export function legacyPayload() {
  const sips = (read(LEGACY_KEYS.sips, []) || []).map((s) => ({
    fundName: s?.fundName, amount: num(s?.amount), frequency: s?.frequency,
    nextDebitDate: date(s?.nextDebitDate), notes: s?.notes || null,
  }));
  const usHoldings = (read(LEGACY_KEYS.usHoldings, []) || []).map((h) => ({
    name: h?.name, ticker: h?.ticker || null, units: num(h?.units),
    buyPrice: num(h?.buyPrice), buyDate: date(h?.buyDate),
  }));
  const watchlist = (read(LEGACY_KEYS.watchlist, []) || []).map((f) => ({
    schemeCode: f?.schemeCode != null ? String(f.schemeCode) : null, schemeName: f?.schemeName,
  }));
  const links = read(LEGACY_KEYS.goalSipLinks, {}) || {};
  const goalSipLinks = Object.entries(typeof links === "object" ? links : {}).map(([goalId, l]) => ({
    goalId: Number(goalId), fundName: l?.fundName || null, monthlyAmount: num(l?.monthlyAmount),
  })).filter((l) => Number.isFinite(l.goalId));

  const total = sips.length + usHoldings.length + watchlist.length + goalSipLinks.length;
  return total ? { sips, usHoldings, watchlist, goalSipLinks } : null;
}

function currentRole() {
  try { return JSON.parse(localStorage.getItem("user"))?.role; } catch { return undefined; }
}

let pending = null;

/**
 * Moves this device's saved data into the account, once. Every screen awaits
 * this before loading, so the moved rows show up on the first render. A
 * failure keeps the local copy so the next visit can try again.
 */
export function moveDeviceDataOnce() {
  if (pending) return pending;
  pending = (async () => {
    const body = legacyPayload();
    // The shared demo account is read-only: never push a device's data into it.
    if (!body || currentRole() === "DEMO") return;
    try {
      await API.post("/device-data/import", body);
      Object.values(LEGACY_KEYS).forEach((k) => {
        try { localStorage.removeItem(k); } catch { /* ignore */ }
      });
    } catch {
      pending = null; // try again next time
    }
  })();
  return pending;
}

/** For tests. */
export function _resetMoveForTests() { pending = null; }

export const sipApi = {
  list: async () => { await moveDeviceDataOnce(); return (await API.get("/sips")).data || []; },
  create: async (sip) => (await API.post("/sips", sip)).data,
  update: async (id, sip) => (await API.put(`/sips/${id}`, sip)).data,
  remove: (id) => API.delete(`/sips/${id}`),
};

export const usHoldingApi = {
  list: async () => { await moveDeviceDataOnce(); return (await API.get("/us-holdings")).data || []; },
  create: async (h) => (await API.post("/us-holdings", h)).data,
  remove: (id) => API.delete(`/us-holdings/${id}`),
};

export const watchlistApi = {
  list: async () => { await moveDeviceDataOnce(); return (await API.get("/fund-watchlist")).data || []; },
  add: async (f) => (await API.post("/fund-watchlist", { schemeCode: String(f.schemeCode), schemeName: f.schemeName })).data,
  remove: (code) => API.delete(`/fund-watchlist/${encodeURIComponent(code)}`),
};
