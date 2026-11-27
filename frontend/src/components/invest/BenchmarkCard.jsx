import { useEffect, useState } from "react";
import API from "../../services/api";
import { cx } from "../ui";
import { percent } from "../../utils/money";
import { benchmarkFor, compare } from "../../utils/benchmark";
import { Panel } from "./parts";

/*
 * "Your funds against the index": each equity fund's past return next to
 * the plain index fund for its market, over the longest period both have.
 * A laggard gets one plain sentence. Never "switch to" anything.
 */

const PERIOD = { "1y": "1 year", "3y": "3 years", "5y": "5 years" };

export default function BenchmarkCard({ details }) {
    const marks = [...new Set((details || []).map((d) => benchmarkFor(d.fund?.category)?.code).filter(Boolean))];
    const markKey = marks.join(",");
    const [index, setIndex] = useState({ key: null, byCode: {} });

    useEffect(() => {
        if (!markKey) return;
        let alive = true;
        Promise.all(markKey.split(",").map((c) => API.get(`/discover/funds/${c}`).then((r) => [c, r.data]).catch(() => [c, null])))
            .then((pairs) => { if (alive) setIndex({ key: markKey, byCode: Object.fromEntries(pairs) }); });
        return () => { alive = false; };
    }, [markKey]);

    if (!details || details.length === 0) return null;
    const ready = !markKey || index.key === markKey;
    const rows = ready ? details.map(({ holding, fund }) => {
        const mark = benchmarkFor(fund?.category);
        const cmp = mark ? compare(fund?.returns, index.byCode[mark.code]?.returns) : null;
        return { holding, mark, cmp };
    }).filter((r) => r.cmp) : null;
    if (rows && rows.length === 0) return null;
    const laggards = (rows || []).filter((r) => r.cmp.lagging);
    return (
        <Panel title="Your funds against the index"
               note="Each fund's past return a year, next to the plain index fund for its market over the same period. Past returns, not a forecast; not a recommendation to buy or sell.">
            {!rows ? <p className="text-small text-ink-3">Comparing past returns…</p> : (
                <>
                    {laggards.length > 0 && (
                        <p className="mb-3 rounded-control bg-warn/10 px-3 py-2 text-small text-ink">
                            {laggards[0].holding.name} trailed the {laggards[0].mark.name} by {Math.abs(laggards[0].cmp.gap)} points a year
                            over {PERIOD[laggards[0].cmp.period]}.{laggards.length > 1 ? ` ${laggards.length - 1} more fund${laggards.length > 2 ? "s" : ""} did too.` : ""}
                        </p>
                    )}
                    <ul className="divide-y divide-line">
                        {rows.map(({ holding, mark, cmp }) => (
                            <li key={holding.id} className="py-2.5 flex items-center gap-3">
                                <span className="min-w-0 flex-1">
                                    <span className="block text-body text-ink truncate">{holding.name}</span>
                                    <span className="block text-caption text-ink-3">vs {mark.name} · {PERIOD[cmp.period]}, a year</span>
                                </span>
                                <span className="text-right num">
                                    <span className="block text-small text-ink">{percent(cmp.fund, { plus: true })} <span className="text-ink-3">vs {percent(cmp.index, { plus: true })}</span></span>
                                    <span className={cx("block text-caption font-semibold", cmp.gap >= 0 ? "text-good" : cmp.lagging ? "text-bad" : "text-ink-3")}>
                                        {cmp.gap >= 0 ? "ahead by " : "behind by "}{Math.abs(cmp.gap)} pts
                                    </span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </Panel>
    );
}
