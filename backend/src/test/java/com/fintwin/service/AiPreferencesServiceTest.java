package com.fintwin.service;

import com.fintwin.model.User;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class AiPreferencesServiceTest {

    @Test
    void theModeAskedForWins() {
        User u = new User();
        u.setAiMode("Budget Coach");
        assertThat(AiPreferencesService.modeFor(u, "Voice")).isEqualTo("Voice");
    }

    @Test
    void noModeAskedForUsesTheSavedOne() {
        User u = new User();
        u.setAiMode("Budget Coach");
        assertThat(AiPreferencesService.modeFor(u, null)).isEqualTo("Budget Coach");
        assertThat(AiPreferencesService.modeFor(u, " ")).isEqualTo("Budget Coach");
    }

    @Test
    void nothingSavedOrSomethingUnknownFallsBackToSavings() {
        assertThat(AiPreferencesService.modeFor(new User(), null)).isEqualTo("Savings Advisor");
        User u = new User();
        u.setAiMode("Stock Tipster");
        assertThat(AiPreferencesService.modeFor(u, null)).isEqualTo("Savings Advisor");
    }

    @Test
    void dailyInsightsAreOnByDefault() {
        assertThat(new User().isDailyInsights()).isTrue();
    }
}
