import { describe, it, expect } from "vitest";
import {
    parseDelimited, sniffDelimiter, findHeaderRow, parseStatement, parseGrid,
    guessMapping, parseAmount, normalizeDate, buildImportRows, summarize, guessAccountLabel, directionOf,
} from "./statementParser";

// Shaped like a real net-banking export: account preamble, CRLF line endings,
// a quoted narration with a comma, debit/credit columns, a footer line.
const SBI_LIKE = [
    "Account Name :,MD SAAD",
    "Account Number :,XXXXXXX1234",
    "Period :,01 Sep 2026 to 30 Sep 2026",
    "",
    "Txn Date,Value Date,Description,Ref No./Cheque No.,Debit,Credit,Balance",
    '1 Sep 2026,1 Sep 2026,"UPI/DR/412345/SWIGGY, BANGALORE",412345,450.00,,"24,550.00"',
    "2 Sep 2026,2 Sep 2026,NEFT CR ACME PAYROLL,N2345,,\"1,20,000.00\",\"1,44,550.00\"",
    "5 Sep 2026,5 Sep 2026,CREDIT CARD PAYMENT HDFC,CC99,\"12,000.00\",,\"1,32,550.00\"",
    "** This is a computer generated statement **",
].join("\r\n");

describe("parseDelimited", () => {
    it("keeps commas and newlines inside quoted cells", () => {
        const rows = parseDelimited('a,"b, c","line1\nline2"\r\nd,e,f');
        expect(rows).toEqual([["a", "b, c", "line1\nline2"], ["d", "e", "f"]]);
    });

    it("reads escaped quotes", () => {
        expect(parseDelimited('"say ""hi""",x')).toEqual([['say "hi"', "x"]]);
    });

    it("strips a byte-order mark and drops blank lines", () => {
        expect(parseDelimited("﻿a,b\n\n\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
    });
});

describe("sniffDelimiter", () => {
    it("detects tab- and semicolon-delimited exports", () => {
        expect(sniffDelimiter("Date\tNarration\tAmount\n01/09/26\tX\t5")).toBe("\t");
        expect(sniffDelimiter("Date;Narration;Amount\n01/09/26;X;5")).toBe(";");
        expect(sniffDelimiter("Date,Narration,Amount\n01/09/26,X,5")).toBe(",");
    });
});

describe("findHeaderRow / parseStatement", () => {
    it("skips the bank's account preamble to find the real header", () => {
        const grid = parseDelimited(SBI_LIKE);
        expect(grid[findHeaderRow(grid)][0]).toBe("Txn Date");
    });

    it("returns named rows and drops the footer line", () => {
        const { headers, rows, preambleLines } = parseStatement(SBI_LIKE);
        expect(headers).toContain("Description");
        expect(preambleLines).toBe(3);
        expect(rows).toHaveLength(3);
        expect(rows[0].Description).toBe("UPI/DR/412345/SWIGGY, BANGALORE");
    });

    it("makes duplicate column names distinct", () => {
        const { headers } = parseStatement("Date,Amount,Amount\n01/09/2026,5,6");
        expect(headers).toEqual(["Date", "Amount", "Amount (2)"]);
    });
});

describe("parseGrid", () => {
    it("treats a server-read grid exactly like a parsed CSV", () => {
        const fromText = parseStatement(SBI_LIKE);
        const fromGrid = parseGrid(parseDelimited(SBI_LIKE));
        expect(fromGrid).toEqual(fromText);
    });

    it("tolerates null cells and non-string values", () => {
        const { headers, rows } = parseGrid([
            ["Date", "Narration", "Debit", "Balance"],
            ["2026-09-01", "UPI/SWIGGY", 1250, null],
        ]);
        expect(headers).toEqual(["Date", "Narration", "Debit", "Balance"]);
        expect(rows[0]).toEqual({ Date: "2026-09-01", Narration: "UPI/SWIGGY", Debit: "1250", Balance: "" });
    });

    it("returns an empty table for an empty grid", () => {
        expect(parseGrid([])).toEqual({ headers: [], rows: [], preambleLines: 0, preamble: [] });
        expect(parseGrid(undefined).rows).toEqual([]);
    });
});

describe("guessMapping", () => {
    it("maps a debit/credit statement without help", () => {
        const { headers } = parseStatement(SBI_LIKE);
        const { mapping, debitCreditMode } = guessMapping(headers);
        expect(debitCreditMode).toBe(true);
        expect(mapping).toMatchObject({
            date: "Txn Date", merchant: "Description",
            debit: "Debit", credit: "Credit", balance: "Balance",
        });
    });

    it("prefers the transaction date over the value date", () => {
        expect(guessMapping(["Value Date", "Transaction Date", "Amount"]).mapping.date)
            .toBe("Transaction Date");
    });

    it("maps a single amount column and never uses balance as the amount", () => {
        const { mapping, debitCreditMode } = guessMapping(["Date", "Narration", "Balance Amount", "Amount"]);
        expect(debitCreditMode).toBe(false);
        expect(mapping.amount).toBe("Amount");
    });
});

describe("parseAmount", () => {
    it("reads Indian digit grouping", () => {
        // parseFloat("1,250.00") returned 1 — a ₹1,250 debit imported as ₹1
        expect(parseAmount("1,250.00")).toBe(1250);
        expect(parseAmount("1,23,456.78")).toBe(123456.78);
    });

    it("applies Dr / Cr suffixes and brackets", () => {
        expect(parseAmount("1,250.00 Dr")).toBe(-1250);
        expect(parseAmount("500.00 Cr")).toBe(500);
        expect(parseAmount("649.00DR")).toBe(-649);
        expect(parseAmount("(1,250.00)")).toBe(-1250);
    });

    it("strips currency markers", () => {
        expect(parseAmount("₹ 649")).toBe(649);
        expect(parseAmount("Rs. 500")).toBe(500);
        expect(parseAmount("INR 2,000.50")).toBe(2000.5);
    });

    it("treats blanks and junk as absent, not zero", () => {
        for (const v of [null, undefined, "", " ", "-", "abc", "12abc"]) {
            expect(parseAmount(v)).toBeNull();
        }
    });
});

describe("normalizeDate", () => {
    it.each([
        ["2026-09-01", "2026-09-01"],
        ["2026-09-01T10:15:30", "2026-09-01"],
        ["01/09/2026", "2026-09-01"],
        ["1/9/2026", "2026-09-01"],
        ["01-09-2026", "2026-09-01"],
        ["01.09.2026", "2026-09-01"],
        ["01/09/26", "2026-09-01"],
        ["1 Sep 2026", "2026-09-01"],
        ["01-Sep-2026", "2026-09-01"],
        ["01-SEP-26", "2026-09-01"],
        ["1 September 2026", "2026-09-01"],
        ["01/09/2026 14:32", "2026-09-01"],
        ["Jun 24, 2026", "2026-06-24"],          // PhonePe, month first
        ["Sep 1 2026", "2026-09-01"],
        ["Sept. 1, 2026 05:05 PM", "2026-09-01"],
    ])("reads %s as %s (day first)", (input, expected) => {
        expect(normalizeDate(input)).toBe(expected);
    });

    it("returns null instead of stamping unreadable dates as today", () => {
        for (const v of ["", null, "not a date", "31/02/2026", "13/13/2026", "Opening Balance"]) {
            expect(normalizeDate(v)).toBeNull();
        }
    });
});

describe("buildImportRows", () => {
    const { rows } = parseStatement(SBI_LIKE);
    const { mapping } = guessMapping(parseStatement(SBI_LIKE).headers);

    it("turns debit/credit columns into signed amounts with balance", () => {
        const { rows: out, skipped } = buildImportRows(rows, mapping, { debitCreditMode: true });
        expect(skipped).toBe(0);
        expect(out[0]).toEqual({
            date: "2026-09-01", merchant: "UPI/DR/412345/SWIGGY, BANGALORE",
            amount: -450, balance: 24550,
        });
        expect(out[1].amount).toBe(120000);
        expect(out[2].amount).toBe(-12000);
    });

    it("never sends a placeholder category, so the backend can categorise", () => {
        const { rows: out } = buildImportRows(rows, mapping, { debitCreditMode: true });
        expect(out.every(r => !("category" in r))).toBe(true);
    });

    it("sends a real category when the file has one", () => {
        const { rows: out } = buildImportRows(
            [{ D: "01/09/2026", N: "Zerodha", A: "-5000", C: "Investments" }],
            { date: "D", merchant: "N", amount: "A", category: "C" });
        expect(out[0].category).toBe("Investments");
    });

    it("skips and counts rows with no date or no amount", () => {
        const { rows: out, skipped } = buildImportRows(
            [
                { D: "Opening Balance", A: "100" },
                { D: "01/09/2026", A: "" },
                { D: "01/09/2026", A: "250.00 Dr", N: "OK" },
            ],
            { date: "D", merchant: "N", amount: "A" });
        expect(out).toHaveLength(1);
        expect(skipped).toBe(2);
    });

    it("flips signs for card statements that list purchases as positive", () => {
        const { rows: out } = buildImportRows(
            [{ D: "01/09/2026", N: "AMAZON", A: "2,499.00" }],
            { date: "D", merchant: "N", amount: "A" },
            { flipSign: true });
        expect(out[0].amount).toBe(-2499);
    });
});

describe("summarize", () => {
    it("totals money in and out and the date range", () => {
        expect(summarize([
            { date: "2026-09-05", amount: -450 },
            { date: "2026-09-01", amount: 1000 },
            { date: "2026-09-09", amount: -50 },
        ])).toEqual({ count: 3, out: 500, in: 1000, from: "2026-09-01", to: "2026-09-09" });
    });
});

describe("guessAccountLabel", () => {
    it("reads the bank and last digits from the statement header", () => {
        const { preamble } = parseStatement(SBI_LIKE.replace("Account Name :,MD SAAD", "State Bank of India,"));
        expect(guessAccountLabel(preamble, "statement.csv")).toBe("SBI ··1234");
    });

    it("uses the file name when the header doesn't name the bank", () => {
        expect(guessAccountLabel([["Account No :", "50100XXXXXX5678"]], "HDFC_Acct_Statement_Sep.pdf"))
            .toBe("HDFC ··5678");
    });

    it("keeps ICICI's three-digit mask", () => {
        expect(guessAccountLabel([["ICICI Bank"], ["Account Number", "XXXXXXXX345"]], "")).toBe("ICICI ··345");
    });

    it("tells SBI Card from SBI", () => {
        expect(guessAccountLabel([["SBI Card statement"], ["Card No", "XXXX XXXX XXXX 9012"]], "")).toBe("SBI Card ··9012");
    });

    it("returns what it can, or nothing", () => {
        expect(guessAccountLabel([["Axis Bank"]], "")).toBe("Axis");
        expect(guessAccountLabel([], "export.csv")).toBe("");
    });
});

// PhonePe's statement: unsigned "INR" amounts, direction in a "Type" column,
// month-first dates, and long payee names that spill into the Type column
describe("UPI app statements (PhonePe)", () => {
    const grid = [
        ["Date", "Transaction Details", "Type", "Amount"],
        ["Jun 24, 2026", "Received from ******1317", "Credit", "INR 1000.00"],
        ["05:05 PM", "Transaction ID : T2606241705189563531737", "", ""],
        ["Jun 24, 2026", "Paid to Apple Services", "Debit", "INR 39.00"],
        ["Jul 3, 2026", "Paid to NEW TIRUPATI BOOK CENTRE AND", "STATIONERS Debit", "INR 85.00"],
        ["This", "is a system generated statement. For any queries", "at https://support.phonepe.com", ""],
    ];

    it("finds the Type column and signs amounts from it", () => {
        const parsed = parseGrid(grid);
        const { mapping, debitCreditMode } = guessMapping(parsed.headers);
        expect(debitCreditMode).toBe(false);
        expect(mapping).toMatchObject({ date: "Date", amount: "Amount", direction: "Type" });

        const { rows, skipped } = buildImportRows(parsed.rows, mapping, { debitCreditMode });
        expect(rows.map(r => r.amount)).toEqual([1000, -39, -85]);
        expect(rows[0].date).toBe("2026-06-24");
        // footer is not a transaction, so it isn't reported as skipped
        expect(skipped).toBe(0);
    });

    it("gives a payee name that spilled into the Type column back to the merchant", () => {
        const parsed = parseGrid(grid);
        const { mapping } = guessMapping(parsed.headers);
        const { rows } = buildImportRows(parsed.rows, mapping);
        expect(rows[2].merchant).toBe("Paid to NEW TIRUPATI BOOK CENTRE AND STATIONERS");
    });

    it("reads the direction word, even after spilled text", () => {
        expect(directionOf("Debit")).toBe(-1);
        expect(directionOf("CR")).toBe(1);
        expect(directionOf("Dr.")).toBe(-1);
        expect(directionOf("STATIONERS Debit")).toBe(-1);
        expect(directionOf("REHMAN Credit")).toBe(1);
        expect(directionOf("")).toBeNull();
        expect(directionOf("Pending")).toBeNull();
    });

    it("does not look for a direction column when there are debit and credit columns", () => {
        expect(guessMapping(["Date", "Type", "Debit", "Credit"]).mapping.direction).toBe("");
    });

    it("labels the account by the app", () => {
        expect(guessAccountLabel([], "PhonePe_Transaction_Statement.pdf")).toBe("PhonePe");
        expect(guessAccountLabel([], "paytm_statement.csv")).toBe("Paytm");
    });
});

