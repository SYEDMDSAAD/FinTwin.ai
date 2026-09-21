// Parsing for bank and credit-card statement exports.
//
// Real statement files are not tidy CSV: banks put 10-20 lines of account
// details above the table, use Windows line endings, wrap long narrations
// inside quotes, write amounts as "1,250.00 Dr", and use a dozen date styles.
// Everything here is pure so each of those cases is pinned down by a test.

const DELIMITERS = [",", "\t", ";", "|"];

/** Splits delimited text into rows of cells, honouring quotes. */
export function parseDelimited(text, delimiter) {
    const src = text.replace(/^\uFEFF/, "");
    const delim = delimiter ?? sniffDelimiter(src);
    const rows = [];
    let row = [];
    let cell = "";
    let inQuotes = false;

    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (inQuotes) {
            if (ch === '"') {
                if (src[i + 1] === '"') { cell += '"'; i++; }   // escaped quote
                else inQuotes = false;
            } else {
                cell += ch;                                       // newlines stay inside the cell
            }
        } else if (ch === '"') {
            inQuotes = true;
        } else if (ch === delim) {
            row.push(cell.trim());
            cell = "";
        } else if (ch === "\n" || ch === "\r") {
            if (ch === "\r" && src[i + 1] === "\n") i++;
            row.push(cell.trim());
            rows.push(row);
            row = [];
            cell = "";
        } else {
            cell += ch;
        }
    }
    if (cell !== "" || row.length > 0) {
        row.push(cell.trim());
        rows.push(row);
    }
    return rows.filter(r => r.some(c => c !== ""));
}

/** Picks the delimiter that splits the most early lines into the most columns. */
export function sniffDelimiter(text) {
    const sample = text.split(/\r?\n/).slice(0, 40).join("\n");
    let best = ",";
    let bestScore = 0;
    for (const d of DELIMITERS) {
        const score = parseDelimited(sample, d)
            .reduce((sum, r) => sum + (r.length > 1 ? r.length : 0), 0);
        if (score > bestScore) { best = d; bestScore = score; }
    }
    return best;
}

const HEADER_WORDS = [
    "date", "narration", "description", "particulars", "details", "remarks",
    "amount", "debit", "withdrawal", "credit", "deposit", "balance",
    "transaction", "txn", "chq", "ref", "value",
];

/**
 * Index of the row holding the column names — the first row among the top
 * of the file that reads most like a header, skipping the bank's preamble.
 */
export function findHeaderRow(rows) {
    let bestIdx = 0;
    let bestHits = 0;
    rows.slice(0, 40).forEach((row, idx) => {
        const hits = row.filter(cell => {
            const c = cell.toLowerCase();
            return c.length < 40 && HEADER_WORDS.some(w => c.includes(w));
        }).length;
        if (hits > bestHits) { bestHits = hits; bestIdx = idx; }
    });
    return bestHits >= 2 ? bestIdx : 0;
}

/**
 * Parses a statement file into named columns.
 * Returns { headers, rows, preambleLines }.
 */
export function parseStatement(text) {
    return parseGrid(parseDelimited(text));
}

/**
 * Same as parseStatement, for a grid that was already split into cells —
 * what the server returns after reading a PDF or Excel statement.
 */
export function parseGrid(rawGrid) {
    const grid = (rawGrid || [])
        .map(r => r.map(c => (c === null || c === undefined ? "" : String(c).trim())))
        .filter(r => r.some(c => c !== ""));
    if (grid.length === 0) return { headers: [], rows: [], preambleLines: 0, preamble: [] };

    const headerIdx = findHeaderRow(grid);
    const headers = uniqueHeaders(grid[headerIdx]);

    const rows = grid.slice(headerIdx + 1)
        // Footer lines ("Statement summary", "** End of statement **") have
        // one or two cells; a transaction row fills most of the table.
        .filter(r => r.filter(c => c !== "").length >= Math.min(3, headers.length))
        .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ""])));

    return { headers, rows, preambleLines: headerIdx, preamble: grid.slice(0, headerIdx) };
}

// Two columns can share a name ("Amount", "Amount"); a select keyed on the
// name would make the second one unreachable.
function uniqueHeaders(raw) {
    const seen = {};
    return raw.map((h, i) => {
        const name = h || `Column ${i + 1}`;
        seen[name] = (seen[name] || 0) + 1;
        return seen[name] > 1 ? `${name} (${seen[name]})` : name;
    });
}

const find = (headers, pattern, exclude) =>
    headers.find(h => pattern.test(h) && !(exclude && exclude.test(h))) || "";

/**
 * Best-guess column mapping so most statements need no manual mapping.
 * Every guess is shown in the selects for the user to correct.
 */
export function guessMapping(headers) {
    const date = find(headers, /(txn|tran|transaction|posting)\s*date/i)
        || find(headers, /date/i, /value/i)
        || find(headers, /date/i);
    const merchant = find(headers, /narration|description|particulars|details|remarks|merchant|payee/i);
    const debit = find(headers, /debit|withdrawal|\bdr\b/i);
    const credit = find(headers, /credit|deposit|\bcr\b/i);
    const balance = find(headers, /balance/i);
    const amount = find(headers, /amount/i, /balance/i);
    const category = find(headers, /category/i);

    return {
        mapping: { date, merchant, amount, debit, credit, balance, category },
        debitCreditMode: Boolean(debit && credit),
    };
}

/**
 * Reads an amount the way Indian statements write it: "1,250.00",
 * "1,23,456.78", "₹ 649", "1,250.00 Dr" (negative), "500 Cr" (positive),
 * "(1,250.00)" (negative). Blank and "-" are null, not zero.
 */
export function parseAmount(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;

    let s = String(raw).trim();
    if (s === "" || s === "-" || s === "--") return null;

    let forcedSign = null;
    const drCr = s.match(/\s*(dr|cr)\.?$/i);
    if (drCr) {
        forcedSign = drCr[1].toLowerCase() === "dr" ? -1 : 1;
        s = s.slice(0, drCr.index).trim();
    }

    const bracketed = s.startsWith("(") && s.endsWith(")");
    if (bracketed) s = s.slice(1, -1);

    s = s.replace(/₹|\binr\b|\brs\.?/gi, "").replace(/[,\s]/g, "");
    if (s === "" || !/^[+-]?\d*\.?\d+$/.test(s)) return null;

    const value = Number(s);
    if (forcedSign !== null) return forcedSign * Math.abs(value);
    return bracketed ? -Math.abs(value) : value;
}

const MONTHS = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

const pad = n => String(n).padStart(2, "0");

function iso(y, m, d) {
    const year = y < 100 ? 2000 + y : y;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;
    const dt = new Date(Date.UTC(year, m - 1, d));
    // Rejects 31/02 rather than letting Date roll it into March
    if (dt.getUTCMonth() !== m - 1) return null;
    return `${year}-${pad(m)}-${pad(d)}`;
}

/**
 * Normalises a statement date to YYYY-MM-DD, or null when it cannot be read.
 *
 * Returns null rather than today's date on purpose: a row stamped "today"
 * silently piles a whole statement onto the import date. Numeric dates are
 * read day-first, as every Indian bank writes them.
 */
export function normalizeDate(raw) {
    if (!raw) return null;
    const s = String(raw).trim();

    let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/);
    if (m) return iso(+m[1], +m[2], +m[3]);

    m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s.*)?$/);
    if (m) return iso(+m[3], +m[2], +m[1]);

    m = s.match(/^(\d{1,2})[\s/-]*([A-Za-z]{3,9})[\s,/-]*(\d{2}|\d{4})(?:\s.*)?$/);
    if (m) {
        const month = MONTHS[m[2].toLowerCase().slice(0, 3)];
        return month ? iso(+m[3], month, +m[1]) : null;
    }
    return null;
}

/**
 * Turns mapped statement rows into import rows for POST /transactions/batch.
 * Returns { rows, skipped }. Rows with no readable date or no amount are
 * skipped and counted, never guessed.
 *
 * Categories are sent only when the file really has a category column; the
 * backend categorises everything else from the narration.
 */
export function buildImportRows(rows, mapping, { debitCreditMode = false, flipSign = false } = {}) {
    const out = [];
    let skipped = 0;

    for (const row of rows) {
        const date = normalizeDate(row[mapping.date]);

        let amount;
        if (debitCreditMode) {
            // The column says which way the money moved; the cell's own sign
            // (or Dr/Cr suffix) is not trusted over it.
            const debit = parseAmount(row[mapping.debit]);
            const credit = parseAmount(row[mapping.credit]);
            amount = (credit ? Math.abs(credit) : 0) - (debit ? Math.abs(debit) : 0);
        } else {
            amount = parseAmount(row[mapping.amount]);
        }

        if (!date || !amount) { skipped++; continue; }
        if (flipSign) amount = -amount;

        const item = {
            date,
            merchant: (row[mapping.merchant] || "").replace(/\s+/g, " ").trim() || "Unknown",
            amount: Math.round(amount * 100) / 100,
        };
        const balance = mapping.balance ? parseAmount(row[mapping.balance]) : null;
        if (balance !== null) item.balance = balance;
        const category = mapping.category ? (row[mapping.category] || "").trim() : "";
        if (category) item.category = category;
        out.push(item);
    }
    return { rows: out, skipped };
}

/** Totals for the preview: count, money out, money in, date range. */
export function summarize(importRows) {
    let out = 0;
    let inn = 0;
    let from = null;
    let to = null;
    for (const r of importRows) {
        if (r.amount < 0) out += -r.amount; else inn += r.amount;
        if (!from || r.date < from) from = r.date;
        if (!to || r.date > to) to = r.date;
    }
    return { count: importRows.length, out, in: inn, from, to };
}

// Bank names as they appear in statement headers and file names. Output uses
// the same short names as the server's alert-email parser ("HDFC ··1234"), so
// a statement and alerts for one account are grouped together.
const BANKS = [
    [/\bhdfc\b|hdfcbank/i, "HDFC"],
    [/\bicici\b/i, "ICICI"],
    [/\bsbi\s*card\b/i, "SBI Card"],
    [/\bsbi\b|state bank of india/i, "SBI"],
    [/\baxis\b/i, "Axis"],
    [/\bkotak\b/i, "Kotak"],
    [/\byes\s*bank\b/i, "Yes Bank"],
    [/\bidfc\b/i, "IDFC FIRST"],
    [/\bindusind\b/i, "IndusInd"],
    [/\bfederal\b/i, "Federal"],
    [/bank of baroda|\bbob\b/i, "Bank of Baroda"],
    [/\bpnb\b|punjab national/i, "PNB"],
    [/\bcanara\b/i, "Canara"],
    [/union bank/i, "Union Bank"],
    [/\bau\s*(small finance)?\s*bank\b/i, "AU"],
    [/\brbl\b/i, "RBL"],
];

/**
 * A label for the account a statement belongs to — "HDFC ··1234" — from the
 * lines above its table and the file name. Either part may be missing; the
 * user can edit the result.
 */
export function guessAccountLabel(preamble = [], fileName = "") {
    const lines = preamble.map(r => r.filter(Boolean).join(" "));
    const text = [...lines, fileName.replace(/[_.-]+/g, " ")].join("\n");

    const bank = BANKS.find(([re]) => re.test(text))?.[1] ?? "";

    // The account number follows its label; its trailing digits are what banks
    // leave unmasked ("50100XXXXXX5678" → 5678, ICICI's "XXXXXXXX345" → 345)
    let last = "";
    for (const line of lines) {
        const m = line.match(/(?:a\/?c|acct|account|card)(?:\s*(?:no\.?|number|num))?\s*[:#.]?\s*([\dxX*•][\dxX*•\s-]{2,30})/i);
        const digits = m?.[1].replace(/[\s-]/g, "").match(/(\d{3,})$/)?.[1];
        if (digits) { last = digits.slice(-4); break; }
    }
    if (!last) {
        const masked = text.match(/[xX*•]{2,}(\d{3,6})\b/);
        if (masked) last = masked[1].slice(-4);
    }
    return [bank, last && `··${last}`].filter(Boolean).join(" ");
}

