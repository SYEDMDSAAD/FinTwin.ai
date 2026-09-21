package com.fintwin.repository;

import com.fintwin.model.Investment;
import com.fintwin.model.User;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface InvestmentRepository extends JpaRepository<Investment, Long> {
    List<Investment> findByUser(User user);

    void deleteByUser(User user);

    // SQL lookups by name/tickerCode removed — both fields are AES-256/GCM encrypted
}
