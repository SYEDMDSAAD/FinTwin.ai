import { RefreshCw, CheckCircle2 } from "lucide-react";
import { SectionHeader, List, ListRow, cx } from "./ui";
import { softenCaps } from "./EnhancedTransactionsTable";

const inr = (value) =>
    "₹" + Math.round(value || 0).toLocaleString("en-IN");

// "in 3 days" reads better than a date when a charge is imminent, which is
// exactly when someone still has time to cancel it.
export function describeNextCharge(nextChargeDate) {

    if (!nextChargeDate) return null;

    const next  = new Date(nextChargeDate + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (Number.isNaN(next.getTime())) return null;

    const days = Math.round((next - today) / 86400000);

    if (days <= 0) return "due now";
    if (days === 1) return "tomorrow";
    if (days <= 14) return `in ${days} days`;

    return next.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

const CADENCE = { weekly: "Weekly", monthly: "Monthly", quarterly: "Every 3 months", yearly: "Yearly", annual: "Yearly" };

function RecurringExpenses({ recurringExpenses = [] }) {
    const active = recurringExpenses.filter((e) => e.active !== false);

    // What these cost over the next twelve months if nothing changes: the
    // number that makes a ₹199 subscription feel like a decision.
    const annualTotal = active.reduce((sum, e) => sum + (e.annualisedCost || 0), 0);

    return (
        <section aria-label="Recurring payments" className="mb-8">
            <SectionHeader
                title="Recurring payments"
                subtitle="Subscriptions, bills and EMIs"
                action={active.length > 0 && (
                    <span className="text-right">
                        <span className="block text-body font-semibold text-ink num">{inr(annualTotal)}</span>
                        <span className="block text-caption text-ink-3">
                            a year across {active.length} {active.length === 1 ? "charge" : "charges"}
                        </span>
                    </span>
                )}
            />

            {recurringExpenses.length === 0 ? (
                <List>
                    <ListRow icon={CheckCircle2} tone="good" title="No recurring expenses detected" subtitle="They show up here once found" />
                </List>
            ) : (
                <ul className="rounded-card bg-surface border border-line divide-y divide-line">
                    {recurringExpenses.map((expense, index) => {
                        const lapsed = expense.active === false;
                        const due = describeNextCharge(expense.nextChargeDate);
                        const cadence = expense.cadence ? (CADENCE[expense.cadence.toLowerCase()] || expense.cadence) : null;
                        return (
                            <li key={index} className={cx("flex items-start gap-3 px-4 py-3.5", lapsed && "opacity-60")}>
                                <span aria-hidden className="shrink-0 w-10 h-10 rounded-full bg-surface-sunken text-ink-2 flex items-center justify-center">
                                    <RefreshCw size={16} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block text-body text-ink truncate">{softenCaps(expense.merchant)}</span>
                                    <span className="block text-small text-ink-3">
                                        {lapsed ? (
                                            "No charge in a while, possibly cancelled"
                                        ) : (
                                            <>
                                                {cadence && <>{cadence} · </>}
                                                next <span className="text-ink-2 font-medium">{due || "—"}</span>
                                            </>
                                        )}
                                    </span>
                                </span>
                                <span className="shrink-0 text-right">
                                    <span className="block text-body font-semibold text-ink num">
                                        {expense.amountVaries && <span className="text-small font-normal text-ink-3 mr-1">approx</span>}
                                        {inr(expense.amount)}
                                    </span>
                                    {expense.annualisedCost > 0 && (
                                        <span className="block text-small text-ink-3 num">{inr(expense.annualisedCost)} a year</span>
                                    )}
                                </span>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

export default RecurringExpenses;
