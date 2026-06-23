import { useState, useEffect, useRef } from "react";
import { Search, Star, TrendingUp, RefreshCw, Bookmark } from "lucide-react";

const CAT_COLORS = {
  "Large Cap": "#22d3ee", "Mid Cap": "#a78bfa", "Small Cap": "#fbbf24",
  "ELSS": "#4ade80", "Debt": "#94a3b8", "Hybrid": "#f472b6",
  "Index": "#38bdf8", "Flexi Cap": "#fb923c",
};

const WATCHLIST_KEY = "fintwin-mf-watchlist";
function getWatchlist() { try { return JSON.parse(localStorage.getItem(WATCHLIST_KEY)) || []; } catch { return []; } }
function saveWatchlist(w) { localStorage.setItem(WATCHLIST_KEY, JSON.stringify(w)); }

function categoryFromName(name = "") {
  const n = name.toLowerCase();
  if (n.includes("elss") || n.includes("tax")) return "ELSS";
  if (n.includes("liquid") || n.includes("overnight")) return "Debt";
  if (n.includes("debt") || n.includes("bond") || n.includes("gilt")) return "Debt";
  if (n.includes("hybrid") || n.includes("balanced")) return "Hybrid";
  if (n.includes("index") || n.includes("nifty") || n.includes("sensex")) return "Index";
  if (n.includes("flexi") || n.includes("multi cap")) return "Flexi Cap";
  if (n.includes("small")) return "Small Cap";
  if (n.includes("mid")) return "Mid Cap";
  if (n.includes("large")) return "Large Cap";
  return "Other";
}

export default function MutualFundsTab() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [watchlist, setWatchlist] = useState(getWatchlist);
  const [navCache, setNavCache] = useState({});
  const debRef = useRef(null);

  const search = async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch("https://api.mfapi.in/mf/search?q=" + encodeURIComponent(q));
      const json = await res.json();
      const top = json.slice(0, 15);
      setResults(top);
      fetchNAVs(top.map(f => f.schemeCode));
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchNAVs = async (codes) => {
    for (const code of codes.slice(0, 8)) {
      if (navCache[code]) continue;
      try {
        const res = await fetch(`https://api.mfapi.in/mf/${code}`);
        const json = await res.json();
        const data = json.data || [];
        const nav = parseFloat(data[0]?.nav) || null;
        const nav1y = parseFloat(data[365]?.nav) || null;
        const nav3y = parseFloat(data[365*3]?.nav) || null;
        const ret1y = nav && nav1y ? (((nav - nav1y) / nav1y) * 100).toFixed(1) : null;
        const ret3y = nav && nav3y ? (((nav - nav3y) / nav3y) * 100 / 3).toFixed(1) : null;
        setNavCache(c => ({ ...c, [code]: { nav, ret1y, ret3y } }));
      } catch {}
    }
  };

  useEffect(() => {
    clearTimeout(debRef.current);
    debRef.current = setTimeout(() => search(query), 400);
  }, [query]);

  const toggleWatch = (fund) => {
    const w = getWatchlist();
    const exists = w.find(f => f.schemeCode === fund.schemeCode);
    const next = exists ? w.filter(f => f.schemeCode !== fund.schemeCode) : [...w, fund];
    setWatchlist(next); saveWatchlist(next);
  };

  const isWatched = (code) => watchlist.some(f => f.schemeCode === code);

  const display = query.trim() ? results : (watchlist.length > 0 ? watchlist : []);
  const showingWatchlist = !query.trim() && watchlist.length > 0;

  return (
    <div>
      {/* Search */}
      <div style={{ position: "relative", marginBottom: 20 }}>
        <Search size={15} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-label)" }} />
        <input
          style={{
            width: "100%", padding: "11px 12px 11px 38px", borderRadius: 12,
            background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
            color: "#fff", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit",
          }}
          placeholder="Search mutual funds (e.g. Parag Parikh, Nifty 50, ELSS)..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        {loading && <RefreshCw size={14} className="animate-spin" style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />}
      </div>

      {showingWatchlist && (
        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-dim)", letterSpacing: "0.1em", marginBottom: 12 }}>
          WATCHLIST ({watchlist.length})
        </div>
      )}

      {!query.trim() && watchlist.length === 0 && (
        <div style={{ textAlign: "center", padding: "50px 20px", color: "var(--text-dimmer)" }}>
          <Search size={40} style={{ opacity: 0.2, marginBottom: 12 }} />
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Search Mutual Funds</div>
          <div style={{ fontSize: 12 }}>Search by fund name, AMC, or category. Add to watchlist to track NAV and returns.</div>
        </div>
      )}

      {/* Results list */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {display.map(fund => {
          const nav = navCache[fund.schemeCode];
          const cat = categoryFromName(fund.schemeName);
          const catColor = CAT_COLORS[cat] || "#94a3b8";
          const watched = isWatched(fund.schemeCode);

          return (
            <div key={fund.schemeCode} style={{
              position: "relative", overflow: "hidden",
              background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)",
              borderRadius: 14, padding: "14px 16px",
              display: "flex", alignItems: "center", gap: 14,
              transition: "background 0.15s",
            }}
              onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.04)"}
              onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", lineHeight: 1.4, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {fund.schemeName}
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: catColor, background: catColor+"15", border: `1px solid ${catColor}25`, borderRadius: 5, padding: "1px 7px" }}>
                    {cat}
                  </span>
                  <span style={{ fontSize: 10, color: "var(--text-dim)" }}>Code: {fund.schemeCode}</span>
                </div>
              </div>

              {/* NAV & returns */}
              <div style={{ display: "flex", gap: 20, flexShrink: 0, alignItems: "center" }}>
                {nav ? (
                  <>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600, marginBottom: 2 }}>NAV</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>₹{nav.nav}</div>
                    </div>
                    {nav.ret1y && (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600, marginBottom: 2 }}>1Y</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: parseFloat(nav.ret1y) >= 0 ? "#4ade80" : "#f87171" }}>
                          {parseFloat(nav.ret1y) >= 0 ? "+" : ""}{nav.ret1y}%
                        </div>
                      </div>
                    )}
                    {nav.ret3y && (
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 10, color: "var(--text-dim)", fontWeight: 600, marginBottom: 2 }}>3Y CAGR</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: parseFloat(nav.ret3y) >= 0 ? "#4ade80" : "#f87171" }}>
                          {parseFloat(nav.ret3y) >= 0 ? "+" : ""}{nav.ret3y}%
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ fontSize: 11, color: "var(--text-dimmer)", textAlign: "right" }}>Loading NAV...</div>
                )}

                <button
                  onClick={() => toggleWatch(fund)}
                  style={{
                    width: 34, height: 34, borderRadius: 9, border: "none", cursor: "pointer",
                    background: watched ? "rgba(251,191,36,0.15)" : "rgba(255,255,255,0.04)",
                    border2: "1px solid",
                    color: watched ? "#fbbf24" : "var(--text-dim)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.2s", flexShrink: 0,
                    border: `1px solid ${watched ? "rgba(251,191,36,0.3)" : "rgba(255,255,255,0.08)"}`,
                  }}
                  title={watched ? "Remove from watchlist" : "Add to watchlist"}
                >
                  {watched ? <Star size={14} fill="#fbbf24" /> : <Bookmark size={14} />}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {query.trim() && !loading && results.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: "var(--text-dimmer)", fontSize: 13 }}>No funds found for "{query}"</div>
      )}
    </div>
  );
}
