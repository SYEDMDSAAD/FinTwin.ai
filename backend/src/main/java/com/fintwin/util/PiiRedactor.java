package com.fintwin.util;

import java.util.List;
import java.util.regex.Pattern;

/**
 * Masks identifiers and secrets in text: email addresses, UPI IDs, Indian
 * mobile numbers, card and Aadhaar numbers, PANs, long account or reference
 * numbers, and anything shaped like a credential (a JWT, a bearer token, a
 * Google API key, "password: ...").
 *
 * Used on every log line, and on Copilot questions and answers before they
 * are sent to the AI service or stored. The AI service masks the same shapes
 * again before any model sees them (ai-service/utils/redact.py — keep the
 * two in step).
 *
 * Rupee amounts, dates, percentages and merchant names are left alone:
 * answers are checked against the figures they were given, and no amount a
 * person would have runs to 11 digits. A figure written with a ₹ sign or
 * Indian commas is never touched.
 */
public final class PiiRedactor {

    private record Rule(Pattern pattern, String mask) {}

    // Order matters: longer, more specific shapes first, so a card number
    // isn't half-eaten by the phone pattern.
    private static final List<Rule> RULES = List.of(
            new Rule(Pattern.compile("\\beyJ[\\w-]{8,}\\.[\\w-]{8,}\\.[\\w-]{8,}"), "<TOKEN>"),
            new Rule(Pattern.compile("(?i)\\bbearer\\s+[\\w.~+/=-]{12,}"), "Bearer <TOKEN>"),
            new Rule(Pattern.compile("\\bAIza[\\w-]{30,}"), "<API_KEY>"),
            new Rule(Pattern.compile("\\b(?:sk|pk|rk)[-_](?:live|test|ant|proj)?[-_]?[A-Za-z0-9_-]{16,}"), "<API_KEY>"),
            new Rule(Pattern.compile("(?i)\\b(password|passwd|pwd|passcode|pin|otp|cvv|mpin|secret|api[_ -]?key)"
                    + "(\\s*(?:is|:|=)\\s*)\\S+"), "$1$2<REDACTED>"),
            new Rule(Pattern.compile("[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+"), "<EMAIL>"),
            new Rule(Pattern.compile("[\\w.-]{2,}@[a-zA-Z]{2,}\\b(?!\\.\\w)"), "<UPI_ID>"),
            new Rule(Pattern.compile("\\b[A-Z]{5}\\d{4}[A-Z]\\b"), "<PAN>"),
            new Rule(Pattern.compile("(?<![\\d₹,.])\\d{4}(?:[ -]\\d{4}){2,3}(?:[ -]?\\d{1,3})?(?!\\d|[,.]\\d)"), "<CARD_OR_ID>"),
            new Rule(Pattern.compile("(?<![\\d₹,.])[2-9]\\d{11}(?!\\d|[,.]\\d)"), "<AADHAAR>"),
            new Rule(Pattern.compile("(?<![\\d₹,.])(?:\\+?91[\\s-]?)?[6-9]\\d{4}[\\s-]?\\d{5}(?!\\d|[,.]\\d)"), "<PHONE>"),
            new Rule(Pattern.compile("(?<![\\d₹,.])\\d{11,19}(?!\\d|[,.]\\d)"), "<NUMBER>")
    );

    private PiiRedactor() {}

    /** The text with identifiers and secrets masked; null stays null. */
    public static String redact(String text) {
        if (text == null || text.isEmpty()) return text;
        String out = text;
        for (Rule r : RULES) out = r.pattern().matcher(out).replaceAll(r.mask());
        return out;
    }
}
