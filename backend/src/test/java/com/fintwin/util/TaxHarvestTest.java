package com.fintwin.util;

import com.fintwin.model.HoldingTransaction;
import com.fintwin.model.Investment;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class TaxHarvestTest {

    static final LocalDate TODAY = LocalDate.of(2027, 2, 15);   // FY 2026-27

    static Investment fund(long id, String cls, double units, double value) {
        Investment i = new Investment();
        i.setId(id);
        i.setName("Fund " + id);
        i.setType("Mutual Fund");
        i.setAssetClass(cls);
        i.setUnits(units);
        i.setCurrentValue(value);
        return i;
    }

    static HoldingTransaction buy(Investment i, LocalDate d, double amount, double units) {
        return new HoldingTransaction(i, d, "PURCHASE_SIP", amount, units, amount / units);
    }

    @Test
    void onlyUnitsHeldOverAYearCountAndTheAllowanceCapsIt() {
        Investment f = fund(1, "EQUITY", 300, 60_000);                     // NAV 200 today
        var ts = List.of(buy(f, LocalDate.of(2025, 1, 10), 10_000, 100),    // cost 100: long term, +10,000
                         buy(f, LocalDate.of(2025, 6, 10), 15_000, 100),    // cost 150: long term, +5,000
                         buy(f, LocalDate.of(2026, 6, 10), 18_000, 100));   // short term: not counted
        var r = TaxHarvest.of(List.of(f), Map.of(1L, ts), TODAY);
        assertThat(r.fyStart()).isEqualTo(LocalDate.of(2026, 4, 1));
        assertThat(r.unrealisedLongTerm()).isCloseTo(15_000, within(0.01));
        assertThat(r.harvestable()).isCloseTo(15_000, within(0.01));
        assertThat(r.holdings()).singleElement().satisfies(l -> assertThat(l.units()).isEqualTo(200.0));
    }

    @Test
    void gainsAlreadyBookedThisYearUseUpTheAllowanceFirstInFirstOut() {
        Investment f = fund(1, "EQUITY", 1_000, 400_000);                   // NAV 400
        var ts = List.of(buy(f, LocalDate.of(2024, 1, 10), 100_000, 1_000), // cost 100
                         buy(f, LocalDate.of(2024, 2, 10), 100_000, 1_000),
                         new HoldingTransaction(f, LocalDate.of(2026, 5, 1), "REDEMPTION", -300_000.0, -1_000.0, 300.0));
        var r = TaxHarvest.of(List.of(f), Map.of(1L, ts), TODAY);
        assertThat(r.realisedThisYear()).isCloseTo(200_000, within(0.01));  // sold the first lot at 300
        assertThat(r.unrealisedLongTerm()).isCloseTo(300_000, within(0.01));
        assertThat(r.harvestable()).isZero();                               // allowance already used
    }

    @Test
    void debtFundsAndHistoriesThatDontAddUpAreLeftOut() {
        Investment debt = fund(1, "DEBT", 100, 20_000);
        Investment gap = fund(2, "EQUITY", 500, 100_000);                   // history shows only 100 units
        Investment old = fund(3, "EQUITY", 100, 50_000);
        var r = TaxHarvest.of(List.of(debt, gap, old), Map.of(
                1L, List.of(buy(debt, LocalDate.of(2024, 1, 1), 10_000, 100)),
                2L, List.of(buy(gap, LocalDate.of(2024, 1, 1), 10_000, 100)),
                3L, List.of(buy(old, LocalDate.of(2017, 6, 1), 10_000, 100))), TODAY);
        assertThat(r.unrealisedLongTerm()).isZero();
        assertThat(r.leftOut()).isEqualTo(2);
    }

    @Test
    void theFinancialYearStartsInApril() {
        assertThat(TaxHarvest.fyStart(LocalDate.of(2027, 3, 31))).isEqualTo(LocalDate.of(2026, 4, 1));
        assertThat(TaxHarvest.fyStart(LocalDate.of(2027, 4, 1))).isEqualTo(LocalDate.of(2027, 4, 1));
    }
}
