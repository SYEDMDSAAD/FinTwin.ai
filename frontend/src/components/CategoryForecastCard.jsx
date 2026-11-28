import { Sparkles } from "lucide-react";
import { rupees } from "../utils/money";
import { SectionHeader, SERIES } from "./ui";

/* Next month's spending by category: one split bar, then the categories. */

function CategoryForecastCard({ categoryForecast }) {
    if (!categoryForecast || categoryForecast.length === 0) return null;

    const items = [...categoryForecast].sort((a, b) => b.predictedAmount - a.predictedAmount);
    const total = items.reduce((sum, item) => sum + item.predictedAmount, 0);
    const color = (i) => SERIES[Math.min(i, SERIES.length - 1)];
    const share = (v) => (total > 0 ? (v / total) * 100 : 0);

    return (
        <section aria-label="Next month by category" className="max-w-2xl mb-8">
            <SectionHeader title="Next month by category" subtitle="Predicted from your recent spending" />
            <div className="rounded-card bg-surface border border-line">
                <div className="px-4 pt-4 pb-3">
                    <div className="flex items-baseline justify-between gap-3">
                        <p className="text-title text-ink num">{rupees(total)}</p>
                        <span className="inline-flex items-center gap-1 text-small text-ink-3"><Sparkles size={14} aria-hidden className="text-accent" /> Forecast</span>
                    </div>
                    <div className="mt-3 flex h-2 gap-0.5 rounded-full overflow-hidden" aria-hidden>
                        {items.map((item, i) => (
                            <div key={item.category} style={{ width: `${share(item.predictedAmount)}%`, background: color(i), minWidth: 3 }} />
                        ))}
                    </div>
                </div>
                <ul className="divide-y divide-line border-t border-line">
                    {items.map((item, i) => (
                        <li key={item.category} className="flex items-center gap-3 px-4 py-3">
                            <span aria-hidden className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color(i) }} />
                            <span className="flex-1 min-w-0 truncate text-body text-ink">{item.category}</span>
                            <span className="text-small text-ink-3 num w-10 text-right">{Math.round(share(item.predictedAmount))}%</span>
                            <span className="text-body font-semibold text-ink num w-20 text-right">{rupees(item.predictedAmount)}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
}

export default CategoryForecastCard;
