import { useEffect, useState } from "react";
import { cx } from "./ui";
import { apiUrl } from "../services/apiOrigin";

const INDICES = [
  { label: "Nifty 50",   symbol: "^NSEI" },
  { label: "Sensex",     symbol: "^BSESN" },
  { label: "Nifty Bank", symbol: "^NSEBANK" },
  { label: "Gold, $/oz", symbol: "GC=F" },
];

/* One index: name, level, today's move. Dashes until the quote arrives. */
function IndexCard({ item }) {
  const up = (item.change ?? 0) >= 0;
  const has = item.value != null;
  return (
    <div className="shrink-0 min-w-[132px] rounded-control bg-surface border border-line px-3 py-2">
      <p className="text-caption text-ink-3">{item.label}</p>
      <p className="text-body font-semibold text-ink num">
        {has ? item.value.toLocaleString("en-IN", { maximumFractionDigits: 2 }) : "—"}
      </p>
      <p className={cx("text-caption font-medium num", !has || item.changePct == null ? "text-ink-3" : up ? "text-good" : "text-bad")}>
        {has && item.changePct != null ? `${up ? "+" : "−"}${Math.abs(item.changePct).toFixed(2)}%` : "\u00a0"}
      </p>
    </div>
  );
}

export default function MarketTicker() {
  const [data, setData] = useState(INDICES.map(i => ({ ...i, value: null, change: null, changePct: null })));

  useEffect(() => {
    let cancelled = false;
    let retry = null;
    // A failed or empty fetch tries again in 10 seconds, not at the next minute
    const retrySoon = () => {
      if (!cancelled && !retry) retry = setTimeout(() => { retry = null; fetchAll(); }, 10000);
    };
    const fetchAll = async () => {
      try {
        const symbols = INDICES.map(i => i.symbol).join(",");
        const res = await fetch(
          apiUrl(`/api/v1/market/quotes?symbols=${encodeURIComponent(symbols)}`),
          { signal: AbortSignal.timeout(10000) }
        );
        const quotes = await res.json();
        if (cancelled) return;
        // Match by symbol, not index — the backend drops timed-out quotes,
        // and a positional merge would shift prices under the wrong label.
        const bySymbol = Object.fromEntries(
          (Array.isArray(quotes) ? quotes : []).map(q => [q.symbol, q])
        );
        const merged = INDICES.map((idx) => {
          const q = bySymbol[idx.symbol] || {};
          return {
            ...idx,
            value: q.price ?? null,
            change: q.change ?? null,
            changePct: q.changePct ?? null,
          };
        });
        setData(merged);
        if (!Object.keys(bySymbol).length) retrySoon();
      } catch {
        // keep existing data / dashes on failure — don't hide the ticker
        retrySoon();
      }
    };
    fetchAll();
    const t = setInterval(fetchAll, 60000);
    return () => { cancelled = true; clearInterval(t); clearTimeout(retry); };
  }, []);

  return (
    <div aria-label="Markets today" className="flex gap-2 mb-5 -mx-1 px-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
      {data.map(item => <IndexCard key={item.symbol} item={item} />)}
    </div>
  );
}
