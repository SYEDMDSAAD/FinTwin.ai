package com.fintwin.controller;

import com.fintwin.dto.AnomalyDTO;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** The copilot's unusual-spending tool: ready sentences and whole rupees. */
class InternalAIAnomaliesTest {

    @Test
    @SuppressWarnings("unchecked")
    void eachAnomalyCarriesItsReasonAndRoundedAmounts() {
        AnomalyDTO a = new AnomalyDTO("Zomato", -2450.6, 4.04, "high", "Food",
                "₹2,451 at Zomato is about 4x your usual ₹607", -606.7, "merchant_spike");
        Map<String, Object> body = InternalAIController.anomaliesBody(List.of(a));

        assertThat(body.get("count")).isEqualTo(1);
        Map<String, Object> item = ((List<Map<String, Object>>) body.get("anomalies")).get(0);
        assertThat(item.get("amount")).isEqualTo(2451L);
        assertThat(item.get("usualAmount")).isEqualTo(607L);
        assertThat(item.get("timesUsual")).isEqualTo(4.0);
        assertThat(item.get("reason")).isEqualTo("₹2,451 at Zomato is about 4x your usual ₹607");
        assertThat(body).doesNotContainKey("note");
    }

    @Test
    void nothingUnusualSaysSo() {
        Map<String, Object> body = InternalAIController.anomaliesBody(List.of());
        assertThat(body.get("count")).isEqualTo(0);
        assertThat(body.get("note").toString()).contains("Nothing");
    }
}
