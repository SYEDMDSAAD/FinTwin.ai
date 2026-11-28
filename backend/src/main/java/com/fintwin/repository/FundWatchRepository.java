package com.fintwin.repository;

import com.fintwin.model.FundWatch;
import com.fintwin.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface FundWatchRepository extends JpaRepository<FundWatch, Long> {
    List<FundWatch> findByUserOrderByCreatedAtAsc(User user);

    long countByUser(User user);

    Optional<FundWatch> findByIdAndUser(Long id, User user);
    Optional<FundWatch> findByUserAndSchemeCode(User user, String schemeCode);
}
