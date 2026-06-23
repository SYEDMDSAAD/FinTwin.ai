package com.fintwin.repository;

import com.fintwin.model.FinancialGoal;
import com.fintwin.model.User;

import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface FinancialGoalRepository
extends JpaRepository<
    FinancialGoal,
    Long
> {

    List<FinancialGoal>
    findByUser(User user);

    long countByUser(User user);

    void deleteByUser(
            User user
    );
}