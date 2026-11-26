import { lakhs, longDate } from "../utils/money";
import { SectionHeader, cx } from "./ui";
import { softenCaps } from "./EnhancedTransactionsTable";

/* The last 3 months (this month and the two before it), as one list. */

const cleanMerchant = (name) => {
    if (!name) return "—";
    // Strip UPI-style prefixes like "CARD/CR/123456/MerchantName/CODE"
    const parts = name.split("/");
    return softenCaps(parts.length >= 4 ? parts[3] : name);
};

function MonthlySummaryCard({ summary }) {
    if (!summary) return null;

    const rows = [
        { label: "Money in", value: lakhs(summary.income), cls: "text-good" },
        { label: "Money out", value: lakhs(summary.expenses) },
        { label: summary.savings < 0 ? "Overspent" : "Saved", value: lakhs(summary.savings), cls: summary.savings < 0 ? "text-bad" : "" },
        { label: "Biggest category", value: summary.topCategory || "—" },
        { label: "Paid most to", value: cleanMerchant(summary.topMerchant), title: summary.topMerchant },
        { label: "Transactions", value: String(summary.transactionCount ?? 0) },
    ];

    return (
        <section aria-label="Last 3 months" className="max-w-2xl mb-8">
            <SectionHeader title="Last 3 months" subtitle={summary.periodFrom ? `Since ${longDate(summary.periodFrom)}` : null} />
            <ul className="rounded-card bg-surface border border-line divide-y divide-line">
                {rows.map((r) => (
                    <li key={r.label} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="text-body text-ink-2">{r.label}</span>
                        <span className={cx("min-w-0 truncate text-body font-semibold text-ink num", r.cls)} title={r.title}>{r.value}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

export default MonthlySummaryCard;
