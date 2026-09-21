package com.fintwin.util;

import org.junit.jupiter.api.Test;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;

class StatementImportTest {

    // ── parseAmount ──────────────────────────────────────────────────────────

    @Test
    void readsIndianGroupedAmounts() {
        // parseFloat("1,250.00") in the browser was reading this as ₹1
        assertThat(StatementImport.parseAmount("1,250.00")).isEqualTo(1250.0);
        assertThat(StatementImport.parseAmount("1,23,456.78")).isEqualTo(123456.78);
    }

    @Test
    void drSuffixIsADebitAndCrSuffixIsACredit() {
        assertThat(StatementImport.parseAmount("1,250.00 Dr")).isEqualTo(-1250.0);
        assertThat(StatementImport.parseAmount("500.00 Cr")).isEqualTo(500.0);
        assertThat(StatementImport.parseAmount("649.00DR")).isEqualTo(-649.0);
        assertThat(StatementImport.parseAmount("649.00 Cr.")).isEqualTo(649.0);
    }

    @Test
    void drCrSuffixSetsTheSignRegardlessOfAnySignOnTheNumber() {
        assertThat(StatementImport.parseAmount("-1,250.00 Dr")).isEqualTo(-1250.0);
        assertThat(StatementImport.parseAmount("-500 Cr")).isEqualTo(500.0);
    }

    @Test
    void bracketedAmountsAreNegative() {
        assertThat(StatementImport.parseAmount("(1,250.00)")).isEqualTo(-1250.0);
    }

    @Test
    void stripsCurrencyMarkers() {
        assertThat(StatementImport.parseAmount("₹ 649")).isEqualTo(649.0);
        assertThat(StatementImport.parseAmount("Rs. 500")).isEqualTo(500.0);
        assertThat(StatementImport.parseAmount("INR 2,000.50")).isEqualTo(2000.5);
        assertThat(StatementImport.parseAmount("-₹649")).isEqualTo(-649.0);
    }

    @Test
    void passesNumbersThroughUnchanged() {
        assertThat(StatementImport.parseAmount(-649.0)).isEqualTo(-649.0);
        assertThat(StatementImport.parseAmount(500)).isEqualTo(500.0);
    }

    @Test
    void blanksAndPlaceholdersAreAbsentNotZero() {
        assertThat(StatementImport.parseAmount(null)).isNull();
        assertThat(StatementImport.parseAmount("")).isNull();
        assertThat(StatementImport.parseAmount("   ")).isNull();
        assertThat(StatementImport.parseAmount("-")).isNull();
        assertThat(StatementImport.parseAmount("INVALID")).isNull();
    }

    // ── externalId ───────────────────────────────────────────────────────────

    private static final LocalDate DAY = LocalDate.of(2026, 9, 1);

    @Test
    void sameRowAlwaysGetsTheSameId() {
        String a = StatementImport.externalId(DAY, -649.0, "UPI/NETFLIX", 10_000.0, 0);
        String b = StatementImport.externalId(DAY, -649.0, "UPI/NETFLIX", 10_000.0, 0);
        assertThat(a).isEqualTo(b).startsWith(StatementImport.EXTERNAL_ID_PREFIX);
    }

    @Test
    void identicalSiblingsAreToldApartByOrdinal() {
        // Two ₹20 chais at the same stall on the same day are both real
        String first  = StatementImport.externalId(DAY, -20.0, "UPI/CHAI POINT", null, 0);
        String second = StatementImport.externalId(DAY, -20.0, "UPI/CHAI POINT", null, 1);
        assertThat(first).isNotEqualTo(second);
    }

    @Test
    void narrationCaseAndSpacingDoNotChangeTheId() {
        // Banks re-export the same row with different padding between downloads
        String a = StatementImport.externalId(DAY, -649.0, "UPI/NETFLIX  COM", null, 0);
        String b = StatementImport.externalId(DAY, -649.0, " upi/netflix com ", null, 0);
        assertThat(a).isEqualTo(b);
    }

    @Test
    void anyMaterialDifferenceChangesTheId() {
        String base = StatementImport.externalId(DAY, -649.0, "NETFLIX", 1000.0, 0);
        assertThat(StatementImport.externalId(DAY.plusDays(1), -649.0, "NETFLIX", 1000.0, 0)).isNotEqualTo(base);
        assertThat(StatementImport.externalId(DAY, -650.0, "NETFLIX", 1000.0, 0)).isNotEqualTo(base);
        assertThat(StatementImport.externalId(DAY, -649.0, "SPOTIFY", 1000.0, 0)).isNotEqualTo(base);
        assertThat(StatementImport.externalId(DAY, -649.0, "NETFLIX", 351.0, 0)).isNotEqualTo(base);
    }

    @Test
    void idFitsTheExternalIdColumn() {
        assertThat(StatementImport.externalId(DAY, -1.0, "x", null, 0)).hasSizeLessThanOrEqualTo(255);
    }
}
