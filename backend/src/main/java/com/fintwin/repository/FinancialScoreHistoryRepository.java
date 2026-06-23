package com.fintwin.repository;

import com.fintwin.model.FinancialScoreHistory;
import com.fintwin.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface FinancialScoreHistoryRepository
        extends JpaRepository<FinancialScoreHistory, Long> {

    List<FinancialScoreHistory>
    findByUserOrderByMonthAsc(User user);

    void deleteByUser(User user);
}