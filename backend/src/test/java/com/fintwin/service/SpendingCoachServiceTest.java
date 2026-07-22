package com.fintwin.service;

import com.fintwin.model.Transaction;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class SpendingCoachServiceTest {

    @Test
    void windowFingerprint_isStableForTheSameWindow() {
        assertThat(SpendingCoachService.windowFingerprint(window()))
                .isEqualTo(SpendingCoachService.windowFingerprint(window()));
    }

    @Test
    void windowFingerprint_changesWhenAnyTransactionChanges() {
        String baseline = SpendingCoachService.windowFingerprint(window());

        List<Transaction> edited = window();
        edited.get(1).setAmount(-999.0);
        assertThat(SpendingCoachService.windowFingerprint(edited)).isNotEqualTo(baseline);

        List<Transaction> extended = window();
        extended.add(txn(4L, -50.0, "Chai", "Food", LocalDate.of(2026, 7, 3)));
        assertThat(SpendingCoachService.windowFingerprint(extended)).isNotEqualTo(baseline);
    }

    @Test
    void windowFingerprint_survivesNullFields() {
        // Imported rows can miss category or merchant; the digest must not throw.
        List<Transaction> txns = List.of(txn(1L, null, null, null, null));
        assertThat(SpendingCoachService.windowFingerprint(txns)).isNotBlank();
    }

    private static List<Transaction> window() {
        return new java.util.ArrayList<>(List.of(
                txn(1L, 50_000.0, "Salary",  "Income", LocalDate.of(2026, 6, 28)),
                txn(2L, -8_000.0, "Rent",    "Housing", LocalDate.of(2026, 7, 1)),
                txn(3L, -649.0,   "Netflix", "Entertainment", LocalDate.of(2026, 7, 2))
        ));
    }

    private static Transaction txn(Long id, Double amount, String merchant,
                                   String category, LocalDate date) {
        Transaction t = new Transaction();
        t.setId(id);
        t.setAmount(amount);
        t.setMerchant(merchant);
        t.setCategory(category);
        t.setDate(date);
        return t;
    }
}
