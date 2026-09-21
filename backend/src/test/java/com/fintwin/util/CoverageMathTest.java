package com.fintwin.util;

import com.fintwin.model.Transaction;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class CoverageMathTest {

    private static final LocalDate TODAY = LocalDate.of(2026, 9, 21);

    private static Transaction row(String date, String account, String source, String externalId) {
        Transaction t = new Transaction();
        t.setDate(LocalDate.parse(date));
        t.setAmount(-100.0);
        t.setAccountRef(account);
        t.setSource(source);
        t.setExternalId(externalId);
        return t;
    }

    private static Transaction stmt(String date, String account) {
        return row(date, account, "STATEMENT", StatementImport.EXTERNAL_ID_PREFIX + date);
    }

    private static Transaction alert(String date, String account) {
        return row(date, account, "EMAIL", "MAIL:" + date);
    }

    private static CoverageMath.AccountCoverage only(List<Transaction> rows) {
        List<CoverageMath.AccountCoverage> all = CoverageMath.coverage(rows, TODAY);
        assertThat(all).hasSize(1);
        return all.get(0);
    }

    @Test
    void statementsThroughLastMonthAreCurrent() {
        var c = only(List.of(stmt("2026-07-10", "HDFC ··1234"), stmt("2026-08-28", "HDFC ··1234")));
        assertThat(c.status()).isEqualTo(CoverageMath.Status.CURRENT);
        assertThat(c.statementsUpTo()).isEqualTo(LocalDate.of(2026, 8, 28));
        assertThat(c.missingMonths()).isEmpty();
        assertThat(c.nudgeFor(TODAY)).isNull();
    }

    @Test
    void aMissingMonthIsReportedAndNudged() {
        var c = only(List.of(stmt("2026-06-05", "HDFC ··1234"), stmt("2026-07-12", "HDFC ··1234")));
        assertThat(c.status()).isEqualTo(CoverageMath.Status.BEHIND);
        assertThat(c.missingMonths()).containsExactly(YearMonth.of(2026, 8));
        assertThat(c.nudgeFor(TODAY)).isEqualTo(YearMonth.of(2026, 8));
    }

    @Test
    void aHoleInTheMiddleIsReportedToo() {
        var c = only(List.of(stmt("2026-06-05", "SBI ··6789"), stmt("2026-08-12", "SBI ··6789")));
        assertThat(c.missingMonths()).containsExactly(YearMonth.of(2026, 7));
        assertThat(c.nudgeFor(TODAY)).isNull();   // the latest month is in; July is shown, not nagged
    }

    @Test
    void onlyTheLastSixMonthsAreReported() {
        var c = only(List.of(stmt("2025-01-15", "HDFC ··1234")));
        assertThat(c.missingMonths()).hasSize(CoverageMath.LOOKBACK_MONTHS)
                .first().isEqualTo(YearMonth.of(2026, 3));
    }

    @Test
    void recentAlertsMakeTheAccountLiveAndSilenceTheNudge() {
        var c = only(List.of(stmt("2026-07-12", "HDFC ··1234"), alert("2026-09-20", "HDFC ··1234")));
        assertThat(c.status()).isEqualTo(CoverageMath.Status.LIVE);
        assertThat(c.lastAlert()).isEqualTo(LocalDate.of(2026, 9, 20));
        assertThat(c.missingMonths()).containsExactly(YearMonth.of(2026, 8));
        assertThat(c.nudgeFor(TODAY)).isNull();
    }

    @Test
    void alertsThatStoppedAreNotLive() {
        var c = only(List.of(alert("2026-08-01", "HDFC ··1234")));
        assertThat(c.status()).isEqualTo(CoverageMath.Status.BEHIND);
    }

    @Test
    void noNudgeOnTheFirstBeforeBanksPublishStatements() {
        var c = CoverageMath.coverage(List.of(stmt("2026-07-12", "HDFC ··1234")), LocalDate.of(2026, 9, 1)).get(0);
        assertThat(c.nudgeFor(LocalDate.of(2026, 9, 1))).isNull();
        assertThat(c.nudgeFor(LocalDate.of(2026, 9, 2))).isEqualTo(YearMonth.of(2026, 8));
    }

    @Test
    void groupsByAccountAndPutsAccountsNeedingAttentionFirst() {
        List<Transaction> rows = new ArrayList<>(List.of(
                stmt("2026-08-30", "HDFC ··1234"),
                stmt("2026-06-30", "ICICI ··345"),
                row("2026-09-18", "HDFC ··5678", "CARD", "MAIL:c1")));   // alerting: live
        var all = CoverageMath.coverage(rows, TODAY);

        assertThat(all).extracting(CoverageMath.AccountCoverage::account)
                .containsExactly("ICICI ··345", "HDFC ··5678", "HDFC ··1234");
        assertThat(all.get(1).card()).isTrue();
    }

    @Test
    void manualEntriesAreNotAnAccount_unlabelledImportsAndBankLinksAre() {
        var all = CoverageMath.coverage(List.of(
                row("2026-09-10", null, "MANUAL", null),
                row("2026-09-10", null, "STATEMENT", StatementImport.EXTERNAL_ID_PREFIX + "x"),
                row("2026-09-10", null, "CARD", StatementImport.EXTERNAL_ID_PREFIX + "y"),
                row("2026-09-10", null, "BANK", "setu-txn-1")), TODAY);

        assertThat(all).extracting(CoverageMath.AccountCoverage::account)
                .containsExactlyInAnyOrder(CoverageMath.UNLABELLED_BANK, CoverageMath.UNLABELLED_CARD,
                        CoverageMath.LINKED_BANK);
        assertThat(all).filteredOn(c -> c.account().equals(CoverageMath.LINKED_BANK))
                .extracting(CoverageMath.AccountCoverage::status).containsExactly(CoverageMath.Status.LIVE);
    }

    @Test
    void monthNamesCarryTheYearOnlyWhenItDiffers() {
        assertThat(CoverageMath.monthName(YearMonth.of(2026, 8), TODAY)).isEqualTo("August");
        assertThat(CoverageMath.monthName(YearMonth.of(2025, 12), TODAY)).isEqualTo("December 2025");
    }
}
