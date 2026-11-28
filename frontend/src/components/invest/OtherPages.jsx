import { useEffect, useState } from "react";
import API from "../../services/api";
import { cx } from "../ui";
import { rupees, percent } from "../../utils/money";
import { IPO_STATUSES } from "../../constants/investments";
import { fdValue, ipoSteps, ipoMinimum, inr2 } from "../../utils/investMath";
import { Fact, Facts, Panel, YourHolding } from "./parts";

/*
 * Pages for holdings without a market price: deposits (FD, PPF, bonds),
 * IPO applications, and anything else (gold, NPS, crypto, other).
 */

const longDay = (iso) => iso ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

/** FD / PPF / bonds: interest so far and what it grows to, like INDmoney's FD view. */
export function DepositPage({ holding }) {
    const yearly = holding.type === "PPF";
    const fd = fdValue(holding.investedAmount, holding.interestRate, holding.purchaseDate, new Date(), yearly ? 1 : 4);
    return (
        <div className="space-y-5">
            <header>
                <p className="text-caption text-ink-3">{holding.type}</p>
                <h2 className="text-[20px] leading-tight font-[650] text-ink">{holding.name}</h2>
                <p className="mt-1 num"><span className="text-[24px] font-[650] text-ink">{rupees(fd?.today ?? holding.currentValue)}</span>
                    <span className="ml-2 text-small text-ink-3">worth today</span></p>
            </header>
            {!fd ? (
                <Panel title="Add the rate and start date"
                       note="Edit this holding and add its interest rate and the date it started, and FinTwin works out the interest.">
                    <Facts><Fact label="Amount" value={rupees(holding.investedAmount)} /></Facts>
                </Panel>
            ) : (
                <>
                    <Panel title="So far" note={yearly
                        ? "PPF interest is added once a year. Worked out at today's rate; the government resets it every quarter."
                        : "Banks add FD interest every quarter. Interest is taxed as income, and the bank may deduct TDS."}>
                        <Facts>
                            <Fact label="Put in" value={rupees(holding.investedAmount)} />
                            <Fact label="Rate" value={`${holding.interestRate}% a year`} />
                            <Fact label="Started" value={longDay(holding.purchaseDate)} />
                            <Fact label="Interest earned" value={rupees(fd.interest, { plus: true })} tone="good" />
                            <Fact label="Held for" value={`${fd.heldYears} yr${fd.heldYears === 1 ? "" : "s"}`} />
                        </Facts>
                    </Panel>
                    <Panel title="If it stays at this rate">
                        <ol className="relative grid grid-cols-3 gap-3">
                            {fd.ahead.map((a) => (
                                <li key={a.years} className="rounded-control bg-surface-sunken p-3">
                                    <p className="text-caption text-ink-3">In {a.years} yr{a.years > 1 ? "s" : ""}</p>
                                    <p className="text-body font-semibold text-ink num">{rupees(a.value)}</p>
                                </li>
                            ))}
                        </ol>
                    </Panel>
                </>
            )}
        </div>
    );
}

/** An IPO application: status, the four dates, price band and lot, like Groww's IPO page. */
export function IpoPage({ holding }) {
    const [ipo, setIpo] = useState(undefined);
    useEffect(() => {
        let alive = true;
        API.get("/discover/ipos")
            .then((r) => { if (alive) setIpo((Array.isArray(r.data) ? r.data : []).find((i) => i.id === holding.ipoListingId) || null); })
            .catch(() => { if (alive) setIpo(null); });
        return () => { alive = false; };
    }, [holding.ipoListingId]);

    const status = IPO_STATUSES.find((s) => s.value === holding.ipoStatus);
    const [statusName, statusNote] = (status?.label || "Applied").split(" — ");
    const steps = ipoSteps(ipo);
    const listed = holding.ipoStatus === "LISTED";
    const gain = (holding.currentValue ?? 0) - (holding.investedAmount ?? 0);
    return (
        <div className="space-y-5">
            <header>
                <p className="text-caption text-ink-3">IPO{ipo?.category ? ` · ${ipo.category}` : ""}</p>
                <h2 className="text-[20px] leading-tight font-[650] text-ink">{holding.name}</h2>
                <p className="mt-2"><span className={cx("inline-flex h-7 items-center px-3 rounded-full text-small font-semibold",
                    listed ? "bg-good/10 text-good" : holding.ipoStatus === "NOT_ALLOTTED" ? "bg-surface-sunken text-ink-3" : "bg-accent/10 text-accent")}>
                    {statusName}</span>{statusNote && <span className="ml-2 text-small text-ink-3">{statusNote}</span>}</p>
            </header>

            {steps.length > 0 && (
                <Panel title="Timeline">
                    <ol className="grid grid-cols-4 gap-2">
                        {steps.map((s) => (
                            <li key={s.label} className="min-w-0">
                                <span className={cx("block h-1.5 rounded-full mb-2", s.done ? "bg-accent" : "bg-surface-sunken")} />
                                <span className="block text-caption text-ink-3">{s.label}</span>
                                <span className="block text-small font-semibold text-ink num truncate">{s.date ? longDay(s.date).replace(/ \d{4}$/, "") : "—"}</span>
                            </li>
                        ))}
                    </ol>
                </Panel>
            )}

            <Panel title="The issue">
                {ipo === undefined ? <p className="text-small text-ink-3">Loading…</p> : !ipo ? (
                    <p className="text-small text-ink-3">This IPO isn't in the catalogue any more.</p>
                ) : (
                    <Facts>
                        <Fact label={ipo.issuePrice ? "Issue price" : "Price band"} value={ipo.issuePrice ? inr2(ipo.issuePrice)
                            : ipo.priceBandLow != null ? `${rupees(ipo.priceBandLow)}–${rupees(ipo.priceBandHigh)}` : "—"} />
                        <Fact label="Lot" value={ipo.lotSize ? `${ipo.lotSize} shares` : "—"} />
                        <Fact label="Minimum" value={ipoMinimum(ipo) ? rupees(ipoMinimum(ipo)) : "—"} />
                        {ipo.symbol && <Fact label="Symbol" value={ipo.symbol} />}
                    </Facts>
                )}
            </Panel>

            <Panel title={listed ? "Your shares" : "Your application"}>
                <Facts>
                    <Fact label={listed ? "Paid" : "Blocked"} value={rupees(holding.investedAmount)} />
                    {listed && <Fact label="Worth now" value={rupees(holding.currentValue)} />}
                    {listed && <Fact label="Listing gain so far" tone={gain >= 0 ? "good" : "bad"}
                                     value={`${rupees(gain, { plus: true })}${holding.investedAmount ? ` · ${percent(gain / holding.investedAmount * 100, { plus: true })}` : ""}`} />}
                </Facts>
            </Panel>
        </div>
    );
}

/** Gold, NPS, crypto and anything else: the plain facts. */
export function BasicPage({ holding, hint }) {
    return (
        <div className="space-y-5">
            <header>
                <p className="text-caption text-ink-3">{holding.type}</p>
                <h2 className="text-[20px] leading-tight font-[650] text-ink">{holding.name}</h2>
                <p className="mt-1 num"><span className="text-[24px] font-[650] text-ink">{rupees(holding.currentValue)}</span>
                    <span className="ml-2 text-small text-ink-3">worth now</span></p>
            </header>
            <YourHolding holding={holding} extra={holding.units ? <Fact label="Units" value={Number(holding.units).toLocaleString("en-IN", { maximumFractionDigits: 4 })} /> : null} />
            {holding.notes && <Panel title="Notes"><p className="text-small text-ink-2 whitespace-pre-line">{holding.notes}</p></Panel>}
            {hint && <p className="text-small text-ink-3 px-1">{hint}</p>}
        </div>
    );
}
