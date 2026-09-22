package com.fintwin.controller;

import com.fintwin.model.Investment;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The copilot's portfolio tool: every number worked out before the model sees it. */
class InternalAIPortfolioTest {

    private static Investment inv(String name, String type, double invested, double current, String ticker, Double units) {
        Investment i = new Investment();
        i.setName(name);
        i.setType(type);
        i.setInvestedAmount(invested);
        i.setCurrentValue(current);
        i.setTickerCode(ticker);
        i.setUnits(units);
        return i;
    }

    @Test
    @SuppressWarnings("unchecked")
    void totalsGainsAndAllocationAreComputed() {
        Investment fund = inv("Parag Parikh Flexi Cap", "Mutual Fund", 15000, 15746.39, "122640", 173.931);
        fund.setPurchaseDate(LocalDate.of(2025, 9, 22));
        Map<String, Object> body = InternalAIController.portfolioBody(List.of(
                fund,
                inv("HDFC Bank", "Stocks", 15000, 13271.77, "HDFCBANK.NS", 17.8444),
                inv("SBI FD", "Fixed Deposit", 10000, 10700, null, null)), null);

        assertThat(body).containsEntry("holdingCount", 3)
                .containsEntry("totalInvestedFormatted", "₹40,000")
                .containsEntry("currentValueFormatted", "₹39,718.16")
                .containsEntry("totalGainFormatted", "-₹281.84")
                .containsEntry("totalGainPercent", -0.7)
                .containsEntry("bestPerformer", "SBI FD (7.0%)")
                .containsEntry("worstPerformer", "HDFC Bank (-11.52%)");

        List<Map<String, Object>> holdings = (List<Map<String, Object>>) body.get("holdings");
        assertThat(holdings).extracting(h -> h.get("name")).containsExactly("SBI FD", "Parag Parikh Flexi Cap", "HDFC Bank");
        Map<String, Object> mf = holdings.get(1);
        assertThat(mf).containsEntry("gainFormatted", "+₹746.39").containsEntry("gainPercent", 4.98)
                .containsEntry("purchaseDate", "2025-09-22").containsEntry("units", 173.931)
                .containsEntry("valuation", "market price at the last portfolio refresh");
        assertThat(holdings.get(0).get("valuation")).asString().startsWith("estimated");

        assertThat((List<String>) body.get("allocation")).first().isEqualTo("Mutual Fund: 39.6% (₹15,746.39)");
        assertThat(body.get("summary")).isEqualTo(
                "Portfolio (3 holdings): invested ₹40,000, now worth ₹39,718.16 — a loss of ₹281.84 (-0.7%).");
        assertThat((List<String>) body.get("perHolding")).contains(
                "HDFC Bank (Stocks): invested ₹15,000, now ₹13,271.77, -₹1,728.23 (-11.52%)");
        assertThat((List<Object>) body.get("inProfit")).containsExactly("SBI FD", "Parag Parikh Flexi Cap");
        assertThat((List<Object>) body.get("atLoss")).containsExactly("HDFC Bank");
        assertThat(body).doesNotContainKey("note");
    }

    @Test
    void anUnlinkedLumpSumIsFlagged() {
        Map<String, Object> body = InternalAIController.portfolioBody(List.of(
                inv("Investment Portfolio", "Other", 15000, 15000, null, null)), null);
        assertThat(body.get("note")).asString().contains("not linked");
        assertThat(body).doesNotContainKey("bestPerformer");
    }

    @Test
    void anUnlistedIpoIsNotCalledAMarketPrice() {
        Investment ipo = inv("Integration Test Ltd", "IPO", 15000, 15000, null, null);
        ipo.setIpoStatus("ALLOTTED");
        @SuppressWarnings("unchecked")
        var row = ((List<Map<String, Object>>) InternalAIController.portfolioBody(List.of(ipo), null).get("holdings")).get(0);
        assertThat(row.get("valuation")).asString().startsWith("not listed yet");
    }

    @Test
    void noInvestmentsSaysSo() {
        Map<String, Object> body = InternalAIController.portfolioBody(List.of(), null);
        assertThat(body).containsEntry("holdingCount", 0).containsEntry("totalGainPercent", 0.0);
        assertThat(body.get("note")).asString().contains("no investments");
    }

    @Test
    void filtersToOneTypeWithItsOwnTotals() {
        List<Investment> all = List.of(
                inv("Parag Parikh Flexi Cap", "Mutual Fund", 15000, 15746.39, "122640", 173.931),
                inv("HDFC Bank", "Stocks", 15000, 13271.77, "HDFCBANK.NS", 17.8444));
        Map<String, Object> funds = InternalAIController.portfolioBody(all, "mutual fund");
        assertThat(funds).containsEntry("filteredTo", "mutual fund").containsEntry("holdingCount", 1)
                .containsEntry("totalGainFormatted", "+₹746.39");
        assertThat(funds.get("summary")).asString().startsWith("mutual fund holdings (1 holding): invested ₹15,000");

        Map<String, Object> gold = InternalAIController.portfolioBody(all, "Gold");
        assertThat(gold).containsEntry("holdingCount", 0);
        assertThat(gold.get("note")).asString().contains("no Gold holdings");
    }
}
