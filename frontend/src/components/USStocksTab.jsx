import { useEffect, useState } from "react";
import { Plus, X, TrendingUp } from "lucide-react";
import { toast } from "react-hot-toast";
import { apiUrl } from "../services/apiOrigin";
import { usHoldingApi } from "../services/trackedHoldings";

const INDICES = [
  { label: "S&P 500",   symbol: "^GSPC", color: "var(--good)" },
  { label: "NASDAQ",    symbol: "^IXIC",  color: "var(--info)" },
  { label: "Dow Jones", symbol: "^DJI",   color: "var(--accent)" },
];

const EMPTY = { name: "", ticker: "", units: "", buyPrice: "", buyDate: "" };

function IndexCard({ idx }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetch_ = async () => {
      try {
        const res = await fetch(
          apiUrl(`/api/v1/market/quotes?symbols=${encodeURIComponent(idx.symbol)}`),
          { signal: AbortSignal.timeout(10000) }
        );
        const quotes = await res.json();
        const q = (Array.isArray(quotes) ? quotes : []).find(x => x.symbol === idx.symbol);
        if (q?.price != null && !cancelled) setData({
          price: q.price,
          change: q.change,
          pct: q.changePct,
        });
      } catch {}
    };
    fetch_();
    return () => { cancelled = true; };
  }, [idx.symbol]);

  const up = (data?.change ?? 0) >= 0;
  return (
    <div style={{
      background: "var(--bg-card)", border: "1px solid var(--border-card)",
      borderRadius: "var(--radius-control)", padding: "8px 12px", flexShrink: 0, minWidth: 132,
    }}>
      <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{idx.label}</div>
      {data ? (
        <>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
            {data.price?.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </div>
          <div style={{ fontSize: 12, fontWeight: 500, color: up ? "var(--good)" : "var(--bad)", fontVariantNumeric: "tabular-nums" }}>
            {up ? "+" : "−"}{Math.abs(data.pct ?? 0).toFixed(2)}%
          </div>
        </>
      ) : (
        <div style={{ fontSize: 15, color: "var(--text-dim)" }}>—</div>
      )}
    </div>
  );
}

export default function USStocksTab() {
  const [holdings, setHoldings] = useState([]);
  // Live prices by ticker; not stored, fetched each visit.
  const [prices, setPrices] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Without live prices P&L reads 0 forever, so price every ticker we hold.
  const refreshHoldingPrices = async (list) => {
    const tickers = [...new Set(list.map(h => h.ticker).filter(Boolean))];
    if (!tickers.length) return;
    setRefreshing(true);
    try {
      const res = await fetch(
        apiUrl(`/api/v1/market/quotes?symbols=${encodeURIComponent(tickers.join(","))}`),
        { signal: AbortSignal.timeout(10000) }
      );
      const quotes = await res.json();
      const next = {};
      (Array.isArray(quotes) ? quotes : []).forEach(q => { if (q?.price != null) next[q.symbol] = q.price; });
      setPrices(p => ({ ...p, ...next }));
    } catch {} finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    usHoldingApi.list().then((list) => {
      if (cancelled) return;
      setHoldings(list);
      refreshHoldingPrices(list);
    }).catch(() => { if (!cancelled) toast.error("Couldn't load your US holdings."); });
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    if (!form.name.trim() || !form.buyPrice || saving) return;
    setSaving(true);
    try {
      const made = await usHoldingApi.create({
        name: form.name, ticker: form.ticker || null,
        units: parseFloat(form.units) || 0, buyPrice: parseFloat(form.buyPrice) || 0,
        buyDate: form.buyDate || null,
      });
      const next = [...holdings, made];
      setHoldings(next); setShowAdd(false); setForm(EMPTY);
      refreshHoldingPrices([made]);
    } catch {
      toast.error("Couldn't save this holding. Check the ticker and try again.");
    } finally {
      setSaving(false);
    }
  };
  const handleDelete = async (id) => {
    const before = holdings;
    setHoldings(holdings.filter(h => h.id !== id));
    try { await usHoldingApi.remove(id); } catch {
      setHoldings(before); toast.error("Couldn't remove this holding.");
    }
  };

  const priceOf = (h) => (h.ticker && prices[h.ticker] != null ? prices[h.ticker] : h.buyPrice);
  const totalInvested = holdings.reduce((s,h) => s + (h.units * h.buyPrice), 0);
  const totalCurrent  = holdings.reduce((s,h) => s + (h.units * priceOf(h)), 0);
  const totalPnl = totalCurrent - totalInvested;

  return (
    <div>
      {/* US Indices */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto", scrollbarWidth: "none", margin: "0 -4px", padding: "0 4px" }} aria-label="US markets today">
          {INDICES.map(idx => <IndexCard key={idx.symbol} idx={idx} />)}
        </div>
      </div>

      {/* My US Holdings */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, color: "var(--text-primary)" }}>US stocks</div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 4 }}>Prices in US dollars</div>
          {holdings.length > 0 && (
            <div style={{ display: "flex", gap: 16 }}>
              <div>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Invested: </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>${totalInvested.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
              </div>
              <div>
                <span style={{ fontSize: 12, color: "var(--text-dim)" }}>P&L: </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: totalPnl >= 0 ? "var(--good)" : "var(--bad)" }}>
                  {totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {holdings.some(h => h.ticker) && (
            <button
              onClick={() => refreshHoldingPrices(holdings)}
              disabled={refreshing}
              style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 999, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", background: "var(--bg-input)", color: "var(--text-primary)", opacity: refreshing ? 0.6 : 1 }}
            >
              {refreshing ? "Updating…" : "Update prices"}
            </button>
          )}
          <button
            onClick={() => setShowAdd(o => !o)}
            style={{ display: "flex", alignItems: "center", gap: 6, height: 36, padding: "0 14px", borderRadius: 999, border: "none", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap", background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Plus size={14} /> Add
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: "var(--good-soft)", border: "1px solid var(--good-soft)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
            <div>
              <label style={lbl}>Company Name *</label>
              <input style={inp} placeholder="e.g. Apple Inc." value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
            </div>
            <div>
              <label style={lbl}>Ticker Symbol</label>
              <input style={inp} placeholder="e.g. AAPL" value={form.ticker} onChange={e => setForm({...form, ticker: e.target.value.toUpperCase()})} />
            </div>
            <div>
              <label style={lbl}>Shares / Units</label>
              <input type="number" style={inp} placeholder="10" value={form.units} onChange={e => setForm({...form, units: e.target.value})} />
            </div>
            <div>
              <label style={lbl}>Avg Buy Price ($) *</label>
              <input type="number" style={inp} placeholder="150.00" value={form.buyPrice} onChange={e => setForm({...form, buyPrice: e.target.value})} />
            </div>
            <div>
              <label style={lbl}>Buy Date</label>
              <input type="date" style={inp} value={form.buyDate} onChange={e => setForm({...form, buyDate: e.target.value})} />
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => { setShowAdd(false); setForm(EMPTY); }} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border-card)", background: "none", color: "var(--text-dim)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={!form.name.trim() || !form.buyPrice || saving}
              style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: "none", background: "var(--good-soft)", color: "var(--good)", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: form.name.trim() && form.buyPrice ? 1 : 0.4 }}
            >
              Add holding
            </button>
          </div>
        </div>
      )}

      {/* Holdings table */}
      {holdings.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 20px", color: "var(--text-dimmer)", fontSize: 13 }}>
          <TrendingUp size={36} style={{ opacity: 0.2, marginBottom: 12 }} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}>No US stock holdings yet</div>
          <div>Track your Apple, Google, Tesla and other US positions here.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-card)" }}>
                {["Name","Ticker","Units","Buy Price","Current","Value","P&L",""].map(h => (
                  <th key={h} style={{ textAlign: h === "P&L" || h === "Value" ? "right" : "left", padding: "8px 12px", fontSize: 12, fontWeight: 700, color: "var(--text-dim)", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map(h => {
                const invested = h.units * h.buyPrice;
                const current  = h.units * priceOf(h);
                const pnl = current - invested;
                const pct = invested ? (pnl / invested * 100).toFixed(1) : 0;
                const pos = pnl >= 0;
                return (
                  <tr key={h.id} style={{ borderBottom: "1px solid var(--border-card)" }}>
                    <td style={{ padding: "11px 12px", fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{h.name}</td>
                    <td style={{ padding: "11px 12px" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--good)", background: "var(--good-soft)", border: "1px solid var(--good-soft)", borderRadius: 5, padding: "2px 7px" }}>{h.ticker || "—"}</span>
                    </td>
                    <td style={{ padding: "11px 12px", fontSize: 12, color: "var(--text-secondary)" }}>{h.units}</td>
                    <td style={{ padding: "11px 12px", fontSize: 12, color: "var(--text-secondary)" }}>${h.buyPrice}</td>
                    <td style={{ padding: "11px 12px", fontSize: 12, color: "var(--info)" }}>${Number(priceOf(h)).toFixed(2)}</td>
                    <td style={{ padding: "11px 12px", fontSize: 13, fontWeight: 700, color: "var(--text-primary)", textAlign: "right" }}>${current.toFixed(2)}</td>
                    <td style={{ padding: "11px 12px", textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: pos ? "var(--good)" : "var(--bad)" }}>{pos?"+":""}${Math.abs(pnl).toFixed(2)}</div>
                      <div style={{ fontSize: 12, color: pos ? "var(--good)" : "var(--bad)" }}>{pos?"+":""}{pct}%</div>
                    </td>
                    <td style={{ padding: "11px 12px" }}>
                      <button onClick={() => handleDelete(h.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--bad)", padding: 4, display: "flex" }}>
                        <X size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const lbl = { display: "block", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)", marginBottom: 6 };
const inp = { width: "100%", height: 44, padding: "0 12px", borderRadius: "var(--radius-control)", background: "var(--bg-input)", border: "1px solid transparent", color: "var(--text-primary)", fontSize: 15, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
