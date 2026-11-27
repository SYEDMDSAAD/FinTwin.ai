/*
 * Future Twin maths: what a portfolio and a monthly amount grow to at an
 * assumed yearly return, compounded monthly. Assumed, not promised: the
 * page always says so.
 */

export const RATES = [6, 8, 10, 12];
export const HORIZONS = [5, 10, 20];

/** Value after `years` of a starting sum plus `monthly` added at each month's end. */
export function grow(start, monthly, ratePct, years) {
    const n = Math.round(years * 12);
    const i = Math.pow(1 + ratePct / 100, 1 / 12) - 1;
    if (i === 0) return start + monthly * n;
    const f = Math.pow(1 + i, n);
    return start * f + monthly * ((f - 1) / i);
}

/** The twin's extra each month from the habits the user counts. */
export function twinExtra(inputs, { roundUps = true, pauses = true, extra = 0 } = {}) {
    return (roundUps ? inputs?.roundUps?.amount || 0 : 0)
        + (pauses ? inputs?.pausedThisMonth || 0 : 0)
        + (Number(extra) || 0);
}

/** Year-by-year values for you and your twin, for the chart. */
export function series(inputs, options, ratePct, years) {
    const start = inputs?.portfolioValue || 0;
    const sip = inputs?.sipMonthly || 0;
    const extra = twinExtra(inputs, options);
    const out = [];
    for (let y = 0; y <= years; y++) {
        out.push({ year: y, you: Math.round(grow(start, sip, ratePct, y)), twin: Math.round(grow(start, sip + extra, ratePct, y)) });
    }
    return out;
}
