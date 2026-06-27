import { useEffect, useState, useRef } from "react";

const INDICES = [
  { label: "NIFTY 50",   symbol: "^NSEI",    color: "#a78bfa" },
  { label: "SENSEX",     symbol: "^BSESN",   color: "#22d3ee" },
  { label: "NIFTY BANK", symbol: "^NSEBANK", color: "#4ade80" },
  { label: "GOLD (USD/oz)", symbol: "GC=F",  color: "#fbbf24" },
];

function TickerItem({ item }) {
  const up = (item.change ?? 0) >= 0;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "0 28px", whiteSpace: "nowrap", flexShrink: 0 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: item.color, letterSpacing: "0.05em" }}>{item.label}</span>
      <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
        {item.value != null ? item.value.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}
      </span>
      {item.change != null && (
        <span style={{ fontSize: 11, fontWeight: 600, color: up ? "#4ade80" : "#f87171" }}>
          {up ? "▲" : "▼"} {Math.abs(item.change).toFixed(2)} ({up ? "+" : ""}{item.changePct?.toFixed(2)}%)
        </span>
      )}
      <span style={{ color: "var(--border-subtle)", fontSize: 12 }}>|</span>
    </span>
  );
}

export default function MarketTicker() {
  const [data, setData] = useState(INDICES.map(i => ({ ...i, value: null, change: null, changePct: null })));
  const trackRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const fetchAll = async () => {
      try {
        const symbols = INDICES.map(i => i.symbol).join(",");
        const res = await fetch(
          `/api/market/quotes?symbols=${encodeURIComponent(symbols)}`,
          { signal: AbortSignal.timeout(10000) }
        );
        const quotes = await res.json();
        if (cancelled) return;
        const merged = INDICES.map((idx, i) => {
          const q = quotes[i] || {};
          return {
            ...idx,
            value: q.price ?? null,
            change: q.change ?? null,
            changePct: q.changePct ?? null,
          };
        });
        setData(merged);
      } catch {
        // keep existing data / dashes on failure — don't hide the ticker
      }
    };
    fetchAll();
    const t = setInterval(fetchAll, 60000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  const items = [...data, ...data, ...data];

  return (
    <div style={{
      width: "100%", overflow: "hidden",
      background: "rgba(255,255,255,0.018)",
      borderBottom: "1px solid rgba(255,255,255,0.06)",
      borderTop: "1px solid rgba(255,255,255,0.06)",
      height: 36, display: "flex", alignItems: "center",
      marginBottom: 20,
      position: "relative",
    }}>
      <style>{`
        @keyframes tickerScroll {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-33.333%); }
        }
        .ticker-track { display: inline-flex; animation: tickerScroll 40s linear infinite; will-change: transform; }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>

      <div style={{ paddingLeft: 4, overflow: "hidden", width: "100%" }}>
        <div className="ticker-track" ref={trackRef}>
          {items.map((item, i) => (
            <TickerItem key={i} item={item} />
          ))}
        </div>
      </div>

      {/* Right fade */}
      <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 60, background: "linear-gradient(270deg, var(--bg-base) 40%, transparent)", pointerEvents: "none" }} />
    </div>
  );
}
