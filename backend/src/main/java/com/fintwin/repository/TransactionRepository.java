package com.fintwin.repository;

import com.fintwin.model.Transaction;
import com.fintwin.model.User;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.Set;

public interface TransactionRepository
        extends JpaRepository<Transaction, Long> {

    List<Transaction> findByUser(User user);

    Optional<Transaction> findByUserAndExternalId(User user, String externalId);

    @Query("SELECT t.externalId FROM Transaction t WHERE t.user = :user AND t.externalId IS NOT NULL")
    Set<String> findExternalIdsByUser(@Param("user") User user);

    long countByUser(User user);

    void deleteByUser(User user);

    @Query("SELECT t FROM Transaction t WHERE t.user = :user AND (t.source = 'SEED' OR t.source IS NULL)")
    List<Transaction> findSeededByUser(@Param("user") User user);

    @Query("SELECT t FROM Transaction t WHERE t.user.id = :userId AND t.date >= :cutoff ORDER BY t.date ASC")
    List<Transaction> findLatestThreeMonthsTransactions(@Param("userId") Long userId, @Param("cutoff") java.time.LocalDate cutoff);

    default List<Transaction> findLatestThreeMonthsTransactions(Long userId) {
        java.time.LocalDate cutoff = java.time.LocalDate.now().minusMonths(2).withDayOfMonth(1);
        return findLatestThreeMonthsTransactions(userId, cutoff);
    }
}