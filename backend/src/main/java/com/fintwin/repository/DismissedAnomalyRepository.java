package com.fintwin.repository;

import com.fintwin.model.DismissedAnomalyPattern;
import com.fintwin.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DismissedAnomalyRepository extends JpaRepository<DismissedAnomalyPattern, Long> {
    List<DismissedAnomalyPattern> findByUser(User user);
    boolean existsByUserAndAnomalyTypeAndMerchant(User user, String anomalyType, String merchant);
}
