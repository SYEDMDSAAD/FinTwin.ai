/**
 * How many months of history an analytics period needs, so the page can ask
 * the server for exactly that (0 = everything the user has imported). The
 * dashboard only holds the last few months; a year-long chart fetches its own.
 */
export function monthsNeeded(period, customStart, today = new Date()) {
    if (period === "This month") return 1;
    if (period === "Last month") return 2;
    if (period === "This year") return today.getMonth() + 1;
    if (period === "Last 12 months") return 12;
    if (period === "All time") return 0;
    if (period === "Custom" && customStart) {
        const from = new Date(customStart);
        if (!Number.isNaN(from.getTime())) {
            const months = (today.getFullYear() - from.getFullYear()) * 12
                + (today.getMonth() - from.getMonth()) + 1;
            return months > 0 ? months : 1;
        }
    }
    return 3;
}
