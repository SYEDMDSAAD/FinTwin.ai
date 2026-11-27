import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import toast from "react-hot-toast";
import API from "../../services/api";
import { Button, cx } from "../ui";
import { rupees, percent } from "../../utils/money";
import { rangePosition, inr2, shortInr } from "../../utils/investMath";
import PriceChart from "./PriceChart";
import { Fact, Panel, YourHolding } from "./parts";

/*
 * A stock's page, like Kite and Groww: today's price and change, a chart
 * from one day to five years, where the price sits in its 52-week range,
 * and the user's position (quantity, average price, today's P&L).
 */

const STOCK_RANGES = ["1D", "1W", "1M", "1Y", "5Y"];

function labelFor(range, t) {
    const d = new Date(t);
    if (range === "1D") return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    if (range === "1W") return d.toLocaleDateString("en-IN", { weekday: "short", hour: "2-digit" });
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: range === "1M" ? undefined : "2-digit" });
}

export default function StockPage({ symbol, name, holding }) {
    const [quote, setQuote] = useState(null);
    const [year, setYear] = useState(null);
    const [following, setFollowing] = useState(false);
    useEffect(() => {
        let alive = true;
        API.get("/discover/stocks/quotes", { params: { symbols: symbol } })
            .then((r) => { if (alive) setQuote((r.data || [])[0] || {}); })
            .catch(() => { if (alive) setQuote({}); });
        return () => { alive = false; };
    }, [symbol]);

    const load = useCallback((range) => API.get("/discover/stocks/history", { params: { symbol, range } }).then((r) => ({
        change: r.data?.change, high52: r.data?.high52, low52: r.data?.low52,
        points: (r.data?.points || []).map((p) => ({ label: labelFor(range, p.t), value: p.price })),
    })), [symbol]);
    const onData = useCallback((d) => { if (d.high52 != null) setYear({ high: d.high52, low: d.low52 }); }, []);

    const follow = async () => {
        try {
            await API.post("/watchlist", { kind: "STOCK", symbol: quote?.symbol || symbol, name: name || symbol });
            setFollowing(true);
            toast.success("Added to your watchlist");
        } catch (e) {
            toast.error(e?.response?.data?.error || "Couldn't add it to your watchlist");
        }
    };

    const price = quote?.price;
    const up = (quote?.changePct ?? 0) >= 0;
    const qty = holding?.units;
    const pos = rangePosition(price, year?.low, year?.high);
    const dayPnl = qty && price != null && quote?.previousClose ? qty * (price - quote.previousClose) : null;
    return (
        <div className="space-y-5">
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-caption text-ink-3">{(quote?.symbol || symbol).replace(/\.NS$/, " · NSE").replace(/\.BO$/, " · BSE")}</p>
                    <h2 className="text-[20px] leading-tight font-[650] text-ink">{name || symbol}</h2>
                    <p className="mt-1 num">
                        <span className="text-[24px] font-[650] text-ink">{price != null ? inr2(price) : "—"}</span>
                        {quote?.changePct != null && (
                            <span className={cx("ml-2 text-small font-semibold", up ? "text-good" : "text-bad")}>
                                {price != null && quote.previousClose ? `${rupees(price - quote.previousClose, { plus: true })} · ` : ""}{percent(quote.changePct, { plus: true })} today
                            </span>
                        )}
                    </p>
                </div>
                <Button size="sm" variant="secondary" icon={Star} onClick={follow} disabled={following}>{following ? "Following" : "Follow"}</Button>
            </header>

            <Panel>
                <PriceChart load={load} onData={onData} ranges={STOCK_RANGES} initial="1Y" label="Price" format={shortInr} />
            </Panel>

            <YourHolding holding={holding} extra={qty ? <>
                <Fact label="Quantity" value={Number(qty).toLocaleString("en-IN")} />
                <Fact label="Average price" value={inr2(holding.investedAmount / qty)} />
                {dayPnl != null && <Fact label="Today" value={rupees(dayPnl, { plus: true })} tone={dayPnl >= 0 ? "good" : "bad"} />}
            </> : null} />

            <Panel title="52-week range">
                {pos == null ? <p className="text-small text-ink-3">Unavailable right now.</p> : (
                    <>
                        <div className="relative h-1.5 rounded-full bg-surface-sunken" role="img"
                             aria-label={`Today's price is ${pos}% of the way from the 52-week low to the high`}>
                            <span className="absolute -top-1 w-3.5 h-3.5 rounded-full bg-accent border-2 border-surface" style={{ left: `calc(${pos}% - 7px)` }} />
                        </div>
                        <div className="flex justify-between mt-2 text-small num">
                            <span><span className="text-ink-3">Low </span><span className="text-ink font-semibold">{inr2(year.low)}</span></span>
                            <span><span className="text-ink-3">High </span><span className="text-ink font-semibold">{inr2(year.high)}</span></span>
                        </div>
                    </>
                )}
                <p className="text-small text-ink-3 mt-3 num">Previous close {inr2(quote?.previousClose)}</p>
            </Panel>
        </div>
    );
}
