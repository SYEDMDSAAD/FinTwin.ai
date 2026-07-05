package com.fintwin.util;

import com.fintwin.model.Transaction;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class TransactionMathTest {

    @Test
    void monthsPresent_countsDistinctMonths_neverBelowOne() {
        assertThat(TransactionMath.monthsPresent(List.of())).isEqualTo(1);

        List<Transaction> txns = List.of(
                txn(1000.0, "Employer", "Income", LocalDate.of(2026, 5, 1)),
                txn(-200.0, "Swiggy",   "Food",   LocalDate.of(2026, 5, 15)),
                txn(-300.0, "Swiggy",   "Food",   LocalDate.of(2026, 6, 10))
        );
        assertThat(TransactionMath.monthsPresent(txns)).isEqualTo(2);
    }

    @Test
    void income_and_expenses_excludeNullsAndSelfTransfers() {
        List<Transaction> txns = List.of(
                txn(50_000.0,  "Employer",              "Income",   LocalDate.now()),
                txn(-8_000.0,  "Rent",                  "Housing",  LocalDate.now()),
                txn(-20_000.0, "UPI Self Transfer",     null,       LocalDate.now()),
                txn(20_000.0,  "NEFT from own account", null,       LocalDate.now()),
                txn(-1_000.0,  "Moved savings",         "Transfer", LocalDate.now()),
                txn(null,      "Broken row",            "Food",     LocalDate.now())
        );

        assertThat(TransactionMath.income(txns)).isEqualTo(50_000.0);
        assertThat(TransactionMath.expenses(txns)).isEqualTo(8_000.0);
    }

    @Test
    void isSelfTransfer_matchesMarkersAndTransferCategory_caseInsensitive() {
        assertThat(TransactionMath.isSelfTransfer(txn(-1.0, "SELF TRANSFER to SBI", null, null))).isTrue();
        assertThat(TransactionMath.isSelfTransfer(txn(-1.0, "transfer to own account", null, null))).isTrue();
        assertThat(TransactionMath.isSelfTransfer(txn(-1.0, "Swiggy", "transfer", null))).isTrue();
        // Credit-card bill payments are deliberately NOT excluded
        assertThat(TransactionMath.isSelfTransfer(txn(-1.0, "Credit Card Payment", "Bills", null))).isFalse();
        assertThat(TransactionMath.isSelfTransfer(txn(-1.0, null, null, null))).isFalse();
    }

    private static Transaction txn(Double amount, String merchant, String category, LocalDate date) {
        Transaction t = new Transaction();
        t.setAmount(amount);
        t.setMerchant(merchant);
        t.setCategory(category);
        t.setDate(date);
        return t;
    }
}
