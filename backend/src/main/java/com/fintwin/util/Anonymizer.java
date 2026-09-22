package com.fintwin.util;

import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Strips what identifies people from text headed for a training set: email
 * addresses, UPI IDs, phone numbers, masked contacts, account and reference
 * numbers, and people's names — the payee when a transaction looks like a
 * payment to a person, plus any names the caller knows (the user's own name,
 * the people they pay) wherever they appear in free text.
 *
 * Deliberately heavy-handed: a lost shop name costs a training example; a
 * leaked name or number can't be taken back.
 */
public final class Anonymizer {

    public static final String PERSON = "<PERSON>";

    private static final Pattern EMAIL = Pattern.compile("[\\w.+-]+@[\\w-]+(\\.[\\w-]+)+");
    // A UPI handle has no domain dot after the @: rahul.k@okaxis, 9876543210@ybl —
    // a full stop ending the sentence is fine ("…via 9876543210@ybl.")
    private static final Pattern UPI_ID = Pattern.compile("[\\w.-]{2,}@[a-zA-Z]{2,}\\b(?!\\.\\w)");
    private static final Pattern MASKED = Pattern.compile("[x*•X]{3,}\\s*\\d{2,}");
    private static final Pattern PHONE = Pattern.compile("(?<!\\d)(\\+?91[\\s-]?)?[6-9]\\d{9}(?!\\d)");
    private static final Pattern LONG_NUMBER = Pattern.compile("\\d{6,}");

    private final List<Pattern> names;

    /** @param knownNames names to scrub wherever they appear (parts shorter than 3 letters are ignored) */
    public Anonymizer(Collection<String> knownNames) {
        Set<String> parts = new TreeSet<>(Comparator.comparingInt(String::length).reversed().thenComparing(s -> s));
        for (String n : knownNames == null ? List.<String>of() : knownNames) {
            // A UPI id or number isn't a name ("9876543210@ybl" would make "ybl" one);
            // the patterns below already cover them
            if (n == null || n.contains("@") || n.matches(".*\\d.*")) continue;
            String full = n.trim();
            if (full.length() >= 3) parts.add(full);
            for (String p : full.split("[^\\p{L}]+")) if (p.length() >= 3) parts.add(p);
        }
        this.names = parts.stream()
                .map(p -> Pattern.compile("(?<![\\p{L}])" + Pattern.quote(p) + "(?![\\p{L}])",
                        Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE))
                .toList();
    }

    public static Anonymizer withNames(Collection<String> knownNames) {
        return new Anonymizer(knownNames);
    }

    /** Free text (a copilot question or answer, a narration). */
    public String text(String s) {
        if (s == null) return null;
        String out = EMAIL.matcher(s).replaceAll("<EMAIL>");
        out = UPI_ID.matcher(out).replaceAll("<UPI_ID>");
        out = MASKED.matcher(out).replaceAll("<MASKED>");
        out = PHONE.matcher(out).replaceAll("<PHONE>");
        out = LONG_NUMBER.matcher(out).replaceAll("<NUM>");
        for (Pattern p : names) out = p.matcher(out).replaceAll(Matcher.quoteReplacement(PERSON));
        return out;
    }

    /**
     * A transaction's merchant text. When the payee looks like a person the
     * whole payee becomes {@code <PERSON>} ("Paid to <PERSON>"); a business
     * name is kept, since it's what categorisation learns from.
     */
    public String merchant(String merchant) {
        if (merchant == null) return null;
        String payee = MerchantCategorizer.payeeOf(merchant);
        boolean person = MerchantCategorizer.classify(merchant)
                .map(c -> Categorized.PERSON.equals(c.source())).orElse(false);
        String m = person && !payee.isBlank() ? merchant.replace(payee, PERSON) : merchant;
        return text(m);
    }
}
