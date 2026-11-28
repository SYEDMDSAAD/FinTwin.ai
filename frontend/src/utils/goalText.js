/* A goal from a sentence: "Goa trip in March, 40k", "save 2 lakh for a bike
   in 18 months", "emergency fund ₹1.5L by Dec 2027". Fills the goal form;
   the user checks it and taps create. Runs on the phone, nothing is sent. */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const UNIT = { k: 1e3, thousand: 1e3, l: 1e5, lac: 1e5, lacs: 1e5, lakh: 1e5, lakhs: 1e5, cr: 1e7, crore: 1e7, crores: 1e7 };

const AMOUNT = /(?:₹|\brs\.?|\binr)?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakhs?|lacs?|l|crores?|cr)?\b/gi;
const IN_PERIOD = /\b(?:in|within|over|for)?\s*(\d+(?:\.\d+)?)\s*(months?|mos?|years?|yrs?)\b/i;
const BY_MONTH = /\b(?:by|in|before|till|until)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:\s*,?\s*('?\d{2}|\d{4}))?\b/i;
const BY_YEAR = /\b(?:by|in|before)\s+(20\d{2})\b/i;
const NEXT_YEAR = /\bnext\s+year\b/i;
const FILLER = /\b(i|want|wanna|need|to|save|saving|savings|for|a|an|the|of|my|by|in|before|till|until|within|over|goal|rupees|rs|inr)\b/gi;

function monthsUntil(year, monthIndex, now) {
    return Math.max(1, (year - now.getFullYear()) * 12 + (monthIndex - now.getMonth()));
}

/** { title, targetAmount, durationMonths }, each null when the sentence doesn't say. */
export function parseGoalText(text, now = new Date()) {
    let rest = ` ${text || ""} `;
    let durationMonths = null;

    const period = rest.match(IN_PERIOD);
    if (period) {
        const n = Number(period[1]);
        durationMonths = Math.max(1, Math.round(/^y/i.test(period[2]) ? n * 12 : n));
        rest = rest.replace(period[0], " ");
    } else {
        const byMonth = rest.match(BY_MONTH);
        const byYear = rest.match(BY_YEAR);
        if (byMonth) {
            const m = MONTHS.indexOf(byMonth[1].slice(0, 3).toLowerCase());
            let year;
            if (byMonth[2]) {
                const y = byMonth[2].replace("'", "");
                year = y.length === 2 ? 2000 + Number(y) : Number(y);
            } else {
                year = m > now.getMonth() ? now.getFullYear() : now.getFullYear() + 1;
            }
            durationMonths = monthsUntil(year, m, now);
            rest = rest.replace(byMonth[0], " ");
        } else if (byYear) {
            durationMonths = monthsUntil(Number(byYear[1]), 0, now);
            rest = rest.replace(byYear[0], " ");
        } else if (NEXT_YEAR.test(rest)) {
            durationMonths = 12;
            rest = rest.replace(NEXT_YEAR, " ");
        }
    }

    // The biggest amount mentioned is the target ("2 lakh bike, 5k a month" → 2 lakh)
    let targetAmount = null;
    let amountText = null;
    for (const m of rest.matchAll(AMOUNT)) {
        const value = Number(m[1].replace(/,/g, "")) * (m[2] ? UNIT[m[2].toLowerCase()] : 1);
        if (!m[2] && value < 100) continue;          // "2 bikes", not ₹2
        if (targetAmount == null || value > targetAmount) {
            targetAmount = Math.round(value);
            amountText = m[0];
        }
    }
    if (amountText) rest = rest.replace(amountText, " ");

    const words = rest.replace(/[₹,.;:!?()-]/g, " ").replace(FILLER, " ").replace(/\s+/g, " ").trim();
    const title = words ? words.charAt(0).toUpperCase() + words.slice(1) : null;
    return { title: title && title.length >= 2 ? title.slice(0, 100) : null, targetAmount, durationMonths };
}
