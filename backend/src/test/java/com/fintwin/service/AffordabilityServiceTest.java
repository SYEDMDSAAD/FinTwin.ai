package com.fintwin.service;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

class AffordabilityServiceTest {

    @Test
    void computeEmi_matchesStandardAmortizationReference() {
        // ₹1,00,000 at 12% p.a. over 12 months — the textbook reference EMI is ₹8,884.88
        double emi = AffordabilityService.computeEmi(100_000, 12.0, 12);
        assertThat(emi).isCloseTo(8884.88, within(0.01));
    }

    @Test
    void computeEmi_zeroRateFallsBackToFlatDivision() {
        assertThat(AffordabilityService.computeEmi(12_000, 0.0, 12)).isEqualTo(1000.0);
    }

    @Test
    void computeEmi_exceedsFlatDivisionWhenRatePositive() {
        double flat = 50_000.0 / 24;
        double emi  = AffordabilityService.computeEmi(50_000, 14.0, 24);
        assertThat(emi).isGreaterThan(flat);
    }

    @Test
    void computeEmi_nonPositiveMonthsReturnsPrincipal() {
        assertThat(AffordabilityService.computeEmi(5_000, 14.0, 0)).isEqualTo(5_000);
    }
}
