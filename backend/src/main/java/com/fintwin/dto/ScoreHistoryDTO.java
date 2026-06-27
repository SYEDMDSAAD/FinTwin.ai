package com.fintwin.dto;

import com.fintwin.model.FinancialScoreHistory;

/** API representation of a monthly financial-score snapshot (user excluded). */
public record ScoreHistoryDTO(Long id, Integer score, String month) {

    public static ScoreHistoryDTO from(FinancialScoreHistory h) {
        return new ScoreHistoryDTO(h.getId(), h.getScore(), h.getMonth());
    }
}
