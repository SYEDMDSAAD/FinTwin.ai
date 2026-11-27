import { useCallback, useEffect, useState } from "react";
import { Star } from "lucide-react";
import toast from "react-hot-toast";
import API from "../../services/api";
import { Button, cx } from "../ui";
import { rupees, percent } from "../../utils/money";
import { lumpSum, sipReturns, planOf, inr2, shortInr } from "../../utils/investMath";
import PriceChart from "./PriceChart";
import { Fact, Facts, Panel, YourHolding } from "./parts";

/*
 * A mutual fund's page, laid out like Groww's: NAV chart with ranges, past
 * returns, the facts, the user's own holding, and a calculator that replays
 * a SIP or a lump sum on the fund's real NAVs. Facts and past numbers only.
 */

const FUND_RANGES = ["1M", "6M", "1Y", "3Y", "5Y", "ALL"];
const shortDay = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });

function ageOf(since) {
    if (!since) return null;
    const years = (Date.now() - new Date(`${since}T00:00:00`)) / (365.25 * 86_400_000);
    return years >= 1 ? `${Math.floor(years)} yr${years >= 2 ? "s" : ""}` : `${Math.max(1, Math.round(years * 12))} months`;
}

function Calculator({ code }) {
    const [navs, setNavs] = useState(null);
    const [mode, setMode] = useState("sip");
    const [amount, setAmount] = useState("5000");
    const [years, setYears] = useState(3);
    useEffect(() => {
        let alive = true;
        API.get(`/discover/funds/${code}/navs`)
            .then((r) => { if (alive) setNavs(Array.isArray(r.data) ? r.data : []); })
            .catch(() => { if (alive) setNavs([]); });
        return () => { alive = false; };
    }, [code]);

    const amt = Number(amount);
    const r = navs?.length ? (mode === "sip" ? sipReturns(navs, amt, years) : lumpSum(navs, amt, years)) : null;
    const pick = (m) => { setMode(m); setAmount(m === "sip" ? "5000" : "50000"); };
    return (
        <Panel title="If you had invested" note="Worked out on this fund's real past NAVs. Past returns don't promise future ones.">
            <div className="flex flex-wrap items-center gap-2 mb-4">
                <div role="group" aria-label="How you invest" className="flex gap-1 p-0.5 rounded-full bg-surface-sunken">
                    {[["sip", "Monthly SIP"], ["lump", "One time"]].map(([k, l]) => (
                        <button key={k} type="button" aria-pressed={mode === k} onClick={() => pick(k)}
                                className={cx("h-8 px-3 rounded-full text-small font-medium", mode === k ? "bg-surface text-ink shadow-sm" : "text-ink-3")}>
                            {l}
                        </button>
                    ))}
                </div>
                <label className="flex items-center gap-1.5 text-small text-ink-3">
                    ₹
                    <input type="number" inputMode="numeric" min="100" step="500" value={amount} aria-label="Amount"
                           onChange={(e) => setAmount(e.target.value)}
                           className="w-24 h-8 px-2 rounded-control bg-surface-sunken border border-line text-ink num" />
                    {mode === "sip" && "a month"}
                </label>
                <div role="group" aria-label="For how long" className="flex gap-1">
                    {[1, 3, 5].map((y) => (
                        <button key={y} type="button" aria-pressed={years === y} onClick={() => setYears(y)}
                                className={cx("h-8 px-3 rounded-full text-small font-medium", years === y ? "bg-surface-sunken text-ink" : "text-ink-3 hover:text-ink")}>
                            {y} yr{y > 1 ? "s" : ""}
                        </button>
                    ))}
                </div>
            </div>
            {navs === null ? (
                <p className="text-small text-ink-3">Loading NAV history…</p>
            ) : !r ? (
                <p className="text-small text-ink-3">{navs.length ? `This fund doesn't have ${years} year${years > 1 ? "s" : ""} of history yet.` : "NAV history is unavailable right now."}</p>
            ) : (
                <Facts>
                    <Fact label="You'd have put in" value={rupees(r.invested)} />
                    <Fact label="Worth today" value={rupees(r.value)} />
                    <Fact label={mode === "sip" ? "XIRR" : "A year"} value={r.perYear != null ? percent(r.perYear, { plus: true }) : "—"}
                          tone={r.gain >= 0 ? "good" : "bad"} />
                </Facts>
            )}
        </Panel>
    );
}

export default function FundPage({ code, name, holding }) {
    const [fund, setFund] = useState(null);
    const [since, setSince] = useState(null);
    const [following, setFollowing] = useState(false);
    useEffect(() => {
        let alive = true;
        API.get(`/discover/funds/${code}`)
            .then((r) => { if (alive) setFund(r.data); })
            .catch(() => { if (alive) setFund({ failed: true }); });
        return () => { alive = false; };
    }, [code]);

    const load = useCallback((range) => API.get(`/discover/funds/${code}/history`, { params: { range } }).then((r) => ({
        change: r.data?.change,
        since: r.data?.since,
        points: (r.data?.points || []).map((p) => ({ label: shortDay(p.date), value: p.nav })),
    })), [code]);
    const onData = useCallback((d) => { if (d.since) setSince(d.since); }, []);

    const follow = async () => {
        try {
            await API.post("/watchlist", { kind: "FUND", symbol: code, name: fund?.name || name });
            setFollowing(true);
            toast.success("Added to your watchlist");
        } catch (e) {
            toast.error(e?.response?.data?.error || "Couldn't add it to your watchlist");
        }
    };

    const title = fund?.name || name || "Fund";
    const { plan, option } = planOf(title);
    const ret = fund?.returns || {};
    const units = holding?.units;
    return (
        <div className="space-y-5">
            <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-caption text-ink-3">{fund?.amc || "Mutual fund"}</p>
                    <h2 className="text-[20px] leading-tight font-[650] text-ink">{title}</h2>
                    <p className="mt-1 text-body text-ink num">
                        <span className="text-[24px] font-[650]">{fund?.nav != null ? inr2(fund.nav) : "—"}</span>
                        <span className="ml-2 text-small text-ink-3">NAV{fund?.nav_date ? ` · ${fund.nav_date}` : ""}</span>
                    </p>
                </div>
                <Button size="sm" variant="secondary" icon={Star} onClick={follow} disabled={following}>{following ? "Following" : "Follow"}</Button>
            </header>

            <Panel>
                <PriceChart load={load} onData={onData} ranges={FUND_RANGES} label="NAV" format={shortInr} />
            </Panel>

            <YourHolding holding={holding} extra={units ? <>
                <Fact label="Units" value={Number(units).toLocaleString("en-IN", { maximumFractionDigits: 3 })} />
                <Fact label="Average NAV" value={inr2(holding.investedAmount / units)} />
            </> : null} />

            <Panel title="Past returns" note="1-year return, then 3 and 5 years a year (annualised), from the NAV history.">
                {fund?.failed ? <p className="text-small text-ink-3">Unavailable right now.</p> : (
                    <Facts>
                        {[["1y", "1 year"], ["3y", "3 years, a year"], ["5y", "5 years, a year"]].map(([k, l]) => (
                            <Fact key={k} label={l} value={ret[k] != null ? percent(ret[k], { plus: true }) : "—"}
                                  tone={ret[k] == null ? undefined : ret[k] >= 0 ? "good" : "bad"} />
                        ))}
                    </Facts>
                )}
            </Panel>

            <Calculator code={code} />

            <Panel title="About this fund"
                   note={plan === "Regular" ? "Regular plans pay a commission out of your returns. The same fund's direct plan costs less each year." : null}>
                <Facts>
                    <Fact label="Category" value={fund?.category?.replace(/^.*Scheme - /, "") || "—"} />
                    <Fact label="Plan" value={plan} />
                    <Fact label="Option" value={option} />
                    <Fact label="Fund age" value={ageOf(since) || "—"} />
                    <Fact label="Scheme code" value={code} />
                    <Fact label="ISIN" value={fund?.isin || "—"} />
                </Facts>
            </Panel>
        </div>
    );
}
