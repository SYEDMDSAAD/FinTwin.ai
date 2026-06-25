package com.fintwin.repository;

import com.fintwin.model.BankConnection;
import com.fintwin.model.User;

import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

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

    // Pessimistic write lock — used to serialize concurrent webhook calls for the
    // same connection so only one processes a given session
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT b FROM BankConnection b WHERE b.id = :id")
    Optional<BankConnection> findByIdWithLock(@Param("id") Long id);

    // Single DB query instead of iterating all users — used by admin adoption stats
    @Query("SELECT COUNT(DISTINCT b.user.id) FROM BankConnection b")
    long countDistinctUsers();
}
