import { Sparkles } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Cell } from "recharts";
import { rupees } from "../utils/money";
import { xAxis, yAxis, grid, ChartTooltip, tooltipCursor, cx } from "./ui";

/* Next month's spending, predicted from the last three, with the months it came from. */

const monthLabel = (ym) => new Date(`${ym}-01T00:00:00`).toLocaleString("en-IN", { month: "short" });

function ForecastCard({ forecast, monthlyHistory }) {
    if (!forecast) return null;

    const history = (monthlyHistory || []).slice(-3);
    const last = history[history.length - 1];
    const next = last
        ? new Date(new Date(`${last.month}-01T00:00:00`).setMonth(new Date(`${last.month}-01T00:00:00`).getMonth() + 1))
        : new Date(new Date().setMonth(new Date().getMonth() + 1));
    const nextLabel = next.toLocaleString("en-IN", { month: "short" });

    const data = [
        ...history.map((h) => ({ month: monthLabel(h.month), amount: h.expense, forecast: false })),
        { month: nextLabel, amount: forecast.predictedExpenses || 0, forecast: true },
    ];

    const over = forecast.predictedSavings < 0;
    const growth = Number(forecast.expenseGrowth) || 0;

    return (
        <section aria-label="Next month" className="max-w-2xl mb-8">
            <div className="rounded-card bg-surface border border-line p-5">
                <p className="text-small text-ink-3">Next month's spending, predicted</p>
                <p className="text-display text-ink num mt-1">{rupees(forecast.predictedExpenses)}</p>
                <p className="text-small text-ink-3 mt-1">
                    {growth === 0 ? "About the same as recent months" : `${growth > 0 ? "Up" : "Down"} ${Math.abs(growth)}% on recent months`}
                </p>

                <div className="h-44 mt-5 -ml-2">
                    <ResponsiveContainer initialDimension={{ width: 320, height: 176 }} width="100%" height="100%">
                        <BarChart data={data} barCategoryGap="28%">
                            <CartesianGrid {...grid} />
                            <XAxis {...xAxis} dataKey="month" />
                            <YAxis {...yAxis} />
                            <Tooltip cursor={tooltipCursor} content={<ChartTooltip />} />
                            <Bar dataKey="amount" radius={[6, 6, 6, 6]} maxBarSize={44}>
                                {data.map((d) => (
                                    <Cell key={d.month} fill={d.forecast ? "var(--accent)" : "var(--border-card-hover)"} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="flex gap-4 text-caption text-ink-3 mt-1">
                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: "var(--border-card-hover)" }} /> Spent</span>
                    <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-accent" /> Predicted</span>
                </div>
            </div>

            <ul className="mt-4 rounded-card bg-surface border border-line divide-y divide-line">
                <li className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <span className="min-w-0">
                        <span className="block text-body text-ink">{over ? "Likely overspend" : "Likely left over"}</span>
                        <span className="block text-small text-ink-3">{over ? "Spending on track to pass income" : "Income minus predicted spending"}</span>
                    </span>
                    <span className={cx("text-body font-semibold num", over ? "text-bad" : "text-good")}>
                        {rupees(Math.abs(forecast.predictedSavings || 0))}
                    </span>
                </li>
                {forecast.insight && (
                    <li className="flex items-start gap-3 px-4 py-3.5">
                        <Sparkles size={16} aria-hidden className="shrink-0 mt-0.5 text-accent" />
                        <span className="text-small text-ink-2">{forecast.insight}</span>
                    </li>
                )}
            </ul>
        </section>
    );
}

export default ForecastCard;
