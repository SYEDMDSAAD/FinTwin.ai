package com.fintwin.service;

import com.fintwin.util.Categorized;
import com.fintwin.util.TransactionMath;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The bank sync categorises with the same rules as statements and alert
 * emails, so one payment lands in one category whichever way it arrived.
 */
class BankSyncCategoryTest {

    private final CategoryService categories = new CategoryService();
    private final BankConnectionService bank =
            new BankConnectionService(null, null, null, null, null, null, categories);

    private Categorized bank(String narration, String type) {
        return bank.deriveCategory(narration, type, Map.of(), false, false);
    }

    @ParameterizedTest(name = "{0} ({1})")
    @CsvSource(delimiter = '|', value = {
            "UPI/412345/SWIGGY/swiggy@icici          | DEBIT",
            "UPI/412345/Kolar Gold Traders/kgt@ybl   | DEBIT",
            "POS 4521 BILLING COUNTER RAJ STORES     | DEBIT",
            "UPI/99/Noor bakery show room/nb@ok      | DEBIT",
            "NEFT CR-ACME PVT LTD-SALARY SEP         | CREDIT",
            "NEFT CR-ACME PVT LTD                    | CREDIT",
            "UPI/88/RAHUL KUMAR SHARMA/rk@ybl        | CREDIT",
            "SALARY ADVANCE RECOVERY                 | DEBIT",
            "IMPS/transfer to self HDFC              | DEBIT",
    })
    void bankAndStatementAgree(String narration, String type) {
        double amount = "CREDIT".equals(type) ? 1_000 : -1_000;
        assertThat(bank(narration, type))
                .isEqualTo(categories.classify(narration, Map.of(), amount));
    }

    @Test
    void theOldKeywordListsMistakesAreGone() {
        // "ola" inside "Kolar" used to make this Transport
        assertThat(bank("UPI/412345/Kolar Gold Traders/kgt@ybl", "DEBIT").category()).isNotEqualTo("Transport");
        // "bill" anywhere used to make it Utilities, a category nothing else uses
        assertThat(bank("POS 4521 BILLING COUNTER RAJ STORES", "DEBIT").category()).isNotEqualTo("Utilities");
        // an unrecognised credit is no longer assumed to be income
        assertThat(bank("NEFT CR-ACME PVT LTD", "CREDIT").category()).isEqualTo("Other");
        // and a named salary still is
        assertThat(bank("NEFT CR-ACME PVT LTD-SALARY SEP", "CREDIT")).isEqualTo(new Categorized("Income", Categorized.BRAND));
    }

    @Test
    void moneyGoingOutIsNeverIncome() {
        assertThat(bank("SALARY ADVANCE RECOVERY", "DEBIT").category()).isNotEqualTo("Income");
        assertThat(categories.classify("BONUS PAYOUT", Map.of(), -500.0).category()).isEqualTo("Other");
        assertThat(categories.classify("BONUS PAYOUT", Map.of(), 500.0).category()).isEqualTo("Income");
        assertThat(categories.classify("BONUS PAYOUT", Map.of(), null).category()).isEqualTo("Income");
    }

    @Test
    void theUsersOwnRuleStillComesFirst() {
        Map<String, String> learned = Map.of("upi/412345/kolar gold traders/kgt@ybl", "Shopping");
        assertThat(bank.deriveCategory("UPI/412345/Kolar Gold Traders/kgt@ybl", "DEBIT", learned, false, false))
                .isEqualTo(new Categorized("Shopping", Categorized.LEARNED));
    }

    @Test
    void cardBookkeepingIsUnchanged() {
        assertThat(bank.deriveCategory("PAYMENT RECEIVED THANK YOU", "CREDIT", Map.of(), true, true))
                .isEqualTo(new Categorized(TransactionMath.CARD_PAYMENT_CATEGORY, Categorized.FORCED));
        assertThat(bank.deriveCategory("REFUND AMAZON", "CREDIT", Map.of(), true, true))
                .isEqualTo(new Categorized("Other", Categorized.FORCED));
    }
}
