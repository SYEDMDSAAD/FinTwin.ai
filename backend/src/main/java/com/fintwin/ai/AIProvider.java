package com.fintwin.ai;

import com.fintwin.dto.FinancialSummaryDTO;

/**
 * Abstraction over any AI provider (Ollama, OpenAI, Anthropic, etc.).
 * Swap implementations in AiServiceConfig without touching business logic.
 */
public interface AIProvider {

    /**
     * Generate a financial advice reply given the user's message, selected mode,
     * and pre-aggregated financial snapshot.
     */
    String chat(String message, String mode, FinancialSummaryDTO summary);

    /** A reply and how it was produced (path, tools, checks, timing), when the provider reports it. */
    record ChatResult(String reply, java.util.Map<String, Object> trace) {}

    default ChatResult chatWithTrace(String message, String mode, FinancialSummaryDTO summary) {
        return new ChatResult(chat(message, mode, summary), java.util.Map.of());
    }
}
