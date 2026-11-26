package com.fintwin.dto;

import com.fintwin.model.FundWatch;
import com.fintwin.model.SipPlan;
import com.fintwin.model.UsHolding;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Wire shapes for SIPs, US holdings and the fund watchlist. */
public final class TrackedHoldingsDTO {

    private TrackedHoldingsDTO() {}

    public record Sip(Long id, String fundName, BigDecimal amount, String frequency,
                      LocalDate nextDebitDate, String notes, Long goalId) {
        public static Sip from(SipPlan s) {
            return new Sip(s.getId(), s.getFundName(), s.getAmount(), s.getFrequency(),
                    s.getNextDebitDate(), s.getNotes(), s.getGoal() == null ? null : s.getGoal().getId());
        }
    }

    public record UsStock(Long id, String name, String ticker, Double units,
                          BigDecimal buyPrice, LocalDate buyDate) {
        public static UsStock from(UsHolding h) {
            return new UsStock(h.getId(), h.getName(), h.getTicker(), h.getUnits(), h.getBuyPrice(), h.getBuyDate());
        }
    }

    public record WatchedFund(String schemeCode, String schemeName) {
        public static WatchedFund from(FundWatch f) {
            return new WatchedFund(f.getSchemeCode(), f.getSchemeName());
        }
    }

    /** The old goal-to-SIP link kept on the device: goal id, optional fund name, monthly amount. */
    public record GoalSipLink(Long goalId, String fundName, BigDecimal monthlyAmount) {}

    /** Everything one device had saved locally, sent once to be moved into the account. */
    public record DeviceImport(List<Sip> sips, List<UsStock> usHoldings,
                               List<WatchedFund> watchlist, List<GoalSipLink> goalSipLinks) {}

    public record ImportResult(int sips, int usHoldings, int watchlist, int goalLinks, int skipped) {}
}
