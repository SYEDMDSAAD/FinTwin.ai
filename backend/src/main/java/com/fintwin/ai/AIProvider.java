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
}
