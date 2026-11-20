package com.fintwin.repository;

import com.fintwin.model.FinancialGoal;
import com.fintwin.model.GoalEarmark;
import com.fintwin.model.User;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface GoalEarmarkRepository extends JpaRepository<GoalEarmark, Long> {

    @EntityGraph(attributePaths = "goal")
    List<GoalEarmark> findByUser(User user);

    Optional<GoalEarmark> findByGoalAndMonthAndSource(FinancialGoal goal, String month, String source);
}
