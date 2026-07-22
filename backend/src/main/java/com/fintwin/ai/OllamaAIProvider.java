package com.fintwin.ai;

import com.fintwin.dto.FinancialSummaryDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

/**
 * AIProvider implementation backed by the local Python AI service (Ollama/phi3:mini).
 * To swap providers, implement AIProvider and update the @Primary annotation here.
 */
@Component
public class OllamaAIProvider implements AIProvider {

    private static final Logger log = LoggerFactory.getLogger(OllamaAIProvider.class);

    @Value("${ai.service.url}")
    private String aiServiceUrl;

    @Autowired
    @Qualifier("aiRestTemplate")
    private RestTemplate aiRestTemplate;

    @Override
    public String chat(String message, String mode, FinancialSummaryDTO summary) {
        Map<String, Object> financialData = new HashMap<>();
        financialData.put("userId",              summary.getUserId());
        financialData.put("income",              summary.getIncome());
        financialData.put("expenses",            summary.getExpenses());
        financialData.put("savings",             summary.getSavings());
        financialData.put("savingsRatio",        summary.getSavingsRatio());
        financialData.put("financialScore",      summary.getFinancialScore());
        financialData.put("transactionCount",    summary.getTransactionCount());
        financialData.put("topCategory",         summary.getTopCategory());
        financialData.put("categorySpending",    summary.getCategorySpending());
        financialData.put("merchantSpending",    summary.getMerchantSpending());
        financialData.put("budgetAlerts",        summary.getBudgetAlerts());
        financialData.put("subscriptions",       summary.getSubscriptions());
        financialData.put("conversationHistory", summary.getConversationHistory());

        Map<String, Object> body = new HashMap<>();
        body.put("message",       message);
        body.put("mode",          mode != null ? mode : "Savings Advisor");
        body.put("financialData", financialData);

        @SuppressWarnings("rawtypes")
        Map response = aiRestTemplate.postForObject(aiServiceUrl + "/chat", body, Map.class);

        if (response == null || response.get("reply") == null) {
            log.warn("Ollama returned null/empty response");
            return "FinTwin AI could not generate a response.";
        }

        return response.get("reply").toString();
    }
}
