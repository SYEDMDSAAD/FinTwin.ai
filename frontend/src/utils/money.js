// How the dashboard writes money, percentages and periods.
//
// A negative amount gets a real minus sign (U+2212) in front of the rupee
// sign: "−₹2,246", never "₹-2,246".

export const MINUS = "−";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function signed(text, n, plus) {
    if (n < 0) return MINUS + text;
    return plus && n > 0 ? `+${text}` : text;
}

/** ₹ in Indian grouping, whole rupees. `plus` writes "+" on a gain. */
export function rupees(value, { plus = false } = {}) {
    const n = Math.round(Number(value) || 0);
    return signed(`₹${Math.abs(n).toLocaleString("en-IN")}`, n, plus);
}

/** ₹ in lakhs, two places: −₹0.09L. */
export function lakhs(value) {
    const n = Math.round((Number(value) || 0) / 1000) / 100;
    return signed(`₹${Math.abs(n).toFixed(2)}L`, n, false);
}

/** A percentage to one place, trailing zero dropped: −11.5%, 4%, +310.7%. */
export function percent(value, { plus = false } = {}) {
    const n = Math.round((Number(value) || 0) * 10) / 10;
    return signed(`${Math.abs(n)}%`, n, plus);
}

/** "2026-10-01" → a local date, without the UTC shift `new Date(string)` makes. */
function parse(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
    return m ? { y: +m[1], mo: +m[2] - 1, d: +m[3] } : null;
}

/** "1–20 Oct", "1 Oct", or "28 Sep – 3 Oct" across months; "" when unknown. */
export function dayRange(fromIso, toIso) {
    const a = parse(fromIso);
    const b = parse(toIso);
    if (!a || !b) return "";
    if (a.y === b.y && a.mo === b.mo) {
        return a.d === b.d ? `${a.d} ${MONTHS[a.mo]}` : `${a.d}–${b.d} ${MONTHS[a.mo]}`;
    }
    return `${a.d} ${MONTHS[a.mo]} – ${b.d} ${MONTHS[b.mo]}`;
}

/** "24 Jun 2026"; "" when unknown. */
export function longDate(iso) {
    const a = parse(iso);
    return a ? `${a.d} ${MONTHS[a.mo]} ${a.y}` : "";
}

export const GOOD = "#4ade80";
export const BAD = "#f87171";
export const NEUTRAL = "#94a3b8";

/**
 * Green when a change is good, red when it is bad, grey when there is none.
 * Income and savings are good going up; spending is good going down.
 */
export function changeTone(change, goodWhenUp = true) {
    const n = Number(change) || 0;
    if (n === 0) return NEUTRAL;
    return (n > 0) === goodWhenUp ? GOOD : BAD;
}
