package com.fintwin.repository;

import com.fintwin.model.Budget;
import com.fintwin.model.User;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;

public interface BudgetRepository
extends JpaRepository<Budget, Long> {

    List<Budget> findByUser(User user);

    void deleteByUser(User user);
}