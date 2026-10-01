package com.fintwin.util;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Payees from a hand-checked PhonePe statement, with invented names and the
 * real amounts. The rule placed 11 of these 12 (the 12th, a friend paid ₹70
 * once, is the case only the user can tell apart).
 */
class PaymentPatternsTest {

    private static String place(PaymentPatterns.Ledger ledger, String merchant) {
        return PaymentPatterns.refine(Categorized.PERSON, merchant, ledger.of(merchant))
                .map(Categorized::category).orElse("unchanged");
    }

    private static PaymentPatterns.Ledger ledger(Object... merchantAmountPairs) {
        PaymentPatterns.Ledger l = new PaymentPatterns.Ledger();
        for (int i = 0; i < merchantAmountPairs.length; i += 2) {
            l.add((String) merchantAmountPairs[i], ((Number) merchantAmountPairs[i + 1]).doubleValue());
        }
        return l;
    }

    @Test
    void stallsAndAutosPaidSmallSums_areLocalShops() {
        PaymentPatterns.Ledger l = ledger(
                "Paid to RAMESH GOPAL PAWAR", -15,      // tea stall
                "Paid to Kiran Dattatray More", -20,     // food stall
                "Paid to SAMEER SALIM SHAIKH", -196,     // auto
                "Paid to VILAS RAOSAHEB JADHAV", -337);  // auto

        assertThat(place(l, "Paid to RAMESH GOPAL PAWAR")).isEqualTo(MerchantCategorizer.LOCAL_SHOPS);
        assertThat(place(l, "Paid to Kiran Dattatray More")).isEqualTo(MerchantCategorizer.LOCAL_SHOPS);
        assertThat(place(l, "Paid to SAMEER SALIM SHAIKH")).isEqualTo(MerchantCategorizer.LOCAL_SHOPS);
        assertThat(place(l, "Paid to VILAS RAOSAHEB JADHAV")).isEqualTo(MerchantCategorizer.LOCAL_SHOPS);
    }

    @Test
    void someoneWhoSentMoneyBack_isAPerson_evenWhenPaidPennies() {
        // a friend: paid ₹10 and ₹20, once sent ₹180
        PaymentPatterns.Ledger l = ledger(
                "Paid to ARJUN DAS GUPTA", -10,
                "Paid to ARJUN DAS GUPTA", -20,
                "Received from ARJUN  DAS GUPTA", 180);

        assertThat(place(l, "Paid to ARJUN DAS GUPTA")).isEqualTo(MerchantCategorizer.PEOPLE);
        assertThat(place(l, "Received from ARJUN  DAS GUPTA")).isEqualTo(MerchantCategorizer.PEOPLE);
    }

    @Test
    void aLargePayment_isAPerson() {
        PaymentPatterns.Ledger l = ledger("Paid to IMRAN AHMED FAROOQUI", -1922);

        assertThat(place(l, "Paid to IMRAN AHMED FAROOQUI")).isEqualTo(MerchantCategorizer.PEOPLE);
    }

    @Test
    void maskedContactsAndPhoneNumberIds_stayPeople_whateverTheAmounts() {
        PaymentPatterns.Ledger l = ledger("Paid to ******1893", -20, "Paid to 9876543210ptyes", -5);

        assertThat(PaymentPatterns.refine(Categorized.PERSON, "Paid to ******1893",
                l.of("Paid to ******1893"))).isEmpty();
        assertThat(PaymentPatterns.refine(Categorized.PERSON, "Paid to 9876543210ptyes",
                l.of("Paid to 9876543210ptyes"))).isEmpty();
    }

    @Test
    void anAlreadyPlacedShop_turnsBackIntoAPerson_whenTheySendMoney() {
        PaymentPatterns.Ledger l = ledger("Paid to NITIN SHAH", -40, "Received from NITIN SHAH", 500);

        assertThat(PaymentPatterns.refine(Categorized.PAYMENT_PATTERN, "Paid to NITIN SHAH",
                l.of("Paid to NITIN SHAH")).map(Categorized::category))
                .contains(MerchantCategorizer.PEOPLE);
    }

    @Test
    void otherRulesPredictions_areLeftAlone() {
        PaymentPatterns.Ledger l = ledger("Paid to Noor bakery", -40);

        assertThat(PaymentPatterns.refine(Categorized.SHOP_WORD, "Paid to Noor bakery",
                l.of("Paid to Noor bakery"))).isEmpty();
        assertThat(PaymentPatterns.refine(Categorized.LEARNED, "Paid to Noor bakery",
                l.of("Paid to Noor bakery"))).isEmpty();
    }
}
