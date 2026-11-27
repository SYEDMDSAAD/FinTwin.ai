import { useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, ShoppingBag } from "lucide-react";
import { Button, Progress, cx } from "./ui";
import { rupees } from "../utils/money";

function AffordabilitySection({

    price,
    setPrice,
    analyzeAffordability,
    affordability

}) {

    const [analyzing, setAnalyzing] = useState(false);

    const handleAnalyze = async () => {
        if (analyzing) return;
        setAnalyzing(true);
        try {
            await analyzeAffordability();
        } finally {
            setAnalyzing(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter") handleAnalyze();
    };

    // Verdict derived from the risk + outright-affordability signals the
    // backend already computes — surfaced as one clear headline instead of
    // making the user read three separate stat boxes to figure it out.
    const verdict = affordability && (() => {
        if (!affordability.canAffordOutright) {
            return {
                tone: "bad",
                Icon: XCircle,
                title: "Not affordable outright",
                detail: affordability.monthsToSave > 0
                    ? `Save for about ${affordability.monthsToSave} month${affordability.monthsToSave > 1 ? "s" : ""}, or use the suggested EMI below.`
                    : "Your current savings rate doesn't cover this. Consider the EMI option.",
            };
        }
        if (affordability.risk === "High") {
            return {
                tone: "warn",
                Icon: AlertTriangle,
                title: "Affordable, but risky",
                detail: "This would leave a thin emergency buffer. Consider the EMI option instead of paying outright.",
            };
        }
        if (affordability.risk === "Medium") {
            return {
                tone: "warn",
                Icon: AlertTriangle,
                title: "Affordable, with some strain",
                detail: "You can cover this, but it'll narrow your safety buffer for a few months.",
            };
        }
        return {
            tone: "good",
            Icon: CheckCircle2,
            title: "Comfortably affordable",
            detail: "You can cover this outright without denting your emergency buffer.",
        };
    })();

    // Visual split of "price" vs "what's left" out of total available funds,
    // reconstructed from remainingSavings (= availableFunds - price) since
    // the raw availableFunds figure isn't part of the API response.
    const availableFunds = affordability
        ? affordability.remainingSavings + Number(price || 0)
        : 0;

    const usedPct = affordability && availableFunds > 0
        ? Math.max(0, Math.min(100, (Number(price) / availableFunds) * 100))
        : 0;

    const TEXT = { good: "text-good", warn: "text-warn", bad: "text-bad" };
    const SOFT = { good: "bg-good-soft text-good", warn: "bg-warn-soft text-warn", bad: "bg-bad-soft text-bad" };

    const rows = affordability ? [
        { label: "Risk", value: affordability.risk, cls: TEXT[affordability.risk === "High" ? "bad" : affordability.risk === "Medium" ? "warn" : "good"] },
        { label: "Savings left after", value: rupees(affordability.remainingSavings) },
        {
            label: "Suggested EMI",
            note: affordability.emiMonths
                ? `${affordability.emiMonths} months${affordability.emiAnnualInterestRate ? ` at an assumed ${affordability.emiAnnualInterestRate}% a year` : ""}`
                : null,
            value: `${rupees(affordability.suggestedEMI)} a month`,
        },
        { label: "Average saved a month", value: rupees(affordability.monthlySavingsAvg), cls: affordability.monthlySavingsAvg < 0 ? "text-bad" : "" },
    ] : [];

    return (
        <section aria-label="Can I afford this?" className="max-w-2xl mb-10 lg:sticky lg:top-6">
            <div className="rounded-card bg-surface border border-line p-5">
                <div className="flex items-center gap-3">
                    <span className="shrink-0 w-10 h-10 rounded-full bg-surface-sunken text-ink-2 flex items-center justify-center">
                        <ShoppingBag size={18} aria-hidden />
                    </span>
                    <div>
                        <h2 className="text-heading text-ink">Can I afford this?</h2>
                        <p className="text-small text-ink-3">Checked against your savings and spending</p>
                    </div>
                </div>

                <div className="mt-4 flex gap-2">
                    <div className="relative flex-1 min-w-0">
                        <span aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-3">₹</span>
                        <input
                            type="number"
                            inputMode="numeric"
                            placeholder="Price"
                            aria-label="Price"
                            value={price}
                            onChange={(e) => setPrice(e.target.value)}
                            onKeyDown={handleKeyDown}
                            className="no-spinner w-full h-11 rounded-control bg-surface-sunken border border-transparent pl-7 pr-3 text-body text-ink num placeholder:text-ink-3 focus:outline-none focus:border-accent"
                        />
                    </div>
                    <Button onClick={handleAnalyze} disabled={analyzing || !price} className="shrink-0">
                        {analyzing ? "Checking…" : "Check"}
                    </Button>
                </div>

                {affordability && verdict && (
                    <div className="mt-5 flex items-start gap-3">
                        <span className={cx("shrink-0 w-10 h-10 rounded-full flex items-center justify-center", SOFT[verdict.tone])}>
                            <verdict.Icon size={18} aria-hidden />
                        </span>
                        <div className="min-w-0">
                            <p className={cx("text-body font-semibold", TEXT[verdict.tone])}>{verdict.title}</p>
                            <p className="text-small text-ink-2 mt-0.5">{verdict.detail}</p>
                        </div>
                    </div>
                )}

                {affordability && availableFunds > 0 && (
                    <div className="mt-5">
                        <div className="flex justify-between text-small text-ink-3 mb-2 num">
                            <span>{rupees(price)} price</span>
                            <span>{rupees(availableFunds)} available</span>
                        </div>
                        <Progress value={usedPct} tone={usedPct >= 80 ? "bad" : usedPct >= 50 ? "warn" : "good"} label="Share of savings used" />
                        <p className="text-small text-ink-3 mt-2">Uses {usedPct.toFixed(0)}% of your available savings.</p>
                    </div>
                )}
            </div>

            {affordability && (
                <ul className="mt-4 rounded-card bg-surface border border-line divide-y divide-line">
                    {rows.map((r) => (
                        <li key={r.label} className="flex items-center justify-between gap-3 px-4 py-3.5">
                            <span className="min-w-0">
                                <span className="block text-body text-ink">{r.label}</span>
                                {r.note && <span className="block text-small text-ink-3">{r.note}</span>}
                            </span>
                            <span className={cx("shrink-0 text-body font-semibold num text-ink", r.cls)}>{r.value}</span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

export default AffordabilitySection;
