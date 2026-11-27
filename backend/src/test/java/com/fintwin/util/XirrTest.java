package com.fintwin.util;

import com.fintwin.util.Xirr.Flow;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class XirrTest {

    static final LocalDate D = LocalDate.of(2024, 1, 1);

    @Test
    void lumpSumThatDoublesInTwoYearsIsAbout41PercentAYear() {
        Double r = Xirr.of(List.of(new Flow(D, -100_000), new Flow(D.plusDays(730), 200_000)));
        assertThat(r).isCloseTo(Math.sqrt(2) - 1, within(1e-4));
    }

    @Test
    void monthlySipMatchesTheSpreadsheetFigure() {
        // 24 instalments of 5,000 worth 1,40,000 a month after the last:
        // about 15.5% a year (checked against an independent solver).
        List<Flow> fs = new ArrayList<>();
        for (int m = 0; m < 24; m++) fs.add(new Flow(D.plusMonths(m), -5_000));
        fs.add(new Flow(D.plusMonths(24), 140_000));
        assertThat(Xirr.of(fs)).isCloseTo(0.1553, within(0.001));
    }

    @Test
    void aLossIsNegative() {
        assertThat(Xirr.of(List.of(new Flow(D, -100_000), new Flow(D.plusDays(365 * 2), 81_000))))
                .isCloseTo(-0.1, within(1e-3));
    }

    @Test
    void noFigureUnderAYearOrWithoutMoneyBothWays() {
        assertThat(Xirr.of(List.of(new Flow(D, -100), new Flow(D.plusDays(200), 110)))).isNull();
        assertThat(Xirr.of(List.of(new Flow(D, -100), new Flow(D.plusDays(400), -50)))).isNull();
        assertThat(Xirr.of(List.of(new Flow(D, -100)))).isNull();
    }
}
