package com.fintwin.util;

import com.fintwin.model.HoldingTransaction;
import com.fintwin.model.Investment;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class HoldingReturnsTest {

    static final LocalDate TODAY = LocalDate.of(2026, 11, 27);

    static Investment holding(long id, Double invested, Double value, LocalDate bought) {
        Investment i = new Investment();
        i.setId(id);
        i.setInvestedAmount(invested);
        i.setCurrentValue(value);
        i.setPurchaseDate(bought);
        return i;
    }

    @Test
    void usesTheStatementsTransactionsWhenThereAreAny() {
        Investment fund = holding(1, 10_000.0, 12_100.0, TODAY.minusYears(2));
        List<HoldingTransaction> lines = List.of(
                new HoldingTransaction(fund, TODAY.minusYears(2), "PURCHASE", 10_000.0, 100.0, 100.0),
                new HoldingTransaction(fund, TODAY.minusYears(2), "STAMP_DUTY_TAX", 0.5, null, null),
                new HoldingTransaction(fund, TODAY.minusYears(1), "DIVIDEND_REINVEST", 300.0, 2.0, 150.0));
        var r = HoldingReturns.of(List.of(fund), Map.of(1L, lines), TODAY);
        assertThat(r.holdings().get(1L).estimated()).isFalse();
        assertThat(r.holdings().get(1L).xirr()).isCloseTo(0.10, within(0.001));
        assertThat(r.portfolio()).isCloseTo(0.10, within(0.001));
    }

    @Test
    void aRedemptionAndADividendCountAsMoneyBack() {
        Investment fund = holding(1, null, 0.0, null);
        List<HoldingTransaction> lines = List.of(
                new HoldingTransaction(fund, TODAY.minusYears(2), "PURCHASE", 10_000.0, 100.0, 100.0),
                new HoldingTransaction(fund, TODAY.minusYears(1), "DIVIDEND_PAYOUT", 1_000.0, null, null),
                new HoldingTransaction(fund, TODAY, "DIVIDEND_PAYOUT", -1_000.0, null, null),
                new HoldingTransaction(fund, TODAY, "REDEMPTION", -10_000.0, -100.0, 100.0));
        assertThat(HoldingReturns.of(List.of(fund), Map.of(1L, lines), TODAY).holdings().get(1L).xirr())
                .isCloseTo(0.10, within(0.001));   // 10% paid out each year (whatever the printed sign), capital back
    }

    @Test
    void aHandAddedHoldingIsEstimatedFromItsAmountAndDate() {
        Investment fd = holding(2, 100_000.0, 121_000.0, TODAY.minusYears(2));
        Investment noDate = holding(3, 5_000.0, 6_000.0, null);
        var r = HoldingReturns.of(List.of(fd, noDate), Map.of(), TODAY);
        assertThat(r.holdings().get(2L).estimated()).isTrue();
        assertThat(r.holdings().get(2L).xirr()).isCloseTo(0.10, within(0.001));
        assertThat(r.holdings()).doesNotContainKey(3L);
    }
}
