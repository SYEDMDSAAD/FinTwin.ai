package com.fintwin.ai;

import org.springframework.web.client.RestClientException;

/**
 * The user has used today's model-token allowance (ai.daily-token-limit).
 *
 * Thrown before the AI service is called, and a RestClientException on
 * purpose: every AI feature already treats that as "the model is
 * unavailable" and serves its code-written fallback (coach, report, goal
 * plan, investments, categories). The copilot answers 429 with a plain
 * message instead (TransactionController), and its circuit breaker ignores
 * this exception — one user's allowance must not cut the copilot off for
 * everyone.
 */
public class AiQuotaExceededException extends RestClientException {

    public AiQuotaExceededException(long used, long limit) {
        super("Daily AI allowance used: " + used + " of " + limit + " tokens");
    }
}
