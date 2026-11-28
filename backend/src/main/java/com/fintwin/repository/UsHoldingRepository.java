package com.fintwin.repository;

import com.fintwin.model.UsHolding;
import com.fintwin.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UsHoldingRepository extends JpaRepository<UsHolding, Long> {
    List<UsHolding> findByUserOrderByCreatedAtAsc(User user);

    long countByUser(User user);

    Optional<UsHolding> findByIdAndUser(Long id, User user);

}
