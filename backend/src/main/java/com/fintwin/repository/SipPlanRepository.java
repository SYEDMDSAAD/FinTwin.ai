package com.fintwin.repository;

import com.fintwin.model.SipPlan;
import com.fintwin.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface SipPlanRepository extends JpaRepository<SipPlan, Long> {
    List<SipPlan> findByUserOrderByCreatedAtAsc(User user);

    long countByUser(User user);

    Optional<SipPlan> findByIdAndUser(Long id, User user);
    Optional<SipPlan> findByGoalIdAndUser(Long goalId, User user);

    void deleteByUser(User user);
}
