package com.fintwin.repository;

import com.fintwin.model.BankConnection;
import com.fintwin.model.User;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface BankConnectionRepository
        extends JpaRepository<BankConnection, Long> {

    List<BankConnection> findByUser(User user);

    Optional<BankConnection> findByConsentHandle(String consentHandle);

    Optional<BankConnection> findByConsentId(String consentId);

    Optional<BankConnection> findTopByConsentStatusOrderByCreatedAtDesc(String consentStatus);

    List<BankConnection> findByUserAndConsentStatus(User user, String consentStatus);

    void deleteByUser(User user);

    long countByUser(User user);

    // Single DB query instead of iterating all users — used by admin adoption stats
    @org.springframework.data.jpa.repository.Query("SELECT COUNT(DISTINCT b.user.id) FROM BankConnection b")
    long countDistinctUsers();
}
