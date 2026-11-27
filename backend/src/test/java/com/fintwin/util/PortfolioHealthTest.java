package com.fintwin.util;

import com.fintwin.model.Investment;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class PortfolioHealthTest {

    static final LocalDate TODAY = LocalDate.of(2026, 11, 27);

    static Investment h(String name, String type, double value, String ticker) {
        Investment i = new Investment();
        i.setName(name);
        i.setType(type);
        i.setCurrentValue(value);
        i.setTickerCode(ticker);
        return i;
    }

    @Test
    void saysWhatIsTrueAndWhatItCostsWithoutNamingAnythingToBuy() {
        Investment regular = h("HDFC Flexi Cap Fund - Regular Plan - Growth", "Mutual Fund", 200_000, "100001");
        Investment direct = h("Parag Parikh Flexi Cap Fund - Direct Plan Growth", "Mutual Fund", 100_000, "122639");
        Investment share = h("INFY", "Stocks", 700_000, null);
        share.setSource("NSDL");
        share.setUnitsAsOf(TODAY.minusDays(60));
        var tax = new TaxHarvest.Result(LocalDate.of(2026, 4, 1), LocalDate.of(2027, 3, 31), 0, 40_000, 40_000, List.of(), 0);

        var checks = PortfolioHealth.of(List.of(regular, direct, share), tax, TODAY);
        assertThat(checks).extracting(PortfolioHealth.Check::id).containsExactly("regular", "one-big", "unpriced", "stale", "tax");
        assertThat(checks.get(0).title()).isEqualTo("HDFC Flexi Cap Fund - Regular Plan - Growth is a Regular plan");
        assertThat(checks.get(0).detail()).contains("₹1,000–₹3,000 a year on ₹200,000");
        assertThat(checks.get(1).title()).isEqualTo("INFY is 70% of your portfolio");
        assertThat(checks.get(4).title()).isEqualTo("About ₹40,000 of gains could be booked tax-free");
        assertThat(checks.get(4).detail()).contains("31 Mar 2027");
    }

    @Test
    void aBigFixedDepositIsNotFlaggedAndAnEmptyPortfolioSaysNothing() {
        var checks = PortfolioHealth.of(List.of(h("SBI FD", "Fixed Deposit", 900_000, null),
                h("Index fund - Direct", "Mutual Fund", 100_000, "1")), null, TODAY);
        assertThat(checks).isEmpty();
        assertThat(PortfolioHealth.of(List.of(), null, TODAY)).isEmpty();
    }
}
