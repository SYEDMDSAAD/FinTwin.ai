package com.fintwin.util;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

/**
 * Tells a person from a shop that goes by its owner's name, using how the user
 * pays them. A statement only names the payee — "DATTA MURLIDHAR MEKARKAR" —
 * and the business category the UPI app sees never reaches it.
 *
 * A shop never sends the user money and is paid small sums; people send
 * money back, or are paid large ones. On one user's hand-checked PhonePe
 * statement this placed 11 of 12 such payees, against 3 of 12 when every
 * full name was taken for a person. The miss was a friend paid ₹70 once:
 * only the user can tell that apart.
 */
public final class PaymentPatterns {

    private PaymentPatterns() {}

    /** A payment this large goes to a person, not a stall. */
    static final double PERSON_AMOUNT = 500.0;

    /** What the user's money says about one payee. */
    public record PayeeStats(boolean receivedFrom, double largestPayment) {

        PayeeStats add(double amount) {
            return amount > 0
                    ? new PayeeStats(true, largestPayment)
                    : new PayeeStats(receivedFrom, Math.max(largestPayment, -amount));
        }
    }

    /** Collects {@link PayeeStats} payee by payee, sent and received alike. */
    public static final class Ledger {
        private final Map<String, PayeeStats> byPayee = new HashMap<>();

        public void add(String merchant, Double amount) {
            if (merchant == null || amount == null || amount == 0) return;
            byPayee.merge(key(merchant), new PayeeStats(false, 0).add(amount),
                    (a, b) -> new PayeeStats(a.receivedFrom() || b.receivedFrom(),
                            Math.max(a.largestPayment(), b.largestPayment())));
        }

        public PayeeStats of(String merchant) {
            return byPayee.getOrDefault(key(merchant), new PayeeStats(false, 0));
        }
    }

    /**
     * Whether a prediction is one this rule may revisit: a name taken for a
     * person (or already placed by this rule). Masked contacts and phone-number
     * UPI ids are people whatever the amounts.
     */
    public static boolean applies(String source, String merchant) {
        return (Categorized.PERSON.equals(source) || Categorized.PAYMENT_PATTERN.equals(source))
                && !MerchantCategorizer.isCertainPerson(merchant);
    }

    /**
     * People or Local Shops for a payee {@link #applies} to; empty when the
     * rule has nothing to say about this prediction.
     */
    public static Optional<Categorized> refine(String source, String merchant, PayeeStats stats) {
        if (!applies(source, merchant)) return Optional.empty();
        boolean person = stats.receivedFrom() || stats.largestPayment() >= PERSON_AMOUNT;
        return Optional.of(person
                ? new Categorized(MerchantCategorizer.PEOPLE, Categorized.PERSON)
                : new Categorized(MerchantCategorizer.LOCAL_SHOPS, Categorized.PAYMENT_PATTERN));
    }

    // "Paid to SOUMIK ROY" and "Received from Soumik  Roy" are the same payee
    private static String key(String merchant) {
        return MerchantCategorizer.payeeOf(merchant).toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }
}
