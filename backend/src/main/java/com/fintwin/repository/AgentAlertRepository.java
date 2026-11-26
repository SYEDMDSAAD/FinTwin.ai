package com.fintwin.repository;

import com.fintwin.model.AgentAlert;
import com.fintwin.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDateTime;
import java.util.List;

public interface AgentAlertRepository extends JpaRepository<AgentAlert, Long> {
    boolean existsByUserAndPatternKey(User user, String patternKey);

    List<AgentAlert> findByUserAndCreatedAtAfterOrderByCreatedAtDesc(User user, LocalDateTime after);
}
