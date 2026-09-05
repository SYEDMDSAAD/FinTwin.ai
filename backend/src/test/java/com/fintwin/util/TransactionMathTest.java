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
    void netSavingsByMonth_groupsByMonth_skipsSelfTransfersAndBrokenRows() {
        List<Transaction> txns = List.of(
                txn(50_000.0,  "Salary",            "Income",   LocalDate.of(2026, 5, 28)),
                txn(-30_000.0, "Rent",              "Housing",  LocalDate.of(2026, 5, 3)),
                txn(60_000.0,  "Salary",            "Income",   LocalDate.of(2026, 6, 28)),
                txn(-70_000.0, "Hospital",          "Health",   LocalDate.of(2026, 6, 30)),
                txn(-15_000.0, "UPI Self Transfer", null,       LocalDate.of(2026, 5, 4)),
                txn(null,      "Broken row",        "Food",     LocalDate.of(2026, 5, 5)),
                txn(1_000.0,   "No date",           "Income",   null)
        );

        var byMonth = TransactionMath.netSavingsByMonth(txns);

        assertThat(byMonth).hasSize(2);
        assertThat(byMonth.get(java.time.YearMonth.of(2026, 5))).isEqualTo(20_000.0);
        // Overspent months stay negative here; callers decide how to treat them
        assertThat(byMonth.get(java.time.YearMonth.of(2026, 6))).isEqualTo(-10_000.0);
    }

    @Test
    void isSelfTransfer_matchesMarkersAndTransferCategory_caseInsensitive() {
        assertThat(TransactionMath.isSelfTransfer(txn(-1.0, "SELF TRANSFER to SBI", null, null))).isTrue();
        assertThat(TransactionMath.isSelfTransfer(txn(-1.0, "transfer to own account", null, null))).isTrue();
        assertThat(TransactionMath.isSelfTransfer(txn(-1.0, "Swiggy", "transfer", null))).isTrue();
        // A card-payment-looking narration alone is NOT enough to exclude a row:
        // for a user with no card connected the bill payment is still the only
        // trace of that spending, and ingest leaves its category alone.
        assertThat(TransactionMath.isSelfTransfer(txn(-1.0, "Credit Card Payment", "Bills", null))).isFalse();
        assertThat(TransactionMath.isSelfTransfer(txn(-1.0, null, null, null))).isFalse();
    }

    @Test
    void cardBillPayments_areExcludedOnceIngestHasStampedTheCategory() {
        // Ingest only assigns this category when the card's own purchases were
        // synced too, so both legs of the bill payment drop out together and the
        // underlying purchases are what remain.
        Transaction bankLeg = txn(-45_000.0, "NEFT DR-CREDIT CARD PAYMENT", "Card Payment", null);
        Transaction cardLeg = txn(45_000.0,  "PAYMENT RECEIVED",            "Card Payment", null);

        assertThat(TransactionMath.isCardBillPayment(bankLeg)).isTrue();
        assertThat(TransactionMath.isSelfTransfer(bankLeg)).isTrue();
        assertThat(TransactionMath.isSelfTransfer(cardLeg)).isTrue();

        // Case-insensitive, like the Transfer category check beside it
        assertThat(TransactionMath.isCardBillPayment(txn(-1.0, "x", "card payment", null))).isTrue();
        assertThat(TransactionMath.isCardBillPayment(txn(-1.0, "x", "Food", null))).isFalse();
    }

    @Test
    void cardSpendIsCountedOnce_notTwice() {
        // One month: a card purchase, the bill that repays it, and the credit
        // that lands on the card. Only the purchase is spending.
        List<Transaction> txns = List.of(
                txn(60_000.0,  "Salary",                 "Income",       LocalDate.of(2026, 5, 1)),
                txn(-12_000.0, "AMAZON",                 "Shopping",     LocalDate.of(2026, 5, 8)),
                txn(-12_000.0, "CREDIT CARD PAYMENT",    "Card Payment", LocalDate.of(2026, 5, 28)),
                txn(12_000.0,  "PAYMENT RECEIVED",       "Card Payment", LocalDate.of(2026, 5, 28))
        );

        assertThat(TransactionMath.expenses(txns)).isEqualTo(12_000.0);
        assertThat(TransactionMath.income(txns)).isEqualTo(60_000.0);
        assertThat(TransactionMath.netSavingsByMonth(txns).get(java.time.YearMonth.of(2026, 5)))
                .isEqualTo(48_000.0);
    }

    @Test
    void incomeReliable_rejectsAWholeHistoryCreditedOnTheImportDate() {
        // 200 credits landing on one day inside a 3-month window: the Setu
        // sandbox signature, and what an imported opening balance looks like.
        List<Transaction> txns = new java.util.ArrayList<>(List.of(
                txn(-30_000.0, "Rent",   "Housing", LocalDate.of(2026, 5, 10)),
                txn(40_000.0,  "Salary", "Income",  LocalDate.of(2026, 5, 28)),
                txn(-25_000.0, "Rent",   "Housing", LocalDate.of(2026, 7, 10))
        ));
        for (int i = 0; i < 200; i++) {
            txns.add(txn(490_000.0, "Bulk credit", "Other", LocalDate.of(2026, 6, 24)));
        }

        assertThat(TransactionMath.incomeConcentration(txns)).isGreaterThan(80.0);
        assertThat(TransactionMath.incomeReliable(txns)).isFalse();
    }

    @Test
    void incomeReliable_acceptsASalaryArrivingEveryMonth() {
        List<Transaction> txns = List.of(
                txn(60_000.0,  "Salary", "Income",  LocalDate.of(2026, 5, 28)),
                txn(60_000.0,  "Salary", "Income",  LocalDate.of(2026, 6, 28)),
                txn(60_000.0,  "Salary", "Income",  LocalDate.of(2026, 7, 28)),
                txn(-30_000.0, "Rent",   "Housing", LocalDate.of(2026, 7, 10))
        );

        assertThat(TransactionMath.incomeConcentration(txns)).isLessThan(80.0);
        assertThat(TransactionMath.incomeReliable(txns)).isTrue();
    }

    @Test
    void incomeReliable_isFalseWithoutAnyIncome() {
        List<Transaction> txns = List.of(
                txn(-500.0, "Swiggy", "Food", LocalDate.of(2026, 6, 1)),
                txn(-700.0, "Swiggy", "Food", LocalDate.of(2026, 7, 1))
        );

        assertThat(TransactionMath.incomeConcentration(txns)).isZero();
        assertThat(TransactionMath.incomeReliable(txns)).isFalse();
    }

    @Test
    void incomeReliable_allowsASingleMonthWindow() {
        // One month of data cannot show a lopsided distribution, so a lone
        // payday is not treated as an artefact.
        List<Transaction> txns = List.of(
                txn(50_000.0,  "Salary", "Income",  LocalDate.of(2026, 7, 1)),
                txn(-20_000.0, "Rent",   "Housing", LocalDate.of(2026, 7, 5))
        );

        assertThat(TransactionMath.incomeReliable(txns)).isTrue();
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
