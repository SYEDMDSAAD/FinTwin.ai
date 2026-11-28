import { cx } from "../ui";
import { rupees, percent } from "../../utils/money";

/* Small pieces shared by the holding pages. */

export function Fact({ label, value, tone }) {
    return (
        <div className="min-w-0">
            <dt className="text-caption text-ink-3">{label}</dt>
            <dd className={cx("text-body font-semibold num truncate", tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink")}>
                {value ?? "—"}
            </dd>
        </div>
    );
}

export function Facts({ children, cols = 3 }) {
    return <dl className={cx("grid gap-x-4 gap-y-3", cols === 2 ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-3")}>{children}</dl>;
}

export function Panel({ title, children, note, className }) {
    return (
        <section aria-label={title} className={cx("rounded-card bg-surface border border-line p-5", className)}>
            {title && <h3 className="text-body font-semibold text-ink mb-3">{title}</h3>}
            {children}
            {note && <p className="text-caption text-ink-3 mt-3">{note}</p>}
        </section>
    );
}

/** The user's own position in a holding: what went in, what it's worth, the gain. */
export function YourHolding({ holding, extra }) {
    if (!holding) return null;
    const gain = (holding.currentValue ?? 0) - (holding.investedAmount ?? 0);
    const pct = holding.investedAmount ? (gain / holding.investedAmount) * 100 : null;
    return (
        <Panel title="Your holding">
            <Facts>
                <Fact label="Invested" value={rupees(holding.investedAmount)} />
                <Fact label="Worth now" value={rupees(holding.currentValue)} />
                <Fact label="Returns" value={`${rupees(gain, { plus: true })}${pct != null ? ` · ${percent(pct, { plus: true })}` : ""}`}
                      tone={gain >= 0 ? "good" : "bad"} />
                {holding.xirr != null && <Fact label="XIRR" value={`${holding.xirr}% a year${holding.xirrEstimated ? " (est.)" : ""}`} />}
                {holding.purchaseDate && <Fact label="Since" value={new Date(`${holding.purchaseDate}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })} />}
                {extra}
            </Facts>
        </Panel>
    );
}
