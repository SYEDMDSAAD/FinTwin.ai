package com.fintwin.identity.logging;

import ch.qos.logback.classic.pattern.MessageConverter;
import ch.qos.logback.classic.spi.ILoggingEvent;

import java.util.List;
import java.util.regex.Pattern;

/**
 * {@code %maskedMsg}: the log message with emails, phone numbers, OTPs,
 * passwords and tokens masked. This service sends OTPs, reset links and
 * temporary passwords, and used to log who each went to by email address.
 *
 * Same shapes as the backend's com.fintwin.util.PiiRedactor (a copy: the two
 * services share no code).
 */
public class MaskedMessageConverter extends MessageConverter {

    private record Rule(Pattern pattern, String mask) {}

    private static final List<Rule> RULES = List.of(
            new Rule(Pattern.compile("\\beyJ[\\w-]{8,}\\.[\\w-]{8,}\\.[\\w-]{8,}"), "<TOKEN>"),
            new Rule(Pattern.compile("(?i)\\bbearer\\s+[\\w.~+/=-]{12,}"), "Bearer <TOKEN>"),
            new Rule(Pattern.compile("(?i)\\b(password|passwd|pwd|passcode|pin|otp|secret|token)"
                    + "(\\s*(?:is|:|=)\\s*)\\S+"), "$1$2<REDACTED>"),
            new Rule(Pattern.compile("[\\w.+-]+@[\\w-]+(?:\\.[\\w-]+)+"), "<EMAIL>"),
            new Rule(Pattern.compile("(?<![\\d₹,.])(?:\\+?91[\\s-]?)?[6-9]\\d{4}[\\s-]?\\d{5}(?!\\d|[,.]\\d)"), "<PHONE>"),
            new Rule(Pattern.compile("(?<![\\d₹,.])\\d{11,19}(?!\\d|[,.]\\d)"), "<NUMBER>")
    );

    public static String mask(String text) {
        if (text == null || text.isEmpty()) return text;
        String out = text;
        for (Rule r : RULES) out = r.pattern().matcher(out).replaceAll(r.mask());
        return out;
    }

    @Override
    public String convert(ILoggingEvent event) {
        return mask(super.convert(event));
    }
}
