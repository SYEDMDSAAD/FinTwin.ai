package com.fintwin.util;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reads the one transaction out of a bank's alert email.
 *
 * Rather than one template per bank — which breaks the day a bank rewords its
 * alert — this looks for the shape every Indian alert shares: a currency
 * amount, a debit or credit verb beside it, an account or card reference, and
 * usually a date and a counterparty. What it must never do is invent spending,
 * so anything that isn't clearly a completed transaction is refused: OTPs,
 * due-date reminders, statements, declined or failed payments, balances.
 *
 * Only the text around the amount is judged, because alert emails end with
 * marketing footers ("exclusive offers", "OTP never shared") that would
 * otherwise trip the exclusions.
 */
public final class BankAlertParser {

    private BankAlertParser() {}

    /**
     * @param amount       signed: negative for money out, positive for money in
     * @param counterparty merchant, payee or payer as the alert names it
     * @param last4        last 3–4 digits of the account or card, when given
     * @param card         true for a credit-card transaction
     * @param channel      UPI, CARD, ATM, NEFT, IMPS, RTGS or null
     */
    public record Alert(double amount, String counterparty, LocalDate date,
                        String last4, boolean card, String channel) {}

    private static final int BEFORE = 160;
    private static final int AFTER = 220;

    private static final Pattern AMOUNT = Pattern.compile(
            "(?i)(?:rs\\.?|inr|₹)\\s*([0-9][0-9,]*(?:\\.[0-9]{1,2})?)");

    // Words that make an amount a balance or a limit rather than a transaction
    private static final Pattern BALANCE_CONTEXT = Pattern.compile(
            "(?i)(avl\\.?|available|avail\\.?|bal\\.?|balance|limit|lmt|outstanding|due)\\W{0,4}(?:is|of|:)?\\W{0,3}$");

    private static final Pattern DEBIT = Pattern.compile(
            "(?i)\\b(debited|spent|withdrawn|paid|sent|deducted|debit of|has a debit|purchase|"
            + "used for|using your|txn of|transaction of|charged)\\b");
    private static final Pattern CREDIT = Pattern.compile(
            "(?i)\\b(credited|received|deposited|credit of|refund(?:ed)?|reversed|reversal|cashback)\\b");

    // Refused outright wherever they appear in the subject or around the amount
    private static final Pattern NOT_A_TRANSACTION = Pattern.compile(
            "(?i)\\b(otp|one[- ]time password|verification code|payment due|is due|due date|"
            + "minimum amount due|total amount due|amount due|statement (?:is ready|for|of)|e-?statement|"
            + "declined|failed|unsuccessful|could not be processed|not processed|was not successful|"
            + "pre-?approved|eligible for|standing instruction registered|mandate (?:created|registered)|"
            + "will be debited|scheduled|reminder)\\b");

    private static final Pattern CARD_REF = Pattern.compile("(?i)credit\\s*card|\\bcard\\s*(?:no\\.?|number|ending|xx|\\*|x{2,})");
    private static final Pattern DEBIT_CARD = Pattern.compile("(?i)debit\\s*card");
    private static final Pattern ACCOUNT_REF = Pattern.compile("(?i)\\b(?:a/c|acct|account)\\b");

    private static final Pattern LAST4 = Pattern.compile(
            "(?i)(?:a/c|acct|account|card)(?:\\s*(?:no\\.?|number|ending(?:\\s*(?:with|in))?))?\\s*[:#]?\\s*"
            + "(?:[x*•.]{0,12})\\s*(\\d{4})\\b"
            + "|[xX*•]{2,}(\\d{3,6})\\b");

    private static final List<Pattern> COUNTERPARTY = List.of(
            // "to VPA netflix@icici NETFLIX on 21-09-26", "by VPA acme@hdfc ACME LTD on ..."
            Pattern.compile("(?i)\\b(?:to|from|by)\\s+vpa\\s+(\\S+?)\\s+([A-Z][A-Za-z0-9 &.'\\-]{1,40}?)\\s+on\\b"),
            Pattern.compile("(?i)\\b(?:to|from|by)\\s+vpa\\s+(\\S+)"),
            // "at NETFLIX on 21-09-2026" (card spends); not "at 10:15"
            Pattern.compile("(?i)\\bat\\s+([A-Za-z][A-Za-z0-9 &*.'/\\-]{1,40}?)\\s*(?:\\bon\\b|\\bat\\b|\\bfrom\\b|\\.\\s|,|\\bavl|\\bref|\\btxn|$)"),
            // ICICI-style "Info: UPI-123-NETFLIX."
            Pattern.compile("(?i)\\binfo[:.]?\\s*([^.;]{2,60})"),
            Pattern.compile("(?i)\\b(?:transfer to|towards|to)\\s+([A-Za-z][A-Za-z0-9 &.'\\-]{1,40}?)\\s*(?:\\bon\\b|\\bref|\\bvia|\\bupi|\\.\\s|,|$)"),
            // "from" before "by": in "by NEFT from ACME LTD" the payer follows "from"
            Pattern.compile("(?i)\\bfrom\\s+([A-Za-z][A-Za-z0-9 &.'\\-]{1,40}?)\\s*(?:\\bon\\b|\\bref|\\bvia|\\.\\s|\\.$|,|$)"),
            Pattern.compile("(?i)\\bby\\s+([A-Za-z][A-Za-z0-9 &.'\\-]{1,40}?)\\s*(?:\\bon\\b|\\bref|\\bvia|\\.\\s|\\.$|,|$)"),
            // ICICI card spends name the merchant last: "... on 21-Sep-26 on NETFLIX."
            Pattern.compile("(?i)\\bon\\s+([A-Za-z][A-Za-z0-9 &*.'/\\-]{1,40}?)\\s*(?:\\.\\s|\\.$|,|\\bavl|$)"));

    // Names that are a rail or a pronoun, not a counterparty
    private static final Pattern NOT_A_NAME = Pattern.compile(
            "(?i)(your|the|a/c|account|card|you|us|bank|neft|imps|rtgs|upi|transfer|atm)\\b.*"
            + "|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*");

    private static final Pattern DATE = Pattern.compile(
            "(?i)\\b(\\d{4}-\\d{2}-\\d{2}"
            + "|\\d{1,2}[/-]\\d{1,2}[/-]\\d{2,4}"
            + "|\\d{1,2}[\\s-]?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[\\s,-]?\\d{2,4})\\b");

    private static final List<DateTimeFormatter> DATE_FORMATS = List.of(
            fmt("yyyy-MM-dd"), fmt("d/M/uuuu"), fmt("d-M-uuuu"), fmt("d/M/uu"), fmt("d-M-uu"),
            fmt("d-MMM-uuuu"), fmt("d-MMM-uu"), fmt("d MMM uuuu"), fmt("d MMM uu"),
            fmt("dMMMuu"), fmt("dMMMuuuu"), fmt("d MMMM uuuu"), fmt("d-MMMM-uuuu"));

    private static DateTimeFormatter fmt(String p) {
        return new DateTimeFormatterBuilder().parseCaseInsensitive().appendPattern(p)
                .toFormatter(Locale.ENGLISH);
    }

    /**
     * @param received when the email arrived — the fallback date, and the
     *                 anchor that rejects a misread date far from it
     */
    public static Optional<Alert> parse(String subject, String body, LocalDate received) {
        String subj = normalise(subject);
        String text = normalise(body);
        if (NOT_A_TRANSACTION.matcher(subj).find()) return Optional.empty();

        String haystack = text.isEmpty() ? subj : text;
        Matcher m = AMOUNT.matcher(haystack);
        while (m.find()) {
            String before = haystack.substring(Math.max(0, m.start() - BEFORE), m.start());
            String after = haystack.substring(m.end(), Math.min(haystack.length(), m.end() + AFTER));
            if (BALANCE_CONTEXT.matcher(before).find()) continue;

            // The verb nearest the amount decides the direction
            int debitAt = nearest(DEBIT, before, after);
            int creditAt = nearest(CREDIT, before, after);
            if (debitAt == Integer.MAX_VALUE && creditAt == Integer.MAX_VALUE) continue;
            boolean isCredit = creditAt < debitAt;

            String window = before + m.group() + after;
            // A sentence about this amount that says it failed or is only due
            String sentence = sentenceAround(haystack, m.start(), m.end());
            if (NOT_A_TRANSACTION.matcher(sentence).find()) return Optional.empty();

            double value;
            try {
                value = Double.parseDouble(m.group(1).replace(",", ""));
            } catch (NumberFormatException e) {
                continue;
            }
            if (value <= 0) continue;

            boolean card = !DEBIT_CARD.matcher(window).find()
                    && (CARD_REF.matcher(window).find() || CARD_REF.matcher(subj).find())
                    && !(ACCOUNT_REF.matcher(window).find() && !window.toLowerCase(Locale.ROOT).contains("credit card"));

            return Optional.of(new Alert(
                    isCredit ? value : -value,
                    counterparty(after, window, isCredit),
                    date(after + " " + before, received),
                    last4(window),
                    card,
                    channel(window, card)));
        }
        return Optional.empty();
    }

    private static int nearest(Pattern verb, String before, String after) {
        int best = Integer.MAX_VALUE;
        Matcher b = verb.matcher(before);
        while (b.find()) best = Math.min(best, before.length() - b.end());
        Matcher a = verb.matcher(after);
        if (a.find()) best = Math.min(best, a.start());
        return best;
    }

    private static String sentenceAround(String text, int start, int end) {
        int from = Math.max(text.lastIndexOf(". ", start), text.lastIndexOf('\n', start));
        int to = text.indexOf(". ", end);
        int nl = text.indexOf('\n', end);
        if (to < 0 || (nl >= 0 && nl < to)) to = nl;
        return text.substring(Math.max(0, from), to < 0 ? text.length() : to);
    }

    private static String counterparty(String after, String window, boolean isCredit) {
        for (Pattern p : COUNTERPARTY) {
            Matcher m = p.matcher(p.pattern().contains("vpa") || p.pattern().contains("info") ? window : after);
            if (!m.find()) continue;
            String name = m.groupCount() >= 2 && m.group(2) != null ? m.group(2) : m.group(1);
            name = cleanName(name);
            if (name.length() >= 2 && !NOT_A_NAME.matcher(name).matches()) {
                return name;
            }
        }
        return null;
    }

    private static final Pattern RAIL = Pattern.compile("(?i)upi|neft|imps|rtgs|pos|ach|nach|dr|cr|p2m|p2a");

    private static String cleanName(String name) {
        String n = name.trim().replaceAll("[\\s.,;:\\-]+$", "");
        // "UPI-512345678901-ZOMATO" / "UPI/DR/123/SWIGGY": the payee is the
        // first segment that is neither a rail, a reference number nor a VPA
        if (n.matches("(?i)(upi|neft|imps|rtgs|pos|ach|nach)[-/].*")) {
            for (String seg : n.split("[-/]")) {
                String part = seg.trim();
                if (part.isEmpty() || RAIL.matcher(part).matches() || part.contains("@")
                        || !part.matches(".*[A-Za-z].*") || part.matches("[A-Za-z]{0,2}\\d+")) continue;
                return part;
            }
        }
        // A bare VPA reads better as its handle: "netflix@icici" → "netflix"
        if (n.contains("@") && !n.contains(" ")) n = n.substring(0, n.indexOf('@'));
        return n;
    }

    private static LocalDate date(String around, LocalDate received) {
        Matcher m = DATE.matcher(around);
        while (m.find()) {
            String raw = m.group(1).replaceAll("(?i)sept", "Sep").replaceAll("\\s+", " ");
            for (DateTimeFormatter f : DATE_FORMATS) {
                try {
                    LocalDate d = LocalDate.parse(raw, f);
                    // Alerts go out within minutes; a date far from arrival is a misread
                    if (received == null
                            || (!d.isAfter(received.plusDays(1)) && !d.isBefore(received.minusDays(45)))) {
                        return d;
                    }
                } catch (Exception ignored) {
                    // try the next format
                }
            }
        }
        return received;
    }

    private static String last4(String window) {
        Matcher m = LAST4.matcher(window);
        while (m.find()) {
            String digits = m.group(1) != null ? m.group(1) : m.group(2);
            // ICICI masks down to three digits ("XX345"); keep what the bank shows
            if (digits != null) return digits.length() > 4 ? digits.substring(digits.length() - 4) : digits;
        }
        return null;
    }

    private static String channel(String window, boolean card) {
        String w = window.toLowerCase(Locale.ROOT);
        if (w.contains("upi") || w.contains("vpa")) return "UPI";
        if (w.contains("atm") || w.contains("withdrawn")) return "ATM";
        if (w.contains("neft")) return "NEFT";
        if (w.contains("imps")) return "IMPS";
        if (w.contains("rtgs")) return "RTGS";
        return card ? "CARD" : null;
    }

    private static String normalise(String s) {
        if (s == null) return "";
        return s.replace(' ', ' ')
                .replaceAll("[ \\t\\x0B\\f\\r]+", " ")
                .replaceAll(" *\\n[ \\n]*", "\n")
                .trim();
    }
}
