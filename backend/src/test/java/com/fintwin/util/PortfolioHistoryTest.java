package com.fintwin.util;

import com.fintwin.model.HoldingTransaction;
import com.fintwin.model.Investment;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class PortfolioHistoryTest {

    @Test
    void unitsAtEachMonthEndTimesThatMonthsNav() {
        Investment f = new Investment();
        f.setId(1L);
        f.setType("Mutual Fund");
        f.setTickerCode("122639");
        var ts = List.of(
                new HoldingTransaction(f, LocalDate.of(2026, 9, 5), "PURCHASE_SIP", 5000.0, 50.0, 100.0),
                new HoldingTransaction(f, LocalDate.of(2026, 9, 5), "STAMP_DUTY_TAX", 0.25, null, null),
                new HoldingTransaction(f, LocalDate.of(2026, 10, 5), "PURCHASE_SIP", 5000.0, 45.45, 110.0),
                new HoldingTransaction(f, LocalDate.of(2026, 11, 10), "REDEMPTION", -2400.0, -20.0, 120.0));
        Investment byHand = new Investment();
        byHand.setId(2L);
        byHand.setType("Mutual Fund");
        byHand.setTickerCode("100001");

        var navs = Map.of("2026-09", 102.0, "2026-10", 110.0);   // November not published yet: October's carries
        var points = PortfolioHistory.of(List.of(f, byHand), Map.of(1L, ts), (code, from) -> navs,
                LocalDate.of(2026, 11, 27));

        assertThat(points).extracting(PortfolioHistory.Point::month).containsExactly("2026-09", "2026-10", "2026-11");
        assertThat(points.get(0).invested()).isEqualTo(5000);
        assertThat(points.get(0).value()).isEqualTo(5100);       // 50 × 102
        assertThat(points.get(1).value()).isEqualTo(10500);      // 95.45 × 110
        assertThat(points.get(2).invested()).isEqualTo(7600);    // 10,000 in, 2,400 out
        assertThat(points.get(2).value()).isEqualTo(8300);       // 75.45 × 110
    }

    @Test
    void nothingToChartWithoutAStatement() {
        Investment f = new Investment();
        f.setId(1L);
        f.setType("Stocks");
        assertThat(PortfolioHistory.of(List.of(f), Map.of(), (c, m) -> Map.of(), LocalDate.now())).isEmpty();
    }
}
