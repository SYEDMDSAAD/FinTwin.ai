package com.fintwin.util;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.HexFormat;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Parsing and identity rules for transactions imported from a bank or card
 * statement.
 *
 * Kept pure so the awkward cases (Indian number formatting, Dr/Cr suffixes,
 * identical same-day payments) are pinned down by unit tests rather than
 * discovered on a user's real statement.
 */
public final class StatementImport {

    private StatementImport() {}

    /** Prefix on every statement-import externalId, next to AA's "CARD:" ids. */
    public static final String EXTERNAL_ID_PREFIX = "STMT:";

    private static final Pattern CURRENCY = Pattern.compile("(?i)(₹|\\binr\\b|\\brs\\.?)");
    private static final Pattern DR_CR = Pattern.compile("(?i)\\s*(dr|cr)\\.?$");
    private static final Pattern WHITESPACE = Pattern.compile("\\s+");

    /**
     * Reads an amount the way Indian statements write it.
     *
     * Handles "1,250.00", "1,23,456.78", "₹ 649", "Rs. 500", "1,250.00 Dr"
     * (debit, negative), "500.00 Cr" (credit, positive), "(1,250.00)"
     * (bracketed, negative) and plain numbers. Returns null for blanks and
     * placeholders like "-", so an empty debit cell is not read as zero spend.
     *
     * A Dr/Cr suffix sets the sign on its own; it is not combined with any
     * sign already on the number.
     */
    public static Double parseAmount(Object raw) {
        if (raw == null) return null;
        if (raw instanceof Number n) return n.doubleValue();

        String s = raw.toString().trim();
        if (s.isEmpty() || s.equals("-") || s.equals("--")) return null;

        Integer forcedSign = null;
        var drCr = DR_CR.matcher(s);
        if (drCr.find()) {
            forcedSign = drCr.group(1).equalsIgnoreCase("dr") ? -1 : 1;
            s = s.substring(0, drCr.start()).trim();
        }

        boolean bracketed = s.startsWith("(") && s.endsWith(")");
        if (bracketed) s = s.substring(1, s.length() - 1);

        s = CURRENCY.matcher(s).replaceAll("");
        s = s.replace(",", "").replace(" ", "");
        if (s.isEmpty()) return null;

        double value;
        try {
            value = Double.parseDouble(s);
        } catch (NumberFormatException e) {
            return null;
        }

        if (forcedSign != null) return forcedSign * Math.abs(value);
        return bracketed ? -Math.abs(value) : value;
    }

    /**
     * Stable identity for one statement row, so importing the same statement
     * twice (or two overlapping statements) does not double the user's spending.
     *
     * {@code ordinal} tells apart rows that are otherwise identical — two ₹20
     * chai payments to the same vendor on the same day are both real. It is the
     * row's position among its identical siblings in the file, which a re-import
     * of the same file reproduces exactly. The running balance, when the
     * statement has one, already separates such rows on its own.
     */
    public static String externalId(LocalDate date, double amount, String narration,
                                    Double balance, int ordinal) {
        String key = String.join("|",
                date.toString(),
                String.format(Locale.ROOT, "%.2f", amount),
                normalizeNarration(narration),
                balance == null ? "" : String.format(Locale.ROOT, "%.2f", balance),
                Integer.toString(ordinal));
        return EXTERNAL_ID_PREFIX + sha256(key).substring(0, 40);
    }

    /** The dedupe key without the ordinal — used to count identical siblings. */
    public static String siblingKey(LocalDate date, double amount, String narration, Double balance) {
        return externalId(date, amount, narration, balance, 0);
    }

    static String normalizeNarration(String narration) {
        if (narration == null) return "";
        return WHITESPACE.matcher(narration.trim().toLowerCase(Locale.ROOT)).replaceAll(" ");
    }

    private static String sha256(String s) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
