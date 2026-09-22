package com.fintwin.service;

import com.fintwin.exception.BadRequestException;
import com.fintwin.model.Investment;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class InvestmentIpoRulesTest {

    private static Investment ipo(String status, double invested) {
        Investment i = new Investment();
        i.setType("ipo");
        i.setIpoStatus(status);
        i.setInvestedAmount(invested);
        i.setCurrentValue(99_999.0);
        return i;
    }

    @Test
    void anApplicationIsWorthWhatWasBlocked() {
        Investment i = ipo(null, 14_800);
        InvestmentService.applyIpoRules(i);
        assertThat(i.getType()).isEqualTo("IPO");
        assertThat(i.getIpoStatus()).isEqualTo("APPLIED");
        assertThat(i.getCurrentValue()).isEqualTo(14_800.0);
    }

    @Test
    void aRefundedApplicationStopsCountingTowardsNetWorth() {
        Investment i = ipo("not_allotted", 14_800);
        i.setUnits(148.0);
        InvestmentService.applyIpoRules(i);
        assertThat(i.getInvestedAmount()).isZero();
        assertThat(i.getCurrentValue()).isZero();
        assertThat(i.getUnits()).isNull();
    }

    @Test
    void aListedHoldingKeepsItsLiveValueAndANormalisedSymbol() {
        Investment i = ipo("LISTED", 14_800);
        i.setTickerCode(" newco ");
        i.setCurrentValue(19_240.0);
        InvestmentService.applyIpoRules(i);
        assertThat(i.getTickerCode()).isEqualTo("NEWCO");
        assertThat(i.getCurrentValue()).isEqualTo(19_240.0);
    }

    @Test
    void listedWithoutASymbolCanOnlyBeValuedAtCost() {
        Investment i = ipo("LISTED", 14_800);
        InvestmentService.applyIpoRules(i);
        assertThat(i.getCurrentValue()).isEqualTo(14_800.0);
    }

    @Test
    void unknownStatusIsRejected() {
        assertThatThrownBy(() -> InvestmentService.applyIpoRules(ipo("PENDING", 1)))
                .isInstanceOf(BadRequestException.class);
    }

    @Test
    void otherHoldingsCarryNoIpoFields() {
        Investment i = new Investment();
        i.setType("Stocks");
        i.setIpoStatus("APPLIED");
        i.setIpoListingId(3L);
        InvestmentService.applyIpoRules(i);
        assertThat(i.getIpoStatus()).isNull();
        assertThat(i.getIpoListingId()).isNull();
    }
}
