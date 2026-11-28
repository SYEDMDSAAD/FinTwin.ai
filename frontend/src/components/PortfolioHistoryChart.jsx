import { useEffect, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import API from "../services/api";
import { SectionHeader, xAxis, yAxis, grid, ChartTooltip } from "./ui";

/*
 * Value over time for the funds that came from a statement: what they were
 * worth at each month's end against the money put in. Shown only once there
 * are at least three months to draw.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const label = (ym) => {
    const [y, m] = ym.split("-");
    return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
};

export default function PortfolioHistoryChart({ refreshKey }) {
    const [history, setHistory] = useState(null);

    useEffect(() => {
        let live = true;
        API.get("/portfolio/history").then((r) => { if (live) setHistory(r.data); }).catch(() => {});
        return () => { live = false; };
    }, [refreshKey]);

    const points = (history?.months || []).map((p) => ({ ...p, label: label(p.month) }));
    if (points.length < 3) return null;

    return (
        <section aria-label="Value over time" className="mb-6">
            <SectionHeader title="Value over time" />
            <div className="rounded-card bg-surface border border-line p-4">
                <div className="h-48 -ml-2">
                    <ResponsiveContainer initialDimension={{ width: 320, height: 192 }} width="100%" height="100%">
                        <AreaChart data={points}>
                            <CartesianGrid {...grid} />
                            <XAxis {...xAxis} dataKey="label" />
                            <YAxis {...yAxis} />
                            <Tooltip content={<ChartTooltip />} />
                            <Area type="monotone" dataKey="value" name="Worth" stroke="var(--accent)" fill="var(--accent)" fillOpacity={0.12} strokeWidth={2} />
                            <Line type="stepAfter" dataKey="invested" name="Put in" stroke="var(--text-dim)" strokeDasharray="4 3" dot={false} strokeWidth={1.5} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex gap-4 text-caption text-ink-3 mt-1">
                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent" /> Worth</span>
                    <span className="inline-flex items-center gap-1.5"><span className="w-3 border-t border-dashed border-ink-3" /> Put in</span>
                    <span className="ml-auto">{history.funds} {history.funds === 1 ? "fund" : "funds"} from your statement</span>
                </div>
            </div>
        </section>
    );
}
