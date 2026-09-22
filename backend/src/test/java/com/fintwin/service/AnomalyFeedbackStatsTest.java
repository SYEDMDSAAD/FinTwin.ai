package com.fintwin.service;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AnomalyFeedbackStatsTest {

    @Test
    void falseAlarmRateOverallAndPerKind() {
        Map<String, Object> s = AnomalyService.feedbackStats(List.of(
                new Object[]{"merchant_spike", "high", "CONFIRMED", 3L},
                new Object[]{"merchant_spike", "low", "NOT_ANOMALY", 1L},
                new Object[]{"burst", "medium", "NOT_ANOMALY", 4L}));
        assertThat(s).containsEntry("confirmed", 3L).containsEntry("falseAlarms", 5L).containsEntry("falseAlarmRate", 62.5);
        @SuppressWarnings("unchecked")
        var byType = (List<Map<String, Object>>) s.get("byType");
        assertThat(byType).extracting(m -> m.get("type"), m -> m.get("falseAlarmRate"))
                .containsExactly(org.assertj.core.groups.Tuple.tuple("burst", 100.0),
                                 org.assertj.core.groups.Tuple.tuple("merchant_spike", 25.0));
    }

    @Test
    void theSameAlertAlwaysGetsTheSameKeyAndDifferentAmountsDont() {
        assertThat(AnomalyService.patternKey(1L, "burst", " Swiggy ", 100.0))
                .isEqualTo(AnomalyService.patternKey(1L, "burst", "swiggy", 100.0))
                .isNotEqualTo(AnomalyService.patternKey(1L, "burst", "swiggy", 101.0))
                .isNotEqualTo(AnomalyService.patternKey(2L, "burst", "swiggy", 100.0));
    }
}
