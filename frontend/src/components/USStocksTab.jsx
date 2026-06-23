import { useEffect, useState } from "react";
import { Plus, X, TrendingUp, TrendingDown, RefreshCw } from "lucide-react";

const INDICES = [
  { label: "S&P 500",   symbol: "^GSPC", color: "#4ade80" },
  { label: "NASDAQ",    symbol: "^IXIC",  color: "#22d3ee" },
  { label: "Dow Jones", symbol: "^DJI",   color: "#a78bfa" },
];

const STORAGE_KEY = "fintwin-us-holdings";
function getHoldings() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; } catch { return []; } }
function saveHoldings(h) { localStorage.setItem(STORAGE_KEY, JSON.stringify(h)); }

const EMPTY = { name: "", ticker: "", units: "", buyPrice: "", buyDate: "" };

function IndexCard({ idx }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetch_ = async () => {
      try {
        const res = await fetch(
          `/api/market/quotes?symbols=${encodeURIComponent(idx.symbol)}`,
          { signal: AbortSignal.timeout(10000) }
        );
        const quotes = await res.json();
        const q = quotes[0];
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
      position: "relative", overflow: "hidden",
      background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 16, padding: "16px 20px", flex: 1, minWidth: 160,
      borderTop: `3px solid ${idx.color}`,
    }}>
      <div style={{ position: "absolute", inset: "0 0 auto", height: 1, background: `linear-gradient(90deg,transparent,${idx.color}30,transparent)` }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: idx.color, marginBottom: 8 }}>{idx.label}</div>
      {data ? (
        <>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#fff", letterSpacing: "-0.02em" }}>
            {data.price?.toLocaleString("en-US", { maximumFractionDigits: 2 })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginTop: 4, fontSize: 12, fontWeight: 600, color: up ? "#4ade80" : "#f87171" }}>
            {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
            {up ? "+" : ""}{data.change?.toFixed(2)} ({up ? "+" : ""}{data.pct?.toFixed(2)}%)
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: "var(--text-dimmer)", paddingTop: 8 }}>Loading...</div>
      )}
    </div>
  );
}

export default function USStocksTab() {
  const [holdings, setHoldings] = useState(getHoldings);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState(EMPTY);

  const handleSave = () => {
    if (!form.name.trim() || !form.buyPrice) return;
    const h = {
      id: Date.now().toString(),
      ...form,
      units: parseFloat(form.units) || 0,
      buyPrice: parseFloat(form.buyPrice) || 0,
      currentPrice: parseFloat(form.buyPrice) || 0,
    };
    const next = [...holdings, h];
    setHoldings(next); saveHoldings(next); setShowAdd(false); setForm(EMPTY);
  };
  const handleDelete = (id) => {
    const next = holdings.filter(h => h.id !== id);
    setHoldings(next); saveHoldings(next);
  };

  const totalInvested = holdings.reduce((s,h) => s + (h.units * h.buyPrice), 0);
  const totalCurrent  = holdings.reduce((s,h) => s + (h.units * (h.currentPrice || h.buyPrice)), 0);
  const totalPnl = totalCurrent - totalInvested;

  return (
    <div>
      {/* US Indices */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.1em", marginBottom: 12 }}>US MARKET INDICES (LIVE)</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {INDICES.map(idx => <IndexCard key={idx.symbol} idx={idx} />)}
        </div>
      </div>

      {/* My US Holdings */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.1em", marginBottom: 2 }}>MY US STOCK HOLDINGS</div>
          {holdings.length > 0 && (
            <div style={{ display: "flex", gap: 16 }}>
              <div>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Invested: </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>${totalInvested.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
              </div>
              <div>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>P&L: </span>
                <span style={{ fontSize: 13, fontWeight: 700, color: totalPnl >= 0 ? "#4ade80" : "#f87171" }}>
                  {totalPnl >= 0 ? "+" : ""}${totalPnl.toLocaleString("en-US", { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => setShowAdd(o => !o)}
          style={{ display: "flex", alignItems: "center", gap: 7, padding: "8px 14px", borderRadius: 11, border: "1px solid rgba(74,222,128,0.25)", background: "rgba(74,222,128,0.08)", color: "#4ade80", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}
        >
          <Plus size={13} /> Add Holding
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ background: "rgba(74,222,128,0.04)", border: "1px solid rgba(74,222,128,0.12)", borderRadius: 14, padding: 16, marginBottom: 16 }}>
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
            <button onClick={() => { setShowAdd(false); setForm(EMPTY); }} style={{ padding: "8px 16px", borderRadius: 10, border: "1px solid rgba(255,255,255,0.1)", background: "none", color: "var(--text-muted)", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Cancel</button>
            <button
              onClick={handleSave}
              disabled={!form.name.trim() || !form.buyPrice}
              style={{ flex: 1, padding: "8px 0", borderRadius: 10, border: "none", background: "rgba(74,222,128,0.15)", color: "#4ade80", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", opacity: form.name.trim() && form.buyPrice ? 1 : 0.4 }}
            >
              Add Holding
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
              <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                {["Name","Ticker","Units","Buy Price","Current","Value","P&L",""].map(h => (
                  <th key={h} style={{ textAlign: h === "P&L" || h === "Value" ? "right" : "left", padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {holdings.map(h => {
                const invested = h.units * h.buyPrice;
                const current  = h.units * (h.currentPrice || h.buyPrice);
                const pnl = current - invested;
                const pct = invested ? (pnl / invested * 100).toFixed(1) : 0;
                const pos = pnl >= 0;
                return (
                  <tr key={h.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                    <td style={{ padding: "11px 12px", fontSize: 13, fontWeight: 600, color: "#fff" }}>{h.name}</td>
                    <td style={{ padding: "11px 12px" }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#4ade80", background: "rgba(74,222,128,0.1)", border: "1px solid rgba(74,222,128,0.2)", borderRadius: 5, padding: "2px 7px" }}>{h.ticker || "—"}</span>
                    </td>
                    <td style={{ padding: "11px 12px", fontSize: 12, color: "var(--text-secondary)" }}>{h.units}</td>
                    <td style={{ padding: "11px 12px", fontSize: 12, color: "var(--text-secondary)" }}>${h.buyPrice}</td>
                    <td style={{ padding: "11px 12px", fontSize: 12, color: "#22d3ee" }}>${(h.currentPrice || h.buyPrice)?.toFixed(2)}</td>
                    <td style={{ padding: "11px 12px", fontSize: 13, fontWeight: 700, color: "#fff", textAlign: "right" }}>${current.toFixed(2)}</td>
                    <td style={{ padding: "11px 12px", textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: pos ? "#4ade80" : "#f87171" }}>{pos?"+":""}${Math.abs(pnl).toFixed(2)}</div>
                      <div style={{ fontSize: 10, color: pos ? "#4ade80" : "#f87171" }}>{pos?"+":""}{pct}%</div>
                    </td>
                    <td style={{ padding: "11px 12px" }}>
                      <button onClick={() => handleDelete(h.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(248,113,113,0.4)", padding: 4, display: "flex" }}>
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

const lbl = { display: "block", fontSize: 10, fontWeight: 700, color: "var(--text-label)", letterSpacing: "0.08em", marginBottom: 5 };
const inp = { width: "100%", padding: "8px 11px", borderRadius: 9, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#fff", fontSize: 13, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
