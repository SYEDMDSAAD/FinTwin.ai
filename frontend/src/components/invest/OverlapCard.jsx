import { useEffect, useState } from "react";
import API from "../../services/api";
import { rupees } from "../../utils/money";
import { doublingUp, sectorSplit } from "../../utils/overlap";
import { Panel } from "./parts";

/*
 * Phase 3 insights: funds that double up, and the user's stocks by sector.
 * Plain facts about what they hold, never "sell one" or "buy another".
 */

export function OverlapCard({ details }) {
    if (!details || details.length < 2) return null;
    const found = doublingUp(details.map(({ holding, fund }) => ({ holding, category: fund?.category || "" })));
    if (found.length === 0) return null;
    return (
        <Panel title="Funds that double up"
               note="From each fund's name and SEBI category. Exact overlap needs every fund's monthly holdings list, which FinTwin doesn't read yet.">
            <ul className="space-y-3">
                {found.map((f) => (
                    <li key={f.kind + f.label} className="rounded-control bg-surface-sunken px-3 py-2.5">
                        <p className="text-small font-semibold text-ink">
                            {f.kind === "same-index" ? `${f.names.length} funds track the ${f.label}` : `${f.names.length} ${f.label} funds`}
                            <span className="font-normal text-ink-3"> · {rupees(f.value)}</span>
                        </p>
                        <p className="text-small text-ink-3 mt-0.5">
                            {f.kind === "same-index"
                                ? "They hold the same stocks in the same weights, so together they act like one fund."
                                : "Funds in one category often own many of the same companies."}
                        </p>
                        <p className="text-caption text-ink-3 mt-1 truncate">{f.names.join(" · ")}</p>
                    </li>
                ))}
            </ul>
        </Panel>
    );
}

export function SectorCard({ holdings }) {
    const stocks = (holdings || []).filter((h) => h.type === "Stocks" && (h.tickerCode || "").trim());
    const symbols = stocks.map((s) => s.tickerCode.trim().toUpperCase()).join(",");
    const [sectors, setSectors] = useState({ key: null, map: null });
    useEffect(() => {
        if (!symbols) return;
        let alive = true;
        API.get("/discover/stocks/sectors", { params: { symbols } })
            .then((r) => { if (alive) setSectors({ key: symbols, map: r.data && typeof r.data === "object" ? r.data : {} }); })
            .catch(() => { if (alive) setSectors({ key: symbols, map: {} }); });
        return () => { alive = false; };
    }, [symbols]);

    if (!symbols || sectors.key !== symbols) return null;
    const rows = sectorSplit(stocks, sectors.map);
    if (rows.length === 0 || (rows.length === 1 && rows[0].sector === "Unknown")) return null;
    return (
        <Panel title="Your stocks by sector" note="Shares you hold directly, by value. Funds aren't included. Sectors as Yahoo Finance classifies them.">
            <ul className="space-y-2.5">
                {rows.map((r) => (
                    <li key={r.sector}>
                        <div className="flex justify-between text-small"><span className="text-ink">{r.sector}</span>
                            <span className="text-ink-3 num">{r.pct}% · {rupees(r.value)}</span></div>
                        <div className="mt-1 h-1.5 rounded-full bg-surface-sunken overflow-hidden">
                            <div className="h-full rounded-full bg-accent" style={{ width: `${r.pct}%` }} />
                        </div>
                    </li>
                ))}
            </ul>
            {rows[0].pct >= 50 && rows[0].sector !== "Unknown" && (
                <p className="text-small text-ink mt-3">{rows[0].pct}% of your shares are in one sector: {rows[0].sector}.</p>
            )}
        </Panel>
    );
}
